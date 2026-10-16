/**
 * Globals do Payload (configurações, navegação, links externos, página inicial) com RESERVA no código.
 *
 * Regra do projeto: o portal nunca cai porque o CMS caiu. Cada função devolve o valor do Global mesclado sobre o padrão de
 * `dados/instituicional.ts` e `dados/cidade.ts`: campo em branco ou CMS fora do ar = valor de reserva. Só liga com
 * `CMS_GLOBAIS=payload` em `.env.web`; ausente, o site usa só o código (desfazer = apagar a linha e reiniciar o `portal-web`).
 * Resposta guardada por 60 s em memória (o Global é pequeno e lido em toda página).
 */
import { AUTARQUIAS, CNPJ, COLUNAS_RODAPE, EMAIL_CONTATO, ENDERECO, HORARIO_ATENDIMENTO, LINKS_EXTERNOS, MENU_PRINCIPAL, MUNICIPIO, REDES_SOCIAIS, SITE, TELEFONES } from '../dados/instituicional';
import type { Endereco, ItemMenu, LinkExterno } from '../dados/instituicional';
import { A_CIDADE, TAREFAS } from '../dados/cidade';
import type { Tarefa } from '../dados/cidade';
import { PAYLOAD_URL } from './payload';

const VALIDADE_MS = 60_000;
const cache = new Map<string, { em: number; valor: Record<string, any> | null }>();

async function ler(slug: string): Promise<Record<string, any> | null> {
  if (process.env.CMS_GLOBAIS !== 'payload') return null;
  const guardado = cache.get(slug);
  if (guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.valor;
  let valor: Record<string, any> | null = null;
  try {
    const r = await fetch(`${PAYLOAD_URL}/api/globals/${slug}?depth=0`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(3000) });
    if (r.ok) valor = (await r.json()) as Record<string, any>;
    else console.warn(`[payload] global "${slug}" indisponível (HTTP ${r.status}) — usando os valores de reserva.`);
  } catch (erro) {
    console.warn(`[payload] global "${slug}" indisponível (${erro instanceof Error ? erro.name : 'erro'}) — usando os valores de reserva.`);
  }
  // Falha também fica no cache (curto): sem isso, CMS fora do ar faria cada página esperar 3 s.
  cache.set(slug, { em: Date.now(), valor });
  return valor;
}

const texto = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const lista = <T>(v: unknown): T[] | undefined => (Array.isArray(v) && v.length > 0 ? (v as T[]) : undefined);

/* ── links externos ─────────────────────────────────────────────────────── */

export async function linksExternos(): Promise<Record<string, LinkExterno>> {
  const g = await ler('links-externos');
  const saida: Record<string, LinkExterno> = {};
  for (const [chave, padrao] of Object.entries(LINKS_EXTERNOS)) {
    const c = g?.[chave] as Partial<LinkExterno> | undefined;
    // Global carregado e URL em branco = o administrador tirou o link do ar de propósito.
    if (g && !texto(c?.url)) continue;
    saida[chave] = { url: texto(c?.url) ?? padrao.url, rotulo: texto(c?.rotulo) ?? padrao.rotulo, descricao: texto(c?.descricao) ?? padrao.descricao };
  }
  return saida;
}

/** `@chave` → URL do link externo; qualquer outro valor passa como está. Devolve `null` se o link foi retirado. */
export function resolverDestino(destino: string | undefined, links: Record<string, LinkExterno>): string | null {
  if (!destino) return null;
  if (!destino.startsWith('@')) return destino;
  return links[destino.slice(1)]?.url ?? null;
}
export const ehExterno = (destino: string): boolean => /^https?:\/\//i.test(destino);

/* ── configurações ──────────────────────────────────────────────────────── */

export async function configuracoes() {
  const g = await ler('configuracoes-portal');
  const e = g?.endereco as Partial<Endereco> | undefined;
  const temEndereco = e && Object.values(e).some((x) => texto(x));
  return {
    municipio: {
      nome: texto(g?.nomeMunicipio) ?? MUNICIPIO.nome,
      uf: texto(g?.uf) ?? MUNICIPIO.uf,
      nomeCompleto: texto(g?.nomeCompleto) ?? MUNICIPIO.nomeCompleto,
      gentilico: texto(g?.gentilico) ?? MUNICIPIO.gentilico,
    },
    site: { titulo: texto(g?.tituloSite) ?? SITE.titulo, descricao: texto(g?.descricaoSite) ?? SITE.descricao, urlPublica: SITE.urlPublica },
    cnpj: texto(g?.cnpj) ?? CNPJ,
    endereco: (temEndereco ? { ...ENDERECO, ...Object.fromEntries(Object.entries(e!).filter(([, x]) => texto(x))) } : ENDERECO) as Endereco | null,
    telefones: (lista<{ rotulo: string; numero: string }>(g?.telefones) ?? TELEFONES).map((t) => ({ rotulo: t.rotulo, numero: t.numero })),
    email: texto(g?.emailContato) ?? EMAIL_CONTATO,
    horario: texto(g?.horarioAtendimento) ?? HORARIO_ATENDIMENTO,
    redesSociais: (lista<{ nome: string; url: string }>(g?.redesSociais) ?? REDES_SOCIAIS).map((r) => ({ nome: r.nome, url: r.url })),
    autarquias: (lista<{ nome: string; sigla: string; url: string; descricao?: string }>(g?.autarquias) ?? AUTARQUIAS).map((a) => ({ nome: a.nome, sigla: a.sigla, url: a.url, descricao: a.descricao ?? '' })),
  };
}

