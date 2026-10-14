/**
 * Cliente do Payload CMS (leitura pública) — contraparte de `directus.ts`.
 *
 * Mesma regra central: Payload fora do ar, coleção ausente ou permissão negada
 * NUNCA derrubam o portal. Devolve `{ dados, indisponivel }` e a página decide.
 * Usado coleção a coleção, atrás de chave por variável de ambiente (ver `fonteCms`),
 * durante a migração Directus → Payload.
 */
import type { Resposta } from './directus';

const BASE = (process.env.PAYLOAD_INTERNAL_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const TEMPO_LIMITE_MS = 5000;

/** De onde cada coleção migrada é lida. Padrão `directus`: ligar é decisão explícita. */
const CHAVES = { telefones_uteis: 'CMS_TELEFONES', coleta_lixo: 'CMS_COLETA_LIXO', conselhos_municipais: 'CMS_CONSELHOS' } as const;
export type ColecaoMigravel = keyof typeof CHAVES;
export const COLECOES_MIGRAVEIS = Object.keys(CHAVES) as ColecaoMigravel[];

export function fonteCms(colecao: ColecaoMigravel): 'directus' | 'payload' {
  return process.env[CHAVES[colecao]] === 'payload' ? 'payload' : 'directus';
}

const avisados = new Set<string>();
function avisarUmaVez(colecao: string, motivo: string): void {
  if (avisados.has(colecao)) return;
  avisados.add(colecao);
  console.warn(`[payload] coleção "${colecao}" indisponível (${motivo}) — a página seguirá sem esses dados.`);
}

/** URL base do Payload, para as rotas que repassam arquivos (ver pages/midia). */
export const PAYLOAD_URL = BASE;

/**
 * Os links de arquivo gravados no texto rico apontam para `/api/media/file/<nome>`, que só existe
 * na origem do Payload. No domínio público quem serve é a rota `/midia/` do próprio portal.
 */
export const reescreverMidia = (html: string | null | undefined): string | null =>
  html ? html.replaceAll('/api/media/file/', '/midia/') : null;

/**
 * Lista documentos publicados de uma coleção. `sort` aceita vários campos
 * separados por vírgula, como a API do Payload. `limit=0` = sem paginação.
 */
export async function listarPayload<T extends { id: unknown }>(
  colecao: string,
  opcoes: { sort?: string; limit?: number } = {},
): Promise<Resposta<T & { id: string }>> {
  const url = new URL(`${BASE}/api/${colecao}`);
  url.searchParams.set('where[status][equals]', 'publicado');
  url.searchParams.set('depth', '0');
  url.searchParams.set('limit', String(opcoes.limit ?? 0));
  if (opcoes.sort) url.searchParams.set('sort', opcoes.sort);

  try {
    const resposta = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    if (!resposta.ok) {
      avisarUmaVez(colecao, `HTTP ${resposta.status}`);
      return { dados: [], indisponivel: true };
    }
    const corpo = (await resposta.json()) as { docs?: T[] };
    // O resto do portal trata `id` como string (UUID do Directus); no Payload é numérico.
    return { dados: (corpo.docs ?? []).map((d) => ({ ...d, id: String(d.id) })), indisponivel: false };
  } catch (erro) {
    avisarUmaVez(colecao, erro instanceof Error ? erro.name : 'erro desconhecido');
    return { dados: [], indisponivel: true };
  }
}
