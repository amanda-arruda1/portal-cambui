#!/usr/bin/env bash
# Instala o serviço de assinatura do Diário Oficial.
#
# Cria o usuário portal-diario, gera o segredo compartilhado entre ele e o
# portal-web, e sobe a unit. A chave de assinatura fica legível SÓ por este
# usuário — o portal-web não a alcança, e é esse o ponto.
#
#   sudo bash infra/scripts/11-diario-assinatura.sh
set -euo pipefail
cd /opt/portal-cambui

USUARIO=portal-diario

if ! id "$USUARIO" &>/dev/null; then
  echo "→ criando usuário de sistema $USUARIO"
  useradd --system --no-create-home --shell /usr/sbin/nologin "$USUARIO"
else
  echo "= usuário $USUARIO já existe"
fi

# Segredo compartilhado: o portal-web usa para provar que é ele quem pede.
if [ -f .env.diario ] && grep -q '^DIARIO_SERVICO_SEGREDO=' .env.diario; then
  SEGREDO="$(grep -oP '^DIARIO_SERVICO_SEGREDO=\K.*' .env.diario)"
  echo "= segredo do serviço já existe"
else
  SEGREDO="$(python3 -c 'import secrets;print(secrets.token_urlsafe(32))')"
  echo "→ segredo do serviço gerado"
fi

TOKEN_DIRECTUS="$(grep -oP '^DIRECTUS_TOKEN_ESQUEMA=\K.*' .env || true)"
URL_PUBLICA="$(grep -oP '^PUBLIC_SITE_URL=\K.*' .env || echo https://portal.cambui.mg.gov.br)"

cat > .env.diario <<EOF
# Portal Cambuí — serviço de assinatura do Diário Oficial.
# chmod 640, dono root:portal-diario. NUNCA versionar.
#
# Este arquivo NÃO contém a senha do Postgres nem as chaves do Directus:
# o serviço só precisa falar com a API do CMS e assinar arquivos.

DIARIO_SERVICO_HOST=127.0.0.1
DIARIO_SERVICO_PORTA=4322

# Segredo compartilhado com o portal-web. Quem não o apresenta não manda
# assinar nada.
DIARIO_SERVICO_SEGREDO=$SEGREDO

DIRECTUS_INTERNAL_URL=http://127.0.0.1:8055
DIARIO_TOKEN_DIRECTUS=$TOKEN_DIRECTUS
PUBLIC_SITE_URL=$URL_PUBLICA

# --- Certificado de assinatura ---
# TODO(cliente): apontar para o certificado A1 do Município (arquivo .pem
# extraído do .pfx) e para a cadeia da AC. Enquanto estiver vazio, o serviço
# usa o certificado de DEMONSTRAÇÃO gerado por ele mesmo e diz isso em toda
# tela onde a assinatura aparece.
#
#   DIARIO_CERT=/opt/portal-cambui/data/diario/certificados/municipio.pem
#   DIARIO_CHAVE=/opt/portal-cambui/data/diario/certificados/municipio.key
#   DIARIO_CADEIA=/opt/portal-cambui/data/diario/certificados/cadeia-icp.pem
#   DIARIO_SIGNATARIO=NOME DA AUTORIDADE — Prefeita Municipal
DIARIO_CERT=
DIARIO_CHAVE=
DIARIO_CADEIA=
DIARIO_SIGNATARIO=
EOF
chown root:"$USUARIO" .env.diario
chmod 640 .env.diario
echo "→ /opt/portal-cambui/.env.diario  (640 root:$USUARIO)"

# O portal-web precisa do MESMO segredo para poder pedir — e de mais nada.
if ! grep -q '^DIARIO_SERVICO_SEGREDO=' .env.web; then
  cat >> .env.web <<EOF

# Segredo para pedir certidão ao serviço de assinatura. O portal NÃO assina
# nada: a chave privada vive no processo portal-diario, com outro usuário.
DIARIO_SERVICO_URL=http://127.0.0.1:4322
DIARIO_SERVICO_SEGREDO=$SEGREDO
EOF
  echo "→ segredo espelhado em .env.web"
fi

# Certificados: legíveis só pelo serviço.
mkdir -p data/diario/certificados
chown -R root:"$USUARIO" data/diario
chmod 750 data/diario data/diario/certificados
chmod 640 data/diario/certificados/* 2>/dev/null || true
echo "→ data/diario/certificados  (750 root:$USUARIO — o portal-web não lê)"

install -m 644 infra/systemd/portal-diario.service /etc/systemd/system/portal-diario.service
systemctl daemon-reload
systemctl enable --now portal-diario.service
sleep 2
systemctl --no-pager --lines=5 status portal-diario.service || true

echo
echo "Conferindo:"
curl -sf http://127.0.0.1:4322/saude && echo || echo "  (serviço ainda não respondeu — ver journalctl -u portal-diario)"
