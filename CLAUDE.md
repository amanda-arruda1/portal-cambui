# CLAUDE.md

Orientação para sessões do Claude Code neste repositório — **Portal Cambuí**,
portal institucional da Prefeitura Municipal de Cambuí/MG (operação TrustIT).
Memória detalhada do projeto (todas as fases, decisões, pendências) vive em
`/root/.claude/projects/-root/memory/` — ler lá antes de reconstruir contexto
do zero.

## Stack e estrutura

- **Astro 5** (SSR, adapter Node) + TypeScript + Tailwind v4 — `apps/web/`
- **Directus 11** (headless CMS, pt-BR) — schema declarativo em
  `infra/directus/esquema.json`, aplicado via `infra/directus/aplicar-esquema.mjs`;
  permissões em `infra/directus/papeis.json`, aplicadas via
  `infra/directus/aplicar-papeis.mjs`
- **Payload CMS 3** (Next.js) — o CMS novo, em `novo-cms-payload/`, em migração
  coleção a coleção a partir do Directus. **Os dois convivem**: veja a seção
  "Migração Directus → Payload" abaixo antes de mexer em qualquer conteúdo
- PostgreSQL 16, Redis 7, tudo em Docker Compose (o Payload tem Postgres próprio:
  `novo-cms-payload/docker-compose.yml`)
- Produção: `/opt/portal-cambui`, rodando como root no servidor Rocky Linux,
  branch de trabalho atual `melhoria/dobra-no-celular`
- Depois de qualquer mudança em `esquema.json` ou `apps/web/src/lib/painel/campos.ts`:
  rodar `apps/web/scripts/verificar-campos.mjs` para confirmar que o painel e
  o schema continuam sincronizados

## Armadilhas conhecidas (aprendidas em produção)

- **`aplicar-esquema.mjs` só cria coleções novas** — não adiciona campo a
  coleção já existente. Para isso: `POST /fields/<colecao>` direto na API do
  Directus (com `DIRECTUS_TOKEN_ESQUEMA` do `.env`), e também em `/relations`
  se for campo de arquivo.
- **O Directus recusa a consulta INTEIRA se um único campo pedido não tiver
  permissão** — não omite só o campo problemático, devolve 403 pra chamada
  toda. Um `fields=...,arquivo.filename_download` sem permissão nesse campo
  específico zera silenciosamente a lista inteira. `apps/web/src/lib/directus.ts`
  trata isso como "indisponível" (não lança erro), o que faz o sintoma
  parecer "não tem nada cadastrado" em vez de "a consulta falhou" — foi a
  causa real do bug de "anexos sumidos" em Licitações e Obras (ver sessão
  abaixo). Antes de pedir um campo de `directus_files` (ou qualquer relação)
  numa consulta pública, confirmar que o papel Public tem permissão nele.
- **Ordenar por `date_updated` sem cuidado é perigoso**: em ordem
  DESCendente, o Postgres põe `NULL` **primeiro**. Registros nunca editados
  desde a importação (comum em dados migrados em lote) dominam o topo da
  lista e empurram os itens editados de verdade pra fora de qualquer limite
  fixo de exibição. Preferir ordenar por um campo textual (nome/rótulo)
  quando o objetivo é "achar um item específico", não "ver o que mudou
  recentemente".
- Helpers de formatação de contato ficam em `apps/web/src/lib/formato.ts`
  (`linkMapa`, `linkWhatsapp`, `linkTelefone`, `numerosTelefone`) — reusar,
  não reimplementar.
- Sanitização de HTML rico: `apps/web/src/lib/sanitizar.ts`. A mesma config
  é reaproveitável em scripts de importação via
  `apps/web/node_modules/sanitize-html/index.js`.
- Verificação de páginas: sempre com navegador real (Chromium headless +
  CDP), não só `curl` — regressão visual só aparece no DOM renderizado. O
  domínio público (`prefeituradecambui.mg.gov.br`) ainda aponta pro site
  antigo (troca de DNS não aconteceu); pra testar o portal novo por dentro:
  `curl -H "Host: www.prefeituradecambui.mg.gov.br" -H "X-Forwarded-Proto: https" http://127.0.0.1/<rota>`
  (mesmos headers valem apontando um Chromium pro `127.0.0.1`).
