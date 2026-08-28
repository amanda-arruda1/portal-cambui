/**
 * Feed RSS 2.0 das licitações publicadas.
 *
 * Dado público em formato aberto: serve ao fornecedor que usa leitor de feeds,
 * à imprensa local e a agregadores. Aceita os mesmos filtros da listagem, então
 * /licitacoes/feed.xml?modalidade=pregao_eletronico também funciona.
 */
import type { APIRoute } from 'astro';
import { aplicarFiltros, lerFiltros, moeda, rotuloModalidade, situacaoDe, todas } from '../../lib/licitacoes';

const escapar = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ url, site }) => {
  const base = (site ?? new URL('https://www.prefeituradecambui.mg.gov.br')).origin;
  const { dados } = await todas();
  const filtros = lerFiltros(url);
  // Feed é cronológico por publicação — quem assina quer saber do que é NOVO.
  const itens = aplicarFiltros(dados, { ...filtros, ordem: 'publicacao' }).slice(0, 60);

  const corpo = itens.map((l) => {
    const link = `${base}/licitacoes/${l.ano}/${l.slug}`;
    const numero = `${String(l.numero).padStart(3, '0')}/${l.ano}`;
    const descricao = [
      l.objeto_resumo,
      `Situação: ${situacaoDe(l.situacao).rotulo}.`,
      l.data_sessao ? `Sessão pública: ${new Date(l.data_sessao).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (horário de Brasília).` : '',
      l.orcamento_sigiloso ? 'Orçamento sigiloso.' : l.valor_estimado ? `Valor estimado: ${moeda(l.valor_estimado)}.` : '',
      `Processo ${l.numero_processo}.`,
    ].filter(Boolean).join(' ');
    return `    <item>
      <title>${escapar(`${rotuloModalidade(l.modalidade)} nº ${numero} — ${l.objeto_resumo.slice(0, 120)}`)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(l.data_publicacao).toUTCString()}</pubDate>
      <category>${escapar(rotuloModalidade(l.modalidade))}</category>
      <description>${escapar(descricao)}</description>
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Licitações — Prefeitura Municipal de Cambuí</title>
    <link>${base}/licitacoes</link>
    <atom:link href="${base}${url.pathname}${url.search}" rel="self" type="application/rss+xml" />
    <description>Editais, avisos e resultados das licitações e contratações diretas do Município de Cambuí/MG. A divulgação oficial ocorre no PNCP e no veículo oficial do Município.</description>
    <language>pt-BR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <ttl>60</ttl>
${corpo}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
};
