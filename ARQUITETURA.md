# Módulo de Licitações — arquitetura

## Stack, e por quê

**Astro 5 (SSR, adaptador Node) + Directus 11 + PostgreSQL 16** — a mesma do
portal, sem uma dependência nova de infraestrutura.

A escolha não é inércia; é a leitura do bilhete que o briefing deixou: *"o
hosting de prefeitura é modesto e a manutenção depois será feita por quem tiver
menos contexto que você"*. Um serviço separado significaria segundo processo,
segundo banco, segunda autenticação, segundo deploy e segundo lugar para o
certificado vencer. Entrando no organismo existente, o módulo herda de graça:

| Herdado | O que seria refeito do zero |
|---|---|
| Painel com sessão no servidor, 2FA e papéis | login, senha, recuperação, MFA |
| Inspeção de upload (lista de permissão, número mágico, ClamAV, falha fechada) | validação e antivírus de anexo |
| Sanitização de HTML na gravação e na exibição | XSS no campo "objeto" |
| Tokens de cor, tipografia e movimento do `DESIGN.md` | identidade visual paralela |
| Auditoria nativa do Directus (`directus_revisions`) | log imutável de alterações |
| Backup, TLS, firewall, SELinux | tudo de infraestrutura |

**Sem biblioteca nova em lugar nenhum.** PDF de demonstração, `.ics`, RSS e CSV
são gerados à mão — os quatro formatos somam menos de 400 linhas e não mudam
desde os anos 1990. Uma dependência a mais é uma atualização de segurança a
mais para alguém rodar daqui a três anos.

## Modelo de dados

Cinco coleções no Directus (`infra/directus/licitacoes/aplicar-esquema.mjs`):

```
licitacoes ──┬── licitacao_anexos   (documentos, versionados)
             ├── licitacao_lotes    (lotes/itens e vencedores)
             └── licitacao_eventos  (linha do tempo)

licitacao_assinantes  (avisos por e-mail — base separada e mínima)
```

### As três decisões de modelagem que importam

**1. `status` e `situacao` são campos diferentes.**
`status` (rascunho / publicado / arquivado) governa a **visibilidade** e é o que
a política pública do Directus filtra em *todas* as coleções do portal.
`situacao` (publicada → aberta → … → homologada, mais suspensa, revogada,
anulada, fracassada, deserta) governa o **estado do processo**. Fundir os dois
obrigaria a uma permissão especial só para licitações — e permissão especial é
onde vaza rascunho.

**2. Anexo, lote e evento não têm visibilidade própria.**
São públicos se, e somente se, a licitação-pai estiver publicada. O filtro é
relacional: `{ licitacao: { status: { _eq: 'publicado' } } }`. A alternativa
seria gerenciar `status` em cada anexo — e um anexo publicado por engano numa
licitação em rascunho é exatamente o vazamento que não pode acontecer.

**3. Modalidade é dado, não página.**
A lista vive em `apps/web/src/lib/licitacoes.ts`. A rota
`/licitacoes/modalidade/<slug>`, o filtro, os contadores e o feed por modalidade
saem dela. Acrescentar uma modalidade nova é acrescentar uma linha.

### Preservação

Licitação **nunca é apagada** — muda de estado. Nenhuma política do painel tem
permissão de `delete`, e o script de aplicação recusa um arquivo que a conceda.
Documento **nunca é sobrescrito** — o substituto entra como versão nova, o
anterior é marcado `superado` e continua publicado como histórico. Quem baixou o
edital antigo precisa poder provar o que estava no ar naquele dia.

## Decisões de execução

**Busca e filtros rodam em memória, não no CMS.** O município publica de 100 a
200 licitações por ano; o conjunto publicado é carregado uma vez e guardado por
60 segundos. Isso permite, sem depender do banco: ignorar acento, expandir
sinônimos (`merenda` → `gêneros alimentícios`), tolerar erro de digitação, e —
o que mais importa — **contar quantos resultados cada opção de filtro daria**,
que é o que impede o usuário de cair num filtro vazio sem aviso. O ponto de
troca, se um dia o volume crescer, é um arquivo só.

