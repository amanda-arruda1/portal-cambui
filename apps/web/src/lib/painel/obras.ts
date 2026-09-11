/**
 * Regras do painel de obras públicas: validação e gravação.
 *
 * Mesmo espírito de `lib/painel/licitacoes.ts` — o público é o setor de
 * obras, sob fiscalização de órgãos de controle, não um técnico de TI. Toda
 * mensagem de erro diz o que falta e por que importa para quem audita.
 */
import type { Sessao } from './sessao.ts';
import { FONTES_RECURSO } from '../obras.ts';

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
        const campo = e.extensions.field === 'slug' ? 'endereço da página' : e.extensions.field;
        return { ok: false, status: 409, motivo: `Já existe uma obra com esse ${campo}.` };
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

export interface Problema { campo: string; nivel: 'erro' | 'alerta'; texto: string }

export interface DadosObra {
  numero_processo?: string; numero_contrato?: string | null; licitacao?: string | null; slug?: string;
  categoria?: string; secretaria?: string | null;
  objeto_resumo?: string; objeto?: string | null; endereco?: string | null;
  empresa_executora?: string | null; empresa_cnpj?: string | null;
  responsavel_tecnico?: string | null; art_rrt?: string | null;
  fonte_recurso?: string; numero_convenio?: string | null;
  valor_contratado?: number | null; valor_aditivado?: number | null; valor_pago?: number | null;
  data_ordem_servico?: string | null; data_prevista_termino?: string | null; data_termino_real?: string | null;
  situacao?: string; motivo_situacao?: string | null; percentual_execucao?: number | null;
  observacoes?: string | null; data_publicacao?: string | null; status?: string;
}

/**
 * Validações que evitam achado de auditoria. Curta de propósito: cada item
 * aqui é o que um parecer do TCE-MG cobra primeiro de uma obra pública.
 */
export function validar(d: DadosObra, opcoes: { publicando: boolean; temArtRrt: boolean }): Problema[] {
  const p: Problema[] = [];

  if (!d.numero_processo?.trim()) p.push({ campo: 'numero_processo', nivel: 'erro', texto: 'Informe o número do processo administrativo.' });
  if (!d.objeto_resumo?.trim()) p.push({ campo: 'objeto_resumo', nivel: 'erro', texto: 'Descreva o objeto em uma linha — é o que aparece na listagem pública.' });
  if (!d.categoria) p.push({ campo: 'categoria', nivel: 'erro', texto: 'Escolha a categoria da obra.' });
  if (!d.fonte_recurso) p.push({ campo: 'fonte_recurso', nivel: 'erro', texto: 'Informe a fonte do recurso.' });

  const meta = FONTES_RECURSO[d.fonte_recurso ?? ''];
  if ((d.fonte_recurso === 'estadual' || d.fonte_recurso === 'federal') && !d.numero_convenio?.trim()) {
    p.push({ campo: 'numero_convenio', nivel: 'erro', texto: `${meta ?? 'Convênio'} exige o número do convênio — é o primeiro dado pedido em prestação de contas ao órgão repassador.` });
  }

  if (d.situacao === 'paralisada' && !d.motivo_situacao?.trim()) {
    p.push({ campo: 'motivo_situacao', nivel: 'erro', texto: 'Obra paralisada exige motivo registrado — é o que órgãos de controle mais cobram nesse estado.' });
  }
  if (d.situacao === 'cancelada' && !d.motivo_situacao?.trim()) {
    p.push({ campo: 'motivo_situacao', nivel: 'erro', texto: 'Registre o motivo do cancelamento.' });
  }

  const emExecucaoOuAlem = ['em_execucao', 'paralisada', 'concluida'].includes(d.situacao ?? '');
  if (opcoes.publicando && emExecucaoOuAlem) {
    if (!d.responsavel_tecnico?.trim()) {
      p.push({ campo: 'responsavel_tecnico', nivel: 'alerta', texto: 'Sem responsável técnico registrado. Obra em execução sem ART/RRT é a irregularidade mais comum em auditoria de obras — preencha assim que possível.' });
    }
    if (!opcoes.temArtRrt) {
      p.push({ campo: 'anexos', nivel: 'alerta', texto: 'Não há ART/RRT anexada. Anexe assim que possível — é o primeiro documento que um órgão fiscalizador pede.' });
    }
    if (!d.empresa_executora?.trim()) {
      p.push({ campo: 'empresa_executora', nivel: 'alerta', texto: 'Informe a empresa executora.' });
    }
  }

  return p;
}

export const temErro = (p: Problema[]) => p.some((x) => x.nivel === 'erro');

/* ─────────────────────────  gravação  ───────────────────────── */

export const listarPainel = (sessao: Sessao, parametros: string) =>
  chamar<any[]>(sessao, `/items/obras?${parametros}`);

export const obter = (sessao: Sessao, id: string) =>
  chamar<any>(sessao, `/items/obras/${encodeURIComponent(id)}?fields=*,secretaria.id,secretaria.nome,licitacao.id,licitacao.numero,licitacao.ano`);

export const criar = (sessao: Sessao, d: DadosObra) =>
  chamar<{ id: string }>(sessao, '/items/obras', { method: 'POST', body: JSON.stringify(d) });

export const atualizar = (sessao: Sessao, id: string, d: DadosObra) =>
  chamar<{ id: string }>(sessao, `/items/obras/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(d) });

export const anexosDaObra = (sessao: Sessao, id: string) =>
  chamar<any[]>(sessao, `/items/obra_anexos?limit=100&sort=ordem,data_referencia&fields=id,titulo,categoria,data_referencia,arquivo.id,arquivo.filesize,arquivo.type&filter[obra][_eq]=${encodeURIComponent(id)}`);

export const criarAnexo = (sessao: Sessao, d: Record<string, unknown>) =>
  chamar<{ id: string }>(sessao, '/items/obra_anexos', { method: 'POST', body: JSON.stringify({ status: 'publicado', ...d }) });

export const medicoesDaObra = (sessao: Sessao, id: string) =>
  chamar<any[]>(sessao, `/items/obra_medicoes?limit=200&sort=numero&fields=id,numero,data_referencia,percentual_acumulado,valor_medido,valor_acumulado,boletim.id,observacoes&filter[obra][_eq]=${encodeURIComponent(id)}`);

export const criarMedicao = (sessao: Sessao, d: Record<string, unknown>) =>
  chamar<{ id: string }>(sessao, '/items/obra_medicoes', { method: 'POST', body: JSON.stringify({ status: 'publicado', ...d }) });

/** Endereço permanente, derivado do resumo do objeto. Gerado uma vez, na
 *  criação: mudar depois quebraria link já divulgado. */
export function gerarSlug(objetoResumo: string, sufixo: string): string {
  const base = objetoResumo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
  return `${base}-${sufixo}`;
}
