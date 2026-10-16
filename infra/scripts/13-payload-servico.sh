#!/usr/bin/env bash
# Portal Cambuí — instala o Payload CMS como serviço systemd (portal-payload).
#
#   sudo ./13-payload-servico.sh              -> instala, para o processo manual e sobe o serviço
#   sudo ./13-payload-servico.sh --so-checar  -> só valida a unit e as permissões, sem tocar em nada
#
# Escuta em 127.0.0.1:3000. Não abre porta, não toca em firewall, Nginx nem no
# portal-web: ligar o site ao Payload (CMS_TELEFONES=payload) é um passo à parte.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PAY="$REPO/novo-cms-payload"
USUARIO="portal-payload"
UNIT="portal-payload.service"

[[ $EUID -eq 0 ]] || { echo "Rode como root." >&2; exit 1; }
[[ -d "$PAY/.next" ]] || { echo "Falta o build: cd $PAY && npm run build" >&2; exit 1; }
[[ -f "$PAY/.env" ]] || { echo "Falta $PAY/.env (DATABASE_URL e PAYLOAD_SECRET)." >&2; exit 1; }

echo "==> validando a unit"
systemd-analyze verify "$REPO/infra/systemd/$UNIT" 2>&1 | grep -v "^$" || true
if [[ "${1:-}" == "--so-checar" ]]; then echo "Checagem concluída (--so-checar)."; exit 0; fi

echo "==> usuário de serviço"
if ! id "$USUARIO" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$USUARIO"
  echo "  criado: $USUARIO"
else
  echo "  já existe: $USUARIO"
fi

echo "==> permissões"
# Código e dependências: dono root, só leitura para o serviço (um comprometimento
# do processo não pode reescrever o próprio código).
chown -R root:"$USUARIO" "$PAY/.next" "$PAY/node_modules" "$PAY/src" "$PAY/package.json"
chmod -R u=rwX,g=rX,o= "$PAY/.next" "$PAY/node_modules" "$PAY/src" "$PAY/package.json"
chmod o+x "$REPO" "$PAY" 2>/dev/null || true
chown root:"$USUARIO" "$PAY" "$PAY/next.config.ts" "$PAY/tsconfig.json" 2>/dev/null || true
chmod g+rx "$PAY"
# Segredos: legíveis só por root e pelo serviço.
chown root:"$USUARIO" "$PAY/.env"; chmod 640 "$PAY/.env"
# Únicos lugares onde o serviço escreve.
install -d -o "$USUARIO" -g "$USUARIO" -m 750 "$PAY/.next/cache"
chown -R "$USUARIO":"$USUARIO" "$PAY/media"; chmod -R u=rwX,g=rX,o= "$PAY/media"

echo "==> banco do Payload"
(cd "$PAY" && docker compose up -d) >/dev/null
for i in $(seq 1 20); do docker exec payload-postgres pg_isready -U payload >/dev/null 2>&1 && break; sleep 1; done
docker exec payload-postgres pg_isready -U payload

echo "==> migrations do banco"
# O esquema só muda por migration. Um banco criado pelo push do Payload (modo dev) traz a marca 'dev' em
# payload_migrations, e o `migrate` sobre ele faz uma pergunta que, confirmada, APAGA os dados. Em vez de
# arriscar, aborta: tratar a marca à mão (ver CLAUDE.md, seção Payload).
if [[ "$(docker exec payload-postgres psql -U payload -d payload -Atc "select count(*) from payload_migrations where name = 'dev'" 2>/dev/null || echo 0)" != "0" ]]; then
  echo "ERRO: payload_migrations tem a marca 'dev' (banco criado por push). Não rodo o migrate." >&2
  echo "      Registre a migration inicial como aplicada antes (CLAUDE.md > Payload > Esquema)." >&2
  exit 1
fi
(cd "$PAY" && npm run payload -- migrate 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Migrat|Done|ERRO|rror' || true)

echo "==> instalando a unit"
install -m 644 "$REPO/infra/systemd/$UNIT" "/etc/systemd/system/$UNIT"
systemctl daemon-reload

echo "==> trocando o processo manual pelo serviço"
PID="$(ss -ltnp 2>/dev/null | grep -E '127\.0\.0\.1:3000 ' | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
if [[ -n "$PID" ]] && ! systemctl is-active --quiet "$UNIT"; then
  echo "  encerrando o processo manual (pid $PID)"; kill "$PID"; sleep 2
fi
systemctl enable --now "$UNIT"

echo "==> verificando"
for i in $(seq 1 30); do [[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/cms/admin)" == "200" ]] && break; sleep 1; done
printf '  /admin                  -> HTTP %s\n' "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/cms/admin)"
printf '  telefones (anônimo)     -> %s publicados\n' "$(curl -sg 'http://127.0.0.1:3000/cms/api/telefones-uteis?limit=1' | grep -oP '"totalDocs":\K[0-9]+')"
printf '  outra coleção (fechada) -> HTTP %s (esperado 403)\n' "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/cms/api/licitacao-assinantes?limit=1)"
systemctl --no-pager --lines=0 status "$UNIT" | sed -n 1,4p
echo
echo "Serviço no ar. Logs: journalctl -u $UNIT -f"