/* ── navegação ──────────────────────────────────────────────────────────── */

/** Só caminho interno (/…), endereço http(s) ou referência @chave: o menu vem de um campo livre do CMS e vira `href`. */
const destinoSeguro = (v: unknown): string | undefined => {
  const t = texto(v);
  return t && /^(\/(?!\/)\S*|https?:\/\/\S+|@[A-Za-z][A-Za-z0-9]*)$/.test(t) ? t : undefined;
};

/** Menu do Global "Menu Principal" (`itens`: rotulo, destino?, filhos?) no formato do site (`subitens`). */
function menuDoCms(itens: unknown): ItemMenu[] | undefined {
  if (!Array.isArray(itens) || itens.length === 0) return undefined;
  const menu = itens.flatMap((i): ItemMenu[] => {
    const o = i as { rotulo?: unknown; destino?: unknown; filhos?: unknown };
    const rotulo = texto(o?.rotulo);
    if (!rotulo) return [];
    const filhos = Array.isArray(o.filhos)
      ? o.filhos.flatMap((f) => {
          const fo = f as { rotulo?: unknown; destino?: unknown };
          const fr = texto(fo?.rotulo), fd = destinoSeguro(fo?.destino);
          return fr && fd ? [{ rotulo: fr, destino: fd }] : [];
        })
      : [];
    return [{ rotulo, destino: destinoSeguro(o.destino), ...(filhos.length > 0 ? { subitens: filhos } : {}) }];
  });
  return menu.length > 0 ? menu : undefined;
}

export async function navegacao() {
  const [m, g, links] = await Promise.all([ler('menu-principal'), ler('navegacao'), linksExternos()]);
  const menu = (menuDoCms(m?.itens) ?? MENU_PRINCIPAL)
    .map((i) => {
      const subitens = (i.subitens ?? []).map((s) => ({ rotulo: s.rotulo, destino: resolverDestino(s.destino, links) })).filter((s): s is { rotulo: string; destino: string } => !!s.destino);
      // Botão com dropdown só abre a lista: o destino próprio (se o cadastro ainda tiver um) é ignorado.
      return { rotulo: i.rotulo, destino: subitens.length > 0 ? undefined : resolverDestino(i.destino, links) ?? undefined, subitens: subitens.length > 0 ? subitens : undefined };
    })
    // Item que dependia de um link retirado e ficou sem nada para mostrar some do menu.
    .filter((i) => i.destino || i.subitens);
  const colunas = (lista<(typeof COLUNAS_RODAPE)[number]>(g?.colunasRodape) ?? COLUNAS_RODAPE).map((c) => ({
    titulo: c.titulo,
    itens: (c.itens ?? []).map((i) => ({ rotulo: i.rotulo, destino: resolverDestino(i.destino, links) })).filter((i): i is { rotulo: string; destino: string } => !!i.destino),
  }));
  return { menu, colunas };
}

/* ── página inicial ─────────────────────────────────────────────────────── */

export const HEROI_PADRAO = { selo: 'Serra da Mantiqueira', titulo: 'Cambuí\nresolve o seu dia.', subtitulo: 'Trate com a Prefeitura sem fila e sem adivinhar em qual secretaria bater.' };

export async function paginaInicial() {
  const [g, links] = await Promise.all([ler('pagina-inicial'), linksExternos()]);
  const tarefas = (lista<Tarefa>(g?.tarefas) ?? TAREFAS)
    .map((t) => ({ ...t, destino: resolverDestino(t.destino, links) }))
    .filter((t): t is Tarefa & { destino: string } => !!t.destino)
    .map((t) => ({ rotulo: t.rotulo, detalhe: t.detalhe, destino: t.destino, externo: t.externo || ehExterno(t.destino) || undefined }));
  const h = g?.heroi as Partial<typeof HEROI_PADRAO> | undefined;
  const c = g?.cidade as Partial<{ chamada: string; texto: string; portalTuristico: string }> | undefined;
  return {
    heroi: { selo: texto(h?.selo) ?? HEROI_PADRAO.selo, titulo: texto(h?.titulo) ?? HEROI_PADRAO.titulo, subtitulo: texto(h?.subtitulo) ?? HEROI_PADRAO.subtitulo },
    tarefas,
    cidade: { chamada: texto(c?.chamada) ?? A_CIDADE.chamada, texto: texto(c?.texto) ?? A_CIDADE.texto, portalTuristico: texto(c?.portalTuristico) ?? links.portalTuristico?.url ?? A_CIDADE.portalTuristico },
  };
}
