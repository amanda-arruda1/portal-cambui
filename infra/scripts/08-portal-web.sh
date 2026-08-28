#!/usr/bin/env bash
# Portal Cambuí — Fase 2: build e publicação da aplicação Astro (SSR) no host.
#
#   ./08-portal-web.sh            -> instala dependências, compila e (re)sobe
#   ./08-portal-web.sh --so-build -> só compila, sem mexer no serviço
#
# O serviço escuta em 127.0.0.1:4321, onde o Nginx (04) já faz proxy. Nada aqui
# abre porta nem toca no firewall.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="$REPO/apps/web"
USUARIO="portal-web"

[[ $EUID -eq 0 ]] || { echo "Rode como root." >&2; exit 1; }

echo "==> usuário de serviço"
if ! id "$USUARIO" >/dev/null 2>&1; then
  # Sem shell e sem home: esta conta existe só para ser o dono do processo.
  useradd --system --no-create-home --shell /usr/sbin/nologin "$USUARIO"
  echo "  criado: $USUARIO"
else
  echo "  já existe: $USUARIO"
fi

echo "==> dependências e build"
cd "$APP"
if [[ -f package-lock.json ]]; then
  # 'npm ci' respeita o lock e falha se ele divergir do package.json — é o que
  # garante que o servidor compile exatamente o que foi testado.
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi
npm run build

if [[ "${1:-}" == "--so-build" ]]; then
  echo "Build concluído. Serviço não foi tocado (--so-build)."
  exit 0
fi

echo "==> permissões"
# O processo só precisa LER o dist. Dono continua root: um comprometimento do
# serviço web não pode reescrever o próprio código.
chown -R root:"$USUARIO" "$APP/dist"
chmod -R u=rwX,g=rX,o= "$APP/dist"
# O node precisa atravessar os diretórios até o entry.mjs.
chmod o+x "$REPO" "$REPO/apps" "$APP" 2>/dev/null || true

echo "==> diretório de sessões"
# O painel de contribuição guarda a sessão em disco, e nela vai o token do
# Directus — daí o 700. O caminho está ASSADO no build (astro.config.mjs); se
# mudar lá, muda aqui. Criado explicitamente para que o primeiro login não
# dependa de o processo conseguir criar o diretório sozinho.
install -d -o "$USUARIO" -g "$USUARIO" -m 700 /var/lib/portal-cambui/sessoes

# Marco da última entrega de avisos de licitação. Diretório próprio porque o
# resto de data/ pertence ao root (volumes do Docker) e o serviço de avisos
# roda como o usuário do portal.
install -d -o "$USUARIO" -g "$USUARIO" -m 750 /opt/portal-cambui/data/avisos

echo "==> variáveis de ambiente"
if [[ ! -f "$REPO/.env.web" ]]; then
  cp "$REPO/.env.web.example" "$REPO/.env.web"
  echo "  .env.web criado a partir do exemplo — confira os valores."
fi
chown root:"$USUARIO" "$REPO/.env.web"
chmod 640 "$REPO/.env.web"

echo "==> unit do systemd"
install -m 644 "$REPO/infra/systemd/portal-web.service" /etc/systemd/system/portal-web.service
restorecon -F /etc/systemd/system/portal-web.service >/dev/null 2>&1 || true
systemctl daemon-reload

echo "==> subindo o serviço"
systemctl enable --now portal-web
sleep 3
systemctl is-active portal-web

echo
echo "==> conferência"
curl -fsS -o /dev/null -w '  loopback direto (4321): HTTP %{http_code}\n' http://127.0.0.1:4321/ || true
curl -fsS -o /dev/null -w '  via Nginx (80):        HTTP %{http_code}\n' \
  -H 'Host: www.prefeituradecambui.mg.gov.br' http://127.0.0.1/ || true
echo
echo "Logs: journalctl -u portal-web -f"
