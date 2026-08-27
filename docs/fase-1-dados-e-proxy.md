# Fase 1 — Camada de dados e proxy reverso

Registro do que foi construído, testado e do que ficou pendente.
Data: 2026-08-27. Executor: TRUSTIT.

## O que subiu

| Serviço | Versão | Exposição |
|---------|--------|-----------|
| PostgreSQL | 16.15 | nenhuma — só a rede interna do Compose |
| Redis | 7.4-alpine | nenhuma — só a rede interna do Compose |
| Directus | 11.17.4 | `127.0.0.1:8055` |

Verificado: `5432` e `6379` recusam conexão inclusive a partir do host, e a
`8055` não responde pelo IP da LAN (`10.180.5.110`), apenas pelo loopback.

## Decisões e o porquê

**Imagem Debian do Postgres, não Alpine.** A variante Alpine usa musl, sem
locales completos. Num portal em português isso significa ordenação errada de
nomes acentuados. O cluster foi criado com collation ICU `pt-BR`:

```
POSTGRES_INITDB_ARGS="--locale-provider=icu --icu-locale=pt-BR --encoding=UTF8 --locale=C.UTF-8"
```

Resultado conferido no banco em produção: `Álvaro < Ana < Ângela < Zurique`.
Isto só vale na criação do cluster — mudar depois exige recriar o volume.

**Busca insensível a acento.** O dicionário `portuguese` do Postgres faz
stemming mas não remove acento, então quem digitasse "educacao" não acharia
"Educação". `infra/docker/postgres/initdb/10-busca-portugues.sql` cria a
configuração `portugues_sem_acento` (unaccent + portuguese_stem) e a define
como padrão do banco. Conferido: `to_tsquery('educacao & saude')` casa com
"Secretaria de Educação e Saúde de Cambuí".

**Tags fixas nas imagens.** Atualizar versão passa a ser decisão explícita, e
não efeito colateral de um `docker compose pull`.

**HSTS e OCSP stapling deliberadamente fora.** O HSTS entra só depois de a
renovação automática do certificado provar que funciona — é difícil de
reverter, porque o navegador do cidadão passa a recusar `http://` por um ano.
O stapling foi removido porque a Let's Encrypt desativou seus respondedores
OCSP; a diretiva só geraria aviso a cada recarga.

## Defeitos encontrados no próprio trabalho e corrigidos

1. **Redis em loop de reinício.** `cap_drop: [ALL]` tirava o `CHOWN` de que o
   entrypoint precisa para ajustar o dono de `/data`. Resolvido devolvendo
   `CHOWN, DAC_OVERRIDE, SETGID, SETUID`.
2. **Directus com EACCES nos uploads.** Bind mounts criados pelo Docker nascem
   `root:root`, mas o container roda como uid 1000. Resolvido criando os
   diretórios com o dono correto antes de subir (`03-stack-subir.sh`).
3. **`$connection_upgrade` indefinido** no snippet de proxy — faltava o `map`
   no bloco `http`. Sem ele o Nginx nem carregaria.

## Achado de segurança: Docker fora do SELinux

O host está em enforcing, mas o Docker CE não vem com `selinux-enabled`. Os
containers rodavam com `ProcessLabel` vazio — ou seja, **sem confinamento
SELinux nenhum** — e os sufixos `:Z`/`:z` do compose eram registrados e
ignorados, deixando os volumes com o rótulo do host (`usr_t`) em vez de
`container_file_t`.

Na prática: uma fuga de container não encontraria barreira de SELinux, o que
contraria a premissa do projeto. `06-docker-selinux.sh` corrige, e **ainda não
foi executado**.

## Testes realizados

Nginx validado em container (nginx 1.30.4), com certificado autoassinado nos
caminhos reais do Let's Encrypt:

- desafio ACME servido em texto claro na porta 80;
- todo o resto redirecionado com 301 para HTTPS;
- Host desconhecido na 80 → 444; SNI desconhecido na 443 → handshake recusado;
- apex → `www` com 301, preservando o caminho;
- `www` sem o Astro no ar → 502 convertido na página de implantação;
- `/admin` no domínio público → 404;
- HTTP/2 negociado; cabeçalhos de segurança presentes;
- rate limit de `/auth/login` cortando em 503 depois do burst.

## Pendências desta fase

- **`06-docker-selinux.sh` não executado** — containers seguem sem confinamento.
- **`04` e `05` não executados** — Nginx não instalado, 80/443 ainda fechados.
- **Certificado não emitido**, dependente da confirmação de como o tráfego
  externo chega até a VM.
- **Nenhum administrador do Directus criado**: `DIRECTUS_ADMIN_EMAIL` está
  vazio no `.env`, à espera do endereço institucional. O banco tem as 29
  tabelas do Directus e zero usuários.
- **Faixa da TrustIT** ainda não aplicada ao bloco `admin.` do Nginx nem à
  regra da 9025.
