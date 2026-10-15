#!/usr/bin/env node
/**
 * Consulta ao PNCP para o painel do Payload — serviço residente em 127.0.0.1.
 *
 * Existe porque o Payload (como o portal-web) roda com IPAddressDeny=any e não alcança a internet, e o painel fica exposto
 * ao público em /cms. Em vez de abrir a internet para ele, este processo minúsculo faz UMA coisa: buscar uma contratação
 * no PNCP e devolver o JSON. Só escuta em loopback; só aceita CNPJ/ano/sequencial numéricos (nada de URL vinda de fora,
 * logo nada de SSRF); só fala com pncp.gov.br.
 *
 *   GET /compra?cnpj=00000000000000&ano=2026&seq=3   → JSON do PNCP (200) | 404 | 503
 *
 * A API do PNCP é instável (500/503/429 em sequência nas provas de 28/08/2026): timeout curto, uma repetição, e o
 * painel degrada para preenchimento manual. O endereço antigo /api/pncp/v1/orgaos/... passou a responder 301 (movido
 * para /api/consulta/v1/...) — a versão anterior do painel falhava sempre por causa disso.
 */
import http from 'node:http';

const PORTA = Number(process.env.PNCP_PORTA || 3100);
const ORIGEM = 'https://pncp.gov.br/api/consulta/v1/orgaos';

async function buscar(cnpj, ano, seq) {
  const url = `${ORIGEM}/${cnpj}/compras/${ano}/${seq}`;
  for (const tentativa of [0, 1]) {
    try {
      if (tentativa) await new Promise((r) => setTimeout(r, 1500));
      const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' }, redirect: 'error' });
      if (r.status === 404) return { status: 404, corpo: { erro: 'nao_encontrado' } };
      if (r.ok) return { status: 200, corpo: await r.json() };
    } catch { /* a próxima tentativa decide */ }
  }
  return { status: 503, corpo: { erro: 'indisponivel' } };
}

const servidor = http.createServer(async (req, res) => {
  const u = new URL(req.url ?? '/', 'http://localhost');
  const responder = (status, corpo) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(corpo)); };
  if (req.method !== 'GET' || u.pathname !== '/compra') return responder(404, { erro: 'rota' });
  const cnpj = u.searchParams.get('cnpj') ?? '', ano = u.searchParams.get('ano') ?? '', seq = u.searchParams.get('seq') ?? '';
  if (!/^\d{14}$/.test(cnpj) || !/^\d{4}$/.test(ano) || !/^\d{1,9}$/.test(seq)) return responder(400, { erro: 'parametros' });
  const r = await buscar(cnpj, ano, String(Number(seq)));
  console.log(`consulta ${cnpj}/${ano}/${Number(seq)} -> ${r.status}`);
  responder(r.status, r.corpo);
});
servidor.listen(PORTA, '127.0.0.1', () => console.log(`pncp-servico em 127.0.0.1:${PORTA}`));
