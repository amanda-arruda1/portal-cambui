#!/usr/bin/env bash
# Portal Cambuí — Fase 2: antivírus nos arquivos enviados ao CMS.
#
#   ./09-clamav.sh
#
# O que este script entrega:
#   1. clamd rodando como serviço, com socket local — varredura sob demanda
#      custa milissegundos, sem recarregar a base de assinaturas a cada arquivo;
#   2. freshclam atualizando as assinaturas sozinho;
#   3. uma varredura periódica de /opt/portal-cambui/data/directus/uploads que
#      põe em quarentena o que estiver infectado.
#
# POR QUE VARREDURA PERIÓDICA E NÃO SÓ NO UPLOAD: o bloqueio no momento do
# envio entra no módulo de contribuição (extensão do Directus, Fase 3), que é
# quem tem o controle do fluxo. A varredura do disco é a rede de segurança:
# pega o que entrou por outro caminho e o que só virou assinatura conhecida
# depois de já estar hospedado.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ $EUID -eq 0 ]] || { echo "Rode como root." >&2; exit 1; }

echo "==> instalando ClamAV"
dnf install -y clamav clamd clamav-update

echo "==> SELinux: permitir que o clamd leia os arquivos do Directus"
# Os uploads têm rótulo container_file_t (volume do container). Sem este
# boolean o clamd, que roda em antivirus_t, não consegue abri-los.
setsebool -P antivirus_can_scan_system 1
echo "  antivirus_can_scan_system = $(getsebool antivirus_can_scan_system | awk '{print $3}')"

echo "==> freshclam (assinaturas)"
# O arquivo vem com uma linha 'Example' que impede a execução até ser removida.
sed -i 's/^Example$/#Example/' /etc/freshclam.conf
if [[ ! -s /var/lib/clamav/daily.cvd && ! -s /var/lib/clamav/daily.cld ]]; then
  echo "  primeira carga da base — pode levar alguns minutos."
  # A primeira atualização é grande; se a rede falhar, seguimos e o timer
  # tenta de novo depois.
  freshclam --quiet || echo "  AVISO: freshclam falhou agora; o timer tentará de novo."
else
  echo "  base já presente."
fi
systemctl enable --now clamav-freshclam

echo "==> clamd"
sed -i 's/^Example$/#Example/' /etc/clamd.d/scan.conf
# Socket local: o scanner e, mais adiante, a extensão do Directus falam por
# aqui. Sem TCP — não há motivo para expor o antivírus na rede.
grep -q '^LocalSocket ' /etc/clamd.d/scan.conf || \
  echo 'LocalSocket /run/clamd.scan/clamd.sock' >> /etc/clamd.d/scan.conf
grep -q '^LocalSocketGroup ' /etc/clamd.d/scan.conf || \
  echo 'LocalSocketGroup virusgroup' >> /etc/clamd.d/scan.conf
grep -q '^LocalSocketMode ' /etc/clamd.d/scan.conf || \
  echo 'LocalSocketMode 660' >> /etc/clamd.d/scan.conf
systemctl enable --now clamd@scan
sleep 5
systemctl is-active clamd@scan

echo "==> varredura periódica dos uploads"
install -d -m 750 "$REPO/data/quarentena"
install -m 755 "$REPO/infra/scripts/varrer-uploads.sh" /usr/local/sbin/portal-varrer-uploads
install -m 644 "$REPO/infra/systemd/portal-antivirus.service" /etc/systemd/system/
install -m 644 "$REPO/infra/systemd/portal-antivirus.timer"   /etc/systemd/system/
restorecon -F /etc/systemd/system/portal-antivirus.* /usr/local/sbin/portal-varrer-uploads >/dev/null 2>&1 || true
systemctl daemon-reload
systemctl enable --now portal-antivirus.timer

echo
echo "==> estado"
systemctl list-timers portal-antivirus.timer --no-pager | head -3
echo
echo "Varredura manual:  systemctl start portal-antivirus.service"
echo "Log da varredura:  journalctl -u portal-antivirus -n 50"
