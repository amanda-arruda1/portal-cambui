# Portal Institucional — Prefeitura Municipal de Cambuí/MG

Portal institucional do município de Cambuí/MG.
Operação e engenharia: **TRUSTIT — Confiança e Tecnologia Ltda.**

> **Estado em 16/10/2026:** o portal novo está no ar em
> **https://portal.cambui.mg.gov.br** (homologação, fora dos buscadores). O CMS é o
> **Payload** (`/cms/admin`); o **Directus foi aposentado** e o painel `/painel` antigo,
> desligado. O domínio oficial ainda é servido pelo **portal antigo** (ASP.NET, outra máquina)
> — a virada de DNS não foi feita. O guia de trabalho (decisões, armadilhas, estado da
> migração) é o **[CLAUDE.md](CLAUDE.md)**.

## Stack

| Camada    | Tecnologia                                             |
|-----------|--------------------------------------------------------|
| Frontend  | Astro 5 (SSR, adapter Node) + TypeScript + Tailwind v4 |
| CMS/API   | Payload CMS 3 (Next.js, sob `/cms`), em `novo-cms-payload/` |
| Banco     | PostgreSQL 16 em contêiner (`payload-postgres`, só em `127.0.0.1:5433`) |
| Proxy     | Nginx (host) + Certbot                                 |
| Runtime   | Node 22 LTS; Docker só para o Postgres do Payload       |
| Antivírus | ClamAV (inspeção no envio + varredura periódica)       |

## Como as peças se dividem

| Onde | O que | Por quê |
|---|---|---|
| **Contêiner** | Postgres do Payload | Versão fixa, sem porta pública. |
| **Host** | Nginx, `portal-web` (Astro), `portal-payload` (Payload), ClamAV, serviços periódicos | O Nginx alcança tudo em loopback. O confinamento vem do systemd (`ProtectSystem=strict`, `CapabilityBoundingSet=` vazio; o `portal-web` ainda com `IPAddressDeny=any`). |

O Astro escuta só em `127.0.0.1:4321`, o Payload em `127.0.0.1:3000` e o Postgres em
`127.0.0.1:5433`. O Nginx é o único processo que atende a rede. O `portal-web` não alcança a
internet: o que vem de fora (indicadores econômicos, previsão do tempo, e-mail) é buscado por
serviços separados, que gravam no Payload.

## Topologia real da rede

Descoberta na Fase 1 e diferente do previsto — vale ler antes de mexer em Nginx
ou certificado:

```
cidadão → Cloudflare (termina o TLS) → proxy 10.180.0.13 → esta VM :80
```

Consequências que já estão no código:

- **A porta 80 é a porta de atendimento**, não trampolim para HTTPS. Um
  `return 301 https://` aqui é laço infinito: a Cloudflare nos repassa em http.
  O redirect http→https é da borda ("Always Use HTTPS").
- **A 80 só aceita `10.180.0.13`** (rich rule do firewalld). A 443 segue fechada
  porque o proxy ainda não encaminha nela.
- `set_real_ip_from 10.180.0.13` + `real_ip_header CF-Connecting-IP` — sem isso o
  limite de taxa trataria o município inteiro como um cliente só.
- **HTTP-01 é inviável** para o certificado: `/.well-known/acme-challenge/`
  devolve 302 do portal antigo. A rota escolhida é Let's Encrypt por **DNS-01**.

SELinux em **enforcing**. firewalld liberando 9025/tcp (SSH) e 80 (restrita ao
proxy).

## Domínios

- `www.prefeituradecambui.mg.gov.br` — portal público (ainda aponta para o portal antigo)
- `prefeituradecambui.mg.gov.br` — alternativo (redirect para o www)
- `portal.cambui.mg.gov.br` — **endereço de homologação, no ar**: portal novo e painel do CMS
  (`/cms/admin`). A tag `canonical` aponta para o `www`, então o endereço de homologação não
  disputa indexação. Está em `security.allowedDomains` do `astro.config.mjs`.

O trecho Caddy → VM ainda é HTTP simples (rede interna do município). Antes da virada, decidir
entre emitir o certificado de origem (`05-certificado.sh`) ou restringir o `/cms/admin` à faixa
da TrustIT.

## Estrutura

```
apps/web/            Frontend Astro (SSR) — portal público
  src/lib/payload.ts    Cliente do CMS (leitura pública) e arquivo()
  src/lib/conteudo.ts   Consultas por página (notícias, serviços, documentos…)
  src/lib/globais.ts    Textos, menu e links vindos dos Globals, com reserva no código
  src/dados/            Valores de reserva (instituicional.ts, cidade.ts)
  scripts/              Verificações executáveis
novo-cms-payload/    Payload CMS: coleções, globals, papéis, migrations, scripts
infra/nginx/         nginx.conf, snippets e server blocks
infra/systemd/       Units dos serviços e timers
infra/scripts/       Scripts operacionais (numerados) e dos serviços periódicos
assets/marca/        Brasão e identidade visual
docs/                Relatórios de fase e dos módulos
```

