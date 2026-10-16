/**
 * O painel de contribuição antigo (/painel, ligado ao Directus) foi DESLIGADO em 2026-10-16: toda a edição é feita no
 * painel novo, /cms/admin (Payload). Favoritos e atalhos antigos não podem cair num 404 seco: telas redirecionam ao painel
 * novo; endpoints respondem 410 com a explicação. O código antigo está no histórico do git.
 *
 * O portal público não passa por nenhuma destas regras — sai daqui na primeira linha.
 */

import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (contexto, proxima) => {
  const caminho = contexto.url.pathname;
  if (caminho !== '/painel' && !caminho.startsWith('/painel/')) return proxima();

  if (caminho.startsWith('/painel/api/')) {
    return new Response(JSON.stringify({ erro: 'O painel antigo foi desligado. A edição agora é feita em /cms/admin.' }), {
      status: 410,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  // Atalhos diretos para a coleção equivalente no painel novo; o resto cai na página inicial do /cms/admin.
  const COLECOES: Record<string, string> = { licitacoes: 'licitacoes', obras: 'obras' };
  const colecao = COLECOES[caminho.split('/')[2] ?? ''];
  return contexto.redirect(colecao ? `/cms/admin/collections/${colecao}` : '/cms/admin', 303);
});
