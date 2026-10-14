/**
 * Arquivos do Payload no domínio público: /midia/<nome> repassa /api/media/file/<nome>.
 *
 * Equivale ao `location /assets/` do Nginx para o Directus. Existe aqui, e não no
 * Nginx, para a migração Directus → Payload não exigir mudança no proxy de produção;
 * quando o Directus sair, um `location /midia/` direto no Nginx resolve os arquivos
 * comuns (a transformação de imagem continuaria precisando desta rota).
 *
 * IMAGENS: o Directus redimensionava e convertia sob demanda (?width=&quality=&fit=&format=)
 * e as páginas dependem disso — a capa de uma notícia tem até 1,7 MB de original e a home
 * pede 900 px em WebP. Esta rota aceita os mesmos parâmetros, transforma com sharp e guarda
 * o resultado em disco; a segunda requisição da mesma variação não toca no Payload.
 */
import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PAYLOAD_URL } from '../../lib/payload';

export const prerender = false;

const REPASSAR = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'content-disposition'];
/* Em StateDirectory do portal-web (a única área gravável do serviço, ver portal-web.service). */
const CACHE = process.env.IMAGENS_DIR || '/var/lib/portal-cambui/imagens';
const MAX_LADO = 2400; // nenhuma página pede mais que 1600; teto contra abuso (cada variação vira um arquivo)

const FORMATOS: Record<string, { ext: string; mime: string }> = {
  webp: { ext: 'webp', mime: 'image/webp' },
  jpeg: { ext: 'jpg', mime: 'image/jpeg' },
  jpg: { ext: 'jpg', mime: 'image/jpeg' },
  png: { ext: 'png', mime: 'image/png' },
  avif: { ext: 'avif', mime: 'image/avif' },
};
const POR_EXTENSAO: Record<string, string> = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp', '.avif': 'avif' };

const inteiro = (v: string | null, max: number): number | undefined => {
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : undefined;
};

export const GET: APIRoute = async ({ params, request, url }) => {
  const nome = params.nome ?? '';
  // Um único segmento, sem subir de diretório: o nome vem da URL e vai para outra URL.
  if (!nome || nome.includes('/') || nome.includes('..') || nome.includes('\\')) return new Response('Não encontrado', { status: 404 });

  const q = url.searchParams;
  const largura = inteiro(q.get('width'), MAX_LADO);
  const altura = inteiro(q.get('height'), MAX_LADO);
  const qualidade = inteiro(q.get('quality'), 100);
  const encaixe = ['cover', 'contain', 'inside', 'outside', 'fill'].includes(q.get('fit') ?? '') ? q.get('fit')! : 'cover';
  const formatoPedido = q.get('format') ? FORMATOS[q.get('format')!] : undefined;
  const formatoOriginal = POR_EXTENSAO[path.extname(nome).toLowerCase()];
  const transformar = !!(largura || altura || qualidade || formatoPedido) && !!formatoOriginal;

  if (transformar) {
    const saida = formatoPedido ?? FORMATOS[formatoOriginal]!;
    const chave = createHash('sha1').update(JSON.stringify([nome, largura, altura, qualidade, encaixe, saida.ext])).digest('hex');
    const arquivoCache = path.join(CACHE, `${chave}.${saida.ext}`);
    const cabecalhos = { 'Content-Type': saida.mime, 'Cache-Control': 'public, max-age=604800', 'X-Content-Type-Options': 'nosniff' };
    try {
      return new Response(new Uint8Array(await readFile(arquivoCache)), { headers: cabecalhos });
    } catch { /* ainda não existe: gera abaixo */ }

    try {
      const origem = await fetch(`${PAYLOAD_URL}/api/media/file/${encodeURIComponent(nome)}`, { signal: AbortSignal.timeout(30_000) });
      if (!origem.ok) return new Response('Não encontrado', { status: origem.status === 404 ? 404 : 502 });
      const { default: sharp } = await import('sharp');
      let img = sharp(Buffer.from(await origem.arrayBuffer()), { failOn: 'none' }).rotate(); // .rotate(): respeita a orientação EXIF
      if (largura || altura) img = img.resize({ width: largura, height: altura, fit: encaixe as keyof import('sharp').FitEnum, withoutEnlargement: true });
      const opcoes = qualidade ? { quality: qualidade } : {};
      const buffer = await (saida.ext === 'webp' ? img.webp(opcoes) : saida.ext === 'jpg' ? img.jpeg(opcoes) : saida.ext === 'png' ? img.png() : img.avif(opcoes)).toBuffer();
      try { // o cache é otimização: se o disco falhar, a imagem ainda é servida
        await mkdir(CACHE, { recursive: true });
        const tmp = `${arquivoCache}.${process.pid}.tmp`;
        await writeFile(tmp, buffer);
        await rename(tmp, arquivoCache);
      } catch (e) { console.warn('[midia] cache de imagem indisponível:', e instanceof Error ? e.message : e); }
      return new Response(new Uint8Array(buffer), { headers: cabecalhos });
    } catch {
      return new Response('Imagem indisponível', { status: 502 });
    }
  }

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
