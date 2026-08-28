/**
 * RSS das novas edições. Aceita ?caderno=<slug> para assinar um caderno só.
 *
 * RSS e não só e-mail: quem monitora publicação oficial de forma profissional
 * — imprensa, escritório de advocacia, empresa que participa de licitação —
 * usa leitor de feed, e não quer entregar o e-mail para isso.
 */
import type { APIRoute } from 'astro';
import { acervo, materiasDaEdicao } from '../../lib/diario/indice';
import { dataBr } from '../../lib/diario/dominio.mjs';

const esc = (t: string) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export const GET: APIRoute = async ({ url, site }) => {
  const a = await acervo();
  const base = (site?.origin ?? url.origin).replace(/\/+$/, '');
  const slugCaderno = url.searchParams.get('caderno') ?? '';
  const caderno = slugCaderno ? a.cadernos.find((c) => c.slug === slugCaderno) : null;
  if (slugCaderno && !caderno) return new Response('Caderno não encontrado', { status: 404 });

  const edicoes = a.edicoes
    .filter((e) => !caderno || materiasDaEdicao(a, e).some((m) => m.caderno === caderno.id))
    .slice(0, 50);

  const titulo = caderno
    ? `${a.veiculo?.nome_veiculo ?? 'Diário Oficial'} — ${caderno.nome}`
    : (a.veiculo?.nome_veiculo ?? 'Diário Oficial Eletrônico de Cambuí');

  const itens = edicoes.map((e) => {
    const materias = materiasDaEdicao(a, e).filter((m) => !caderno || m.caderno === caderno.id);
    const resumo = materias.slice(0, 25)
      .map((m) => `<li><strong>${esc(m.titulo)}</strong> — ${esc(m.ementa)}</li>`).join('');
    const link = `${base}/diario-oficial/edicao/${e.numero}`;
    return `    <item>
      <title>${esc(`Edição nº ${e.numero} — ${dataBr(e.data_publicacao_legal)}`)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>
      <pubDate>${new Date(e.data_disponibilizacao).toUTCString()}</pubDate>
      <description>${esc(
        `${materias.length} matéria(s). Disponibilizada em ${dataBr(e.data_disponibilizacao)}; ` +
        `publicação legal em ${dataBr(e.data_publicacao_legal)}${e.anulada ? '. EDIÇÃO ANULADA.' : '.'}`)}</description>
      <content:encoded><![CDATA[<ul>${resumo}</ul>${materias.length > 25 ? `<p>e mais ${materias.length - 25} matérias.</p>` : ''}]]></content:encoded>
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${esc(titulo)}</title>
    <link>${esc(`${base}/diario-oficial`)}</link>
    <atom:link href="${esc(`${base}/diario-oficial/feed.xml${slugCaderno ? `?caderno=${slugCaderno}` : ''}`)}" rel="self" type="application/rss+xml" />
    <description>${esc(`Novas edições do órgão oficial do Município de Cambuí/MG${caderno ? `, caderno ${caderno.nome}` : ''}.`)}</description>
    <language>pt-BR</language>
    <lastBuildDate>${new Date(edicoes[0]?.data_disponibilizacao ?? Date.now()).toUTCString()}</lastBuildDate>
${itens}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' },
  });
};
