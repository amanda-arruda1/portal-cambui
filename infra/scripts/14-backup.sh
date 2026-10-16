#!/usr/bin/env bash
# Portal Cambuí — instala o backup diário e o ensaio semanal de restauração.
#
#   sudo ./14-backup.sh              -> cria o diretório, instala as units e liga os timers
#   sudo ./14-backup.sh --so-checar  -> só valida as units, sem instalar
#
# Idempotente. Não abre porta, não toca em firewall/Nginx/SELinux. O backup grava em /var/backups/portal-cambui
# (no MESMO disco do servidor — veja o aviso sobre cópia externa no cabeçalho de infra/scripts/backup.mjs).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST=/var/backups/portal-cambui
UNITS=(portal-backup.service portal-backup.timer portal-backup-teste.service portal-backup-teste.timer portal-backup-falhou@.service)

[[ $EUID -eq 0 ]] || { echo "Rode como root." >&2; exit 1; }
command -v node >/dev/null || { echo "node não encontrado." >&2; exit 1; }
command -v docker >/dev/null || { echo "docker não encontrado." >&2; exit 1; }

echo "==> validando as units"
for u in "${UNITS[@]}"; do systemd-analyze verify "$REPO/infra/systemd/$u" 2>&1 | grep -v '^$' || true; done
node --check "$REPO/infra/scripts/backup.mjs" "$REPO/infra/scripts/backup-testar-restauracao.mjs"
if [[ "${1:-}" == "--so-checar" ]]; then echo "Checagem concluída (--so-checar)."; exit 0; fi

echo "==> diretório de destino"
install -d -m 700 -o root -g root "$DEST"
echo "  $DEST (modo 700, só root)"

echo "==> instalando as units"
for u in "${UNITS[@]}"; do install -m 644 "$REPO/infra/systemd/$u" "/etc/systemd/system/$u"; done
systemctl daemon-reload
systemctl enable --now portal-backup.timer portal-backup-teste.timer

echo "==> agenda"
systemctl list-timers --no-pager portal-backup.timer portal-backup-teste.timer | sed -n 1,4p
echo
echo "Instalado. Primeiro backup agendado para as 02:30. Para rodar agora: systemctl start portal-backup.service"
echo "Status do último: cat $DEST/ULTIMO_STATUS.json | Logs: journalctl -u portal-backup.service"
