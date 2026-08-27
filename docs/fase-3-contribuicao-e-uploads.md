# Fase 3 — Contribuição das secretarias (parte 1)

Executada em 27/08/2026. Entrega a **metade que não depende de conteúdo real
nem do e-mail institucional**: a inspeção de arquivos enviados, o controle de
acesso do CMS escrito como código, e a fundação do painel das secretarias
(sessão, 2FA, fluxo editorial e envio de arquivo).

O que **não** está aqui: as telas de redigir e editar cada tipo de conteúdo.
Elas dependem do esquema aplicado no Directus, que depende do administrador,
que depende do e-mail institucional.

## O que está no ar

| Componente | Onde | Estado |
|---|---|---|
| Inspeção de upload | `apps/web/src/lib/upload/` | no ar, com bateria de teste |
| Painel de contribuição | `/painel` no domínio público | no ar, aguardando usuários |
| Bloco `/painel` no Nginx | `snippets/site-publico.conf` | aplicado e recarregado |
| `portal-web` no grupo `virusgroup` | unit do systemd | aplicado |
| Papéis e permissões | `infra/directus/papeis.json` | escrito, **não aplicado** |

Testes que rodam hoje, sem depender de ninguém:

```bash
cd /opt/portal-cambui/apps/web && node scripts/testar-upload.mjs
```

25 casos de inspeção, 7 de sanitização de nome, e o EICAR contra o clamd de
verdade. Sai com código 0 quando tudo passa.

## Inspeção de upload

Ordem deliberada, do mais barato ao mais caro — o antivírus só vê o que
sobreviveu ao resto:

1. **tamanho** — teto por tipo (PDF 25 MB, imagem 8 MB, documento 15 MB);
2. **extensão** — lista de permissão; o que não está nela é recusado;
3. **assinatura** — o formato sai dos primeiros bytes, não do nome nem do
   `Content-Type`, que vêm de quem envia;
4. **coerência** — extensão, conteúdo e MIME declarado precisam concordar;
5. **risco no formato** — JavaScript e `/Launch` em PDF, fórmula no início de
   campo em CSV (a planilha de quem baixar executaria);
6. **ClamAV** — `INSTREAM` no socket unix.

**Falha fechada.** Se o clamd não responder, o envio é recusado. Um upload
perdido é aborrecimento; um arquivo infectado hospedado em `.gov.br` é
incidente. A tela `/painel/estado` mostra o antivírus para que a secretaria
saiba disso antes de abrir chamado.

**O arquivo reprovado nunca toca o disco.** Ele existe em memória enquanto é
julgado e é descartado. Não há o que varrer depois nem o que limpar da
quarentena. A varredura periódica (`portal-antivirus.timer`) continua como rede
de segurança para o que entrar por outro caminho.

**Formatos deliberadamente fora:** `.svg` (é XML, aceita `<script>`, viraria XSS
armazenado servido do domínio oficial), `.zip`/`.rar`/`.7z` (recipiente de
conteúdo que ninguém revisou), `.doc`/`.xls` (OLE, formato de macro),
`.docm`/`.xlsm`, e qualquer executável ou script.

## Controle de acesso do CMS

`infra/directus/papeis.json` é uma **matriz explícita** de 3 políticas × 6
coleções. Nada é herdado, nada é deduzido: quem auditar lê uma tabela.

| Papel | Cria | Edita até | Pode mover para | 2FA |
|---|---|---|---|---|
| Redator de secretaria | rascunho | em_revisao | rascunho, em_revisao | não |
| Revisor | rascunho | aprovado | rascunho, em_revisao, aprovado | não |
| Publicador | — | arquivado | aprovado, publicado, arquivado | **sim** |

**Separação de funções:** o revisor aprova mas não publica. Está escrito como
permissão de linha no Directus, não como regra de tela — regra de tela se
contorna chamando a API.

**Ninguém aprova nem publica o próprio texto.** Essa é a única regra do fluxo
que vive na aplicação (`lib/painel/sessao.ts`), porque depende de comparar o
autor do item com quem pede, e permissão de linha do Directus não alcança isso.

**2FA obrigatório no publicador** (`enforce_tfa` na política). Consequência
operacional: cadastrar alguém como publicador **sem** que a pessoa configure o
autenticador deixa a conta inutilizável — o Directus recusa a sessão. A ordem é:
criar o usuário como revisor, a pessoa configura o segundo fator, depois muda
para publicador.

**Nenhuma política tem `delete`.** Conteúdo de órgão público tem valor de
registro; o que sai de cena vira `arquivado`. O script recusa aplicar um
`papeis.json` que conceda `delete`.

**Política pública** com filtro `status = publicado` em toda coleção e lista
fechada de campos — sem os dois, rascunho de edital fica legível por quem
chamar `/items/documentos` direto, e `user_created`/`date_updated` expõem a
rotina interna.

Revisar antes de aplicar (funciona **sem** token e **sem** Directus no ar):

```bash
cd /opt/portal-cambui/infra/directus && node aplicar-papeis.mjs --simular
```

