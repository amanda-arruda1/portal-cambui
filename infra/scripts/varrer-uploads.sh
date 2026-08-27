#!/usr/bin/env bash
# Varre os arquivos enviados ao Directus e põe em quarentena o que estiver
# infectado. Chamado pelo portal-antivirus.service (timer).
#
# Move em vez de apagar: um falso positivo em documento oficial do município
# não pode virar perda de arquivo. Quem decide o descarte é uma pessoa.
set -euo pipefail

UPLOADS="/opt/portal-cambui/data/directus/uploads"
QUARENTENA="/opt/portal-cambui/data/quarentena"

[[ -d "$UPLOADS" ]] || { echo "Diretório de uploads não existe: $UPLOADS"; exit 0; }
install -d -m 750 "$QUARENTENA"

# --fdpass entrega o descritor ao clamd em vez de pedir que ele abra o caminho:
# é o que faz a varredura funcionar mesmo com o daemon confinado pelo SELinux.
# O código de saída 1 significa "encontrou vírus" — não é falha do script.
saida=0
clamdscan --fdpass --infected --no-summary --move="$QUARENTENA" "$UPLOADS" || saida=$?

case "$saida" in
  0) echo "Varredura concluída: nenhum arquivo infectado." ;;
  1) echo "ALERTA: arquivo(s) infectado(s) movido(s) para $QUARENTENA." >&2 ;;
  *) echo "ERRO: a varredura falhou (código $saida)." >&2; exit "$saida" ;;
esac