- **Nunca commitar nem dar `git push` sem aprovação explícita do usuário**
  ("sim, pode commitar"). Depois de aprovado, o `push` pode ser automático,
  sem pedir confirmação separada.
- Regra permanente do projeto: **nunca inventar dado**. Informação não
  confirmável por uma fonte real (site antigo, o próprio usuário) — perguntar,
  nunca supor.

## Backup (desde 2026-10-14)

Snapshots diários em `/var/backups/portal-cambui/AAAA-MM-DDTHHMMSS/` (modo 700, só root), às 02:30
(`portal-backup.timer`). Cada snapshot tem `bancos/` (pg_dump -Fc do Directus e do Payload),
`arquivos/` (uploads do Directus, media do Payload, acervo do Diário, marco dos avisos) e `segredos/`
(os `.env`). Arquivo igual ao do dia anterior vira hardlink, então só o que mudou ocupa espaço; por isso
os arquivos do snapshot são 0400 e **nunca se faz `chmod`/edição dentro dele** (alteraria todos os
snapshots que compartilham o inode). Retenção: 14 diários + 8 semanais + 6 mensais.
Instalar/reinstalar: `infra/scripts/14-backup.sh` (idempotente). Rodar agora:
`systemctl start portal-backup.service`. Estado: `cat /var/backups/portal-cambui/ULTIMO_STATUS.json`.
- **Ensaio de restauração semanal** (`portal-backup-teste.timer`, domingo 05:00) e sob demanda:
  `node infra/scripts/backup-testar-restauracao.mjs [snapshot]` — restaura os dumps num Postgres
  temporário sem rede, compara a contagem de linhas com os bancos reais e confere se todo arquivo
  referenciado pelo banco existe no snapshot. Falha de backup ou de ensaio = unit `failed` + linha
  crítica no journal (`journalctl -t portal-backup`), que é o que um agente de monitoramento enxerga.
- **LIMITE: é backup NO MESMO DISCO.** Protege de erro humano, migração ruim e exclusão acidental;
  **não protege de perda do disco/VM**. Falta cópia externa e cifrada (o `segredos/` tem senhas): precisa
  de um destino definido pela TrustIT/prefeitura. Ponto de encaixe documentado no fim de `backup.mjs`.
- Para restaurar de verdade: `pg_restore --clean --if-exists -d <banco>` do dump no container certo e
  copiar `arquivos/<x>/` de volta; **teste antes com o ensaio**. O Directus guarda a lista de arquivos no
  banco (`directus_files`), então banco e uploads têm de vir do MESMO snapshot.
- `backup.mjs` ignora `directus-health-file` (batimento que o Directus reescreve a cada poucos minutos) e a
  verificação pula arquivos que a aplicação reescreveu depois da cópia, como `data/avisos/ultima-execucao.json`.

## Migração Directus → Payload (em andamento desde 2026-10-14)

Detalhes e histórico em `/root/.claude/projects/-root/memory/portal-cambui-migracao-payload.md`.

**Estado.** Lêem do Payload no ar: telefones úteis, coleta de lixo, conselhos municipais,
patrimônio cultural, secretarias, notícias, páginas e documentos. Ainda no Directus: licitações (+ anexos,
lotes, eventos, assinantes), obras e o **Diário Oficial** (`diario_*`, fora do escopo da migração:
imutabilidade no banco + assinatura em serviço separado). `servicos`, `links_uteis`, `selos` e
`perguntas_frequentes` têm 0 registros e nenhuma página consome `links_uteis`: nada a migrar até alguma
página precisar. **Não apagar o Directus**: o `/painel` de contribuição, o Diário, licitações/obras, o
serviço de avisos e as permissões dos redatores ainda dependem dele. Levantamento de Licitações (por que
adiar e o que falta decidir): memória do projeto, `portal-cambui-migracao-payload.md`.

