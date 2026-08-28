#!/usr/bin/env bash
# Usuários de DEMONSTRAÇÃO do Diário Oficial, um por papel.
#
#   sudo bash infra/scripts/12-usuarios-demo.sh
#   sudo bash infra/scripts/12-usuarios-demo.sh --remover
#
# ATENÇÃO: as senhas são conhecidas e estão no README. Isto existe para o
# cliente conseguir percorrer o fluxo inteiro sem depender da TI. ANTES DA
# VIRADA, rode com --remover: conta de demonstração com senha publicada em
# repositório é porta aberta.
#
# Os quatro papéis existem para separar funções: quem escreve não publica, quem
# publica não assina. Entrar como cada um é a única forma de ver isso funcionar.
set -euo pipefail
cd /opt/portal-cambui
set -a; . ./.env; set +a

SENHA='DemoDiario2026!'
DOMINIO='demonstracao.prefeituradecambui.mg.gov.br'

CONTAS=(
  "redator|Diário — Redator setorial|Rita|Redatora (demonstração)"
  "editor|Diário — Editor|Edson|Editor (demonstração)"
  "signataria|Diário — Autoridade signatária|Sônia|Signatária (demonstração)"
  "adminDiario|Diário — Administrador|Ademar|Administrador do Diário (demonstração)"
)

pg() {
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" -i portal-postgres \
    psql -tAX -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"
}

if [ "${1:-}" = "--remover" ]; then
  echo "Removendo contas de demonstração…"
  for linha in "${CONTAS[@]}"; do
    IFS='|' read -r apelido _ _ _ <<< "$linha"
    pg "DELETE FROM directus_users WHERE email = '${apelido}@${DOMINIO}'" >/dev/null
    echo "  − ${apelido}@${DOMINIO}"
  done
  echo "Pronto."
  exit 0
fi

for linha in "${CONTAS[@]}"; do
  IFS='|' read -r apelido papel nome sobrenome <<< "$linha"
  email="${apelido}@${DOMINIO}"

  PAPEL_ID="$(pg "SELECT id FROM directus_roles WHERE name = '${papel}' LIMIT 1")"
  if [ -z "$PAPEL_ID" ]; then
    echo "! papel \"${papel}\" não existe. Rode antes: npm run esquema"
    exit 1
  fi

  if [ -n "$(pg "SELECT 1 FROM directus_users WHERE email = '${email}'")" ]; then
    echo "= ${email} já existe; redefinindo a senha"
    docker exec -i portal-directus npx directus users passwd --email "$email" --password "$SENHA" >/dev/null 2>&1
  else
    echo "+ ${email}  (${papel})"
    docker exec -i portal-directus npx directus users create \
      --email "$email" --password "$SENHA" --role "$PAPEL_ID" >/dev/null 2>&1
  fi

  pg "UPDATE directus_users SET first_name='${nome}', last_name='${sobrenome}', role='${PAPEL_ID}' WHERE email='${email}'" >/dev/null
done

echo
echo "Quatro contas de demonstração, senha: ${SENHA}"
echo "  redator@${DOMINIO}      escreve e envia; NÃO publica"
echo "  editor@${DOMINIO}       revisa, devolve, monta pauta, fecha; NÃO assina"
echo "  signataria@${DOMINIO}   assina e publica; NÃO redige"
echo "  adminDiario@${DOMINIO}  configura e audita; NÃO apaga nada"
echo
echo "As políticas de Editor, Signatária e Administrador exigem 2FA. Para a"
echo "demonstração isso é desligado abaixo; em produção, NÃO desligar."
for linha in "${CONTAS[@]}"; do
  IFS='|' read -r _ papel _ _ <<< "$linha"
  pg "UPDATE directus_policies SET enforce_tfa = false WHERE name = '${papel}'" >/dev/null
done
echo "  2FA desligado nas políticas do Diário (ambiente de demonstração)."
echo
echo "ANTES DA VIRADA:  sudo bash infra/scripts/12-usuarios-demo.sh --remover"
echo "                  e reative enforce_tfa nas políticas."
