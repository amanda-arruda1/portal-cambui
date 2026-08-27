# Fase 3 — Contribuição das secretarias

Executada em 27/08/2026. Entrega tudo o que **não depende de conteúdo real nem
do e-mail institucional**: a inspeção de arquivos enviados, o controle de acesso
do CMS escrito como código, o painel das secretarias (sessão, 2FA, fluxo
editorial, envio de arquivo) e as telas de redigir e editar conteúdo.

Falta só ligar: o esquema precisa estar aplicado no Directus e as pessoas
cadastradas — os dois dependem do e-mail institucional.

## O que está no ar

| Componente | Onde | Estado |
|---|---|---|
| Inspeção de upload | `apps/web/src/lib/upload/` | no ar, com bateria de teste |
| Painel de contribuição | `/painel` no domínio público | no ar, aguardando usuários |
| Bloco `/painel` no Nginx | `snippets/site-publico.conf` | aplicado e recarregado |
| `portal-web` no grupo `virusgroup` | unit do systemd | aplicado |
| Telas de redigir e editar | `/painel/<coleção>/novo` e `/painel/<coleção>/<id>` | no ar |
| Sanitização do texto rico | gravação **e** exibição | no ar |
| Cadastro de pessoas | `/painel/usuarios` (só Administrator) | no ar |
| Verificação em duas etapas | `/painel/conta` | no ar |
| Papéis e permissões | `infra/directus/papeis.json` | **aplicado** em 27/08/2026 |

Testes que rodam hoje, sem depender de ninguém:

```bash
cd /opt/portal-cambui/apps/web && node scripts/testar-upload.mjs
```

25 casos de inspeção, 7 de sanitização de nome, e o EICAR contra o clamd de
verdade. Sai com código 0 quando tudo passa.

```bash
cd /opt/portal-cambui/apps/web && node scripts/verificar-campos.mjs
```

Compara os formulários do painel (`src/lib/painel/campos.ts`) com o esquema do
CMS (`infra/directus/esquema.json`) e falha se um campo aparecer só de um lado,
se a obrigatoriedade divergir ou se a lista de opções não bater. São arquivos
separados de propósito — rótulo em português e ordem de preenchimento não
pertencem ao esquema — e este script é o preço dessa separação.

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

## Telas de redigir e editar

Um formulário só, compartilhado por criar e editar — a diferença é o endereço
de envio e o texto do botão. Campo novo aparece nas duas telas ao mesmo tempo.

**Funciona sem JavaScript.** O endereço de página é gerado no servidor, o
arquivo sobe junto com o envio e a validação inteira é refeita do lado de cá:
`required` e `type="email"` no HTML são conveniência de quem preenche e somem
para quem manda a requisição direto. Com JavaScript ligado, a pessoa ganha
sugestão de endereço enquanto digita, barra de formatação e — o que mais
importa — o veredito do arquivo **na hora**, em vez de descobrir que o PDF foi
recusado depois de dez minutos preenchendo.

**Salvar e mudar de situação são botões diferentes.** Um clique não pode
publicar sem querer, e a tela avisa que são envios separados.

**Erro de validação nunca perde texto.** O que a pessoa digitou volta para a
tela; só depois de gravar é que os valores voltam a vir do CMS.

**Texto rico é sanitizado nos dois sentidos** (`src/lib/sanitizar.ts`): na
gravação, com aviso do que foi retirado; e na exibição pública, porque conteúdo
também entra pelo painel do Directus, que não passa por este formulário. É o
segundo que garante — o portal renderiza o corpo das notícias com `set:html`,
ou seja, marcação de verdade no navegador do cidadão.

Fora da marcação aceita, com motivo: `<img>` (a imagem tem campo próprio, com
texto alternativo; solta no corpo vem sem `alt` e sem passar pela inspeção),
`<h1>` (o H1 é o título da página; um segundo quebra a navegação por cabeçalhos
de quem usa leitor de tela), `style`/`font` (apresentação vem da folha de estilo,
senão cada secretaria inventa a sua) e `<iframe>`/`<video>` (conteúdo de
terceiro embutido no domínio oficial). Link para fora recebe
`rel="noopener noreferrer"`, e `target`/`rel` colados junto com o texto são
descartados.

A barra de formatação usa `document.execCommand`, que é obsoleto. É uma escolha:
o substituto seria trazer um editor inteiro como dependência, e para negrito,
lista e cabeçalho ele funciona em todos os navegadores atuais. O resultado passa
pelo sanitizador do servidor de qualquer jeito, então o risco de ele produzir
algo estranho é de formatação, não de segurança.

## Operar o painel: pessoas e segundo fator

O painel do Directus nunca foi alcançável (o registro `admin.` não existe) e o
projeto pediu que as secretarias não o vejam. As duas telas que faltavam para
operar sem ele:

