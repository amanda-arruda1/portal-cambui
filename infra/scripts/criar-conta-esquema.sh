#!/usr/bin/env bash
# Cria a conta de serviço que os scripts de esquema/seed usam para falar com o
# Directus, e grava o token em /opt/portal-cambui/.env.
#
# Por que existe: aplicar esquema e permissões exige papel Administrator. A
# alternativa seria pedir a senha pessoal de um administrador humano a cada
# execução — o que coloca credencial de pessoa em script e em histórico de
# shell. Uma conta de serviço sem senha, com token revogável numa linha, é
# menos poder e mais rastreável.
#
# Rode uma vez:   sudo bash infra/scripts/criar-conta-esquema.sh
set -euo pipefail
cd /opt/portal-cambui
set -a; . ./.env; set +a

EMAIL='servico-esquema@prefeituradecambui.mg.gov.br'

if grep -q '^DIRECTUS_TOKEN_ESQUEMA=' .env; then
  echo "Já existe DIRECTUS_TOKEN_ESQUEMA no .env — nada a fazer."
  exit 0
fi

SENHA="$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')"
TOKEN="esquema_$(python3 -c 'import secrets;print(secrets.token_urlsafe(32))')"

if docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" -i portal-postgres psql -tAX \
     -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -c "select 1 from directus_users where email='$EMAIL'" | grep -q 1; then
  echo "→ conta já existe; redefinindo a senha temporária"
  docker exec -i portal-directus npx directus users passwd --email "$EMAIL" --password "$SENHA"
else
  echo "→ criando $EMAIL com papel Administrator"
  PAPEL="$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" -i portal-postgres psql -tAX \
           -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
           -c "select id from directus_roles where name='Administrator' limit 1")"
  docker exec -i portal-directus npx directus users create \
    --email "$EMAIL" --password "$SENHA" --role "$PAPEL"
fi

echo "→ trocando a senha por um token estático (a senha some daqui)"
ACESSO="$(curl -sf -X POST http://127.0.0.1:8055/auth/login \
  -H 'Content-Type: application/json' \
  -d "$(E="$EMAIL" S="$SENHA" python3 -c 'import json,os;print(json.dumps({"email":os.environ["E"],"password":os.environ["S"]}))')" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])')"

EU="$(curl -sf -H "Authorization: Bearer $ACESSO" http://127.0.0.1:8055/users/me \
      | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')"

curl -sf -X PATCH "http://127.0.0.1:8055/users/$EU" \
  -H "Authorization: Bearer $ACESSO" -H 'Content-Type: application/json' \
  -d "$(T="$TOKEN" P="$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')" \
        python3 -c 'import json,os;print(json.dumps({"token":os.environ["T"],"password":os.environ["P"]}))')" >/dev/null

cat >> .env <<EOF

# ── Conta de serviço: esquema e migrações ─────────────────────────
# Papel Administrator. Usada só pelos scripts de infra/directus/* para criar
# coleções, campos e permissões. Não entra no painel; a senha foi randomizada
# e descartada logo após a criação, então só o token abre esta conta.
# Revogar:  curl -X PATCH .../users/<id> -d '{"token":null}'
DIRECTUS_TOKEN_ESQUEMA=$TOKEN
EOF
chmod 600 .env

echo
echo "✓ pronto. Token gravado em /opt/portal-cambui/.env (chmod 600)."
echo "  A senha inicial foi substituída por uma aleatória e não ficou registrada."