## Serviços no ar

Todos habilitados no boot:

| Serviço | O que faz |
|---|---|
| `nginx` | porta 80, restrita ao proxy `10.180.0.13` |
| `portal-web` | Astro SSR em `127.0.0.1:4321` |
| `portal-payload` | Payload CMS em `127.0.0.1:3000` (`/cms`) |
| `docker` | Postgres do Payload |
| `portal-pncp` | importação de licitações do PNCP (`127.0.0.1:3100`) |
| `clamd@scan`, `clamav-freshclam` | antivírus e assinaturas |
| `portal-antivirus.timer` | varredura dos uploads |
| `portal-avisos.timer` | entrega dos avisos de licitação por e-mail (5 em 5 min) |
| `portal-indicadores.timer`, `portal-tempo.timer` | indicadores econômicos e previsão do tempo (30 min) |
| `portal-backup.timer`, `portal-backup-teste.timer` | backup diário e ensaio de restauração |

## Design

A identidade visual tem plano escrito e autocrítica registrada em
**[DESIGN.md](DESIGN.md)**. Em uma frase: *Cambuí é uma cidade de serra — a
Mantiqueira que fecha o horizonte e organiza o clima, a estrada e o
calendário —, e o portal adota a carreira (a faixa horizontal) como unidade
de composição.*

- **Tokens** em `apps/web/src/estilos/global.css`, amostrados do brasão oficial.
  Nenhum valor de cor ou de tipo aparece solto fora desse arquivo.
- **Contraste** conferido por `ferramentas/contraste.py`: nenhum par em uso
  abaixo de 5,6:1.
- **Elemento-assinatura**: `apps/web/src/componentes/SilhuetaSerra.astro` —
  a silhueta da Mantiqueira vista de Cambuí, traçada à mão.
- **Componentes do sistema**: `Carreira` (a faixa), `LinhaTarefa` (a linha de
  serviço, que substitui o cartão), `Coleta` (o módulo local),
  `BarraAcessibilidade`, `AvisoCookies`.

## Diário Oficial

O portal **não tem módulo próprio** de Diário Oficial. O Município publica na
plataforma da AMM-MG; o portal só aponta para ela, por um link controlado no CMS
(Global "Links externos", campo `diarioAmm`), usado no menu, no rodapé e em
`/servicos`. O módulo interno (edições, assinatura, certidões) existiu como
protótipo e foi retirado em 2026-10-16; o código está no histórico do git.

## Segurança do conteúdo

- **Arquivo enviado** ao CMS passa por barreiras antes de existir em disco: tamanho → extensão
  (lista de permissão) → formato pelo conteúdo (magic number) → coerência entre extensão,
  conteúdo e MIME → risco dentro do formato (JavaScript em PDF, fórmula em CSV) → ClamAV.
  **Falha fechada**: com o clamd fora do ar, nenhum envio é aceito.
- **Texto rico** é guardado como estrutura (Lexical) e convertido para HTML com sanitização
  na exibição.
- **Fluxo editorial** `rascunho → em_revisao → aprovado → publicado`, com papéis admin /
  revisor / autor, separação de funções e ninguém aprovando o próprio texto. Ninguém apaga
  conteúdo (exclusão lógica). Cada alteração vai para `audit-logs`.

## Módulo de licitações

Área pública em `/licitacoes`; edição no CMS (`/cms/admin`, coleção Licitações, com importação
do PNCP). Arquitetura, modelo de dados e decisões em
**[docs/arquitetura-licitacoes.md](docs/arquitetura-licitacoes.md)**; roteiro de conferência em
**[docs/validacao-licitacoes.md](docs/validacao-licitacoes.md)**.

| Rota | O que é |
|---|---|
| `/licitacoes` | Listagem com busca, filtros e contadores |
| `/licitacoes/modalidade/<slug>` | URL permanente por modalidade |
| `/licitacoes/<ano>/<slug>` | Página da licitação |
| `/licitacoes/<ano>/<slug>/sessao.ics` | Convite de calendário da sessão |
| `/licitacoes/feed.xml` | RSS (aceita os mesmos filtros) |
| `/api/licitacoes` | JSON público, com os mesmos filtros |
| `/licitacoes/exportar.csv` | Exportação da busca |
| `/licitacoes/avisos` | Cadastro de aviso por e-mail (duplo opt-in) |

**Avisos por e-mail.** O portal enfileira no Payload; quem envia é o serviço `portal-avisos`,
pelo relay SMTP2GO.

```bash
node infra/scripts/testar-email.mjs <destinatario>   # teste de ponta a ponta
systemctl start portal-avisos.service                # entrega imediata
journalctl -u portal-avisos -f                       # acompanhar
node infra/scripts/enviar-avisos.mjs --simular       # ver o que faria
```

