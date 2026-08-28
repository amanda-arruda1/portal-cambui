/**
 * Anexar documento a uma licitação.
 *
 * O binário JÁ passou por /painel/api/upload — lista de permissão, número
 * mágico e ClamAV. Aqui só se cria o registro que liga o arquivo à licitação,
 * com tipo, data e versão.
 *
 * Quando o anexo substitui outro (retificação), o anterior é marcado como
 * SUPERADO, nunca apagado: quem baixou a versão antiga precisa poder provar o
 * que estava publicado naquele dia.
 */
import type { APIRoute } from 'astro';
import { criarAnexo, marcarSuperado, registrarEvento } from '../../../lib/painel/licitacoes.ts';

const json = (c: unknown, s: number) => new Response(JSON.stringify(c), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

export const POST: APIRoute = async ({ request, locals }) => {
  const sessao = locals.sessao;
  if (!sessao) return json({ erro: 'Sessão expirada.' }, 401);

  const c = await request.json().catch(() => ({}) as any);
  const { licitacao, titulo, tipo, arquivo, substitui } = c ?? {};
  if (!licitacao || !titulo || !tipo || !arquivo) return json({ erro: 'Dados incompletos para anexar o documento.' }, 400);

  let versao = 1;
  if (substitui) {
    const s = await marcarSuperado(sessao, substitui);
    if (!s.ok) return json({ erro: s.motivo }, s.status);
    versao = Number(c.versao ?? 2);
  }

  const r = await criarAnexo(sessao, {
    licitacao, titulo, tipo, arquivo, versao,
    substitui: substitui ?? null,
    data_publicacao: new Date().toISOString(),
    ordem: Number(c.ordem ?? 0),
  });
  if (!r.ok) return json({ erro: r.motivo }, r.status);

  if (substitui) {
    await registrarEvento(sessao, licitacao, 'retificacao',
      `Documento substituído: "${titulo}" passou a valer como versão ${versao}. A versão anterior permanece publicada como histórico.`);
  }

  console.info(`[licitacoes] ${sessao.usuario.email} anexou "${titulo}" (${tipo}) à licitação ${licitacao}`);
  return json({ id: r.dados.id, versao }, 201);
};
