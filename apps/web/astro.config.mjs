// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// O portal é SSR de ponta a ponta: notícias, editais e diários mudam ao longo
// do dia e um site estático exigiria rebuild a cada publicação da secretaria.
// O adaptador 'standalone' sobe um servidor Node próprio, que o systemd mantém
// no ar e o Nginx alcança em 127.0.0.1:4321 — o processo nunca escuta em rede
// externa.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),

  // Usado para gerar URLs absolutas (canonical, Open Graph, sitemap). Sem isso
  // o sitemap sairia com caminhos relativos e o Google ignoraria.
  site: process.env.PUBLIC_SITE_URL || 'https://www.prefeituradecambui.mg.gov.br',

  server: {
    // Só o loopback: quem atende a internet é o Nginx.
    host: '127.0.0.1',
    port: 4321,
  },

  integrations: [
    sitemap({
      // Páginas de erro e a busca não entram no índice.
      filter: (page) => !page.includes('/busca') && !page.includes('/404'),
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  // O adaptador Node liga sessões com armazenamento em disco. O serviço roda
  // com ProtectSystem=strict, então o único lugar gravável é o StateDirectory
  // entregue pelo systemd — sem apontar para lá, a primeira sessão morreria em
  // EROFS.
  session: {
    driver: 'fs',
    options: { base: process.env.SESSION_DIR || './.sessoes' },
  },

  // Acessibilidade e SEO dependem de HTML previsível; o compressor do Astro
  // remove espaços entre tags inline e altera a renderização de texto.
  compressHTML: false,

  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
});
