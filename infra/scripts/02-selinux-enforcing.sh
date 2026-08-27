#!/usr/bin/env bash
# Portal Cambuí — Fase 0, etapa 2 de 2: vira o SELinux de permissive para enforcing.
# Executar como root DEPOIS do reboot do 01-selinux-relabel.sh. Não reinicia nada.
#
#   ./02-selinux-enforcing.sh            -> para se sobrarem violações não tratadas
#   ./02-selinux-enforcing.sh --forcar   -> vira para enforcing mesmo assim
set -euo pipefail

PORTA_SSH="$(awk '/^[[:space:]]*Port[[:space:]]+/ {print $2; exit}' /etc/ssh/sshd_config)"
PORTA_SSH="${PORTA_SSH:-22}"

echo "==> modo atual: $(getenforce)"
if [[ "$(getenforce)" == "Disabled" ]]; then
  echo "ERRO: SELinux ainda desabilitado — o reboot do 01-selinux-relabel.sh" >&2
  echo "      ainda não aconteceu. Rode 'systemctl reboot' e volte aqui." >&2
  exit 1
fi

# Pré-condição crítica: o sshd roda numa porta fora do padrão. Se essa porta não
# estiver rotulada como ssh_port_t, em enforcing o bind é negado e o acesso ao
# servidor se perde no próximo restart do sshd (ou no próximo reboot).
echo "==> rótulo SELinux da porta do SSH (${PORTA_SSH}/tcp)"
if [[ "$PORTA_SSH" == "22" ]]; then
  echo "  porta padrão, nada a fazer."
elif semanage port -l | grep -qE "^ssh_port_t.*\b${PORTA_SSH}\b"; then
  echo "  já rotulada como ssh_port_t."
else
  echo "  rotulando ${PORTA_SSH}/tcp como ssh_port_t..."
  semanage port -a -t ssh_port_t -p tcp "$PORTA_SSH" \
    || semanage port -m -t ssh_port_t -p tcp "$PORTA_SSH"
  echo "  ok: $(semanage port -l | grep -E '^ssh_port_t')"
fi

echo "==> violações (AVC) ainda pendentes desde o boot:"
# O AVC do bind do sshd é esperado e foi resolvido acima; filtra para não travar à toa.
PENDENTES="$(ausearch -m AVC,USER_AVC -ts boot 2>/dev/null \
  | grep 'type=AVC' \
  | grep -v "comm=\"sshd\".*src=${PORTA_SSH}.*name_bind" || true)"
if [[ -n "$PENDENTES" ]]; then
  echo "$PENDENTES" | tail -40
  echo
  if [[ "${1:-}" != "--forcar" ]]; then
    echo "PARANDO: há violações acima ainda não tratadas. Em enforcing elas passam" >&2
    echo "de 'registrada' para 'bloqueada'. Analise e, se forem aceitáveis, rode:" >&2
    echo "    $0 --forcar" >&2
    exit 2
  fi
  echo "--forcar informado: seguindo mesmo com as violações acima."
else
  echo "  nenhuma pendente."
fi

echo "==> aplicando enforcing (imediato e permanente)"
setenforce 1
sed -i 's/^SELINUX=.*/SELINUX=enforcing/' /etc/selinux/config

echo "==> validando o SSH em enforcing (restart do sshd)"
systemctl restart sshd
sleep 2
if systemctl is-active --quiet sshd && ss -tln | grep -q ":${PORTA_SSH}\b"; then
  echo "  sshd de pé e escutando na ${PORTA_SSH}/tcp."
else
  echo "AVISO: sshd NÃO subiu corretamente — revertendo para permissive." >&2
  setenforce 0
  sed -i 's/^SELINUX=.*/SELINUX=permissive/' /etc/selinux/config
  systemctl restart sshd || true
  echo "Revertido. NÃO encerre esta sessão; investigue antes de tentar de novo." >&2
  exit 3
fi

echo "==> modo agora: $(getenforce) | em /etc/selinux/config: $(grep -E '^SELINUX=' /etc/selinux/config)"
echo "==> docker: $(systemctl is-active docker)"
echo "Confirme que o SSH e o Docker seguem de pé antes de encerrar a sessão."
