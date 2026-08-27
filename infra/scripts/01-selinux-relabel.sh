#!/usr/bin/env bash
# Portal Cambuí — Fase 0, etapa 1 de 2: reabilita o SELinux e reinicia o servidor.
# Executar como root. ESTE SCRIPT REINICIA A MÁQUINA.
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

echo "==> ajustando /etc/selinux/config para permissive"
cp -a /etc/selinux/config /etc/selinux/config.bak-$(date +%Y%m%d-%H%M%S)
sed -i 's/^SELINUX=.*/SELINUX=permissive/' /etc/selinux/config
grep -E '^SELINUX=' /etc/selinux/config

echo "==> agendando o relabel completo do sistema de arquivos"
touch /.autorelabel

echo
echo "O próximo boot vai reetiquetar TODO o disco antes de liberar o login."
echo "Em 1 TB isso costuma levar de 2 a 10 minutos, e a máquina reinicia mais"
echo "uma vez sozinha ao terminar. Não interrompa."
echo
read -r -p "Reiniciar agora? (digite SIM) " resposta
[[ "$resposta" == "SIM" ]] || { echo "Abortado. O relabel segue agendado para o próximo boot."; exit 0; }

echo "Reiniciando..."
systemctl reboot
