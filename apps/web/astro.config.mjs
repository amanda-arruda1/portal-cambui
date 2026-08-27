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

  // Sem esta lista o Astro NÃO confia no Host nem no X-Forwarded-Host e monta
  // Astro.url como "http://localhost" — comportamento proposital dele, contra
  // injeção de cabeçalho Host. A consequência aqui era grave e silenciosa: a
  // verificação de origem embutida compara Origin com Astro.url.origin, então
  // TODO formulário do painel (entrar, aprovar, publicar) levava 403 em
  // produção. Declarados os domínios, a URL volta a ser a real.
  security: {
    allowedDomains: [
      { hostname: 'www.prefeituradecambui.mg.gov.br' },
      { hostname: 'prefeituradecambui.mg.gov.br' },
      { hostname: 'admin.prefeituradecambui.mg.gov.br' },
      // Endereço de homologação, atendido pelo Caddy em 10.180.0.13. Sem ele
      // aqui, todo formulário do painel levaria 403 neste host.
      { hostname: 'portal.cambui.mg.gov.br' },
    ],
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
  //
  // ATENÇÃO: este caminho é ASSADO NO BUILD, não lido em tempo de execução.
  // A versão anterior tinha './.sessoes' como padrão e confiava no
  // SESSION_DIR da unit do systemd — que o processo até recebe, mas tarde
  // demais: quando 'npm run build' roda, a variável não existe, e o valor que
  // entra no manifesto é o padrão. O resultado seria a sessão tentando gravar
  // em /opt/portal-cambui/apps/web/.sessoes, somente-leitura, e a pessoa da
  // secretaria voltando à tela de entrada logo depois de acertar a senha.
  // O padrão agora é o caminho de produção; SESSION_DIR só serve para 'astro
  // dev' em máquina de desenvolvimento, e precisa estar definido no BUILD.
  session: {
    driver: 'fs',
    options: { base: process.env.SESSION_DIR || '/var/lib/portal-cambui/sessoes' },
  },

  // Acessibilidade e SEO dependem de HTML previsível; o compressor do Astro
  // remove espaços entre tags inline e altera a renderização de texto.
  compressHTML: false,

  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
});
