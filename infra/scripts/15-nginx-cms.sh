#!/usr/bin/env bash
# Portal Cambuí — publica o painel do Payload em https://portal.cambui.mg.gov.br/cms (mesmo domínio do site).
#
#   sudo ./15-nginx-cms.sh             -> instala as regras no Nginx, testa e recarrega
#   sudo ./15-nginx-cms.sh --simular   -> só confere os pré-requisitos e mostra o que faria
#   sudo ./15-nginx-cms.sh --remover   -> tira o /cms do Nginx (o Payload segue em 127.0.0.1:3000/cms para o site ler)
#
# PRÉ-REQUISITOS (o script confere e aborta se faltar):
#   - o Payload no ar COM o prefixo: http://127.0.0.1:3000/cms/admin = 200 (basePath '/cms', novo-cms-payload/next.config.ts);
#   - PAYLOAD_INTERNAL_URL no .env.web terminando em /cms. O site lê o Payload por essa URL; sem o prefixo ele perde
#     telefones, notícias, secretarias etc. SEM dar erro (cada página mostra "indisponível").
#
# O QUE FAZ: instala snippets/cms-caminho.conf e conf.d/10-http.conf (que inclui o snippet no server do portal e já traz a
# correção do IP real); `nginx -t` antes de recarregar, com desfazimento se falhar; garante PAYLOAD_ORIGENS_PERMITIDAS no
# .env do Payload (sem isto o painel abre mas o Payload recusa o cookie de login: proteção CSRF).
#
# O QUE NÃO PRECISA: DNS novo nem mudança no Caddy. É o mesmo nome (portal.cambui.mg.gov.br) que já funciona.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NGX=/etc/nginx
SNIP=$NGX/snippets/cms-caminho.conf
CONF=$NGX/conf.d/10-http.conf
ENVP=$REPO/novo-cms-payload/.env
ENVW=$REPO/.env.web
ORIGEM="https://portal.cambui.mg.gov.br"
[[ $EUID -eq 0 ]] || { echo "Rode como root." >&2; exit 1; }

if [[ "${1:-}" == "--remover" ]]; then
  sed -i '\#include /etc/nginx/snippets/cms-caminho.conf;#d' "$CONF"
  rm -f "$SNIP"
  nginx -t && systemctl reload nginx
  echo "O /cms saiu do Nginx. O Payload segue em 127.0.0.1:3000/cms (o site continua lendo conteúdo dele)."; exit 0
fi
SIMULAR=0; [[ "${1:-}" == "--simular" ]] && SIMULAR=1

echo "==> pré-requisitos"
[[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/cms/admin)" == "200" ]] || { echo "ERRO: http://127.0.0.1:3000/cms/admin não responde 200. Reconstrua e reinicie o Payload (npm run build + systemctl restart portal-payload)." >&2; exit 1; }
grep -qE '^PAYLOAD_INTERNAL_URL=.*/cms/?$' "$ENVW" || { echo "ERRO: PAYLOAD_INTERNAL_URL em $ENVW precisa terminar em /cms (o site passaria a não ler o Payload)." >&2; exit 1; }
echo "  Payload responde sob /cms e o site já aponta para o prefixo"
if (( SIMULAR )); then echo "(simulação) instalaria $SNIP e $CONF e recarregaria o Nginx"; exit 0; fi

BKP="$(mktemp -d)"; cp -a "$CONF" "$BKP/10-http.conf"; [[ -f $SNIP ]] && cp -a "$SNIP" "$BKP/cms-caminho.conf" || true
desfaz() { echo "ERRO: desfazendo o Nginx." >&2; cp -a "$BKP/10-http.conf" "$CONF"; if [[ -f $BKP/cms-caminho.conf ]]; then cp -a "$BKP/cms-caminho.conf" "$SNIP"; else rm -f "$SNIP"; fi; nginx -t >/dev/null 2>&1 && systemctl reload nginx || true; exit 1; }
trap desfaz ERR

echo "==> instalando regras do Nginx (backup em $BKP)"
install -m 644 "$REPO/infra/nginx/snippets/cms-caminho.conf" "$SNIP"
install -m 644 "$REPO/infra/nginx/conf.d/10-http.conf" "$CONF"
nginx -t

echo "==> origem permitida no Payload (CSRF)"
if ! grep -q "^PAYLOAD_ORIGENS_PERMITIDAS=.*$ORIGEM" "$ENVP"; then
  sed -i '/^PAYLOAD_ORIGENS_PERMITIDAS=/d' "$ENVP"; printf 'PAYLOAD_ORIGENS_PERMITIDAS=%s\n' "$ORIGEM" >> "$ENVP"
  systemctl restart portal-payload
  for i in $(seq 1 40); do [[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/cms/admin)" == "200" ]] && break; sleep 1; done
  echo "  adicionada e Payload reiniciado"
else echo "  já estava"; fi

systemctl reload nginx
trap - ERR
# `reload` só envia o sinal: os processos novos assumem depois. Verificar já devolveria a resposta dos antigos (sem o /cms).
for i in $(seq 1 30); do [[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: portal.cambui.mg.gov.br' -H 'X-Forwarded-Proto: https' http://127.0.0.1/cms/admin)" == "200" ]] && break; sleep 0.5; done

echo "==> verificando (pelo Nginx, como o Caddy entrega: Host + X-Forwarded-Proto https)"
H=(-H "Host: portal.cambui.mg.gov.br" -H "X-Forwarded-Proto: https")
c() { curl -s -o /dev/null -w '%{http_code}' "${H[@]}" "$@"; }
printf '  /cms                -> %s\n' "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "${H[@]}" http://127.0.0.1/cms)"
printf '  /cms/admin          -> HTTP %s (esperado 200)\n' "$(c http://127.0.0.1/cms/admin)"
printf '  /cms/api/graphql    -> HTTP %s (esperado 404)\n' "$(c http://127.0.0.1/cms/api/graphql)"
printf '  /cms/api/licitacoes -> HTTP %s (esperado 403, fechado)\n' "$(c 'http://127.0.0.1/cms/api/licitacoes?limit=1')"
printf '  site /              -> HTTP %s | /telefones %s | /painel/entrar %s\n' "$(c http://127.0.0.1/)" "$(c http://127.0.0.1/telefones)" "$(c http://127.0.0.1/painel/entrar)"
echo
echo "Pronto: https://portal.cambui.mg.gov.br/cms"
