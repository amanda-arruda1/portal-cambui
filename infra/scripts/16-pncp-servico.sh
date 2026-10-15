#!/usr/bin/env bash
# Portal Cambuí — instala o serviço de consulta ao PNCP (painel do Payload). Idempotente.
#   sudo ./16-pncp-servico.sh              -> instala a unit e liga o serviço
#   sudo ./16-pncp-servico.sh --so-checar  -> só valida
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNIT=portal-pncp.service
[[ $EUID -eq 0 ]] || { echo "Rode como root." >&2; exit 1; }
systemd-analyze verify "$REPO/infra/systemd/$UNIT" 2>&1 | grep -v '^$' || true
node --check "$REPO/infra/scripts/pncp-servico.mjs"
[[ "${1:-}" == "--so-checar" ]] && { echo "Checagem concluída (--so-checar)."; exit 0; }
install -m 644 "$REPO/infra/systemd/$UNIT" "/etc/systemd/system/$UNIT"
systemctl daemon-reload
systemctl enable "$UNIT" >/dev/null
systemctl restart "$UNIT"
for i in $(seq 1 15); do ss -ltn | grep -q '127.0.0.1:3100 ' && break; sleep 1; done
printf '  escutando em 127.0.0.1:3100 -> %s\n' "$(ss -ltn | grep -c '127.0.0.1:3100 ' | sed 's/1/sim/;s/0/NAO/')"
printf '  consulta de prova (contratação real do município) -> HTTP %s\n' "$(curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:3100/compra?cnpj=18675975000185&ano=2026&seq=3')"
systemctl --no-pager --lines=0 status "$UNIT" | sed -n 1,4p
