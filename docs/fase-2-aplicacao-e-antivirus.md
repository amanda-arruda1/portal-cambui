# Fase 2 — Aplicação web e antivírus

Executada em 27/08/2026. Entrega o portal público servindo de verdade atrás do
Nginx e a varredura antivírus dos arquivos enviados ao CMS.

## O que está no ar

| Componente | Onde | Estado |
|---|---|---|
| Aplicação Astro 5 (SSR) | `127.0.0.1:4321`, serviço `portal-web` | ativo, habilitado no boot |
| Nginx (proxy) | porta 80, restrita a `10.180.0.13` | ativo |
| clamd | socket `/run/clamd.scan/clamd.sock` | ativo |
| freshclam | assinaturas atualizando sozinhas | ativo |
| Varredura dos uploads | timer `portal-antivirus`, de hora em hora | ativo |

Rotas conferidas via Nginx: `/`, `/noticias`, `/servicos`, `/secretarias`,
`/documentos`, `/transparencia`, `/contato`, `/acessibilidade`, `/busca`,
`/robots.txt`, `/sitemap-index.xml` — todas 200. Endereço inexistente e notícia
inexistente devolvem **404 de verdade** (status HTTP, não só a mensagem).

## Decisões que valem revisitar

**O Astro roda no host, não em container.** O Nginx do host precisa alcançá-lo
em loopback e o Node 22 já está instalado e sendo atualizado pelo
`dnf-automatic`. Em troca do container, o confinamento vem do systemd: usuário
de serviço próprio (`portal-web`, sem shell), `ProtectSystem=strict`,
`CapabilityBoundingSet=` vazio, `SystemCallFilter=@system-service` e
`IPAddressDeny=any` com exceção só do loopback. O processo lê o próprio `dist`
(que pertence ao root — ele não pode reescrever o próprio código) e fala com o
Directus. Nada mais.

Duas diretivas precisaram ficar de fora e o motivo importa:

- `MemoryDenyWriteExecute` fica **false**: o V8 compila em tempo de execução e
  o Node nem inicia com ela ligada.
- `AF_NETLINK` entrou em `RestrictAddressFamilies`: o adaptador do Astro chama
  `os.networkInterfaces()` só para logar o endereço de escuta, e sem netlink
  cada partida despejava um `Unhandled rejection` no journal. Netlink enumera
  interfaces, não dá alcance de rede — o `IPAddressDeny=any` continua valendo.

**A ausência do CMS é um estado previsto, não um erro.** O esquema de conteúdo
ainda não existe no Directus (depende do administrador, que depende do e-mail
institucional). Todas as consultas em `src/lib/directus.ts` devolvem
`{ dados, indisponivel }` em vez de lançar exceção, e cada seção mostra um
estado vazio honesto. É o que permite o portal entrar no ar antes do conteúdo.
O aviso técnico vai para o journal, uma vez por coleção; a tela pública nunca
mostra host, porta ou stack.

**Nada de dado fictício.** CNPJ, endereço, telefones, horário, e-mail e redes
sociais estão `null` em `src/dados/instituicional.ts`, e cada bloco do rodapé e
da página de contato só renderiza se o dado existir. Não há "(35) 0000-0000" de
exemplo em lugar nenhum. Quando a prefeitura enviar, é esse o único arquivo a
editar.

**A Transparência não é reimplementada.** É obrigação da LC 131/2009 atendida
pelo sistema contábil homologado do município. Duplicar dado financeiro seria a
pior coisa a fazer com dado financeiro. `/transparencia` é um índice de acesso;
enquanto as URLs oficiais não forem confirmadas, a página diz isso em vez de
apontar para link quebrado.

**Varredura periódica, não só no upload.** O bloqueio no momento do envio
pertence ao módulo de contribuição (extensão do Directus, Fase 3), que controla
o fluxo. A varredura horária do disco é a rede de segurança: pega o que entrou
por outro caminho e o que só virou assinatura conhecida depois de já estar
hospedado. Arquivo infectado é **movido para quarentena, nunca apagado** — um
falso positivo em documento oficial não pode virar perda de arquivo.

## Armadilhas já pagas (não repetir)

- **`/run/nginx.pid` residual.** O RPM do nginx.org cria o arquivo por processo
  unconfined, com rótulo `var_run_t`. O Nginx roda em `httpd_t` e não consegue
  escrever nele: em enforcing o master morre com `open() ... failed (13)` e o
  systemd fica 90 s até estourar o timeout. O `04` agora apaga o resíduo antes
  de subir; o próprio Nginx recria o arquivo com o rótulo certo.
- **Duas cópias do Vite.** O Astro 5.18 usa Vite 6.4.3 e o `@tailwindcss/vite`
  puxava o 8.2.2. Dois conjuntos de tipos de `Plugin`, e o plugin do Tailwind
  deixava de ser atribuível. Resolvido com `overrides.vite` no `package.json`.
- **Comentário `/* */` dentro de uma tag.** O compilador do Astro lê cada
  palavra como atributo. Comentário vai fora da tag, ou em `{/* */}` — e, dentro
  de uma expressão, só com um fragmento em volta.
- **`error_page` mantém o status.** `/` devolve **502 com a página de
  implantação** enquanto o Astro estiver fora — é o comportamento correto, não
  um defeito. Quem monitorar por código HTTP precisa saber disso.
- **`httpd_can_network_connect`** é o que permite o `proxy_pass` para
  `127.0.0.1:4321` e `:8055` em enforcing. Sem o boolean, AVC `name_connect`.

## O que falta (e o que trava)

1. **Esquema do conteúdo no Directus.** Declarado em
   `infra/directus/esquema.json`, aplicável por `aplicar-esquema.mjs`
   (idempotente, com `--simular`). **Escrito e simulado, não executado**:
   precisa de um administrador do Directus, que precisa do e-mail
   institucional. Hoje o banco tem 0 usuários de propósito.
2. **Permissões do papel público**, feitas no painel — de propósito fora do
   script: permissão errada vaza rascunho de secretaria. Só leitura, com filtro
   `status = publicado`.
3. **Certificado de origem** (`05-certificado.sh`) — travado no token da
   Cloudflare.
4. **Módulo de contribuição** (Fase 3): frontend próprio para as secretarias,
   fluxo rascunho→em_revisao→aprovado→publicado, 2FA para quem publica, upload
   com whitelist + magic number + ClamAV no ato do envio.

## Operação

```bash
# Rebuild e reinício depois de mexer em apps/web
sudo bash infra/scripts/08-portal-web.sh

# Só compilar, sem tocar no serviço
sudo bash infra/scripts/08-portal-web.sh --so-build

systemctl status portal-web
journalctl -u portal-web -f

# Varredura antivírus manual
systemctl start portal-antivirus.service
journalctl -u portal-antivirus -n 50

# Teste pelo caminho do proxy
curl -H 'Host: www.prefeituradecambui.mg.gov.br' http://127.0.0.1/_saude
```
