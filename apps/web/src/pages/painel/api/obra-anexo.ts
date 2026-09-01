/**
 * Anexar documento a uma obra. O binário já passou por /painel/api/upload
 * (lista de permissão, número mágico, ClamAV) — aqui só se cria o registro
 * que liga o arquivo à obra, com categoria e data.
 */
import type { APIRoute } from 'astro';
import { criarAnexo } from '../../../lib/painel/obras.ts';

const json = (c: unknown, s: number) => new Response(JSON.stringify(c), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

export const POST: APIRoute = async ({ request, locals }) => {
  const sessao = locals.sessao;
  if (!sessao) return json({ erro: 'Sessão expirada.' }, 401);

  const c = await request.json().catch(() => ({}) as any);
  const { obra, titulo, categoria, arquivo } = c ?? {};
  if (!obra || !titulo || !categoria || !arquivo) return json({ erro: 'Dados incompletos para anexar o documento.' }, 400);

  const r = await criarAnexo(sessao, {
    obra, titulo, categoria, arquivo,
    data_referencia: new Date().toISOString(),
    descricao: typeof c.descricao === 'string' && c.descricao.trim() ? c.descricao.trim() : null,
    ordem: Number(c.ordem ?? 0),
  });
  if (!r.ok) return json({ erro: r.motivo }, r.status);

  console.info(`[obras] ${sessao.usuario.email} anexou "${titulo}" (${categoria}) à obra ${obra}`);
  return json({ id: r.dados.id }, 201);
};
