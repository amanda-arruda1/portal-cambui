#!/usr/bin/env bash
# Portal Cambuí — Fase 1: prepara os diretórios de dados e sobe a stack.
#
#   ./03-stack-subir.sh            -> prepara diretórios e sobe
#   ./03-stack-subir.sh --parar    -> derruba os containers (dados preservados)
#
# Por que preparar diretórios: os containers rodam como usuários sem privilégio
# (Postgres/Redis uid 999, Directus uid 1000). Um bind mount criado pelo Docker
# nasce como root:root, e o Directus falha com EACCES ao gravar em
# /directus/uploads. Criar com o dono certo antes de subir resolve na origem.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE=(docker compose -f "$REPO/infra/docker/compose.yaml" --env-file "$REPO/.env")

[[ $EUID -eq 0 ]] || { echo "Rode como root." >&2; exit 1; }
[[ -f "$REPO/.env" ]] || { echo "ERRO: $REPO/.env não existe." >&2; exit 1; }

if [[ "${1:-}" == "--parar" ]]; then
  "${COMPOSE[@]}" down
  echo "Containers parados. Os dados em $REPO/data seguem intactos."
  exit 0
fi

echo "==> conferindo variáveis obrigatórias"
faltando=()
# ADMIN_EMAIL fica de fora: sem ele o Directus sobe e apenas não cria o
# usuário administrador, que é o comportamento desejado enquanto o endereço
# institucional não estiver definido.
for v in POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD REDIS_PASSWORD DIRECTUS_KEY DIRECTUS_SECRET; do
  valor="$(grep -E "^${v}=" "$REPO/.env" | cut -d= -f2-)"
  [[ -n "$valor" ]] || faltando+=("$v")
done
if [[ ${#faltando[@]} -gt 0 ]]; then
  echo "ERRO: variáveis vazias no .env: ${faltando[*]}" >&2
  exit 1
fi
echo "  ok."

echo "==> preparando $REPO/data"
install -d -m 700 -o 999  -g 999  "$REPO/data/postgres"
install -d -m 700 -o 999  -g 1000 "$REPO/data/redis"
install -d -m 750 -o 1000 -g 1000 "$REPO/data/directus/uploads"
install -d -m 750 -o 1000 -g 1000 "$REPO/data/directus/extensions"
ls -ld "$REPO/data"/*/ | sed 's/^/  /'

echo "==> subindo a stack"
"${COMPOSE[@]}" up -d

echo "==> aguardando os serviços ficarem saudáveis (até 5 min)"
for i in $(seq 1 60); do
  pendentes=""
  for c in portal-postgres portal-redis portal-directus; do
    st="$(docker inspect "$c" --format '{{.State.Health.Status}}' 2>/dev/null || echo ausente)"
    [[ "$st" == "healthy" ]] || pendentes+=" $c($st)"
  done
  [[ -z "$pendentes" ]] && break
  sleep 5
done

echo
docker ps --filter name=portal- --format 'table {{.Names}}\t{{.Status}}'
if [[ -n "${pendentes:-}" ]]; then
  echo >&2
  echo "ATENÇÃO: ainda não saudável:${pendentes}" >&2
  echo "Investigue com: docker logs portal-directus" >&2
  exit 1
fi

echo
echo "Stack de pé. O Directus responde em 127.0.0.1:8055 (só pelo host)."
if ! grep -qE '^DIRECTUS_ADMIN_EMAIL=.+' "$REPO/.env"; then
  echo
  echo "NOTA: DIRECTUS_ADMIN_EMAIL está vazio, então nenhum administrador foi"
  echo "criado. Quando o e-mail institucional for definido, crie o usuário com:"
  echo "  docker compose -f $REPO/infra/docker/compose.yaml --env-file $REPO/.env \\"
  echo "    exec directus npx directus users create --role <id-do-papel-admin> \\"
  echo "    --email <endereco> --password <senha>"
fi
