/**
 * Arquivos do Payload no domínio público: /midia/<nome> repassa /api/media/file/<nome>.
 *
 * Equivale ao `location /assets/` do Nginx para o Directus. Existe aqui, e não no
 * Nginx, para a migração Directus → Payload não exigir mudança no proxy de produção;
 * quando o Directus sair, um `location /midia/` direto no Nginx faz o mesmo com menos
 * custo e esta rota pode ser removida.
 */
import type { APIRoute } from 'astro';
import { PAYLOAD_URL } from '../../lib/payload';

export const prerender = false;

const REPASSAR = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'content-disposition'];

export const GET: APIRoute = async ({ params, request, url }) => {
  const nome = params.nome ?? '';
  // Um único segmento, sem subir de diretório: o nome vem da URL e vai para outra URL.
  if (!nome || nome.includes('/') || nome.includes('..') || nome.includes('\\')) return new Response('Não encontrado', { status: 404 });

  const destino = new URL(`${PAYLOAD_URL}/api/media/file/${encodeURIComponent(nome)}`);
  try {
    const origem = await fetch(destino, {
      headers: { ...(request.headers.get('range') ? { Range: request.headers.get('range')! } : {}) },
      signal: AbortSignal.timeout(30_000),
    });
    if (!origem.ok && origem.status !== 206) return new Response('Não encontrado', { status: origem.status === 404 ? 404 : 502 });

    const cabecalhos = new Headers();
    for (const c of REPASSAR) { const v = origem.headers.get(c); if (v) cabecalhos.set(c, v); }
    cabecalhos.set('Cache-Control', 'public, max-age=3600');
    cabecalhos.set('X-Content-Type-Options', 'nosniff');
    if (url.searchParams.has('download') && !cabecalhos.has('content-disposition')) cabecalhos.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`);
    return new Response(origem.body, { status: origem.status, headers: cabecalhos });
  } catch {
    return new Response('Arquivo indisponível', { status: 502 });
  }
};