**Como o site escolhe a fonte.** Uma variável por coleção em `/opt/portal-cambui/.env.web`
(`CMS_TELEFONES`, `CMS_COLETA_LIXO`, `CMS_CONSELHOS`, `CMS_PATRIMONIO`, `CMS_SECRETARIAS`,
`CMS_NOTICIAS`, `CMS_PAGINAS`, `CMS_DOCUMENTOS`), valor `payload` liga; ausente = Directus. Nomes em `apps/web/src/lib/payload.ts`
(`COLECOES_MIGRAVEIS`), que também tira a coleção da lista editável do `/painel` antigo (senão
alguém grava no Directus algo que o site não mostra). **Desfazer = apagar a linha e
`systemctl restart portal-web`.** Mudou código do site: `npm run build` em `apps/web`, depois
`chown -R root:portal-web dist && chmod -R u=rwX,g=rX,o= dist` e `systemctl restart portal-web`
(o `dist` em produção NÃO se atualiza sozinho; guarde uma cópia em `data/backups/` antes).

**Operação do Payload.** Serviço `portal-payload` (unit em `infra/systemd/`, instalador
`infra/scripts/13-payload-servico.sh`, idempotente), só em `127.0.0.1:3000`; banco no container
`payload-postgres` (`127.0.0.1:5433`). Painel: `https://portal.cambui.mg.gov.br/cms/admin` (ver "Painel do Payload publicado"). Mudou código/coleção do Payload:
`npm run build` em `novo-cms-payload`, rodar o script 13 (refaz permissões) e
`systemctl restart portal-payload`.

**Painel do Payload publicado: `https://portal.cambui.mg.gov.br/cms`** (mesmo domínio do site; nenhum DNS nem site novo no
Caddy). O Payload roda com `basePath: '/cms'` (`novo-cms-payload/next.config.ts`, FIXO no código: precisa ser igual no
build e no start): admin em `/cms/admin`, API em `/cms/api`, assets em `/cms/_next`. O Nginx (`snippets/cms-caminho.conf`,
incluído no server do portal em `conf.d/10-http.conf`) repassa o prefixo SEM tirá-lo (`proxy_pass` sem URI). O `/painel`
(Astro) NÃO foi tocado: `/painel` é o painel atual (Licitações, Obras, Diário) e `/cms` é o do Payload; quando o atual
sair, o Payload pode assumir `/painel`. Instalar/reinstalar as regras: `sudo infra/scripts/15-nginx-cms.sh`
(`--simular`, `--remover`; idempotente, `nginx -t` antes, desfaz se falhar). Túnel (sem passar pelo Nginx):
`ssh -L 3000:127.0.0.1:3000 -p 9025 <usuário>@<servidor>` e `http://localhost:3000/cms/admin`.
- **O site lê o Payload por `PAYLOAD_INTERNAL_URL=http://127.0.0.1:3000/cms`** (`.env.web`, e o padrão em `lib/payload.ts`).
  O prefixo faz parte da URL base: sem ele o site perde telefones, notícias, secretarias etc. SEM erro (cada página mostra
  "indisponível"). Mudar o `basePath` exige mudar isso junto e reiniciar `portal-payload` e `portal-web` em sequência (a
  janela foi de ~6 s na virada).
- **`PAYLOAD_ORIGENS_PERMITIDAS=https://portal.cambui.mg.gov.br` (no `.env` do Payload) NÃO é opcional**: com a lista `csrf`
  vazia o Payload aceita requisição por cookie de QUALQUER origem (sem proteção CSRF); com a lista, só as dela, e uma
  requisição com cookie SEM `Origin` e sem `Sec-Fetch-Site` (não é navegador) é tratada como anônima. Sem o nome público
  na lista o painel abre mas "não deixa fazer nada". Scripts HTTP de teste precisam mandar `Origin`.
