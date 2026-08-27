#!/usr/bin/env bash
# Portal Cambuí — Fase 1: instala o Nginx (repo oficial nginx.org stable),
# publica a configuração versionada e abre a porta 80 APENAS para o proxy.
#
#   ./04-nginx-instalar.sh              -> instala e configura do zero
#   ./04-nginx-instalar.sh --recarregar -> só republica a config e recarrega
#   ./04-nginx-instalar.sh --abrir-443  -> libera também a 443 vinda do proxy
#
# A configuração é COPIADA do repositório para /etc/nginx (não é symlink), para
# que o SELinux consiga rotular os arquivos como httpd_config_t. Toda alteração
# em infra/nginx/ exige rodar este script com --recarregar.
#
# TOPOLOGIA: cidadão -> Cloudflare -> proxy 10.180.0.13 -> esta VM:80.
# A VM não tem IP público. Abrir a 80 para 0.0.0.0/0 não traria um visitante a
# mais e só exporia o servidor à rede interna do município — por isso a regra
# abaixo é restrita à origem.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ORIGEM="$REPO/infra/nginx"
PROXY_IP="${PROXY_IP:-10.180.0.13}"

[[ $EUID -eq 0 ]] || { echo "Rode como root." >&2; exit 1; }

regra_porta() {  # $1 = porta
  local p="$1"
  firewall-cmd --permanent --zone=public \
    --add-rich-rule="rule family=\"ipv4\" source address=\"$PROXY_IP\" port port=\"$p\" protocol=\"tcp\" accept" >/dev/null
  echo "  liberada $p/tcp somente de $PROXY_IP"
}

publicar_config() {
  echo "==> publicando configuração a partir de $ORIGEM"
  install -d -m 755 /etc/nginx/conf.d /etc/nginx/snippets
  install -m 644 "$ORIGEM/nginx.conf"       /etc/nginx/nginx.conf
  install -m 644 "$ORIGEM/snippets/"*.conf  /etc/nginx/snippets/
  # Só os .conf: o 20-https.conf.pendente fica de fora até o certificado existir.
  install -m 644 "$ORIGEM/conf.d/"*.conf    /etc/nginx/conf.d/
  # Se o TLS de origem já foi ativado pelo 05, republica também — senão edições
  # no arquivo .pendente nunca chegariam ao servidor.
  if [[ -f /etc/nginx/conf.d/20-https.conf ]]; then
    install -m 644 "$ORIGEM/conf.d/20-https.conf.pendente" /etc/nginx/conf.d/20-https.conf
    echo "  (TLS de origem já ativo: 20-https.conf republicado)"
  fi
  # O default.conf do pacote conflita com os nossos server blocks.
  rm -f /etc/nginx/conf.d/default.conf

  install -d -m 755 /var/www/certbot /var/www/portal
  install -m 644 "$ORIGEM/www/manutencao.html" /var/www/portal/_manutencao.html

  restorecon -RF /etc/nginx /var/www >/dev/null 2>&1 || true
}

case "${1:-}" in
  --recarregar)
    publicar_config
    echo "==> testando configuração"
    nginx -t
    systemctl reload nginx
    echo "Nginx recarregado."
    exit 0
    ;;
  --abrir-443)
    echo "==> liberando a 443 vinda do proxy"
    regra_porta 443
    firewall-cmd --reload
    echo "Pronto. Lembre que o proxy $PROXY_IP também precisa passar a encaminhar a 443."
    exit 0
    ;;
esac

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
# O certbot entra agora porque o 05 pode precisar dele (rota DNS-01); na rota
# do certificado de origem da Cloudflare ele fica ocioso, sem prejuízo.
dnf install -y nginx certbot

echo "==> SELinux: permitir que o Nginx fale com os upstreams em 127.0.0.1"
# Sem este boolean o proxy_pass é bloqueado em enforcing (AVC name_connect).
setsebool -P httpd_can_network_connect 1
echo "  httpd_can_network_connect = $(getsebool httpd_can_network_connect | awk '{print $3}')"

publicar_config

echo "==> testando configuração"
nginx -t

echo "==> abrindo a porta 80 no firewalld, restrita ao proxy"
regra_porta 80
firewall-cmd --reload
echo "  regras agora:"
firewall-cmd --list-rich-rules --zone=public | sed 's/^/    /'

echo "==> removendo o PID residual da instalação"
# O RPM do nginx.org deixa /run/nginx.pid criado por processo unconfined, com
# rótulo var_run_t. O Nginx roda como httpd_t e NÃO pode escrever nesse rótulo:
# em enforcing o master morre com "open() /var/run/nginx.pid failed (13)" e o
# systemd fica 90s no timeout. Apagado, o próprio Nginx recria o arquivo e a
# transição de tipo o rotula httpd_var_run_t (a política já mapeia esse caminho).
rm -f /run/nginx.pid

echo "==> habilitando e subindo o Nginx"
systemctl enable --now nginx
systemctl is-active nginx

cat <<'TXT'

Pronto. A partir daqui o proxy 10.180.0.13 consegue falar com esta VM na 80 e
recebe a página de implantação (o Astro só existe na Fase 2).

O que este script NÃO faz, de propósito:
  - não abre a 80 para o mundo: a VM não tem IP público, seria só exposição;
  - não abre a 443: o proxy ainda não encaminha essa porta (use --abrir-443
    quando/se ele passar a encaminhar);
  - não emite certificado: veja o 05-certificado.sh, que mudou de papel.

Teste local, simulando o proxy:
  curl -H 'Host: www.prefeituradecambui.mg.gov.br' http://127.0.0.1/_saude
TXT
