/**
 * Gravação automática do rascunho de obra. Mesmo papel de
 * painel/api/licitacao-salvar.ts — grava só o que mudou, nunca publica.
 */
import type { APIRoute } from 'astro';
import { atualizar } from '../../../lib/painel/obras.ts';

const CAMPOS_PERMITIDOS = new Set([
  'numero_processo', 'numero_contrato', 'categoria', 'secretaria', 'objeto_resumo', 'objeto', 'endereco',
  'empresa_executora', 'empresa_cnpj', 'responsavel_tecnico', 'art_rrt', 'fonte_recurso', 'numero_convenio',
  'valor_contratado', 'valor_aditivado', 'valor_pago', 'data_ordem_servico', 'data_prevista_termino',
  'data_termino_real', 'situacao', 'motivo_situacao', 'percentual_execucao', 'observacoes',
]);

export const POST: APIRoute = async ({ request, locals }) => {
  const sessao = locals.sessao;
  const json = (c: unknown, s: number) => new Response(JSON.stringify(c), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (!sessao) return json({ erro: 'Sessão expirada.' }, 401);

  const corpo = await request.json().catch(() => ({}) as any);
  const id = String(corpo?.id ?? '');
  if (!id) return json({ erro: 'Rascunho não identificado.' }, 400);

  const dados: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(corpo?.dados ?? {})) if (CAMPOS_PERMITIDOS.has(k)) dados[k] = v;
  if (Object.keys(dados).length === 0) return json({ ok: true, em: new Date().toISOString() }, 200);

  const r = await atualizar(sessao, id, dados);
  if (!r.ok) return json({ erro: r.motivo }, r.status);
  return json({ ok: true, em: new Date().toISOString() }, 200);
};
