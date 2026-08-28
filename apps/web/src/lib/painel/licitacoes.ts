/**
 * Regras do painel de licitações: validação, gravação e importação do PNCP.
 *
 * O público desta camada é UM servidor do setor de licitações, que não é
 * técnico, tem pouco tempo e publica sob prazo legal. Toda mensagem de erro
 * aqui é escrita para ele: diz o que está errado, por que importa e o que
 * fazer — nunca "campo inválido".
 */

import type { Sessao } from './sessao.ts';
import { MODALIDADES } from '../licitacoes.ts';

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');

export type Saida<T> = { ok: true; dados: T } | { ok: false; motivo: string; status: number };

async function chamar<T>(sessao: Sessao, caminho: string, opcoes: RequestInit = {}): Promise<Saida<T>> {
  try {
    const r = await fetch(`${BASE}${caminho}`, {
      ...opcoes,
      headers: {
        Authorization: `Bearer ${sessao.acesso}`,
        ...(opcoes.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(opcoes.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 401) return { ok: false, status: 401, motivo: 'Sua sessão expirou. Entre novamente.' };
    if (r.status === 403) return { ok: false, status: 403, motivo: 'Sua função no portal não permite esta operação.' };
    if (!r.ok) {
      const corpo = await r.json().catch(() => ({}) as any);
      const e = corpo?.errors?.[0];
      if (e?.extensions?.code === 'RECORD_NOT_UNIQUE') {
        const campo = e.extensions.field === 'numero_processo' ? 'número de processo' : e.extensions.field === 'slug' ? 'endereço da página' : e.extensions.field;
        return { ok: false, status: 409, motivo: `Já existe uma licitação com esse ${campo}. Confira se ela não foi publicada antes.` };
      }
      return { ok: false, status: r.status, motivo: e?.message ?? `O sistema respondeu HTTP ${r.status}.` };
    }
    if (r.status === 204) return { ok: true, dados: undefined as T };
    return { ok: true, dados: (await r.json()).data as T };
  } catch {
    return { ok: false, status: 503, motivo: 'O sistema de conteúdo não respondeu. Tente de novo em alguns instantes.' };
  }
}

/* ─────────────────────────  validação  ───────────────────────── */

export interface Problema {
  campo: string;
  /** 'erro' impede a publicação. 'alerta' deixa prosseguir COM justificativa —
   *  é o caso do prazo legal, em que a lei admite exceções que o sistema não
   *  tem como julgar. */
  nivel: 'erro' | 'alerta';
  texto: string;
}

export interface DadosLicitacao {
  numero_processo?: string; numero?: number | null; ano?: number | null; slug?: string;
  modalidade?: string; forma?: string; justificativa_presencial?: string | null;
  criterio_julgamento?: string; modo_disputa?: string; registro_precos?: boolean;
  secretaria?: string | null; objeto_resumo?: string; objeto?: string | null;
  valor_estimado?: number | null; orcamento_sigiloso?: boolean;
  data_publicacao?: string | null; data_abertura_propostas?: string | null; data_sessao?: string | null;
  prazo_impugnacao?: string | null; prazo_esclarecimentos?: string | null;
  situacao?: string; motivo_situacao?: string | null;
  pncp_id?: string | null; pncp_url?: string | null; sistema_sessao_url?: string | null;
  status?: string;
  /** Justificativa registrada quando o publicador decide prosseguir apesar de
   *  um alerta de prazo. Vira observação no evento de publicação. */
  justificativa_prazo?: string | null;
}

const DIA = 86400000;

/**
 * Validações que evitam vexame público.
 *
 * A lista é curta de propósito: cada item aqui é um erro que, cometido, vira
 * impugnação, notícia ruim ou licitação anulada. Validação decorativa só
 * ensina o servidor a ignorar aviso.
 */
export function validar(d: DadosLicitacao, opcoes: { publicando: boolean; temEdital: boolean }): Problema[] {
  const p: Problema[] = [];
  const publicacao = d.data_publicacao ? new Date(d.data_publicacao) : null;
  const sessao = d.data_sessao ? new Date(d.data_sessao) : null;

  if (!d.numero_processo?.trim()) p.push({ campo: 'numero_processo', nivel: 'erro', texto: 'Informe o número do processo administrativo.' });
  if (!d.objeto_resumo?.trim()) p.push({ campo: 'objeto_resumo', nivel: 'erro', texto: 'Descreva o objeto em uma linha — é o que o fornecedor lê na listagem e o que a busca encontra.' });
  if (!d.modalidade) p.push({ campo: 'modalidade', nivel: 'erro', texto: 'Escolha a modalidade.' });
  if (!d.criterio_julgamento) p.push({ campo: 'criterio_julgamento', nivel: 'erro', texto: 'Escolha o critério de julgamento.' });
  if (!publicacao) p.push({ campo: 'data_publicacao', nivel: 'erro', texto: 'Informe a data de publicação do edital.' });

  // Forma presencial exige justificativa — art. 17, §2º, da Lei 14.133/2021.
  if (d.forma === 'presencial' && !d.justificativa_presencial?.trim()) {
    p.push({ campo: 'justificativa_presencial', nivel: 'erro',
      texto: 'A forma presencial exige justificativa registrada (art. 17, §2º, da Lei 14.133/2021). Sem ela, a licitação fica vulnerável a impugnação.' });
  }

  // Abertura anterior à publicação: erro que só aparece depois, e caro.
  if (publicacao && sessao && sessao.getTime() < publicacao.getTime()) {
    p.push({ campo: 'data_sessao', nivel: 'erro',
      texto: 'A sessão está marcada para ANTES da publicação do edital. Confira as duas datas.' });
  }

  if (opcoes.publicando) {
    if (!sessao) {
      p.push({ campo: 'data_sessao', nivel: 'alerta', texto: 'Sem data de sessão, o portal não mostra contagem regressiva nem gera o convite de calendário.' });
    } else if (sessao.getTime() < Date.now()) {
      p.push({ campo: 'data_sessao', nivel: 'erro',
        texto: 'A sessão está marcada para uma data que já passou. Publicar assim informa prazo vencido ao fornecedor.' });
    }

    if (!opcoes.temEdital) {
      p.push({ campo: 'anexos', nivel: 'erro',
        texto: 'Não há edital anexado. Publicar aviso de licitação sem o edital é o erro que mais gera impugnação.' });
    }

    // Prazo mínimo do art. 55 da Lei 14.133/2021: ALERTA, não erro. A lei
    // admite variações conforme o objeto, e o sistema não tem como julgar
    // isso — mas quem prosseguir precisa registrar por quê.
    const meta = MODALIDADES.find((m) => m.valor === d.modalidade);
    if (meta && publicacao && sessao) {
      const uteis = Math.floor((sessao.getTime() - publicacao.getTime()) / DIA);
      if (uteis < meta.prazoMinimoDias) {
        p.push({ campo: 'data_sessao', nivel: 'alerta',
          texto: `São ${uteis} dia(s) entre a publicação e a sessão. Para ${meta.rotulo}, o art. 55 da Lei 14.133/2021 indica ao menos ${meta.prazoMinimoDias}. Se houver razão para o prazo menor, registre a justificativa abaixo antes de publicar.` });
      }
    }
  }

  return p;
}

export const temErro = (p: Problema[]) => p.some((x) => x.nivel === 'erro');

/* ─────────────────────────  gravação  ───────────────────────── */

export const listarPainel = (sessao: Sessao, parametros: string) =>
  chamar<any[]>(sessao, `/items/licitacoes?${parametros}`);

export const obter = (sessao: Sessao, id: string) =>
  chamar<any>(sessao, `/items/licitacoes/${encodeURIComponent(id)}?fields=*,secretaria.id,secretaria.nome`);

export const criar = (sessao: Sessao, d: DadosLicitacao) =>
  chamar<{ id: string }>(sessao, '/items/licitacoes', { method: 'POST', body: JSON.stringify(d) });

export const atualizar = (sessao: Sessao, id: string, d: DadosLicitacao) =>
  chamar<{ id: string }>(sessao, `/items/licitacoes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(d) });

export const registrarEvento = (sessao: Sessao, licitacao: string, tipo: string, descricao: string, quando = new Date()) =>
  chamar(sessao, '/items/licitacao_eventos', {
    method: 'POST',
    body: JSON.stringify({ status: 'publicado', licitacao, tipo, descricao, data: quando.toISOString() }),
  });

export const anexosDaLicitacao = (sessao: Sessao, id: string) =>
  chamar<any[]>(sessao, `/items/licitacao_anexos?limit=100&sort=ordem,data_publicacao&fields=id,titulo,tipo,versao,superado,data_publicacao,arquivo.id,arquivo.filesize,arquivo.type&filter[licitacao][_eq]=${encodeURIComponent(id)}`);

export const criarAnexo = (sessao: Sessao, d: Record<string, unknown>) =>
  chamar<{ id: string }>(sessao, '/items/licitacao_anexos', { method: 'POST', body: JSON.stringify({ status: 'publicado', ...d }) });

export const marcarSuperado = (sessao: Sessao, id: string) =>
  chamar(sessao, `/items/licitacao_anexos/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ superado: true }) });

/** Endereço permanente, derivado da modalidade e do número. Gerado uma vez, na
 *  criação: mudar depois quebraria link de edital que já circulou. */
export function gerarSlug(modalidade: string, numero: number): string {
  const rotulo = MODALIDADES.find((m) => m.valor === modalidade)?.rotulo ?? modalidade;
  const base = rotulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base}-${String(numero).padStart(3, '0')}`;
}

/* ─────────────────────────  importação do PNCP  ───────────────────────── */

/**
 * O PNCP é o veículo oficial. Deixar o servidor digitar tudo de novo aqui é a
 * maior fonte de divergência entre o portal e o registro oficial — então o
 * caminho certo é ler de lá e pedir revisão.
 *
 * A API é tratada como INSTÁVEL de propósito: nas provas feitas em 28/08/2026
 * ela devolveu 500, 503 e 429 em sequência. Timeout curto, uma repetição com
 * espera, e degradação SILENCIOSA para preenchimento manual — o painel não
 * pode parar porque um serviço federal caiu.
 */
const PNCP_MODALIDADE: Record<number, string> = {
  1: 'leilao', 2: 'dialogo_competitivo', 3: 'concurso', 4: 'concorrencia', 5: 'concorrencia',
  6: 'pregao_eletronico', 7: 'pregao_presencial', 8: 'dispensa', 9: 'inexigibilidade',
  10: 'chamamento_publico', 11: 'pre_qualificacao', 12: 'credenciamento', 13: 'leilao',
};
const PNCP_MODO: Record<number, string> = { 1: 'aberto', 2: 'fechado', 3: 'aberto_fechado', 4: 'fechado_aberto', 5: 'nao_se_aplica' };

export interface Importado { dados: DadosLicitacao; origem: string }

/** Aceita a URL completa ou o numeroControlePNCP (CNPJ-1-SEQ/ANO). */
export function interpretarReferenciaPncp(bruto: string): { cnpj: string; ano: string; sequencial: string } | null {
  const texto = bruto.trim();
  const porUrl = texto.match(/pncp\.gov\.br\/app\/editais\/(\d{14})\/(\d{4})\/(\d+)/i);
  if (porUrl) return { cnpj: porUrl[1], ano: porUrl[2], sequencial: porUrl[3] };
  const porId = texto.match(/^(\d{14})-\d+-(\d+)\/(\d{4})$/);
  if (porId) return { cnpj: porId[1], ano: porId[3], sequencial: String(Number(porId[2])) };
  return null;
}

export async function importarDoPncp(referencia: string): Promise<Saida<Importado>> {
  const ref = interpretarReferenciaPncp(referencia);
  if (!ref) {
    return { ok: false, status: 400,
      motivo: 'Não reconheci essa referência. Cole a URL da contratação no PNCP (pncp.gov.br/app/editais/…) ou o número de controle no formato 00000000000000-1-000032/2026.' };
  }

  const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${ref.cnpj}/compras/${ref.ano}/${ref.sequencial}`;

  for (const tentativa of [0, 1]) {
    try {
      if (tentativa > 0) await new Promise((r) => setTimeout(r, 1500));
      const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
      if (r.status === 404) return { ok: false, status: 404, motivo: 'O PNCP não encontrou essa contratação. Confira o número e o ano.' };
      if (!r.ok) continue;

      const c = await r.json();
      const dados: DadosLicitacao = {
        numero_processo: c.processo ?? undefined,
        numero: Number(c.numeroCompra) || undefined,
        ano: Number(c.anoCompra) || undefined,
        modalidade: PNCP_MODALIDADE[c.modalidadeId] ?? undefined,
        forma: c.modalidadeId === 7 ? 'presencial' : 'eletronica',
        justificativa_presencial: c.justificativaPresencial ?? null,
        modo_disputa: PNCP_MODO[c.modoDisputaId] ?? 'aberto',
        registro_precos: Boolean(c.srp),
        objeto_resumo: (c.objetoCompra ?? '').replace(/\s+/g, ' ').trim(),
        valor_estimado: c.valorTotalEstimado ?? null,
        data_publicacao: c.dataPublicacaoPncp ?? null,
        data_abertura_propostas: c.dataAberturaProposta ?? null,
        data_sessao: c.dataAberturaProposta ?? null,
        pncp_id: c.numeroControlePNCP ?? null,
        pncp_url: `https://pncp.gov.br/app/editais/${ref.cnpj}/${ref.ano}/${ref.sequencial}`,
        sistema_sessao_url: c.linkSistemaOrigem ?? null,
      };
      return { ok: true, dados: { dados, origem: url } };
    } catch {
      /* silencioso de propósito: a próxima tentativa decide */
    }
  }

  return { ok: false, status: 503,
    motivo: 'O PNCP não respondeu agora. Isso acontece com frequência e não impede nada: preencha os campos manualmente e siga. Você pode tentar a importação de novo depois.' };
}
