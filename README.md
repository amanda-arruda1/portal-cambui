# Portal Institucional — Prefeitura Municipal de Cambuí/MG

Portal institucional do município de Cambuí/MG.
Operação e engenharia: **TRUSTIT — Confiança e Tecnologia Ltda.**

> **Estado em 27/08/2026:** Fases 0 a 3 concluídas e **o CMS está ligado** —
> administrador criado, 6 coleções aplicadas, 3 papéis e 50 permissões no
> lugar. O portal e o painel podem ser usados em
> **https://portal.cambui.mg.gov.br** (endereço de homologação, fora dos
> buscadores); o painel fica em `/painel`. O domínio oficial ainda é servido
> pelo **portal antigo** (ASP.NET, outra máquina) — a virada não foi feita.
> O portal está com **conteúdo de demonstração** para visualização; enquanto ele
> existir, o site inteiro exibe uma faixa vermelha de aviso. Ver
> [Conteúdo de demonstração](#conteúdo-de-demonstração) e
> [O que falta](#o-que-falta).

## Stack

| Camada    | Tecnologia                                             |
|-----------|--------------------------------------------------------|
| Frontend  | Astro 5 (SSR, adapter Node) + TypeScript + Tailwind v4 |
| CMS/API   | Directus 11 (headless, pt-BR)                          |
| Banco     | PostgreSQL 16 (locale ICU `pt-BR`)                     |
| Cache     | Redis 7                                                |
| Busca     | PostgreSQL FTS (`portugues_sem_acento`: unaccent + portuguese_stem) |
| Proxy     | Nginx (host, repo nginx.org stable) + Certbot          |
| Runtime   | Docker CE + Compose, Node 22 LTS                       |
| Antivírus | ClamAV (inspeção no ato do envio + varredura horária)  |

## Como as peças se dividem

Nem tudo roda em container, e a divisão é deliberada:

| Onde | O que | Por quê |
|---|---|---|
| **Containers** | Postgres, Redis, Directus | Isolamento e versões fixas. Confinados em `container_t`, volumes rotulados. |
| **Host** | Nginx, Astro (`portal-web`), ClamAV | O Nginx precisa alcançar o Astro em loopback; o Node 22 já é mantido pelo `dnf-automatic`. O confinamento do Astro vem do systemd (`ProtectSystem=strict`, `CapabilityBoundingSet=` vazio, `IPAddressDeny=any`). |

Postgres e Redis **não publicam porta alguma** — nem o host os alcança. O
Directus publica só em `127.0.0.1:8055`. O Astro escuta só em `127.0.0.1:4321`.
O Nginx é o único processo que atende a rede.

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

- `www.prefeituradecambui.mg.gov.br` — portal público **e** painel das
  secretarias (`/painel`)
- `prefeituradecambui.mg.gov.br` — alternativo (redirect para o www)
- `admin.prefeituradecambui.mg.gov.br` — painel do Directus. **O registro DNS
  ainda não existe**, e o acesso é para a TI, não para as secretarias.

- `portal.cambui.mg.gov.br` — **endereço de homologação, no ar**. Serve o portal
  novo para conferência antes da virada. Ver abaixo.

### O endereço de homologação

Descoberto em 27/08/2026: este nome já existia, criado fora do projeto, com o
caminho inteiro montado — só a nossa ponta recusava. O trajeto real é:

```
navegador → NAT 177.10.44.44 → Caddy em 10.180.0.13 → esta VM :80
            (TLS termina no Caddy, certificado Let's Encrypt próprio)
```

**Ele é público.** O DNS é de horizonte dividido: de fora resolve para
`177.10.44.44` (o IP de saída NAT do município); de dentro, para `10.180.5.110`
e `10.180.0.13`. Qualquer pessoa na internet alcança — não é um preview
interno, e o certificado Let's Encrypt só existe porque o nome é publicamente
alcançável.

Consequências que já viraram configuração:

- `X-Robots-Tag: noindex, nofollow, noarchive` e um `robots.txt` que bloqueia
  tudo **apenas neste host** — enquanto o oficial for o portal antigo, este
  endereço serve uma versão em construção do site do município e não pode
  aparecer em buscador. O domínio oficial mantém o `robots.txt` normal.
- A tag `canonical` continua apontando para `www.prefeituradecambui.mg.gov.br`,
  então nem por engano o endereço de homologação disputa indexação.
- `portal.cambui.mg.gov.br` entrou em `security.allowedDomains` no
  `astro.config.mjs` — sem isso, todo formulário do painel levaria 403 neste
  host.

**O painel também responde aqui** (`/painel`), e portanto está exposto à
internet. Hoje o risco é baixo porque o Directus tem zero usuários — não há
credencial que passe. Mas o trecho Caddy → VM ainda é HTTP simples: é rede
interna do município, bem melhor do que a internet aberta, e ainda assim não é
TLS fim a fim. **Antes de cadastrar as secretarias, decidir entre** emitir o
certificado de origem (`05-certificado.sh`) **ou** restringir `/painel` neste
host à faixa da TrustIT.

## Estrutura

```
apps/web/            Frontend Astro (SSR) — portal público e painel
  src/lib/upload/    Inspeção de arquivo enviado (whitelist, magic number, ClamAV)
  src/lib/painel/    Sessão, permissões de tela, fluxo editorial, formulários
  src/lib/sanitizar.ts  Limpeza do HTML de texto rico (gravação e exibição)
  scripts/           Testes executáveis (ver "Verificações")
infra/directus/      esquema.json, papeis.json e os aplicadores (.mjs)
infra/docker/        compose.yaml e inicialização do Postgres
infra/nginx/         nginx.conf, snippets e server blocks
infra/systemd/       Units do portal-web e do timer de antivírus
infra/scripts/       Scripts operacionais numerados
assets/marca/        Brasão e identidade visual
docs/                Relatórios de fase
```

`apps/cms/` e `infra/backup/` estão reservados e ainda vazios — as extensões do
Directus e a rotina de backup são trabalho das próximas fases.

## O que cada fase entregou

| Fase | Entrega | Relatório |
|---|---|---|
| 0 | Inventário e endurecimento do servidor: SELinux enforcing, firewalld, Node 22, Docker, repositório git | [docs/fase-0](docs/fase-0-inventario-e-hardening.md) |
| 1 | Camada de dados (Postgres/Redis/Directus), Nginx configurado, topologia descoberta | [docs/fase-1](docs/fase-1-dados-e-proxy.md) |
| 2 | Portal público SSR no ar atrás do Nginx, ClamAV validado com EICAR | [docs/fase-2](docs/fase-2-aplicacao-e-antivirus.md) |
| 3 | Inspeção de upload, papéis e permissões como código, painel de contribuição completo | [docs/fase-3](docs/fase-3-contribuicao-e-uploads.md) |

## Serviços no ar

Todos habilitados no boot:

| Serviço | Onde |
|---|---|
| `nginx` | porta 80, restrita a `10.180.0.13` |
| `portal-web` | Astro SSR em `127.0.0.1:4321` |
| `docker` | Postgres, Redis e Directus |
| `clamd@scan` | socket `/run/clamd.scan/clamd.sock` |
| `clamav-freshclam` | assinaturas atualizando sozinhas |
| `portal-antivirus.timer` | varredura dos uploads, de hora em hora |

## Segurança do conteúdo

O portal renderiza o corpo das notícias como HTML. Com servidores das
secretarias escrevendo, isso exige duas defesas, e as duas estão ligadas:

- **Arquivo enviado** passa por seis barreiras antes de existir em disco:
  tamanho → extensão (lista de permissão) → formato pelo conteúdo (magic
  number) → coerência entre extensão, conteúdo e MIME → risco dentro do formato
  (JavaScript em PDF, fórmula em CSV) → ClamAV. **Falha fechada**: com o clamd
  fora do ar, nenhum envio é aceito. Arquivo reprovado nunca toca o disco.
- **Texto rico** é sanitizado na gravação (com aviso do que saiu) e de novo na
  exibição — o segundo porque conteúdo também pode entrar pelo painel do
  Directus, que não passa pelo formulário do painel.

Fluxo editorial `rascunho → em_revisao → aprovado → publicado → arquivado`, com
separação de funções (revisor aprova mas não publica), **2FA obrigatório para
publicar** e ninguém aprovando o próprio texto. As permissões são uma matriz
explícita em `infra/directus/papeis.json`.

## Conteúdo de demonstração

O portal pode ser populado com conteúdo **ilustrativo**, para ver como fica
antes de existir conteúdo real:

```bash
cd /opt/portal-cambui
DIRECTUS_EMAIL=<admin> DIRECTUS_SENHA=<...> node infra/directus/popular-demonstracao.mjs --aplicar
node infra/directus/popular-demonstracao.mjs --simular   # só mostra o que faria
DIRECTUS_EMAIL=<admin> DIRECTUS_SENHA=<...> node infra/directus/popular-demonstracao.mjs --remover
```

**Precisa sair antes da virada.** Três coisas seguram esse compromisso:

1. **Reversível por construção.** Cada item criado tem o id anotado em
   `data/demonstracao.json`, e o `--remover` apaga exatamente esses ids. Conteúdo
   que a prefeitura tenha escrito no meio não é tocado — foi verificado.
2. **Aviso amarrado ao dado, não ao domínio.** Enquanto o arquivo de marcação
   existir, TODA página do portal e do painel exibe uma faixa vermelha dizendo
   que o conteúdo é ilustrativo e não tem valor oficial. Esquecer de remover
   antes da virada faz o alarme aparecer no site oficial, em vez de o conteúdo
   falso passar batido.
3. **Nada que possa causar dano isolado do aviso.** Nenhum nome de pessoa,
   telefone, e-mail ou endereço; números de documento com sufixo `-DEMO`; e cada
   resumo diz que é demonstração, para o caso de o texto ser visto fora da
   página. As imagens são gradientes gerados pelo próprio script — fotografia
   daria ao conteúdo falso aparência de reportagem real.

## Rodar localmente

Requer **Node 22 LTS**. O portal público funciona sem o CMS no ar — as seções
degradam para um estado vazio honesto em vez de quebrar.

```bash
git clone <repo> portal-cambui && cd portal-cambui/apps/web
npm ci

# Sem CMS: o portal sobe e mostra as seções vazias.
npm run dev                      # http://localhost:4321

# Com o CMS local (Postgres + Redis + Directus em contêiner):
cd ../.. && cp .env.example .env # preencher as senhas
sudo bash infra/scripts/03-stack-subir.sh
DIRECTUS_EMAIL=<admin> DIRECTUS_SENHA=<...> \
  node infra/directus/popular-demonstracao.mjs --aplicar   # conteúdo ilustrativo
```

Variáveis que o frontend lê (ver `.env.web.example`):

| Variável | Para quê |
|---|---|
| `PUBLIC_SITE_URL` | URL canônica, Open Graph e sitemap |
| `DIRECTUS_INTERNAL_URL` | Onde o CMS responde (padrão `http://127.0.0.1:8055`) |
| `SESSION_DIR` | Diretório de sessões do painel — **lido no BUILD**, não em execução |

Produção: `npm run build` gera `dist/`, servido por `node dist/server/entry.mjs`
sob o serviço `portal-web` (ver a seção de scripts).

## Design

A identidade visual tem plano escrito e autocrítica registrada em
**[DESIGN.md](DESIGN.md)**. Em uma frase: *Cambuí é uma cidade feita de
carreiras — as de ponto das malharias e as de montanha da Mantiqueira —, e o
portal adota a carreira como unidade de composição.*

- **Tokens** em `apps/web/src/estilos/global.css`, amostrados do brasão oficial.
  Nenhum valor de cor ou de tipo aparece solto fora desse arquivo.
- **Contraste** conferido por `ferramentas/contraste.py`: nenhum par em uso
  abaixo de 5,6:1.
- **Elemento-assinatura**: `apps/web/src/componentes/SerraTecida.astro` — a
  silhueta da Mantiqueira preenchida com pontos de tricô.
- **Componentes do sistema**: `Carreira` (a faixa), `LinhaTarefa` (a linha de
  serviço, que substitui o cartão), `Coleta` (o módulo local),
  `BarraAcessibilidade`, `AvisoCookies`.

## Módulo do Órgão Oficial (Diário Oficial)

Área pública em `/diario-oficial`, painel em `/painel/diario`.
Arquitetura, modelo de dados e decisões em
**[docs/arquitetura-diario.md](docs/arquitetura-diario.md)**; roteiro de
conferência em **[docs/validacao-diario.md](docs/validacao-diario.md)**.

> Este módulo é um **instrumento de fé pública**. Um edital publicado errado ou
> uma data de prazo calculada errado não é defeito de interface: é ato
> administrativo com vício. As decisões priorizam correção e rastreabilidade —
> e cada uma está justificada no documento de arquitetura.

### Em um comando

```bash
cd /opt/portal-cambui
npm install
npm run esquema      # coleções + permissões (idempotentes; aceitam --simular)
npm run seed         # 148 edições, ~1.800 matérias, PDFs assinados de verdade
npm run build && sudo systemctl restart portal-web
```

`npm run seed -- --reset` refaz do zero. `npm run seed -- --ate=5` gera só as
cinco primeiras, para iterar rápido.

### Comandos do módulo

```bash
npm run testar          # 25 testes: domínio (prazos, citação, LGPD) e assinatura
npm run verificar       # recalcula o SHA-256 de cada PDF e revalida a assinatura
npm run export          # acervo completo: PDFs + JSON + manifesto com hashes
```

### Endereços

| Rota | O que é |
|---|---|
| `/diario-oficial` | Busca no **texto integral das matérias**, com filtros e contadores |
| `/diario-oficial/materia/<ano>/<slug>` | A matéria, com **referência de citação copiável** |
| `/diario-oficial/edicao/<numero>` | A edição, com sumário e dados da assinatura |
| `/diario-oficial/materia/<ano>/<slug>/certidao` | **Certidão de publicação** em PDF assinado |
| `/diario-oficial/autenticidade` | Conferência por código **ou por upload do PDF** |
| `/diario-oficial/orgao-oficial` | Qual é o veículo, sob qual lei, e **como se contam os prazos** |
| `/diario-oficial/arquivo` · `/arquivo/<ano>` | Calendário marcando os dias de circulação |
| `/diario-oficial/feed.xml` | RSS de novas edições (aceita `?caderno=`) |
| `/api/diario-oficial` | JSON público, mesmos filtros da tela |
| `/diario-oficial/exportar.csv` | Exportação da busca |
| `/diario-oficial/sitemap.xml` | Sitemap próprio (rotas SSR) |
| `/diario-oficial/avisos` | Aviso por e-mail, duplo opt-in |
| `/painel/diario` | Envio → revisão → pauta → fechamento → assinatura → publicação |

### Papéis

Quem escreve não publica; quem publica não assina.

| Papel | Faz | Não faz |
|---|---|---|
| **Redator setorial** | escreve e envia matéria da sua secretaria | publicar |
| **Editor do Diário** | revisa, devolve, monta a pauta, fecha a edição | assinar |
| **Autoridade signatária** | assina e publica | redigir ou alterar texto |
| **Administrador** | configura o veículo e audita | assinar; **apagar nada** |

Criados por `npm run esquema`. Atribuir em `/painel/usuarios`.

### Contas de demonstração

```bash
sudo bash infra/scripts/12-usuarios-demo.sh            # cria as quatro
sudo bash infra/scripts/12-usuarios-demo.sh --remover  # ANTES DA VIRADA
```

Senha das quatro: **`DemoDiario2026!`**

| Entrar como | Para ver |
|---|---|
| `redator@demonstracao.prefeituradecambui.mg.gov.br` | escrever e enviar; **não há** botão de publicar |
| `editor@demonstracao.prefeituradecambui.mg.gov.br` | revisar, devolver, montar pauta, fechar; **não** publica |
| `signataria@demonstracao.prefeituradecambui.mg.gov.br` | publicar; **não** redige |
| `adminDiario@demonstracao.prefeituradecambui.mg.gov.br` | configurar e auditar |

> **Antes da virada**, remova as contas e reative `enforce_tfa` nas políticas do
> Diário. Conta com senha publicada em repositório é porta aberta, e o script de
> criação a desliga a exigência de 2FA para a demonstração funcionar sem
> aplicativo autenticador.

Conteúdo criado pelo painel enquanto o marcador de demonstração existir nasce
marcado como demonstração — senão viraria registro **imutável** que o
`--reset` não alcança.

### O serviço de assinatura

A chave privada que assina como o Município **não fica no processo web** — ele
atende a internet e é a maior superfície de ataque do sistema. Ela vive num
serviço separado, com usuário próprio:

```bash
sudo bash infra/scripts/11-diario-assinatura.sh   # instala portal-diario
systemctl status portal-diario
curl -s http://127.0.0.1:4322/saude
```

Enquanto `DIARIO_CERT` não for preenchido em `.env.diario`, o serviço usa um
certificado de **demonstração** gerado por ele mesmo — e o painel e a página de
autenticidade **dizem isso em voz alta**, em vez de exibir um selo que não vale.

### Imutabilidade

Edição publicada nunca é alterada, substituída ou removida. A regra está no
**banco**, em gatilhos, não na aplicação — porque a aplicação é uma das portas,
e um `psql` às 23h é outra. Correção se faz por **errata** ou **republicação**.

```bash
# prova, em transação, que a regra vale (não deixa resíduo)
set -a; . ./.env; set +a
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" -i portal-postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -f - < infra/directus/diario/testar-imutabilidade.sql
```

## Módulo de licitações

Área pública em `/licitacoes`, painel do setor em `/painel/licitacoes`.
Arquitetura, modelo de dados e decisões em **[docs/arquitetura-licitacoes.md](docs/arquitetura-licitacoes.md)**;
roteiro de conferência em
**[docs/validacao-licitacoes.md](docs/validacao-licitacoes.md)**.

```bash
# popular com 40 licitações de demonstração (PDFs de verdade, datas relativas)
cd /opt/portal-cambui
DIRECTUS_EMAIL=<admin> DIRECTUS_SENHA=<...> node infra/directus/licitacoes/seed.mjs
node infra/directus/licitacoes/seed.mjs --reset          # desfaz
node infra/directus/licitacoes/seed.mjs --reset --aplicar # recria

# esquema e permissões (idempotentes, com --simular)
node infra/directus/licitacoes/aplicar-esquema.mjs
node infra/directus/licitacoes/aplicar-permissoes.mjs
```

**Acesso de demonstração ao painel:** as credenciais do administrador criado em
27/08/2026 estão com a TI — a senha não é versionada. Para criar outro acesso:
`sudo bash infra/scripts/10-primeiro-acesso.sh <e-mail>`.

Endereços do módulo:

| Rota | O que é |
|---|---|
| `/licitacoes` | Listagem com busca, filtros e contadores |
| `/licitacoes/modalidade/<slug>` | URL permanente por modalidade |
| `/licitacoes/<ano>/<slug>` | Página da licitação |
| `/licitacoes/<ano>/<slug>/sessao.ics` | Convite de calendário da sessão |
| `/licitacoes/feed.xml` | RSS (aceita os mesmos filtros) |
| `/licitacoes/modalidade/<slug>/feed.xml` | RSS por modalidade |
| `/api/licitacoes` | JSON público, com os mesmos filtros |
| `/licitacoes/exportar.csv` | Exportação da busca |
| `/licitacoes/avisos` | Cadastro de aviso por e-mail |
| `/licitacoes/avisos/confirmar?t=…` | Confirmação (duplo opt-in) |
| `/licitacoes/avisos/sair?t=…` | Descadastro em um clique |

**Avisos por e-mail — no ar.** O portal enfileira; quem envia é o serviço
`portal-avisos`, disparado de 5 em 5 minutos pelo relay SMTP2GO.

```bash
node infra/scripts/testar-email.mjs <destinatario>   # teste de ponta a ponta
systemctl start portal-avisos.service                # entrega imediata
journalctl -u portal-avisos -f                       # acompanhar
node infra/scripts/enviar-avisos.mjs --simular       # ver o que faria
```

O "De:" é `smtp@mailprotect.com.br` com o nome "Prefeitura Municipal de
Cambuí". Para usar o domínio do município é preciso acrescentar
`include:spf.smtp2go.com` ao SPF de `prefeituradecambui.mg.gov.br` e configurar
DKIM no SMTP2GO — ver [docs/arquitetura-licitacoes.md](docs/arquitetura-licitacoes.md).

## Verificações

Rodam agora, sem depender de nada pendente:

```bash
cd /opt/portal-cambui/apps/web

node scripts/testar-upload.mjs      # 25 inspeções + 7 nomes + EICAR contra o clamd real
node scripts/verificar-campos.mjs   # formulários do painel x esquema do CMS
npx astro check                     # tipos

cd /opt/portal-cambui
python3 ferramentas/contraste.py    # contraste de todos os pares de cor

cd /opt/portal-cambui/infra/directus
node aplicar-papeis.mjs --simular   # revisa as permissões sem token e sem CMS no ar
```

## Ordem de execução dos scripts

Todos em `infra/scripts/`, executados como root.

| # | Script | O que faz | Estado |
|---|--------|-----------|--------|
| 00 | `00-firewalld.sh` | Ativa o firewalld liberando só a 9025 | executado |
| 01 | `01-selinux-relabel.sh` | Põe em permissive, marca autorelabel e reinicia | executado |
| 02 | `02-selinux-enforcing.sh` | Rotula a porta do SSH e vira para enforcing | executado |
| 07 | `07-ip-estatico.sh` | Fixa o IP `10.180.5.110` no NetworkManager | executado |
| 06 | `06-docker-selinux.sh` | Integra o Docker ao SELinux e resobe a stack | executado |
| 03 | `03-stack-subir.sh` | Prepara `data/` e sobe Postgres, Redis e Directus | executado |
| 04 | `04-nginx-instalar.sh` | Instala e configura o Nginx; abre a 80 | executado |
| 08 | `08-portal-web.sh` | Compila o Astro e instala o serviço `portal-web` | executado |
| 09 | `09-clamav.sh` | Instala ClamAV, freshclam e o timer de varredura | executado |
| 05 | `05-certificado.sh` | Emite o certificado de origem (DNS-01) | **pendente** |
| 10 | `10-primeiro-acesso.sh` | Cria o administrador, aplica esquema e papéis | executado |

O 06 vem depois do 02 e antes (ou logo após) o 03, porque reinicia o Docker.
O `04 --abrir-443` só faz sentido quando o proxy passar a encaminhar a 443.

Depois de mexer em `apps/web`:

```bash
cd /opt/portal-cambui/apps/web && npm run build \
  && chown -R root:portal-web dist && chmod -R u=rwX,g=rX,o= dist \
  && systemctl restart portal-web
```

## O que falta

**Já feito em 27/08/2026** pelo `10-primeiro-acesso.sh`: administrador criado
(conta técnica da TrustIT, substituível pelo institucional depois), esquema
aplicado, papéis e permissões aplicados. O ciclo editorial foi exercitado de
ponta a ponta e o item de teste, removido.

**Próximo passo — conteúdo real**, pelo próprio painel:

1. cadastrar as **secretarias** — é o que dá escopo aos redatores;
2. criar as pessoas das secretarias no Directus, com papel e o campo
   `secretaria` preenchido;
3. quem for **Publicador** precisa configurar o segundo fator **antes** de
   receber o papel — a política exige 2FA e a conta fica inacessível sem ele.
   A ordem é: criar como **Revisor** → a pessoa entra e cadastra o autenticador
   em `/painel/conta` → aí sim recebe o papel de Publicador;
4. preencher `apps/web/src/dados/instituicional.ts` quando a prefeitura enviar
   CNPJ, endereço, telefones e horários.

**Bloqueio de segurança — TLS até a origem.** O TLS termina no proxy
(Cloudflare no domínio oficial, Caddy no de homologação) e o último trecho até
esta VM é HTTP simples. É rede interna do município, mas a senha das secretarias
passaria por ele em claro. **Antes de cadastrar as secretarias**, resolver por
um dos dois caminhos: emitir o certificado de origem — falta o token da
Cloudflare com `Zone:DNS:Edit` e o e-mail para avisos — ou restringir `/painel`
à faixa da TrustIT.

**Outras pendências:** faixa de IP da TrustIT (a 9025 está aberta a qualquer
origem e o fail2ban segue parado por isso); o proxy encaminhar a 443; combinar
quando e como o portal novo assume o domínio; vetor do brasão; SMTP; dados
institucionais reais (CNPJ, endereço, telefones, horários) — que ficam num
arquivo só, `apps/web/src/dados/instituicional.ts`.

## Regras de trabalho

- Inventariar antes de alterar; nada é modificado sem registro.
- Segredos apenas em `.env` com permissão `600`. Nunca versionados.
- Parar e perguntar antes de: apagar dados, alterar DNS, emitir certificado em
  produção, abrir porta ou gerar custo.
- Nenhum dado fictício em produção. Onde o dado não existe, o portal diz isso
  em português — não inventa.
- SELinux permanece **enforcing**.
- Documentação e commits em português.
