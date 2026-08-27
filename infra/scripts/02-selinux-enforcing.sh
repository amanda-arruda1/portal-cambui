#!/usr/bin/env bash
# Portal Cambuí — Fase 0, etapa 2 de 2: vira o SELinux de permissive para enforcing.
# Executar como root DEPOIS do reboot do 01-selinux-relabel.sh. Não reinicia nada.
set -euo pipefail

echo "==> modo atual: $(getenforce)"
if [[ "$(getenforce)" == "Disabled" ]]; then
  echo "ERRO: SELinux ainda desabilitado — rode antes o 01-selinux-relabel.sh." >&2
  exit 1
fi

echo "==> violações (AVC) registradas desde o boot:"
if ausearch -m AVC,USER_AVC -ts boot 2>/dev/null | grep -q .; then
  ausearch -m AVC,USER_AVC -ts boot 2>/dev/null | tail -40
  echo
  echo "ATENÇÃO: há violações acima. Analise antes de virar para enforcing —"
  echo "em enforcing elas passam de 'registrada' para 'bloqueada'."
  read -r -p "Virar para enforcing mesmo assim? (digite SIM) " resposta
  [[ "$resposta" == "SIM" ]] || { echo "Abortado. Sistema segue em permissive."; exit 0; }
else
  echo "  nenhuma. Relabel limpo."
fi

echo "==> aplicando enforcing (imediato e permanente)"
setenforce 1
sed -i 's/^SELINUX=.*/SELINUX=enforcing/' /etc/selinux/config

echo "==> modo agora: $(getenforce) | em /etc/selinux/config: $(grep -E '^SELINUX=' /etc/selinux/config)"
echo "Confirme que o SSH e o Docker seguem de pé antes de encerrar a sessão."
