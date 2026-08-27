#!/usr/bin/env bash
# 07-ip-estatico.sh — congela em estático exatamente o que o DHCP já entrega hoje.
# Nada muda de valor: mesmo IP, mesma máscara, mesmo gateway, mesmo DNS, mesmo search.
# Se algo der errado, reverte sozinho para DHCP.
set -uo pipefail

CON="eth0"
ADDR="10.180.5.110/21"
GW="10.180.0.254"
DNS="10.180.0.1"
SEARCH="cambui.mg.gov.br"

PROFILE="/etc/NetworkManager/system-connections/${CON}.nmconnection"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/root/${CON}.nmconnection.bak-${STAMP}"
LOG="/var/log/portal-cambui-ip-estatico.log"

exec > >(tee -a "$LOG") 2>&1
echo "=== $(date -Is) — fixando IP estático em ${CON} ==="

[[ $EUID -eq 0 ]] || { echo "ERRO: precisa ser root."; exit 1; }

cp -a "$PROFILE" "$BACKUP"
echo "[+] backup do perfil: $BACKUP"
echo "--- antes ---"; nmcli -f ipv4.method,ipv4.addresses,ipv4.gateway,ipv4.dns con show "$CON"

reverter() {
  echo "[!] FALHA na validação — revertendo para DHCP..."
  cp -a "$BACKUP" "$PROFILE"
  chmod 600 "$PROFILE"
  nmcli con reload
  nmcli con up "$CON" || nmcli dev reapply "$CON"
  sleep 5
  echo "--- estado após rollback ---"
  ip -brief a show "$CON"; ip route
  echo "=== rollback concluído — nada foi alterado permanentemente ==="
  exit 1
}

echo "[+] aplicando método manual com os MESMOS valores do lease atual"
nmcli con mod "$CON" \
  ipv4.method manual \
  ipv4.addresses "$ADDR" \
  ipv4.gateway "$GW" \
  ipv4.dns "$DNS" \
  ipv4.dns-search "$SEARCH" \
  ipv4.ignore-auto-dns yes || { echo "[!] nmcli con mod falhou"; reverter; }

# ipv6 permanece como está (auto) — não tocado.

echo "[+] reaplicando na interface"
nmcli dev reapply "$CON" || nmcli con up "$CON"
sleep 4

echo "--- validação ---"
ok=1
ip -4 addr show "$CON" | grep -q "${ADDR%%/*}/21" || { echo "[!] IP ${ADDR} ausente na interface"; ok=0; }
ip route | grep -q "default via ${GW}" || { echo "[!] rota default ausente"; ok=0; }
ping -c 2 -W 2 "$GW" >/dev/null 2>&1 || { echo "[!] gateway ${GW} não responde ao ping"; ok=0; }
getent hosts "$SEARCH" >/dev/null 2>&1 || nslookup registro.br "$DNS" >/dev/null 2>&1 || { echo "[!] DNS ${DNS} não resolveu"; ok=0; }
ss -ltn 2>/dev/null | grep -q ':9025' || { echo "[!] sshd não está mais escutando na 9025"; ok=0; }

[[ $ok -eq 1 ]] || reverter

echo "--- depois ---"
nmcli -f ipv4.method,ipv4.addresses,ipv4.gateway,ipv4.dns,ipv4.dns-search con show "$CON"
ip -brief a show "$CON"; ip route; cat /etc/resolv.conf
echo "=== $(date -Is) — IP estático aplicado e validado com sucesso ==="
echo "Para desfazer: cp -a $BACKUP $PROFILE && nmcli con reload && nmcli con up $CON"
