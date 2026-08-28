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

## Avisos por e-mail — como funciona

**O portal não envia e-mail. Ele enfileira.**

```
formulário ──► licitacao_envios ──► serviço portal-avisos ──► SMTP do município
 (portal-web,      (a fila)          (timer, 5 em 5 min)
  sem saída
  para a rede)
```

A separação existe porque o `portal-web` roda com `IPAddressDeny=any`: dar
saída para a internet ao único processo exposto ao cidadão, só para mandar
mensagem, aumentaria a superfície de ataque sem necessidade. Enfileirar também
dá, de graça: repetição com espera crescente (2, 4, 8… até 60 min, desistindo
na 5ª), limite de vazão, e servidor de e-mail fora do ar **não trava o cadastro
de ninguém** — a fila é durável e sai na execução seguinte.

**Duas credenciais, dois lugares.** O token em `.env.web` (processo web) só
*escreve* na fila e não consegue lê-la; o token em `.env` (serviço de entrega)
lê e atualiza a fila mas não cadastra ninguém. A propriedade que isso compra: a
fila carrega corpo de e-mail e token de descadastro de cada assinante — se o
token exposto à internet vazar, o atacante não lê a fila.

**Cliente SMTP escrito à mão** (`infra/scripts/smtp.mjs`): EHLO, STARTTLS,
AUTH LOGIN/PLAIN, MIME multipart com assunto em RFC 2047. São 150 linhas de um
protocolo que não muda desde 1998 — uma dependência a menos para alguém
atualizar num servidor de prefeitura daqui a cinco anos.

**Por onde sai, e por que não pelo servidor do município.** O envio usa o
relay transacional **SMTP2GO** (`mail.smtp2go.com:2525`), não o servidor de
caixa postal da prefeitura — que exige a senha de uma caixa e recusa relay de
terceiros (`530 5.7.0 Authentication required`, conferido). Relay transacional é
o certo para envio automático: reputação de IP separada da correspondência
humana, e rastreamento por mensagem.

**O remetente NÃO é `@prefeituradecambui.mg.gov.br`, e isso é uma restrição de
DNS, não uma escolha.** O SPF do município é `v=spf1 include:spf.m9.network
-all`, e `spf.m9.network` é uma lista fixa de IPs que não inclui o SMTP2GO:
sair como o domínio da prefeitura por este relay falharia o SPF de forma rígida
e a mensagem seria descartada no destino. `mailprotect.com.br`, ao contrário,
tem `include:spf.smtp2go.com`. Para usar o domínio do município, é preciso
acrescentar esse include ao SPF dele e configurar DKIM — mudança de DNS, do
cliente. O nome de exibição já é "Prefeitura Municipal de Cambuí".

**Detalhes que decidem se o e-mail chega:** `List-Unsubscribe` com
`One-Click`, que é o que faz o botão nativo de cancelar inscrição aparecer no
Gmail e no Outlook — sem ele, quem quer sair marca como spam e a reputação do
domínio da prefeitura paga; `Auto-Submitted: auto-generated`, para que resposta
automática de férias não volte para a fila; e corpo em texto **e** HTML, porque
cliente de e-mail de prefeitura ainda é Outlook antigo.

**LGPD na prática:** o journal do servidor **nunca** registra o endereço de
quem se cadastrou; o descadastro **apaga** o registro em vez de marcá-lo como
inativo; e o e-mail repetido devolve a mesma resposta de sucesso, para o
formulário não virar um verificador de quem está inscrito.

**A primeira execução não dispara aviso retroativo:** ela só grava o marco. Sem
isso, ligar o serviço mandaria 40 e-mails de licitações antigas para cada
assinante.

## O que ficou como `TODO`

| Onde | O que falta |
|---|---|
| DNS | **`include:spf.smtp2go.com` no SPF de `prefeituradecambui.mg.gov.br`** e DKIM no painel do SMTP2GO. Sem isso o "De:" precisa continuar sendo `@mailprotect.com.br` — funciona, mas o cidadão vê um domínio que não é o da prefeitura. |
| `aplicar-esquema.mjs` | Job de sincronização periódica com o PNCP (comparar o publicado lá com o daqui). A importação sob demanda está pronta; o job é trabalho de infraestrutura. |
| Dados | CNPJ do Município, para montar a URL canônica do PNCP sem depender do que o servidor digitar. |
| Seed | Os 40 registros são de demonstração e saem com `--reset`. **Precisam sair antes da virada.** |