- **IP real atrás do Caddy** (corrigido em 2026-10-14): o `nginx.conf` só confia em `CF-Connecting-IP` (Cloudflare); pelo Caddy
  (`10.180.0.13`) todo acesso aparecia com o IP do proxy, então o limite de login (`zone=login`, 5/min por IP) era UM
  contador para todo mundo e restrição por faixa de IP não funcionaria. O Caddy manda o cliente em `X-Forwarded-For`
  (conferido com tcpdump); o server do `portal.cambui.mg.gov.br` tem `real_ip_header X-Forwarded-For;` (vale só nele; o
  `set_real_ip_from 10.180.0.13` do `nginx.conf` garante que XFF de outra origem é ignorado). Vale também para o login do
  `/painel`. **Quando o domínio de produção passar pela Cloudflare → Caddy, rever** (a cadeia terá mais saltos no XFF).
- **Usuários e papéis**: `users.papel` (`administrador` | `editor`); só administrador cria usuários, vê a lista e muda
  papel; os demais editam só o próprio cadastro. O PRIMEIRO usuário de um banco novo vira administrador sozinho (hook).
  Senha mínima de 12 caracteres; 5 erros bloqueiam a conta por 15 min; cookie `Secure` + `SameSite=Lax` (cookie com
  `Path=/`, então o navegador o envia também ao site e ao `/painel`; é `HttpOnly`); GraphQL fechado no Nginx. Esqueci-a-senha
  NÃO entrega e-mail (o Payload escreve no console: sem adaptador) — por ora quem administra redefine a senha.
- **Nginx instalado ≠ repositório**: o `nginx.conf` instalado ainda tem `client_max_body_size 50m`; o do repositório diz
  200m (nunca aplicado). O snippet do `/cms` fixa 200m só para o painel.
- **Armadilhas ao mexer no Nginx**: `systemctl reload` só envia o sinal — verificar logo depois devolve a resposta dos
  processos antigos (espere o `/cms/admin` dar 200); `return 301 /caminho` gera `http://host:porta/…` (use
  `$esquema_publico://$host/…` atrás do proxy); `curl -I` faz `HEAD`, que várias rotas do Payload não implementam (404 falso);
  `/_saude` tem `access_log off` (não aparece no log); valide mudanças numa cópia isolada do Nginx em porta alta antes.

**Esquema do banco = MIGRATIONS** (`novo-cms-payload/src/migrations/`; `push: false`). Mudou campo
ou coleção: `npm run payload -- migrate:create <nome>`, ler o arquivo gerado, `npm run payload --
migrate`. O serviço roda em produção e NÃO altera esquema sozinho. Reconstruir do zero:
`docker compose up -d`, `npm run payload -- migrate`, `npx payload run scripts/migrar-dados.ts`.
O banco atual foi criado por *push* e tem a migration inicial registrada à mão em
`payload_migrations` (esquema conferido idêntico ao gerado pela migration: colunas, 30 PK, 50 FK,
198 índices). **Nunca rodar `migrate` num banco que tenha `name='dev'` em `payload_migrations`**: o
Payload faz uma pergunta que, confirmada, apaga os dados (o script 13 recusa e aborta).

**Migrar a próxima coleção — roteiro.**
1. Payload: leitura pública só dos publicados (`leituraPublicaPublicados` em
   `collections/_base.ts`); texto rico → `campoHtmlDe('campo')` (vira `campoHtml` em HTML);
   mudou campo → migration.
2. Site: acrescentar a chave em `CHAVES` (`payload.ts`), escolher a fonte na função de
   `conteudo.ts` e **mapear campo a campo** para o formato que as páginas já usam (ver armadilhas).
3. **Comparar as páginas nas duas fontes antes de ligar**: subir dois `astro dev` (portas de
   teste, `IMAGENS_DIR` num diretório temporário), um com a variável em `directus` e outro em
   `payload`, e comparar título, meta description, links, imagens e texto — **em série**, não em
   paralelo. Comparar também CONTAGEM de links e baixar os arquivos (SHA-256).
4. Backup do `dist`, build, variável no `.env.web`, restart, conferir no ar pelo Nginx.
5. Só commitar/push com aprovação (regra do projeto, abaixo).

