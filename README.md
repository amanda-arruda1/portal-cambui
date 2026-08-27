# Portal Institucional — Prefeitura Municipal de Cambuí/MG

Portal institucional do município de Cambuí/MG.
Operação e engenharia: **TRUSTIT — Confiança e Tecnologia Ltda.**

> **Estado em 27/08/2026:** Fases 0 a 3 concluídas. O portal público e o painel
> de contribuição das secretarias estão **no ar no servidor**, mas o domínio
> ainda é servido pelo **portal antigo** (ASP.NET, outra máquina) — a virada não
> foi feita. O CMS está vazio de propósito: o esquema não foi aplicado porque
> depende de um administrador, que depende do **e-mail institucional**. Ver
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

**Nome interno não previsto (descoberto em 27/08/2026):**
`portal.cambui.mg.gov.br` existe no DNS **interno** do município e aponta para
duas máquinas ao mesmo tempo — `10.180.5.110` (esta VM) e `10.180.0.13` (o
proxy). Ninguém do projeto criou esse registro. Hoje ele **não serve nada**:

- o Nginx daqui não tem `server_name` para esse nome, então devolve `444`
  (fecha a conexão sem responder), que é o comportamento do `default_server`;
- e a porta 80 só aceita conexão vinda de `10.180.0.13`, então um navegador da
  rede que caia no IP da VM é barrado antes do Nginx.

Se a intenção de quem criou era ter um endereço interno para conferir o portal
novo antes da virada, dá para atender: basta declarar o `server_name` e ajustar
a origem liberada. **Precisa de decisão** — abrir a 80 para a faixa interna
amplia a superfície, e é o tipo de mudança que o operador executa.

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

## Verificações

Rodam agora, sem depender de nada pendente:

```bash
cd /opt/portal-cambui/apps/web

node scripts/testar-upload.mjs      # 25 inspeções + 7 nomes + EICAR contra o clamd real
node scripts/verificar-campos.mjs   # formulários do painel x esquema do CMS
npx astro check                     # tipos

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

O 06 vem depois do 02 e antes (ou logo após) o 03, porque reinicia o Docker.
O `04 --abrir-443` só faz sentido quando o proxy passar a encaminhar a 443.

Depois de mexer em `apps/web`:

```bash
cd /opt/portal-cambui/apps/web && npm run build \
  && chown -R root:portal-web dist && chmod -R u=rwX,g=rX,o= dist \
  && systemctl restart portal-web
```

## O que falta

**Caminho crítico — e-mail institucional.** Destrava em cadeia:

1. administrador do Directus (`directus users create`);
2. `infra/directus/aplicar-esquema.mjs` — as 6 coleções;
3. `infra/directus/aplicar-papeis.mjs` — políticas, papéis e permissões;
4. cadastro das pessoas das secretarias, com o campo `secretaria` preenchido.

**Bloqueio de segurança — certificado de origem.** Sem TLS entre o proxy
`10.180.0.13` e esta VM, a senha das secretarias trafega em claro nesse trecho.
**Não cadastrar ninguém no painel antes disso.** Falta o token da Cloudflare com
`Zone:DNS:Edit` e o e-mail para avisos de expiração.

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
