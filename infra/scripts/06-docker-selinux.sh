#!/usr/bin/env bash
# Portal Cambuí — habilita a integração do Docker com o SELinux.
#
# Problema que este script resolve: o host está em enforcing, mas o Docker CE
# não vem com 'selinux-enabled' e roda os containers SEM rótulo de processo
# (ProcessLabel vazio). Na prática o SELinux não confina container nenhum, e os
# sufixos :Z/:z do compose são registrados e ignorados — os volumes ficam com o
# rótulo do host (usr_t) em vez de container_file_t.
#
# Depois deste script, uma fuga de container passa a esbarrar na política do
# SELinux, e cada volume recebe rótulo próprio.
#
#   ./06-docker-selinux.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ $EUID -eq 0 ]] || { echo "Rode como root." >&2; exit 1; }

echo "==> dependência de política"
rpm -q container-selinux >/dev/null 2>&1 || dnf install -y container-selinux
echo "  container-selinux: $(rpm -q container-selinux)"

echo "==> /etc/docker/daemon.json"
install -d -m 755 /etc/docker
if [[ -f /etc/docker/daemon.json ]]; then
  cp -a /etc/docker/daemon.json "/etc/docker/daemon.json.bak-$(date +%Y%m%d%H%M%S)"
  echo "  backup do arquivo existente feito."
  python3 - <<'PY'
import json
p = '/etc/docker/daemon.json'
try:
    cfg = json.load(open(p))
except Exception:
    cfg = {}
cfg['selinux-enabled'] = True
json.dump(cfg, open(p, 'w'), indent=2, ensure_ascii=False)
print("  selinux-enabled adicionado, resto preservado.")
PY
else
  cat > /etc/docker/daemon.json <<'JSON'
{
  "selinux-enabled": true,
  "live-restore": false,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "5"
  }
}
JSON
  echo "  criado."
fi

echo "==> parando a stack antes de reiniciar o Docker"
if [[ -f "$REPO/.env" ]]; then
  docker compose -f "$REPO/infra/docker/compose.yaml" --env-file "$REPO/.env" down || true
fi

echo "==> reiniciando o Docker"
systemctl restart docker
sleep 3
if docker info 2>/dev/null | grep -qi selinux; then
  echo "  OK: SELinux agora consta nas security options do daemon."
else
  echo "ERRO: o daemon subiu sem SELinux. Verifique 'journalctl -u docker -n 50'." >&2
  exit 1
fi

echo "==> resubindo a stack (os volumes serão rotulados agora)"
"$REPO/infra/scripts/03-stack-subir.sh"

echo
echo "==> conferência dos rótulos"
ls -ldZ "$REPO"/data/postgres "$REPO"/data/redis "$REPO"/data/directus/uploads | awk '{print "  "$5"  "$NF}'
echo "==> rótulo dos processos"
for c in portal-postgres portal-redis portal-directus; do
  printf '  %-18s %s\n' "$c" "$(docker inspect "$c" --format '{{.ProcessLabel}}' 2>/dev/null)"
done
echo
echo "Se algum container falhar depois desta mudança, cheque AVCs com:"
echo "  ausearch -m AVC -ts recent"
