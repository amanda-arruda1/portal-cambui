/**
 * Porta de entrada do painel de contribuição.
 *
 * Tudo sob /painel passa por aqui antes de qualquer página existir. Concentrar
 * a verificação num ponto só é deliberado: página nova nasce protegida, e
 * esquecer o "if (!sessao)" no topo de um arquivo deixa de ser possível.
 *
 * O portal público NÃO passa por nenhuma destas regras — sai daqui na primeira
 * linha. Cache e indexação do site do cidadão continuam como estavam.
 */

import { defineMiddleware } from 'astro:middleware';
import { recuperar } from './lib/painel/sessao.ts';

/** Rotas do painel abertas a quem ainda não entrou. */
const PUBLICAS = ['/painel/entrar'];

const METODOS_QUE_ESCREVEM = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const onRequest = defineMiddleware(async (contexto, proxima) => {
  const caminho = contexto.url.pathname;
  if (!caminho.startsWith('/painel')) return proxima();

  /* --- Falsificação de requisição entre sites (CSRF) ---
   * O cookie de sessão é enviado pelo navegador em qualquer requisição, e uma
   * página maliciosa poderia postar em /painel/... por conta da secretaria.
   * A defesa é conferir a origem: requisição legítima do painel sempre traz
   * Origin igual ao host que a serviu.
   *
   * O host vem de X-Forwarded-Host quando existe: atrás da Cloudflare e do
   * proxy, o Host que chega aqui é o interno, e comparar com ele recusaria
   * todo mundo. */
  if (METODOS_QUE_ESCREVEM.has(contexto.request.method)) {
    const origem = contexto.request.headers.get('origin');
    const anfitriao =
      contexto.request.headers.get('x-forwarded-host') ?? contexto.request.headers.get('host');

    if (!origem || !anfitriao || new URL(origem).host !== anfitriao) {
      return new Response('Origem da requisição não confere.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  }

  /* --- Licitações e Obras moram no Payload (painel em /cms/admin) ---
   * As telas e os endpoints dos antigos painéis de Licitações e Obras foram removidos em 2026-10-15. Favoritos e atalhos
   * antigos não podem cair num 404 seco: telas redirecionam ao painel novo; endpoints respondem 410 com a explicação. */
  if (caminho.startsWith('/painel/api/licitacao-') || caminho === '/painel/api/pncp') {
    return new Response(JSON.stringify({ erro: 'As licitações agora são editadas no painel novo: /cms/admin.' }), {
      status: 410, headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  if (caminho === '/painel/licitacoes' || caminho.startsWith('/painel/licitacoes/')) {
    return contexto.redirect('/cms/admin/collections/licitacoes', 303);
  }
  // Obras públicas: mesmo caminho, removidas do painel antigo em 2026-10-15.
  if (caminho.startsWith('/painel/api/obra-')) {
    return new Response(JSON.stringify({ erro: 'As obras agora são editadas no painel novo: /cms/admin.' }), {
      status: 410, headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  if (caminho === '/painel/obras' || caminho.startsWith('/painel/obras/')) {
    return contexto.redirect('/cms/admin/collections/obras', 303);
  }

  let resposta: Response;

  if (PUBLICAS.includes(caminho)) {
    resposta = await proxima();
  } else {
    const sessao = await recuperar(contexto.session as any);
    if (!sessao) {
      // Endpoint de dados não recebe tela de entrada: o JavaScript que fez o
      // envio precisa de um código que ele entenda, não de 200 com HTML de
      // formulário — que é o que um redirecionamento vira depois de seguido.
      if (caminho.startsWith('/painel/api/')) {
        return new Response(JSON.stringify({ erro: 'Sessão expirada. Entre novamente.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
      // 'destino' devolve a pessoa ao que ela tentava abrir. Só caminho
      // interno: URL absoluta aqui viraria redirecionamento aberto.
      const destino = encodeURIComponent(caminho + contexto.url.search);
      return contexto.redirect(`/painel/entrar?destino=${destino}`, 303);
    }
    contexto.locals.sessao = sessao;
    resposta = await proxima();
  }

  /* --- Cabeçalhos de toda tela do painel ---
   * no-store: rascunho de ato oficial não pode ficar no cache do navegador de
   * um computador compartilhado da secretaria, alcançável pelo botão "voltar".
   * DENY: o painel não é embutível; mata sequestro de clique.
   * noindex: o buscador nem deveria chegar aqui, mas o cinto não custa. */
  resposta.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  resposta.headers.set('Pragma', 'no-cache');
  resposta.headers.set('X-Frame-Options', 'DENY');
  resposta.headers.set('X-Robots-Tag', 'noindex, nofollow');
  resposta.headers.set('Referrer-Policy', 'same-origin');

  return resposta;
});
