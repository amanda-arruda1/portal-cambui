# Portal Institucional — Prefeitura Municipal de Cambuí/MG

Portal institucional do município de Cambuí/MG.
Operação e engenharia: **TRUSTIT — Confiança e Tecnologia Ltda.**

## Stack

| Camada    | Tecnologia                                    |
|-----------|-----------------------------------------------|
| Frontend  | Astro 5 (SSR, adapter Node) + TypeScript + Tailwind v4 |
| CMS/API   | Directus 11 (headless, pt-BR)                 |
| Banco     | PostgreSQL 16                                 |
| Cache     | Redis 7                                       |
| Busca     | PostgreSQL FTS (dicionário `portuguese`)      |
| Proxy     | Nginx (host, repo nginx.org stable) + Certbot |
| Runtime   | Docker CE + Compose, Node 22 LTS              |
| Antivírus | ClamAV (varredura obrigatória de uploads)     |

## Arquitetura de rede

Somente **80/443** expostos, atendidos pelo Nginx no host, que faz proxy reverso
para Astro e Directus escutando em `127.0.0.1`. PostgreSQL, Redis, Directus e
Astro ficam na rede interna do Compose. SELinux em modo **enforcing**.
firewalld liberando apenas SSH/9025 (restrito à faixa da TrustIT), 80 e 443.

## Domínios

- `www.prefeituradecambui.mg.gov.br` — principal
- `prefeituradecambui.mg.gov.br` — alternativo (redirect)
- `admin.prefeituradecambui.mg.gov.br` — painel administrativo

## Estrutura

```
apps/web/        Frontend Astro (SSR)
apps/cms/        Configuração e extensões do Directus
infra/docker/    compose.yaml e inicialização do Postgres
infra/nginx/     nginx.conf, snippets e server blocks
infra/scripts/   Scripts operacionais
infra/backup/    Rotinas de backup
assets/marca/    Brasão e identidade visual
docs/            Documentação técnica e relatórios de fase
```

## Regras de trabalho

- Inventariar antes de alterar; nada é modificado sem registro.
- Segredos apenas em `.env` com permissão `600`. Nunca versionados.
- Parar e perguntar antes de: apagar dados, alterar DNS, emitir certificado em
  produção, abrir porta ou gerar custo.
- Nenhum dado fictício em produção.
- SELinux permanece **enforcing**.
- Documentação e commits em português.


## Ordem de execução dos scripts

Todos em `infra/scripts/`, executados como root. Os que mexem em firewall e
SELinux precisam ser rodados pelo operador.

| # | Script | O que faz |
|---|--------|-----------|
| 00 | `00-firewalld.sh` | Ativa o firewalld liberando só a 9025 |
| 01 | `01-selinux-relabel.sh` | Põe em permissive, marca autorelabel e reinicia |
| 02 | `02-selinux-enforcing.sh` | Rotula a porta do SSH e vira para enforcing |
| 06 | `06-docker-selinux.sh` | Integra o Docker ao SELinux e resobe a stack |
| 03 | `03-stack-subir.sh` | Prepara `data/` e sobe Postgres, Redis e Directus |
| 04 | `04-nginx-instalar.sh` | Instala e configura o Nginx; abre 80/443 |
| 05 | `05-certificado.sh` | Emite o certificado e ativa os sites HTTPS |

O 06 vem depois do 02 e antes (ou logo após) o 03, porque reinicia o Docker.

## Estado dos serviços

- **Postgres e Redis** não publicam porta alguma: existem só na rede interna
  do Compose. Nem o host os alcança.
- **Directus** publica em `127.0.0.1:8055`, acessível apenas pelo Nginx.
- **Nginx** é o único processo que fala com a internet, em 80 e 443.
