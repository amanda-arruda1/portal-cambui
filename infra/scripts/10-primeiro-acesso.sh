#!/usr/bin/env bash
# Primeiro acesso ao CMS: cria o administrador e liga o conteúdo.
#
#   sudo bash infra/scripts/10-primeiro-acesso.sh <e-mail-do-administrador>
#
# Faz, nesta ordem:
#   1. cria o usuário administrador do Directus (senha forte, gerada aqui);
#   2. aplica o esquema — as 6 coleções de conteúdo;
#   3. aplica papéis, políticas e permissões, inclusive a política pública.
#
# É IDEMPOTENTE nas etapas 2 e 3 (os aplicadores pulam o que já existe). A
# etapa 1 detecta usuário existente e não tenta recriar.
#
# A senha aparece UMA VEZ na tela e não é gravada em lugar nenhum. Guarde-a
# antes de fechar o terminal; perdida, o caminho é criar outro administrador.
set -euo pipefail

REPO="/opt/portal-cambui"
EMAIL="${1:-}"

if [[ -z "$EMAIL" ]]; then
  echo "ERRO: informe o e-mail do administrador." >&2
  echo "  uso: sudo bash $0 <e-mail>" >&2
  exit 1
fi
# Mesma exigência do Directus, que recusa endereço malformado com HTTP 400.
if [[ ! "$EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[A-Za-z]{2,}$ ]]; then
  echo "ERRO: '$EMAIL' não parece um e-mail válido." >&2
  exit 1
fi

cd "$REPO"
set -a; . ./.env; set +a

echo "==> conferindo a stack"
docker compose -f infra/docker/compose.yaml ps --status running --format '{{.Name}}' | sed 's/^/  /'
curl -sf -m 10 http://127.0.0.1:8055/server/health >/dev/null || { echo "ERRO: Directus não respondeu." >&2; exit 1; }

echo "==> administrador"
EXISTENTES=$(docker exec portal-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
  "select count(*) from directus_users where email = '${EMAIL//\'/\'\'}';")

if [[ "$EXISTENTES" != "0" ]]; then
  echo "  já existe um usuário com esse e-mail — nada a criar."
  echo "  Informe a senha dele quando for pedida abaixo."
  read -r -s -p "  Senha do administrador: " SENHA; echo
else
  PAPEL=$(docker exec portal-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
    "select id from directus_roles where name = 'Administrator' limit 1;" | tr -d '[:space:]')
  [[ -n "$PAPEL" ]] || { echo "ERRO: papel Administrator não encontrado." >&2; exit 1; }

  # 24 caracteres de alfabeto seguro: forte sem depender de símbolo que o
  # terminal de alguém possa comer num copiar-e-colar.
  #
  # NÃO usar 'tr -dc ... </dev/urandom | head -c 24': o head fecha o cano ao
  # completar, o tr morre de SIGPIPE (141) e o 'set -o pipefail' derruba o
  # script inteiro no meio. Custou uma execução abortada para descobrir.
  SENHA=$(python3 -c "import secrets, string; print(''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(24)))")

  docker exec portal-directus npx directus users create \
    --email "$EMAIL" --password "$SENHA" --role "$PAPEL" >/dev/null
  echo "  criado: $EMAIL"
fi

export DIRECTUS_EMAIL="$EMAIL"
export DIRECTUS_SENHA="$SENHA"
export DIRECTUS_INTERNAL_URL="http://127.0.0.1:8055"

echo "==> esquema (6 coleções)"
node infra/directus/aplicar-esquema.mjs | sed 's/^/  /'

echo "==> papéis, políticas e permissões"
node infra/directus/aplicar-papeis.mjs | sed 's/^/  /'

echo
echo "======================================================================"
echo "  Painel:  https://portal.cambui.mg.gov.br/painel"
echo "  Usuário: $EMAIL"
if [[ "$EXISTENTES" == "0" ]]; then
  echo "  Senha:   $SENHA"
  echo
  echo "  ANOTE A SENHA AGORA. Ela não é gravada em lugar nenhum."
fi
echo "======================================================================"
echo
echo "Próximos passos, pelo próprio painel:"
echo "  1. cadastrar as secretarias (é o que dá escopo aos redatores);"
echo "  2. criar as pessoas das secretarias no Directus, com papel e o campo"
echo "     'secretaria' preenchido;"
echo "  3. quem for Publicador precisa configurar o segundo fator ANTES de"
echo "     receber o papel — a política exige 2FA e a conta fica inacessível"
echo "     sem ele."
