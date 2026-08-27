#!/usr/bin/env bash
# Portal Cambuí — Fase 1: emite o certificado Let's Encrypt e ativa o HTTPS.
#
#   ./05-certificado.sh --email endereco@dominio --teste   -> ambiente de teste
#   ./05-certificado.sh --email endereco@dominio           -> PRODUÇÃO
#
# Comece SEMPRE pelo --teste. O Let's Encrypt limita 5 emissões por semana para
# o mesmo conjunto de domínios; errar em produção custa 7 dias de espera.
# O ambiente de teste emite um certificado inválido para navegadores, que serve
# só para provar que a validação do domínio funciona.
set -euo pipefail

PRINCIPAL="www.prefeituradecambui.mg.gov.br"
DOMINIOS=("$PRINCIPAL" "prefeituradecambui.mg.gov.br" "admin.prefeituradecambui.mg.gov.br")
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

EMAIL=""
TESTE=0
PULAR=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --email) EMAIL="${2:-}"; shift 2 ;;
    --teste) TESTE=1; shift ;;
    --pular-verificacao) PULAR=1; shift ;;
    *) echo "argumento desconhecido: $1" >&2; exit 1 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "Rode como root." >&2; exit 1; }
[[ -n "$EMAIL" ]] || { echo "ERRO: informe --email (avisos de expiração do Let's Encrypt)." >&2; exit 1; }
systemctl is-active --quiet nginx || { echo "ERRO: Nginx não está ativo. Rode o 04 antes." >&2; exit 1; }

if [[ $PULAR -eq 1 ]]; then
  echo "==> verificação prévia do ACME PULADA a pedido"
  FALHOU=0
else
echo "==> conferindo se o desafio ACME é alcançável de fora"
# Se isto falhar, o certbot também falha — só que gastando uma tentativa.
TOKEN="verificacao-$$"
install -d -m 755 /var/www/certbot/.well-known/acme-challenge
echo "$TOKEN" > /var/www/certbot/.well-known/acme-challenge/"$TOKEN"
restorecon -RF /var/www/certbot >/dev/null 2>&1 || true
FALHOU=0
for d in "${DOMINIOS[@]}"; do
  RESP="$(curl -fsS --max-time 10 "http://$d/.well-known/acme-challenge/$TOKEN" 2>/dev/null || true)"
  if [[ "$RESP" == "$TOKEN" ]]; then
    echo "  OK   $d"
  else
    echo "  FALHA $d — o desafio não chegou até este servidor"
    FALHOU=1
  fi
done
rm -f /var/www/certbot/.well-known/acme-challenge/"$TOKEN"
fi

if [[ $FALHOU -eq 1 ]]; then
  cat >&2 <<'FIM'

PARANDO antes de gastar uma tentativa no Let's Encrypt.

Verifique, nesta ordem:
  1. O DNS de cada domínio aponta para o IP público que chega nesta VM?
  2. Existe port-forward/NAT da porta 80 desse IP para 10.180.5.110?
  3. Há WAF ou balanceador na frente interceptando o /.well-known/?

ATENÇÃO — isto pode ser um falso negativo. O teste sai deste próprio servidor
em direção ao IP público; se o NAT não fizer hairpin (voltar para dentro), a
requisição não retorna mesmo com tudo correto do lado de fora. Confirme de uma
rede externa e, se estiver certo, repita com --pular-verificacao.
FIM
  exit 2
fi

ARGS=(certonly --webroot -w /var/www/certbot
      --email "$EMAIL" --agree-tos --no-eff-email
      --cert-name "$PRINCIPAL" --keep-until-expiring)
for d in "${DOMINIOS[@]}"; do ARGS+=(-d "$d"); done

if [[ $TESTE -eq 1 ]]; then
  echo "==> emitindo em AMBIENTE DE TESTE (certificado inválido, sem consumir cota)"
  certbot "${ARGS[@]}" --dry-run
  echo
  echo "Teste concluído. Se não houve erro acima, repita SEM --teste para valer."
  exit 0
fi

echo "==> emitindo certificado de PRODUÇÃO para: ${DOMINIOS[*]}"
certbot "${ARGS[@]}"

echo "==> ativando os server blocks HTTPS"
install -m 644 "$REPO/infra/nginx/conf.d/20-https.conf.pendente" /etc/nginx/conf.d/20-https.conf
restorecon -F /etc/nginx/conf.d/20-https.conf >/dev/null 2>&1 || true
nginx -t
systemctl reload nginx

echo "==> renovação automática"
# O pacote já traz o timer; o hook garante que o Nginx enxergue o cert novo.
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/recarregar-nginx.sh <<'HOOK'
#!/bin/sh
systemctl reload nginx
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/recarregar-nginx.sh
systemctl enable --now certbot-renew.timer 2>/dev/null || true
certbot renew --dry-run

echo
echo "HTTPS ativo. Confira em https://$PRINCIPAL/ (deve mostrar a página de"
echo "implantação até o Astro subir, na Fase 2)."
echo
echo "Só DEPOIS de ver a renovação automática funcionar, habilite o HSTS:"
echo "  descomente a linha Strict-Transport-Security em"
echo "  infra/nginx/conf.d/20-https.conf.pendente e rode 04 --recarregar."