**`/painel/usuarios`** — cadastro de pessoas, restrito a quem tem o papel
Administrator. Senha inicial gerada no servidor e mostrada uma única vez; só
letras e números, porque senha com símbolo se perde num copiar-e-colar ou numa
leitura por telefone, que é como ela chega à secretaria. Sem exclusão: quem sai
vira *Arquivado*, o que bloqueia o acesso e preserva a autoria. Duas travas que
a tela impõe: redator sem secretaria é recusado (o filtro da permissão compara
com a secretaria da pessoa, e nulo não casa com nada — a fila ficaria vazia para
sempre, sem erro visível), e ninguém retira a própria função de administrador
nem desativa a própria conta.

**`/painel/conta`** — cadastro do autenticador (TOTP). QR gerado no servidor e
embutido como SVG na página: o segredo do segundo fator não sai desta máquina,
nem para um serviço de imagem. A chave também aparece em texto, agrupada de
quatro em quatro, para quem for digitar à mão.

**A ordem para criar um Publicador não pode ser invertida.** A política tem
`enforce_tfa`, então um Publicador sem segundo fator não entra — e é preciso
entrar para cadastrar o segundo fator. O caminho é: criar a pessoa como
**Revisor** → ela entra e cadastra o autenticador em `/painel/conta` → só então
recebe o papel de **Publicador**. A lista de pessoas mostra em vermelho toda
conta de Publicador sem segundo fator, para que ninguém descubra isso no dia em
que precisar publicar.

O emissor que aparece no celular é reescrito para "Portal Cambui": o Directus
gera "Directus:<e-mail>", que não diz nada para quem trabalha na secretaria. Só
o segredo e os parâmetros de cálculo importam para o código funcionar.

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

**O caminho da sessão estava assado no build, apontando para um lugar
somente-leitura.** `astro.config.mjs` lia `process.env.SESSION_DIR` — variável
que a unit do systemd entrega ao processo, mas tarde demais: a configuração é
avaliada quando `npm run build` roda, e ali ela não existe. O valor que entrou
no manifesto foi o padrão `./.sessoes`, dentro de `/opt`, que o
`ProtectSystem=strict` deixa somente-leitura. Ninguém teria conseguido entrar no
painel: a senha seria aceita e a pessoa voltaria à tela de entrada. O padrão
agora é o caminho de produção.

**O Directus responde `INVALID_OTP` para código errado E para código ausente.**
Quem entrasse pela primeira vez numa conta com 2FA lia "o código não confere"
sem ter digitado código nenhum. Só quem chamou sabe a diferença, então ela é
feita na aplicação.

**O campo `folder` do Directus é chave UUID, não rótulo.** Mandando o nome da
pasta, o Postgres recusa com `invalid input syntax for type uuid` e o envio
morre em HTTP 500 — com o erro de SQL cru na tela de quem está na secretaria.

**A verificação embutida do Astro não cobre JSON.** Ela só barra requisição de
outra origem quando o `Content-Type` é de formulário (ou não existe); um POST
com `application/json` passa direto. O middleware do projeto confere a origem em
todo método que escreve, qualquer `Content-Type` — foi testado e é ele que pega
esse caso.

**`documentos` não tinha vínculo com secretaria.** Sem ele, o redator de uma
pasta editaria edital de outra: a permissão de linha não teria por onde
filtrar. Campo somado ao esquema (que ainda não foi aplicado, então não custou
migração) e ao `tipos.ts`.

**Sessão inválida devolvia um 403 seco com a mensagem do Directus em inglês.**
Token vencido, Directus reiniciado com outra chave ou usuário removido não são
falta de permissão: agora o 401 leva de volta à tela de entrada, e a pessoa
retorna ao item de onde saiu.

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
- **A sessão do Astro guarda `{ data }` por chave, não o objeto direto.** Vale
  para quem for inspecionar ou forjar uma sessão para teste.
- **`-F` do curl trata `campo=<algo` como "ler do arquivo".** Testar um campo
  que começa com `<` exige `--form-string`.
- **O campo do arquivo tem de ser o último no `FormData`** enviado ao Directus:
  ele lê os metadados na ordem em que chegam e ignora o que vier depois do
  binário.

## O que falta

Depende do **e-mail institucional**, em cadeia:

1. administrador do Directus (`directus users create`);
2. `node aplicar-esquema.mjs` — as 6 coleções;
3. `node aplicar-papeis.mjs` — políticas, papéis e permissões;
4. cadastro das pessoas das secretarias, com o campo `secretaria` preenchido.

**O que foi verificado e o que não foi.** A renderização de todas as telas do
painel foi conferida forjando uma sessão direto no armazenamento do Astro (sem
tocar no Directus): formulários, rótulos, marcação de campo obrigatório,
validação do servidor, sanitização com aviso e o retorno do texto digitado após
erro. O que **não** deu para exercitar de ponta a ponta é o que depende de um
usuário real no CMS: entrar com senha e segundo fator, gravar um item, e as
transições do fluxo contra as permissões de linha. Reservar esse teste para o
dia do primeiro cadastro.

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

# Formulários do painel x esquema do CMS
cd /opt/portal-cambui/apps/web && node scripts/verificar-campos.mjs

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
