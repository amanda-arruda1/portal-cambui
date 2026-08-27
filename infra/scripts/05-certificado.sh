#!/usr/bin/env bash
# Portal Cambuí — certificado TLS. ESTE SCRIPT MUDOU DE PAPEL em 2026-08-27.
#
# O QUE O LEVANTAMENTO MOSTROU:
#   - prefeituradecambui.mg.gov.br já está no ar, atrás da CLOUDFLARE, servindo
#     o PORTAL ANTIGO (ASP.NET MVC 5). Não é esta VM.
#   - O TLS público já existe e é da Cloudflare (Google Trust Services, cobre o
#     apex e *.prefeituradecambui.mg.gov.br). Renova sozinho. O cidadão já
#     navega em https hoje.
#   - http://…/.well-known/acme-challenge/<token> devolve 302 para /Erro do
#     portal antigo. Ou seja: o desafio HTTP-01 NUNCA chega até nós.
#
# CONSEQUÊNCIA: emitir Let's Encrypt por HTTP-01 (o que a versão anterior deste
# script fazia) falharia sempre, gastando a cota de 5 falhas/hora da autoridade.
# Esse caminho foi REMOVIDO de propósito.
#
# O que resta a fazer aqui é o TLS do último trecho — Cloudflare/proxy até esta
# VM, hoje em texto claro. Duas rotas, ambas válidas:
#
#   ./05-certificado.sh --diagnostico
#       Não muda nada. Mostra o estado real do caminho público.
#
#   ./05-certificado.sh --origem-cloudflare --cert <arq.pem> --chave <arq.key>
#       ROTA RECOMENDADA. Instala um Cloudflare Origin Certificate (gerado no
#       painel: SSL/TLS > Origin Server > Create Certificate; validade de até
#       15 anos, aceito só pela Cloudflare). Não depende de validação externa.
#
#   ./05-certificado.sh --dns-cloudflare --email <e-mail> --token-arquivo <arq>
#       Let's Encrypt por DNS-01. Exige um API token da Cloudflare com permissão
#       Zone:DNS:Edit na zona. Use se houver exigência de CA pública na origem.
#
# Em qualquer rota o certificado acaba em /etc/nginx/ssl/origem/, que é o que o
# 20-https.conf espera — o Nginx não sabe nem se importa de onde ele veio.
set -euo pipefail

PRINCIPAL="www.prefeituradecambui.mg.gov.br"
APEX="prefeituradecambui.mg.gov.br"
ADMIN="admin.prefeituradecambui.mg.gov.br"
DESTINO="/etc/nginx/ssl/origem"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

MODO=""; EMAIL=""; CERT=""; CHAVE=""; TOKEN_ARQ=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --diagnostico)       MODO="diag"; shift ;;
    --origem-cloudflare) MODO="origem"; shift ;;
    --dns-cloudflare)    MODO="dns"; shift ;;
    --email)             EMAIL="${2:-}"; shift 2 ;;
    --cert)              CERT="${2:-}"; shift 2 ;;
    --chave)             CHAVE="${2:-}"; shift 2 ;;
    --token-arquivo)     TOKEN_ARQ="${2:-}"; shift 2 ;;
    *) echo "argumento desconhecido: $1" >&2; exit 1 ;;
  esac
done
[[ -n "$MODO" ]] || { sed -n '2,40p' "$0"; exit 1; }

# ---------------------------------------------------------------- diagnóstico
if [[ "$MODO" == "diag" ]]; then
  echo "==> quem responde hoje em cada nome"
  for d in "$APEX" "$PRINCIPAL" "$ADMIN"; do
    # '|| true': getent falha quando o nome não existe e, com pipefail, isso
    # abortaria o diagnóstico justamente no caso que ele existe para mostrar.
    IPS="$(getent ahosts "$d" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
    if [[ -z "$IPS" ]]; then
      echo "  $d -> NÃO RESOLVE (o registro precisa ser criado na Cloudflare)"
      continue
    fi
    SRV="$(curl -sSI -m 10 "https://$d/" 2>/dev/null | awk -F': ' 'tolower($1)=="server"{print $2}' | tr -d '\r' || true)"
    echo "  $d -> ${IPS}| server: ${SRV:-sem resposta}"
  done

  echo "==> certificado público em $PRINCIPAL"
  echo | timeout 10 openssl s_client -connect "$PRINCIPAL:443" -servername "$PRINCIPAL" 2>/dev/null \
    | openssl x509 -noout -issuer -dates 2>/dev/null | sed 's/^/  /' || echo "  (não obtido)"

  echo "==> o desafio ACME chega nesta VM?"
  COD="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' \
         "http://$PRINCIPAL/.well-known/acme-challenge/sonda-$$" 2>/dev/null || echo 000)"
  if [[ "$COD" == "404" ]]; then
    echo "  código $COD — caminho livre; o HTTP-01 passaria a ser viável."
  else
    echo "  código $COD — o caminho é interceptado antes de chegar aqui."
    echo "  HTTP-01 NÃO é utilizável. Use --origem-cloudflare ou --dns-cloudflare."
  fi

  echo "==> este servidor"
  echo "  nginx: $(systemctl is-active nginx 2>/dev/null)"
  echo "  regras do firewall: $(firewall-cmd --list-rich-rules --zone=public 2>/dev/null | tr '\n' ';' | sed 's/;$//')"
  echo "  cert de origem instalado: $([[ -f $DESTINO/fullchain.pem ]] && echo sim || echo não)"
  exit 0
fi

[[ $EUID -eq 0 ]] || { echo "Rode como root." >&2; exit 1; }

