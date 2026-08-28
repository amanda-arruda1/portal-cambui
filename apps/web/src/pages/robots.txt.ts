import type { APIRoute } from 'astro';
import { SITE } from '../dados/instituicional';

// Gerado em vez de estático para o sitemap apontar sempre para a URL pública
// configurada — em portal de prefeitura o domínio muda mais do que se imagina.
export const GET: APIRoute = () =>
  new Response(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /busca',
      '',
      `Sitemap: ${new URL('/sitemap-index.xml', SITE.urlPublica).href}`,
      // O sitemap do Astro só enxerga rota estática; matéria e edição do Diário
      // são SSR e precisam do seu próprio, senão ficam invisíveis na busca —
      // que é como a maior parte das pessoas procura um ato.
      `Sitemap: ${new URL('/diario-oficial/sitemap.xml', SITE.urlPublica).href}`,
      '',
    ].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
