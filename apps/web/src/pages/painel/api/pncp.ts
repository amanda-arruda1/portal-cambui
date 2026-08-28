/**
 * Importação assistida do PNCP.
 *
 * O servidor cola a URL ou o número de controle; devolvemos os campos
 * pré-preenchidos para ELE REVISAR. Nada é gravado aqui — a confirmação é
 * dele, sempre. É o que elimina a digitação dupla sem transferir ao robô a
 * responsabilidade sobre o que vai ao ar.
 */
import type { APIRoute } from 'astro';
import { importarDoPncp } from '../../../lib/painel/licitacoes.ts';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.sessao) return new Response(JSON.stringify({ erro: 'Sessão expirada.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const corpo = await request.json().catch(() => ({}) as any);
  const referencia = String(corpo?.referencia ?? '').trim();
  if (!referencia) return new Response(JSON.stringify({ erro: 'Informe a URL ou o número de controle do PNCP.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const r = await importarDoPncp(referencia);
  if (!r.ok) {
    console.warn(`[pncp] importação falhou para "${referencia}": ${r.motivo}`);
    return new Response(JSON.stringify({ erro: r.motivo }), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  }
  console.info(`[pncp] ${locals.sessao.usuario.email} importou ${referencia}`);
  return new Response(JSON.stringify(r.dados), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