instalar_par() {  # $1 = fullchain, $2 = privkey
  install -d -m 700 "$DESTINO"
  install -m 644 "$1" "$DESTINO/fullchain.pem"
  install -m 600 "$2" "$DESTINO/privkey.pem"
  restorecon -RF "$DESTINO" >/dev/null 2>&1 || true
  echo "  instalado em $DESTINO"
  openssl x509 -in "$DESTINO/fullchain.pem" -noout -subject -dates -ext subjectAltName \
    2>/dev/null | sed 's/^/  /'
}

ativar_https() {
  echo "==> ativando os server blocks de TLS na origem"
  install -m 644 "$REPO/infra/nginx/conf.d/20-https.conf.pendente" /etc/nginx/conf.d/20-https.conf
  restorecon -F /etc/nginx/conf.d/20-https.conf >/dev/null 2>&1 || true
  nginx -t
  systemctl reload nginx
  echo "  Nginx recarregado."
  cat <<'TXT'

FALTA FAZER FORA DAQUI, senão isto não tem efeito nenhum:
  1. liberar a 443 no firewalld:  ./04-nginx-instalar.sh --abrir-443
  2. o proxy 10.180.0.13 precisa encaminhar a 443 para 10.180.5.110
  3. na Cloudflare, mudar o modo de SSL/TLS para "Full (strict)"
Enquanto (1) e (2) não acontecerem, o site segue atendendo pela 80 normalmente.
TXT
}

# ------------------------------------------------- rota: certificado de origem
if [[ "$MODO" == "origem" ]]; then
  [[ -f "$CERT"  ]] || { echo "ERRO: --cert não encontrado: $CERT" >&2; exit 1; }
  [[ -f "$CHAVE" ]] || { echo "ERRO: --chave não encontrada: $CHAVE" >&2; exit 1; }
  # Um par trocado derruba o Nginx no reload; confere antes de escrever.
  MC="$(openssl x509 -noout -modulus -in "$CERT" 2>/dev/null | openssl md5)"
  MK="$(openssl rsa  -noout -modulus -in "$CHAVE" 2>/dev/null | openssl md5)"
  if [[ -z "$MC" || "$MC" != "$MK" ]]; then
    echo "ERRO: o certificado e a chave não formam par (ou não são RSA)." >&2
    echo "      Gere os dois juntos no painel da Cloudflare e repita." >&2
    exit 1
  fi
  echo "==> instalando o certificado de origem"
  instalar_par "$CERT" "$CHAVE"
  systemctl is-active --quiet nginx || { echo "ERRO: Nginx parado. Rode o 04 antes." >&2; exit 1; }
  ativar_https
  echo
  echo "Lembrete: um Origin Certificate só é aceito pela Cloudflare. Acessar a"
  echo "VM direto pela 443 mostrará aviso de certificado — é o esperado."
  exit 0
fi

# ------------------------------------------------------ rota: Let's Encrypt DNS-01
if [[ "$MODO" == "dns" ]]; then
  [[ -n "$EMAIL" ]] || { echo "ERRO: informe --email (avisos de expiração)." >&2; exit 1; }
  [[ -f "$TOKEN_ARQ" ]] || { echo "ERRO: --token-arquivo não encontrado." >&2; exit 1; }
  systemctl is-active --quiet nginx || { echo "ERRO: Nginx parado. Rode o 04 antes." >&2; exit 1; }

  echo "==> plugin DNS da Cloudflare"
  rpm -q python3-certbot-dns-cloudflare >/dev/null 2>&1 || dnf install -y python3-certbot-dns-cloudflare

  INI=/etc/letsencrypt/cloudflare.ini
  install -d -m 700 /etc/letsencrypt
  umask 077
  printf 'dns_cloudflare_api_token = %s\n' "$(tr -d ' \r\n' < "$TOKEN_ARQ")" > "$INI"
  chmod 600 "$INI"
  echo "  credencial gravada em $INI (600)"

  # O admin ainda não tem registro; incluí-lo é válido no DNS-01 (a validação é
  # por TXT, não por resolução do nome), mas o certificado só terá uso quando o
  # registro existir.
  DOMINIOS=("$PRINCIPAL" "$APEX" "$ADMIN")
  ARGS=(certonly --dns-cloudflare --dns-cloudflare-credentials "$INI"
        --dns-cloudflare-propagation-seconds 30
        --email "$EMAIL" --agree-tos --no-eff-email
        --cert-name "$PRINCIPAL" --keep-until-expiring)
  for d in "${DOMINIOS[@]}"; do ARGS+=(-d "$d"); done

  echo "==> ensaio (não consome cota)"
  certbot "${ARGS[@]}" --dry-run

  echo "==> emitindo de verdade: ${DOMINIOS[*]}"
  certbot "${ARGS[@]}"

  VIVO="/etc/letsencrypt/live/$PRINCIPAL"
  instalar_par "$VIVO/fullchain.pem" "$VIVO/privkey.pem"

  echo "==> renovação automática"
  install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
  cat > /etc/letsencrypt/renewal-hooks/deploy/publicar-origem.sh <<HOOK
#!/bin/sh
# Copia o certificado renovado para onde o Nginx procura e recarrega.
install -m 644 "$VIVO/fullchain.pem" "$DESTINO/fullchain.pem"
install -m 600 "$VIVO/privkey.pem"   "$DESTINO/privkey.pem"
restorecon -RF "$DESTINO" >/dev/null 2>&1 || true
systemctl reload nginx
HOOK
  chmod +x /etc/letsencrypt/renewal-hooks/deploy/publicar-origem.sh
  systemctl enable --now certbot-renew.timer 2>/dev/null || true
  certbot renew --dry-run

  ativar_https
  exit 0
fi
