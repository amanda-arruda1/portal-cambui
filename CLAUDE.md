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
- PostgreSQL 16, Redis 7, tudo em Docker Compose
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
