/**
 * Gravação automática do rascunho.
 *
 * Chamado pelo editor a cada pausa de digitação. Grava só o que mudou e devolve
 * o instante da gravação, que a tela mostra ("salvo às 14:32") — sem esse
 * retorno visível o servidor não confia no automático e fica clicando em salvar.
 *
 * NÃO publica nem muda situação: rascunho automático que publica sozinho seria
 * exatamente o vexame que o módulo existe para evitar.
 */
import type { APIRoute } from 'astro';
import { atualizar } from '../../../lib/painel/licitacoes.ts';

const CAMPOS_PERMITIDOS = new Set([
  'numero_processo', 'numero', 'ano', 'modalidade', 'forma', 'justificativa_presencial',
  'criterio_julgamento', 'modo_disputa', 'registro_precos', 'secretaria', 'objeto_resumo',
  'objeto', 'valor_estimado', 'orcamento_sigiloso', 'data_publicacao', 'data_abertura_propostas',
  'data_sessao', 'prazo_impugnacao', 'prazo_esclarecimentos', 'sistema_sessao_url',
  'pncp_id', 'pncp_url', 'motivo_situacao',
]);

export const POST: APIRoute = async ({ request, locals }) => {
  const sessao = locals.sessao;
  const json = (c: unknown, s: number) => new Response(JSON.stringify(c), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (!sessao) return json({ erro: 'Sessão expirada.' }, 401);

  const corpo = await request.json().catch(() => ({}) as any);
  const id = String(corpo?.id ?? '');
  if (!id) return json({ erro: 'Rascunho não identificado.' }, 400);

  // Lista de permissão: 'status' e 'situacao' NÃO entram aqui de propósito.
  const dados: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(corpo?.dados ?? {})) if (CAMPOS_PERMITIDOS.has(k)) dados[k] = v;
  if (Object.keys(dados).length === 0) return json({ ok: true, em: new Date().toISOString() }, 200);

  const r = await atualizar(sessao, id, dados);
  if (!r.ok) return json({ erro: r.motivo }, r.status);
  return json({ ok: true, em: new Date().toISOString() }, 200);
};
