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

---

## Revisão de 2026-08-27 — o portal está atrás da Cloudflare

O levantamento anterior parou em "existe um proxy `10.180.0.13` que encaminha
a porta 80 para esta VM". A resolução dos nomes mostrou o resto do caminho:

    cidadão -> Cloudflare (termina o TLS) -> proxy 10.180.0.13 -> esta VM:80

Evidências, todas de 2026-08-27:

- `www` e o apex resolvem para IPs da Cloudflare (`104.21.77.119`,
  `172.67.207.93` e IPv6 `2606:4700::/32`); respostas trazem `server: cloudflare`
  e `cf-ray`.
- O que responde hoje **é o portal antigo**, um ASP.NET MVC 5
  (`x-aspnetmvc-version: 5.2`, erros em `/Erro?aspxerrorpath=`), 166 KB de HTML.
  Não é esta VM — a 80 daqui segue fechada no firewalld.
- O certificado público é da **Google Trust Services** via Cloudflare, cobrindo
  `prefeituradecambui.mg.gov.br` e `*.prefeituradecambui.mg.gov.br`, válido até
  2026-11-09 e renovado pela própria Cloudflare.
- `admin.prefeituradecambui.mg.gov.br` **não resolve**: o registro não existe.
- `http://www…/.well-known/acme-challenge/<token>` devolve **302** para a página
  de erro do portal antigo. O desafio HTTP-01 nunca chega até nós.

### O que mudou na configuração

1. **Sem redirect para HTTPS na origem.** O `10-http.conf` fazia
   `return 301 https://$host` em tudo. Nessa topologia isso é um laço: a
   Cloudflare já atendeu o cidadão em https e nos repassa em http; devolver
   https manda o cidadão de volta para ela. O redirect http→https passa a ser
   responsabilidade da borda ("Always Use HTTPS" no painel).
2. **A porta 80 virou a porta de atendimento de verdade**, não um trampolim.
   Os corpos dos sites saíram para `snippets/site-publico.conf` e
   `snippets/site-admin.conf`, incluídos tanto na 80 quanto na 443 — servir o
   mesmo conteúdo em duas portas com dois textos garantiria divergência.
3. **IP real do cidadão** via `set_real_ip_from 10.180.0.13` +
   `real_ip_header CF-Connecting-IP`. Sem isso todo acesso chegava como o IP do
   proxy e o rate limit tratava o município inteiro como um cliente só: um
   visitante ativo derrubaria o site para os demais.
4. **`X-Forwarded-Proto` repassado como `$esquema_publico`**, não `$scheme`.
   O último salto até nós é http; usar `$scheme` faria o Astro e o Directus
   montarem links `http://` e o Directus recusar cookies `secure`.
5. **Firewall restrito.** O 04 abre a 80 só para `10.180.0.13` (rich rule), não
   para `0.0.0.0/0`. A VM não tem IP público: abrir para o mundo não traria um
   visitante a mais, só exporia o servidor à rede interna.
6. **Endpoint `/_saude`** em todos os server blocks, inclusive no
   `default_server` — um health check do proxy feito por IP receberia 444 e
   marcaria a VM como fora do ar.
7. **O 05 mudou de papel.** O caminho HTTP-01 foi removido: falharia sempre e
   gastaria a cota da autoridade. No lugar entraram `--diagnostico`,
   `--origem-cloudflare` (instala um Origin Certificate) e `--dns-cloudflare`
   (Let's Encrypt por DNS-01). Ambos gravam em `/etc/nginx/ssl/origem/`, que é
   o que o `20-https.conf` espera — o Nginx não sabe de onde veio o par.

### Validação feita

Container `nginx:1.29-alpine` com a configuração publicada, sem tocar no host:

| caso | resultado |
|---|---|
| `www` com `X-Forwarded-Proto: https` | 502 → página de implantação, **sem redirect** |
| apex com XFP https | 301 → `https://www…` |
| apex sem XFP | 301 → `http://www…` (esquema local) |
| apex só com `CF-Visitor` | 301 → `https://www…` |
| `/admin` no domínio público | 404 |
| Host desconhecido | 444 |
| `/_saude` por IP | 200 |
| `CF-Connecting-IP: 189.45.12.200` | logado como cliente; `via=` mostra o salto |

### Ainda em aberto

- Quem administra a conta Cloudflare do município (necessário para o Origin
  Certificate, para o registro `admin`, e para o "Always Use HTTPS").
- Se o proxy `10.180.0.13` encaminha a 443. Hoje só manda a 80.
- Plano da virada: o portal antigo continua atendendo até que o novo assuma.
