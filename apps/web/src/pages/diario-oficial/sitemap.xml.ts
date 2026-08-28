/**
 * Sitemap próprio do Diário Oficial.
 *
 * O @astrojs/sitemap só enxerga rotas estáticas; matéria e edição são SSR e
 * ficariam de fora — ou seja, invisíveis para quem procura o ato pelo Google,
 * que é como a maioria das pessoas procura.
 *
 * LGPD: matérias de caderno marcado como NÃO indexável ficam de fora. Elas
 * continuam públicas e acessíveis; apenas não se convida o buscador a
 * transformar o nome de um servidor em primeiro resultado de busca pelo nome
 * dele para o resto da vida. Publicidade legal é base para publicar, não para
 * amplificar indefinidamente.
 */
import type { APIRoute } from 'astro';
import { acervo } from '../../lib/diario/indice';

const esc = (t: string) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async ({ url, site }) => {
  const a = await acervo();
  const base = (site?.origin ?? url.origin).replace(/\/+$/, '');

  const fixas = ['/diario-oficial', '/diario-oficial/orgao-oficial', '/diario-oficial/autenticidade', '/diario-oficial/arquivo'];
  const anos = [...new Set(a.edicoes.map((e) => String(e.data_publicacao_legal).slice(0, 4)))];

  const cadernoIndexavel = new Map(a.cadernos.map((c) => [c.id, c.indexavel !== false]));
  const materias = a.materias.filter((m) => !m.caderno || cadernoIndexavel.get(m.caderno) !== false);

  const item = (caminho: string, data: string | null, prioridade: string, frequencia: string) =>
    `  <url><loc>${esc(base + caminho)}</loc>` +
    (data ? `<lastmod>${String(data).slice(0, 10)}</lastmod>` : '') +
    `<changefreq>${frequencia}</changefreq><priority>${prioridade}</priority></url>`;

  const linhas = [
    ...fixas.map((c) => item(c, a.edicoes[0]?.data_publicacao_legal ?? null, '0.9', 'daily')),
    ...anos.map((ano) => item(`/diario-oficial/arquivo/${ano}`, null, '0.5', 'monthly')),
    ...a.edicoes.map((e) => item(`/diario-oficial/edicao/${e.numero}`, e.data_publicacao_legal, '0.6', 'never')),
    ...materias.map((m) => item(
      `/diario-oficial/materia/${m.edicaoObj?.ano ?? m.ano_ato}/${m.slug}`,
      m.edicaoObj?.data_publicacao_legal ?? null, '0.7', 'never')),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${linhas.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