## Achados desta fase

**O Astro respondia `http://localhost` como origem, e isso quebraria todo
formulário do painel.** O adaptador Node só confia no `Host`/`X-Forwarded-Host`
se os domínios estiverem declarados em `security.allowedDomains` — sem isso ele
cai em `localhost` de propósito, contra injeção de cabeçalho Host. A verificação
de origem embutida do Astro compara `Origin` com `Astro.url.origin`, então
entrar, aprovar e publicar levariam **403 em produção**, de forma silenciosa e
impossível de diagnosticar pela mensagem. Corrigido em `astro.config.mjs`.

**A verificação embutida do Astro não cobre JSON.** Ela só barra requisição de
outra origem quando o `Content-Type` é de formulário (ou não existe); um POST
com `application/json` passa direto. O middleware do projeto confere a origem em
todo método que escreve, qualquer `Content-Type` — foi testado e é ele que pega
esse caso.

**`documentos` não tinha vínculo com secretaria.** Sem ele, o redator de uma
pasta editaria edital de outra: a permissão de linha não teria por onde
filtrar. Campo somado ao esquema (que ainda não foi aplicado, então não custou
migração) e ao `tipos.ts`.

**Limite de taxa devolvia 503, e o site tem `error_page 503 /_manutencao.html`.**
Um cidadão que esbarrasse no limite receberia a página de "portal em
implantação". Agora é `429` — semanticamente correto e fora do alcance do
`error_page`.

**Dois `X-Frame-Options` com valores diferentes.** O Nginx manda `SAMEORIGIN`
para o site; o painel manda `DENY`. Como `add_header` numa `location` substitui
os herdados, o bloco `/painel` repete os demais cabeçalhos e omite este — sobra
um só, o mais restrito.

## Armadilhas já pagas (não repetir)

- **`proxy_send_timeout`/`proxy_read_timeout` já vêm no `proxy.conf`.** Repetir
  na `location` é `[emerg] directive is duplicate` e o Nginx não sobe.
- **O socket do clamd é `660` do grupo `virusgroup`.** Sem
  `SupplementaryGroups=virusgroup` na unit, o portal leva `EACCES` e — por
  falhar fechado — recusa **todo** envio de arquivo. Declarado na unit, não com
  `usermod`, para o requisito viajar junto com o serviço.
- **`fields` de permissão do Directus não aceita caminho relacional.**
  `secretaria.nome` ali não funciona; ler o nome da secretaria numa notícia
  depende de haver permissão de leitura na coleção `secretarias`.
- **Ordem na sanitização de nome importa.** Quebrar o caminho antes de separar a
  extensão fazia `arquivo"; rm -rf /.pdf` virar o nome `pdf` — o arquivo perdia
  a identidade inteira. A extensão sai do nome completo primeiro.
- **O campo do arquivo tem de ser o último no `FormData`** enviado ao Directus:
  ele lê os metadados na ordem em que chegam e ignora o que vier depois do
  binário.

## O que falta

Depende do **e-mail institucional**, em cadeia:

1. administrador do Directus (`directus users create`);
2. `node aplicar-esquema.mjs` — as 6 coleções;
3. `node aplicar-papeis.mjs` — políticas, papéis e permissões;
4. telas de redigir e editar cada tipo de conteúdo;
5. cadastro das pessoas das secretarias, com o campo `secretaria` preenchido.

Independente disso:

- **Faixa de IP da TrustIT** — hoje `/painel` está aberto à internet, protegido
  só por senha, 2FA e limite de taxa. Se a prefeitura aceitar que as secretarias
  só publiquem de dentro da rede, dá para restringir também por origem.
- **Token da Cloudflare** para o `05-certificado.sh`. Enquanto o TLS de origem
  não existir, a senha das secretarias trafega em claro entre o proxy
  `10.180.0.13` e esta VM. **Não colocar ninguém para usar o painel antes
  disso.**

## Operação

```bash
# Bateria de testes da inspeção de upload (roda contra o clamd de verdade)
cd /opt/portal-cambui/apps/web && node scripts/testar-upload.mjs

# Revisar as permissões antes de aplicar (não precisa de Directus no ar)
cd /opt/portal-cambui/infra/directus && node aplicar-papeis.mjs --simular

# Rebuild e reinício depois de mexer em apps/web
cd /opt/portal-cambui/apps/web && npm run build \
  && chown -R root:portal-web dist && chmod -R u=rwX,g=rX,o= dist \
  && systemctl restart portal-web

# Recarregar o Nginx depois de mexer em infra/nginx
install -m 644 /opt/portal-cambui/infra/nginx/snippets/*.conf /etc/nginx/snippets/ \
  && install -m 644 /opt/portal-cambui/infra/nginx/nginx.conf /etc/nginx/nginx.conf \
  && nginx -t && systemctl reload nginx

# O que o painel registra no journal (envios aceitos, recusados e transições)
journalctl -u portal-web -g '\[upload\]|\[fluxo\]' --since today
```
