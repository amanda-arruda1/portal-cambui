/**
 * Cliente do Directus.
 *
 * Deliberadamente sem o @directus/sdk: precisamos de leitura pública com
 * timeout curto e de um comportamento de falha muito específico, e o SDK
 * lança exceções que derrubariam a página inteira.
 *
 * REGRA CENTRAL: uma coleção ausente, um Directus fora do ar ou uma permissão
 * que ainda não foi concedida NUNCA podem derrubar o portal. Toda função aqui
 * devolve `{ dados, indisponivel }` e a página decide o que mostrar. É o que
 * permite o portal subir hoje, antes de o esquema existir no CMS.
 */

/* process.env, não import.meta.env: o segundo é substituído no build e
 * congelaria o valor no bundle. Lendo do processo, mudar a variável na unit do
 * systemd e reiniciar o serviço basta — sem recompilar o portal. */
const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');

/** Token opcional. O caminho normal é o papel público do Directus ter leitura
 *  nas coleções publicadas; o token existe para o caso de a prefeitura optar
 *  por manter tudo fechado e servir só via aplicação. */
const TOKEN = process.env.DIRECTUS_TOKEN || '';

/** O Directus está no mesmo host, em loopback. Se não responder em 5s, está
 *  com problema — melhor a página degradar do que o cidadão esperar. */
const TEMPO_LIMITE_MS = 5000;

export interface Resposta<T> {
  dados: T[];
  /** true quando não foi possível falar com o CMS ou a coleção não existe. */
  indisponivel: boolean;
}

export interface RespostaUnica<T> {
  dado: T | null;
  indisponivel: boolean;
}

/** Coleções já registradas como ausentes, para não repetir aviso a cada
 *  requisição enquanto o esquema do CMS não é aplicado. */
const ausentes = new Set<string>();

function avisarUmaVez(colecao: string, motivo: string): void {
  if (ausentes.has(colecao)) return;
  ausentes.add(colecao);
  console.warn(`[directus] coleção "${colecao}" indisponível (${motivo}) — a página seguirá sem esses dados.`);
}

type Parametros = Record<string, string | number | undefined>;

async function requisitar<T>(colecao: string, parametros: Parametros): Promise<Resposta<T>> {
  const url = new URL(`${BASE}/items/${colecao}`);
  for (const [chave, valor] of Object.entries(parametros)) {
    if (valor !== undefined) url.searchParams.set(chave, String(valor));
  }

  try {
    const resposta = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });

    // 403 é o que o Directus devolve tanto para coleção inexistente quanto
    // para permissão não concedida — nos dois casos o portal segue sem o dado.
    if (resposta.status === 403 || resposta.status === 404) {
      avisarUmaVez(colecao, `HTTP ${resposta.status}`);
      return { dados: [], indisponivel: true };
    }
    if (!resposta.ok) {
      avisarUmaVez(colecao, `HTTP ${resposta.status}`);
      return { dados: [], indisponivel: true };
    }

    const corpo = (await resposta.json()) as { data?: T[] };
    return { dados: corpo.data ?? [], indisponivel: false };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.name : 'erro desconhecido';
    avisarUmaVez(colecao, motivo);
    return { dados: [], indisponivel: true };
  }
}

export async function listar<T>(colecao: string, parametros: Parametros = {}): Promise<Resposta<T>> {
  return requisitar<T>(colecao, parametros);
}

export async function umPor<T>(colecao: string, parametros: Parametros = {}): Promise<RespostaUnica<T>> {
  const { dados, indisponivel } = await requisitar<T>(colecao, { ...parametros, limit: 1 });
  return { dado: dados[0] ?? null, indisponivel };
}

/** URL pública de um arquivo do Directus. O Nginx serve /assets/ fazendo
 *  proxy para o CMS, então o navegador nunca fala com o Directus diretamente.
 *
 *  As páginas pedem `format: 'webp'` nas imagens de conteúdo. Medido com
 *  Lighthouse em 28/08/2026: a matéria com imagem em PNG dava LCP de 2,6s,
 *  acima do teto de 2,5s. Em WebP a mesma imagem cai para menos da metade do
 *  peso — e o ganho vale ainda mais para as fotografias reais que a prefeitura
 *  vai enviar, que são muito mais pesadas do que os gradientes de exemplo. */
export function arquivo(id: string | null | undefined, parametros?: Record<string, string | number>): string | null {
  if (!id) return null;
  const consulta = parametros
    ? '?' + new URLSearchParams(Object.entries(parametros).map(([c, v]) => [c, String(v)])).toString()
    : '';
  return `/assets/${id}${consulta}`;
}

/** Saúde do CMS, para a página de diagnóstico interna. */
export async function saudeDoCms(): Promise<{ ok: boolean; detalhe: string }> {
  try {
    const r = await fetch(`${BASE}/server/health`, { signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    return { ok: r.ok, detalhe: `HTTP ${r.status}` };
  } catch (erro) {
    return { ok: false, detalhe: erro instanceof Error ? erro.message : 'falha desconhecida' };
  }
}
