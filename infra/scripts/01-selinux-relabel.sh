#!/usr/bin/env bash
# Portal Cambuí — Fase 0, etapa 1 de 2: reabilita o SELinux e reinicia o servidor.
# Executar como root.
#
#   ./01-selinux-relabel.sh                 -> apenas prepara (não reinicia)
#   ./01-selinux-relabel.sh --reiniciar     -> prepara e REINICIA a máquina
#
# Vai para 'permissive', não direto para 'enforcing'. Motivo: o sistema rodou
# com SELinux desligado, então nenhum arquivo criado desde o provisionamento tem
# rótulo correto. O autorelabel corrige isso no boot, mas se algo escapar em
# modo enforcing o SSH pode não subir e a máquina fica inacessível. Em permissive
# as violações são apenas registradas. A etapa 2 (02-selinux-enforcing.sh) lê
# esse registro e faz a virada para enforcing — sem novo reboot.
set -euo pipefail

if [[ "$(getenforce)" == "Enforcing" ]]; then
  echo "SELinux já está enforcing. Nada a fazer."
  exit 0
fi

if ! grep -qE '^SELINUX=permissive' /etc/selinux/config; then
  echo "==> ajustando /etc/selinux/config para permissive"
  cp -a /etc/selinux/config "/etc/selinux/config.bak-$(date +%Y%m%d-%H%M%S)"
  sed -i 's/^SELINUX=.*/SELINUX=permissive/' /etc/selinux/config
else
  echo "==> /etc/selinux/config já está em permissive"
fi
grep -E '^SELINUX=' /etc/selinux/config

if [[ ! -e /.autorelabel ]]; then
  echo "==> agendando o relabel completo do sistema de arquivos"
  touch /.autorelabel
else
  echo "==> relabel já estava agendado (/.autorelabel presente)"
fi

echo
echo "Preparado. O próximo boot vai reetiquetar TODO o disco antes de liberar o"
echo "login: de 2 a 10 minutos, com uma segunda reinicialização automática ao"
echo "final. Não interrompa."
echo

if [[ "${1:-}" == "--reiniciar" ]]; then
  echo "Reiniciando agora..."
  systemctl reboot
else
  echo "Nada foi reiniciado. Para reiniciar quando quiser:"
  echo "    systemctl reboot"
  echo "ou rode este mesmo script com:  $0 --reiniciar"
fi