## Rodar localmente

Requer **Node 22 LTS**. O portal público funciona sem o CMS no ar — as seções degradam para
um estado vazio honesto (e os textos de reserva do código) em vez de quebrar.

```bash
git clone <repo> portal-cambui && cd portal-cambui/apps/web
npm ci
npm run dev                      # http://localhost:4321
```

Variáveis que o frontend lê (ver `.env.web.example`):

| Variável | Para quê |
|---|---|
| `PUBLIC_SITE_URL` | URL canônica, Open Graph e sitemap |
| `PAYLOAD_INTERNAL_URL` | Onde o Payload responde (padrão `http://127.0.0.1:3000/cms`) |
| `PAYLOAD_TOKEN_AVISOS` | Chave da conta de serviço dos avisos do portal |
| `CMS_GLOBAIS` | `payload` liga os Globals (textos, menu, links); ausente = só valores de reserva |

## Verificações

```bash
cd /opt/portal-cambui/apps/web && npx astro check     # tipos
cd /opt/portal-cambui/novo-cms-payload && npx tsc --noEmit -p .
cd /opt/portal-cambui && python3 ferramentas/contraste.py   # contraste de todos os pares de cor
```

## Publicar uma mudança

```bash
# site (Astro) — compilar fora do dist e só trocar se passar
cd /opt/portal-cambui/apps/web && npx astro build --outDir dist-teste \
  && mv dist ../../data/backups/web-dist-antes-$(date +%Y%m%d-%H%M%S) && mv dist-teste dist \
  && chown -R root:portal-web dist && chmod -R u=rwX,g=rX,o= dist && systemctl restart portal-web

# CMS (Payload): migrations, build, permissões e reinício
cd /opt/portal-cambui/novo-cms-payload && npm run payload -- migrate && npm run build \
  && bash ../infra/scripts/13-payload-servico.sh && systemctl restart portal-payload
```

Antes de qualquer mudança em produção: `systemctl start portal-backup.service`.

## Scripts de infraestrutura

Todos em `infra/scripts/`, executados como root.

| # | Script | O que faz |
|---|--------|-----------|
| 00 | `00-firewalld.sh` | Ativa o firewalld liberando só a 9025 |
| 01 | `01-selinux-relabel.sh` | Põe em permissive, marca autorelabel e reinicia |
| 02 | `02-selinux-enforcing.sh` | Rotula a porta do SSH e vira para enforcing |
| 04 | `04-nginx-instalar.sh` | Instala e configura o Nginx; abre a 80 |
| 05 | `05-certificado.sh` | Emite o certificado de origem (DNS-01) — **pendente** |
| 07 | `07-ip-estatico.sh` | Fixa o IP `10.180.5.110` no NetworkManager |
| 08 | `08-portal-web.sh` | Compila o Astro e instala o serviço `portal-web` |
| 09 | `09-clamav.sh` | Instala ClamAV, freshclam e o timer de varredura |
| 13 | `13-payload-servico.sh` | Instala/atualiza o serviço `portal-payload` (não reinicia) |
| 14 | `14-backup.sh` | Instala o backup diário e o ensaio de restauração |
| 15 | `15-nginx-cms.sh` | Regras do `/cms` no Nginx |
| 16 | `16-pncp-servico.sh` | Serviço de importação do PNCP |

## O que falta

- **Virada do domínio oficial** (DNS) e **TLS até a origem** (certificado de origem ou restrição do
  `/cms/admin` à faixa da TrustIT).
- **Faixa de IP da TrustIT** (a 9025 está aberta a qualquer origem e o fail2ban segue parado por isso).
- **Pessoas e contas:** confirmar o papel do Gabriel Veit, criar as contas de revisor e autor,
  decidir se Claudiney (TrustIT) e a informática precisam de conta no `/cms`.
- **LGPD:** nome do encarregado de dados (DPO) em `/privacidade` e revisão jurídica do termo de uso.
- **Backup externo criptografado** (TrustIT).
- **Dados institucionais** que a Prefeitura ainda não enviou, hoje com reserva em
  `apps/web/src/dados/instituicional.ts` (ou nos Globals).
- **Instagram:** o feed mostra prévia simulada até a Prefeitura confirmar a conta e gerar o token.

## Regras de trabalho

- Inventariar antes de alterar; nada é modificado sem registro.
- Segredos apenas em `.env` com permissão `600`. Nunca versionados.
- Parar e perguntar antes de: apagar dados, alterar DNS, emitir certificado em
  produção, abrir porta ou gerar custo.
- Nenhum dado fictício em produção. Onde o dado não existe, o portal diz isso
  em português — não inventa.
- SELinux permanece **enforcing**.
- Documentação e commits em português.