**Armadilhas da migração (todas já aconteceram).**
- **A API do Payload devolve camelCase** (`urlExterna`); as páginas esperam os nomes do Directus
  (`url_externa`). Campo sem sublinhado passa batido e o campo com sublinhado some em silêncio
  (um link externo ficou sem `href`). Mapear explicitamente.
- **Texto rico**: Payload guarda JSON do Lexical; o site precisa de HTML → use `campoHtmlDe` e
  `reescreverMidia()`. Links de arquivo ficam `/api/media/file/<nome>` no HTML e viram `/midia/<nome>`.
- **Formatação do texto rico se perde em silêncio**: o conversor padrão do Payload escreve tachado/sublinhado como
  `<span style="text-decoration…">` e o sanitizador do site REMOVE style e span de propósito — um dispositivo de lei
  revogado (tachado) aparecia como se estivesse em vigor. `campos-html.ts` tem um conversor de texto próprio
  (`<s>`, `<u>`). Comparar texto e links NÃO pega isso: compare caractere a caractere (negrito/tachado/em link).
- **UUIDs do Directus escritos no código do site** (ex.: `ID_ORGANOGRAMA`, `ID_IMAGEM_ORGANOGRAMA` em
  `estrutura-administrativa.astro`): no Payload valem pelo `idLegado` (`documentoPorId`, `marcadorPorIdLegado`).
  Arquivo que só o código referencia não é trazido pela migração por coleção: entra em `ARQUIVOS_AVULSOS` de
  `migrar-dados.ts` (`--somente=avulsos`; uma rodada completa reconverte o texto rico e muda o `updatedAt`).
- **Datas do tipo `date`**: o Payload devolve meia-noite UTC (`2026-09-11T00:00:00.000Z`), que no fuso de Brasília
  cai no dia anterior; o site normaliza para `AAAA-MM-DD` (`documentoDoPayload`).
- **Arquivos e imagens**: `/midia/<nome>` (`apps/web/src/pages/midia/[...nome].ts`) repassa o
  arquivo do Payload e, com `width/height/quality/fit/format`, redimensiona com `sharp` e cacheia
  em `/var/lib/portal-cambui/imagens` — equivalente ao `/assets/` do Directus (Nginx). O dado do
  Payload entra nas páginas como marcador `midia:<nome codificado>` e `arquivo()`
  (`lib/directus.ts`) o converte; nenhuma página precisou mudar.
- **Operador de busca**: usar `contains`, nunca `like` (o `like` do Payload exige todas as palavras
  em qualquer ordem). `textoBusca` (notícias) é texto puro gerado por hook e removido da resposta.
- **`payload.update` sobrescreve `updatedAt`** mesmo se for passado em `data`. Backfill que
  precise preservar datas: SQL direto, ou restaurar depois.
- O Payload (sharp) **recodifica imagens `.webp` ao gravar**: o `migrar-dados.ts` restaura os bytes
  originais. Soft delete = `status: arquivado` (o `trash` do Payload é incompatível com
  `delete: () => false`).
- `docker exec` **sem `-i` descarta o heredoc/stdin** — o SQL "roda" sem fazer nada. Use `-i`.
- `semHtml()` decodifica só `&quot; &amp; &#39; &nbsp;` e **não** `&lt;`/`&gt;`, de propósito.
- **Deriva de secretarias**: o Directus mantém a própria tabela `secretarias`, usada por licitações,
  obras, serviços e pelo escopo do `/painel`. Mudar **nome ou slug** de uma secretaria vale nos DOIS
  lugares até essas coleções migrarem (a página `/secretarias/[slug]` casa notícias por slug).

## Sessão de 2026-09-11 — o que foi feito

**Biografia dos responsáveis pelas secretarias**
Trazida do site antigo a biografia de cada Secretário, que tinha ficado de
fora da migração original. Campo novo `secretarias.biografia_responsavel`
(criado direto via API do Directus, rich text — a coleção já existia, então
`aplicar-esquema.mjs` sozinho não bastava) — exibido em
`/secretarias/[slug]`, editável pelo painel.