**Sem paginação.** Paginar de 10 em 10 obrigaria o fornecedor a percorrer telas
para descobrir se há algo do ramo dele. Os resultados vêm agrupados por
urgência — *abrem nos próximos 30 dias*, *em andamento*, *encerradas* — com teto
de segurança em 300.

**Rascunho automático no banco, não no navegador.** "Nova licitação" cria o
registro antes do primeiro campo digitado. `localStorage` protege contra a aba
fechar; rascunho no servidor protege também contra o computador desligar, a
sessão cair e a pessoa continuar de outra máquina.

**Validação separa erro de alerta.** Data no passado, edital ausente, presencial
sem justificativa e sessão anterior à publicação **impedem** publicar. O prazo
mínimo do art. 55 é **alerta**: a lei admite variações que o sistema não tem
como julgar, então deixa passar — exigindo justificativa, que é gravada no
andamento do processo.

**PNCP como fonte, não como dependência.** O servidor cola a URL, o sistema
pré-preenche, ele confere e confirma. A API é tratada como instável de
propósito: nas provas de 28/08/2026 devolveu 500, 503 e 429 em sequência.
Timeout de 8 s, uma repetição, e **degradação silenciosa** para preenchimento
manual — o painel não para porque um serviço federal caiu.

**A faixa da home não é carrossel.** É uma trilha com rolagem **nativa** e
encaixe, que avança um cartão a cada 6 segundos. Rolagem nativa funciona sem
JavaScript, responde ao dedo, à roda e às setas. O avanço para no hover, no
foco, no botão de pausa e ao primeiro toque — e com `prefers-reduced-motion`
**nem começa**.

## Conformidade

- **Publicidade legal** — nota em toda listagem e em toda página de licitação:
  a divulgação oficial ocorre no PNCP e no veículo oficial do Município, e em
  caso de divergência prevalece o edital oficial. Isso protege a Prefeitura.
- **LGPD** — CNPJ de pessoa jurídica é público e aparece; CPF é mascarado por
  `documentoPublico()`. A base de assinantes guarda e-mail, preferências e a
  data do consentimento — nada mais —, nasce não confirmada, não é legível
  publicamente e o descadastro é de um clique. Sem rastreador de terceiros.
- **Orçamento sigiloso** — o valor fica no banco e **não sai** no portal, no
  JSON nem no CSV. O que se divulga é a informação de que é sigiloso.
- **Acessibilidade** — Lighthouse 100 nas quatro páginas do módulo; tabela de
  lotes com cabeçalho associado, formulários com rótulo e erro ligados ao campo,
  situação nunca comunicada só por cor.

## Medido, não estimado

Lighthouse 13.4.1 + Chromium 151, móvel com rede estrangulada:

| Página | Performance | Acessibilidade | Boas práticas | LCP | CLS |
|---|---|---|---|---|---|
| Home (com a faixa) | 99 | 100 | 100 | 1,7 s | 0 |
| Listagem | 93 | 100 | 100 | 2,3 s | 0 |
| Página da licitação | 99 | 100 | 100 | 1,8 s | 0 |
| Avisos por e-mail | 97 | 100 | 100 | 2,3 s | 0 |

Responsividade medida com o navegador: 7 páginas × 4 larguras (360, 768, 1280,
1920) = **28 combinações, nenhuma com rolagem horizontal**.

**Um defeito real que a medição pegou:** a listagem estourava 95 px em 360 px.
Causa: `display: grid` sem `minmax(0, 1fr)` — item de grid nasce com
`min-width: auto` e se recusa a encolher abaixo do conteúdo. Corrigido.

## O que ficou como `TODO`

| Onde | O que falta |
|---|---|
| `licitacoes/avisos` | **Envio de e-mail**: o SMTP do município não existe. A tela registra o interesse e **diz que ainda não envia**, em vez de prometer um e-mail que não chega. Confirmação e descadastro por token já estão modelados. |
| `aplicar-esquema.mjs` | Job de sincronização periódica com o PNCP (comparar o publicado lá com o daqui). A importação sob demanda está pronta; o job é trabalho de infraestrutura. |
| Dados | CNPJ do Município, para montar a URL canônica do PNCP sem depender do que o servidor digitar. |
| Seed | Os 40 registros são de demonstração e saem com `--reset`. **Precisam sair antes da virada.** |
