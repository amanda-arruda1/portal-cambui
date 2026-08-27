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
infra/docker/    docker-compose e Dockerfiles
infra/nginx/     Configuração dos server blocks
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
