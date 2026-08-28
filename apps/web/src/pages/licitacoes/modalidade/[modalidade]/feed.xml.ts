/**
 * Feed por modalidade: /licitacoes/modalidade/pregao-eletronico/feed.xml
 *
 * Existe porque o fornecedor de uma modalidade só não quer receber aviso das
 * outras — e porque a rota espelha a URL pública, que é a que ele já conhece.
 */
import type { APIRoute } from 'astro';
import { MODALIDADES, aplicarFiltros, deSlug, paraSlug, rotuloModalidade, situacaoDe, todas } from '../../../../lib/licitacoes';

const escapar = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ params, site }) => {
  const slug = params.modalidade ?? '';
  const modalidade = MODALIDADES.find((m) => paraSlug(m.valor) === slug);
  if (!modalidade) return new Response('Modalidade desconhecida.', { status: 404 });

  const base = (site ?? new URL('https://www.prefeituradecambui.mg.gov.br')).origin;
  const { dados } = await todas();
  const itens = aplicarFiltros(dados, { q: '', modalidade: deSlug(slug), situacao: '', ano: '', secretaria: '', valorMin: '', valorMax: '', tempo: '', ordem: 'publicacao' }).slice(0, 60);

  const corpo = itens.map((l) => {
    const link = `${base}/licitacoes/${l.ano}/${l.slug}`;
    return `    <item>
      <title>${escapar(`nº ${String(l.numero).padStart(3, '0')}/${l.ano} — ${l.objeto_resumo.slice(0, 120)}`)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(l.data_publicacao).toUTCString()}</pubDate>
      <description>${escapar(`${l.objeto_resumo} Situação: ${situacaoDe(l.situacao).rotulo}.`)}</description>
    </item>`;
  }).join('\n');

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapar(rotuloModalidade(modalidade.valor))} — Licitações de Cambuí</title>
    <link>${base}/licitacoes/modalidade/${slug}</link>
    <atom:link href="${base}/licitacoes/modalidade/${slug}/feed.xml" rel="self" type="application/rss+xml" />
    <description>${escapar(`Licitações na modalidade ${modalidade.rotulo} do Município de Cambuí/MG.`)}</description>
    <language>pt-BR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${corpo}
  </channel>
</rss>
`, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
};
