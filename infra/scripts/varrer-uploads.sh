#!/usr/bin/env bash
# Varre os arquivos enviados ao Directus E ao Payload (media/) e põe em quarentena o que estiver
# infectado. Chamado pelo portal-antivirus.service (timer, de hora em hora).
#
# Move em vez de apagar: um falso positivo em documento oficial do município
# não pode virar perda de arquivo. Quem decide o descarte é uma pessoa.
#
# INCREMENTAL: uma varredura completa dos ~6 GB leva cerca de 45 min por diretório (prioridade ociosa), mais que o intervalo
# do timer. Por isso cada rodada examina só o que chegou DEPOIS da rodada anterior (marco abaixo), e uma vez por semana
# (ou sem marco) faz a varredura completa — o que cobre assinatura nova de vírus aplicada a arquivo antigo.
set -euo pipefail

DIRS=("/opt/portal-cambui/data/directus/uploads" "/opt/portal-cambui/novo-cms-payload/media")
QUARENTENA="/opt/portal-cambui/data/quarentena"
MARCO="$QUARENTENA/.ultima-varredura"
COMPLETA="$QUARENTENA/.ultima-completa"
SEMANA=$((7 * 24 * 3600))

install -d -m 750 "$QUARENTENA"
inicio="$(mktemp -p "$QUARENTENA" .inicio.XXXXXX)"   # carimbo do INÍCIO: o que chegar durante a varredura entra na próxima
trap 'rm -f "$inicio"' EXIT

completa=0
if [[ ! -f "$MARCO" || ! -f "$COMPLETA" ]] || (( $(date +%s) - $(stat -c %Y "$COMPLETA") > SEMANA )); then completa=1; fi

# --fdpass entrega o descritor ao clamd em vez de pedir que ele abra o caminho:
# é o que faz a varredura funcionar mesmo com o daemon confinado pelo SELinux.
# O código de saída 1 significa "encontrou vírus" — não é falha do script.
saida_final=0
for DIR in "${DIRS[@]}"; do
  [[ -d "$DIR" ]] || { echo "Diretório não existe (ignorado): $DIR"; continue; }
  saida=0
  if (( completa )); then
    clamdscan --fdpass --infected --no-summary --move="$QUARENTENA" "$DIR" || saida=$?
    modo="completa"
  else
    find "$DIR" -maxdepth 1 -type f -newer "$MARCO" -print0 \
      | xargs -0 -r clamdscan --fdpass --infected --no-summary --move="$QUARENTENA" || saida=$?
    modo="incremental"
  fi
  # xargs devolve 123 quando algum filho terminou com 1 (vírus achado).
  [[ "$saida" == 123 ]] && saida=1
  case "$saida" in
    0) echo "Varredura $modo de $DIR concluída: nenhum arquivo infectado." ;;
    1) echo "ALERTA: arquivo(s) infectado(s) em $DIR movido(s) para $QUARENTENA." >&2 ;;
    *) echo "ERRO: a varredura $modo de $DIR falhou (código $saida)." >&2; saida_final="$saida" ;;
  esac
done

# Só avança o marco se nada falhou — senão a próxima rodada reexamina o mesmo trecho.
if (( saida_final == 0 )); then
  touch -r "$inicio" "$MARCO"
  (( completa )) && touch -r "$inicio" "$COMPLETA"
fi
exit "$saida_final"
