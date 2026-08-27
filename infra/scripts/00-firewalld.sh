#!/usr/bin/env bash
# Portal Cambuí — Fase 0: ativa o firewall de host e sobe o Docker na ordem correta.
# Executar como root. Idempotente.
#
# Libera SOMENTE a porta 9025 (SSH). As portas 80 e 443 ficam para a fase do
# Nginx — abrir agora não traria ganho e contraria a regra de não abrir portas
# sem necessidade.
set -euo pipefail

echo "==> 1/5 instalando firewalld"
dnf -y install firewalld

echo "==> 2/5 pré-configurando a zona public (offline, antes de ativar)"
# Feito ANTES do serviço subir: se o firewalld iniciasse sem a 9025 liberada,
# a sessão SSH em curso seria cortada.
firewall-offline-cmd --zone=public --add-port=9025/tcp || true
firewall-offline-cmd --zone=public --remove-service=ssh     2>/dev/null || true
firewall-offline-cmd --zone=public --remove-service=cockpit 2>/dev/null || true

echo "==> 3/5 ativando o firewalld"
systemctl enable --now firewalld

echo "==> 4/5 estado do firewall"
firewall-cmd --list-all

echo "==> 5/5 subindo o Docker (depois do firewalld, para que crie as chains dentro dele)"
systemctl enable --now docker
docker info --format 'Docker OK: {{.ServerVersion}} | storage={{.Driver}}'

echo
echo "Pronto. SSH continua na 9025. Portas 80/443 permanecem FECHADAS."
echo "Quando a faixa de gerência da TrustIT for definida, restrinja a 9025 com:"
echo "  firewall-cmd --permanent --zone=public --remove-port=9025/tcp"
echo "  firewall-cmd --permanent --zone=public --add-rich-rule=\\"
echo "    'rule family=ipv4 source address=<FAIXA/CIDR> port port=9025 protocol=tcp accept'"
echo "  firewall-cmd --reload"
