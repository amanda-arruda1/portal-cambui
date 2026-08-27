#!/usr/bin/env bash
# Portal Cambuí — Fase 1: instala o Nginx (repo oficial nginx.org stable) e o
# Certbot, publica a configuração versionada e abre 80/443 no firewalld.
#
#   ./04-nginx-instalar.sh              -> instala e configura do zero
#   ./04-nginx-instalar.sh --recarregar -> só republica a config e recarrega
#
# A configuração é COPIADA do repositório para /etc/nginx (não é symlink), para
# que o SELinux consiga rotular os arquivos como httpd_config_t. Toda alteração
# em infra/nginx/ exige rodar este script com --recarregar.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ORIGEM="$REPO/infra/nginx"

[[ $EUID -eq 0 ]] || { echo "Rode como root." >&2; exit 1; }

publicar_config() {
  echo "==> publicando configuração a partir de $ORIGEM"
  install -d -m 755 /etc/nginx/conf.d /etc/nginx/snippets
  install -m 644 "$ORIGEM/nginx.conf"       /etc/nginx/nginx.conf
  install -m 644 "$ORIGEM/snippets/"*.conf  /etc/nginx/snippets/
  # Só os .conf: o 20-https.conf.pendente fica de fora até o certificado existir.
  install -m 644 "$ORIGEM/conf.d/"*.conf    /etc/nginx/conf.d/
  # Se o HTTPS já foi ativado pelo 05, republica também — senão edições no
  # arquivo .pendente nunca chegariam ao servidor.
  if [[ -f /etc/nginx/conf.d/20-https.conf ]]; then
    install -m 644 "$ORIGEM/conf.d/20-https.conf.pendente" /etc/nginx/conf.d/20-https.conf
    echo "  (HTTPS já ativo: 20-https.conf republicado)"
  fi
  # O default.conf do pacote conflita com os nossos server blocks.
  rm -f /etc/nginx/conf.d/default.conf

  install -d -m 755 /var/www/certbot /var/www/portal
  install -m 644 "$ORIGEM/www/manutencao.html" /var/www/portal/_manutencao.html

  restorecon -RF /etc/nginx /var/www >/dev/null 2>&1 || true
}

if [[ "${1:-}" == "--recarregar" ]]; then
  publicar_config
  echo "==> testando configuração"
  nginx -t
  systemctl reload nginx
  echo "Nginx recarregado."
  exit 0
fi

echo "==> repositório oficial do Nginx"
if [[ ! -f /etc/yum.repos.d/nginx.repo ]]; then
  cat > /etc/yum.repos.d/nginx.repo <<'REPO'
[nginx-stable]
name=nginx stable repo
baseurl=http://nginx.org/packages/centos/9/$basearch/
gpgcheck=1
enabled=1
gpgkey=https://nginx.org/keys/nginx_signing.key
module_hotfixes=true
REPO
  echo "  criado."
else
  echo "  já existe."
fi

echo "==> instalando nginx e certbot"
dnf install -y nginx certbot

echo "==> SELinux: permitir que o Nginx fale com os upstreams em 127.0.0.1"
# Sem este boolean o proxy_pass é bloqueado em enforcing (AVC name_connect).
setsebool -P httpd_can_network_connect 1
echo "  httpd_can_network_connect = $(getsebool httpd_can_network_connect | awk '{print $3}')"

publicar_config

echo "==> testando configuração"
nginx -t

echo "==> abrindo 80/443 no firewalld"
firewall-cmd --permanent --zone=public --add-service=http  >/dev/null
firewall-cmd --permanent --zone=public --add-service=https >/dev/null
firewall-cmd --reload
echo "  portas agora: $(firewall-cmd --list-services --zone=public) / $(firewall-cmd --list-ports --zone=public)"

echo "==> habilitando e subindo o Nginx"
systemctl enable --now nginx
systemctl is-active nginx

echo
echo "Pronto. Neste ponto só a porta 80 responde, servindo o desafio ACME e"
echo "redirecionando o resto para HTTPS — que ainda não existe."
echo "Próximo passo: 05-certificado.sh, DEPOIS de confirmar que o DNS aponta"
echo "para este servidor e que 80/443 chegam até aqui vindos da internet."
