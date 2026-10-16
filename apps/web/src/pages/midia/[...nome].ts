/**
 * Arquivos do Payload no domínio público: /midia/<nome> repassa /api/media/file/<nome>.
 *
 * Existe aqui, e não no Nginx, porque as imagens precisam de transformação sob demanda
 * (um `location /midia/` direto serviria só arquivos comuns).
 *
 * IMAGENS: o antigo CMS (Directus) redimensionava e convertia sob demanda (?width=&quality=&fit=&format=)
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

/**
 * O endpoint de arquivo do Payload responde 500 (e não 404) quando o nome não existe. Como um 500 também pode ser falha real,
 * a rota confere se o arquivo está cadastrado: ausente = 404 de verdade; cadastrado (ou sem como saber) = 502.
 */
async function statusDeFalha(nome: string, statusOrigem: number): Promise<number> {
  if (statusOrigem === 404) return 404;
  try {
    const consulta = new URL(`${PAYLOAD_URL}/api/media`);
    consulta.searchParams.set('where[filename][equals]', nome);
    consulta.searchParams.set('limit', '1');
    consulta.searchParams.set('depth', '0');
    const r = await fetch(consulta, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (r.ok && ((await r.json()) as { totalDocs?: number }).totalDocs === 0) return 404;
  } catch { /* sem resposta do cadastro: não dá para afirmar que não existe */ }
  return 502;
}

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
      if (!origem.ok) { const st = await statusDeFalha(nome, origem.status); return new Response(st === 404 ? 'Não encontrado' : 'Imagem indisponível', { status: st }); }
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
    if (!origem.ok && origem.status !== 206) { const st = await statusDeFalha(nome, origem.status); return new Response(st === 404 ? 'Não encontrado' : 'Arquivo indisponível', { status: st }); }

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