**Limpeza de números "98707" e endereço no rodapé**
Removidos/substituídos todos os telefones com prefixo morto `98707` (a
Prefeitura não usa mais essa faixa), em `secretarias` e `telefones_uteis` —
a maioria virou `null`, alguns foram trocados pelo número real informado
pela usuária (ex.: Assistência Social → (35) 99983-5962). Endereço da sede
no rodapé (`Rodape.astro`) passou a linkar pro Google Maps, no mesmo padrão
já usado em outros pontos do site.

**Secretarias de volta em `/telefones`**
O site antigo listava as secretarias junto dos telefones úteis; o novo não
trazia — usuária percebeu a falta ao tentar achar um contato. `telefones.astro`
passou a mostrar um grupo "Secretarias" no topo da lista, com endereço,
telefone, e-mail e link "Ver secretaria →" pra página própria de cada uma.

**Bug de listagem no painel (`/painel/<coleção>`)**
`listarFila()` buscava só os 50 itens mais recentes por `-date_updated`.
Como a maioria dos registros importados em lote nunca foi editada
(`date_updated` nulo) e nulo em ordem decrescente vem primeiro no Postgres,
itens editados de verdade ficavam fora da tela — foi assim que a usuária não
conseguiu achar o registro "SCFV" em Telefones Úteis (83 registros) pra
corrigir um número. Mesmo problema em Notícias (420 registros, só 50
visíveis) e Coleta de Lixo (57). Corrigido: ordenação alfabética pelo rótulo
+ campo de busca + sem teto de exibição.

**Licitações "sumidas" do painel**
697 licitações já cadastradas (e o próprio formulário de cadastro de nova
licitação, que já existia e é completo) ficavam invisíveis pra usuária
porque só apareciam num link do menu do topo — não na tela inicial do
painel (`/painel`), nem entre os "cartões" de coleção que ela olhava.
Adicionados atalhos na tela inicial pra Diário Oficial, Licitações e Obras
Públicas — o de Licitações já com o botão "+ Publicar nova licitação" e a
contagem de rascunhos pendentes. Removido também um teto de exibição de 200
(de 697) na listagem interna de licitações.

**Editais de licitações antigas "não anexados" — duas causas empilhadas**
1. *Rótulo errado na migração*: 523 de 697 licitações tinham o PDF do
   edital anexado no Directus, mas nenhum arquivo marcado com `tipo=edital`
   — todos entraram como `anexo_do_edital` genérico na importação em lote,
   então a página pública achava que não havia edital publicado. Corrigido
   em 694/697 por evidência no nome do arquivo (arquivo único no grupo; nome
   contendo "edital"; ou nome batendo com o número oficial do processo).
   Quando havia versão original **e** retificada, as duas foram mantidas
   (`tipo=edital` nas duas, `superado: true` na antiga, `false` na atual) —
   preserva o histórico, nada foi apagado. 3 licitações ficaram
   propositalmente sem marcação por ambiguidade real entre arquivos
   candidatos (083/2021, 038/2026, concorrência 003/2023 do estacionamento
   rotativo — recurso administrativo no meio do processo).
2. *Bug de permissão* (causa raiz mais grave, achada só ao testar o fix
   acima): ver a armadilha "Directus recusa a consulta inteira..." lá em
   cima. A lista de anexos vinha SEMPRE vazia pra qualquer licitação —
   mesmo as já corretamente marcadas antes de hoje — e pro mesmo padrão em
   Obras Públicas (`obra_anexos`). Campo `arquivo.filename_download` não é
   usado em nenhuma tela — removido das consultas em `apps/web/src/lib/licitacoes.ts`
   e `apps/web/src/lib/obras.ts`.

Commits desta sessão (branch `melhoria/dobra-no-celular`): biografia dos
responsáveis; limpeza de números 98707 + mapa no rodapé; secretarias em
`/telefones`; fix da listagem do painel (`listarFila`); licitações visíveis
na tela inicial do painel; fix do bug de permissão em anexos de licitações e
obras. As ~555 correções de rótulo de edital foram só dado (gravado direto
no Directus), sem commit de código associado.
