/**
 * Consulta, busca e filtros de obras públicas.
 *
 * Mesma decisão de `lib/licitacoes.ts`: busca e filtros rodam EM MEMÓRIA, com
 * cache de 60s. Ponto de troca único se o volume crescer além de alguns
 * milhares de registros.
 */

import { listar } from './directus';
import { moeda, numero, documentoPublico, tamanhoLegivel, formatoLegivel } from './licitacoes';

export { moeda, numero, documentoPublico, tamanhoLegivel, formatoLegivel };

/* ─────────────────────────  enums do domínio  ───────────────────────── */

export const CATEGORIAS = [
  { valor: 'pavimentacao', rotulo: 'Pavimentação' },
  { valor: 'construcao', rotulo: 'Construção' },
  { valor: 'reforma', rotulo: 'Reforma e ampliação' },
  { valor: 'drenagem', rotulo: 'Drenagem e contenção' },
  { valor: 'saneamento', rotulo: 'Saneamento básico' },
  { valor: 'iluminacao_publica', rotulo: 'Iluminação pública' },
  { valor: 'praca_area_lazer', rotulo: 'Praça e área de lazer' },
  { valor: 'edificacao_publica', rotulo: 'Edificação pública' },
  { valor: 'ponte_viaduto', rotulo: 'Ponte e viaduto' },
  { valor: 'outra', rotulo: 'Outra' },
] as const;

export const SITUACOES = [
  { valor: 'planejada', rotulo: 'Planejada', tom: 'neutro', emAndamento: false },
  { valor: 'em_licitacao', rotulo: 'Em licitação', tom: 'aviso', emAndamento: false },
  { valor: 'nao_iniciada', rotulo: 'Contratada — não iniciada', tom: 'aviso', emAndamento: false },
  { valor: 'em_execucao', rotulo: 'Em execução', tom: 'ok', emAndamento: true },
  { valor: 'paralisada', rotulo: 'Paralisada', tom: 'alerta', emAndamento: true },
  { valor: 'concluida', rotulo: 'Concluída', tom: 'neutro', emAndamento: false },
  { valor: 'cancelada', rotulo: 'Cancelada', tom: 'alerta', emAndamento: false },
] as const;

export const FONTES_RECURSO: Record<string, string> = {
  municipal: 'Recursos próprios do município',
  estadual: 'Convênio estadual',
  federal: 'Convênio federal',
  financiamento: 'Financiamento ou empréstimo',
  misto: 'Recursos combinados',
};

export const TIPOS_ANEXO: Array<{ valor: string; rotulo: string; ordem: number }> = [
  { valor: 'projeto_basico', rotulo: 'Projeto básico', ordem: 1 },
  { valor: 'projeto_executivo', rotulo: 'Projeto executivo', ordem: 2 },
  { valor: 'art_rrt', rotulo: 'ART/RRT do responsável técnico', ordem: 3 },
  { valor: 'edital_licitacao', rotulo: 'Edital da licitação', ordem: 4 },
  { valor: 'contrato', rotulo: 'Contrato', ordem: 5 },
  { valor: 'aditivo', rotulo: 'Termos aditivos', ordem: 6 },
  { valor: 'ordem_servico', rotulo: 'Ordem de serviço', ordem: 7 },
  { valor: 'relatorio_fiscalizacao', rotulo: 'Relatórios de fiscalização', ordem: 8 },
  { valor: 'foto', rotulo: 'Fotos do andamento', ordem: 9 },
  { valor: 'outro', rotulo: 'Outros documentos', ordem: 10 },
];

export const rotuloCategoria = (v: string) => CATEGORIAS.find((c) => c.valor === v)?.rotulo ?? v;
export const situacaoDe = (v: string) => SITUACOES.find((s) => s.valor === v) ?? SITUACOES[0];
export const paraSlugCategoria = (v: string) => v.replace(/_/g, '-');
export const deSlugCategoria = (s: string) => s.replace(/-/g, '_');

/* ─────────────────────────  tipos  ───────────────────────── */

export interface ArquivoAnexo { id: string; type: string | null; filesize: number | null }
export interface AnexoObra {
  id: string; titulo: string; categoria: string; arquivo: ArquivoAnexo | null;
  data_referencia: string; descricao: string | null; ordem: number | null;
}
export interface MedicaoObra {
  id: string; numero: number; data_referencia: string; percentual_acumulado: number | null;
  valor_medido: number | string | null; valor_acumulado: number | string | null;
  boletim: ArquivoAnexo | null; observacoes: string | null;
}

export interface Obra {
  id: string; numero_processo: string; numero_contrato: string | null;
  licitacao: { id: string; numero: number; ano: number } | null;
  slug: string; categoria: string;
  secretaria: { nome: string; slug: string } | null;
  objeto_resumo: string; objeto: string | null; endereco: string | null;
  empresa_executora: string | null; empresa_cnpj: string | null;
  responsavel_tecnico: string | null; art_rrt: string | null;
  fonte_recurso: string; numero_convenio: string | null;
  valor_contratado: number | string | null; valor_aditivado: number | string | null; valor_pago: number | string | null;
  data_ordem_servico: string | null; data_prevista_termino: string | null; data_termino_real: string | null;
  situacao: string; motivo_situacao: string | null; percentual_execucao: number | null;
  observacoes: string | null; data_publicacao: string; demonstracao: boolean; date_updated: string | null;
}

/* ─────────────────────────  carga  ───────────────────────── */

const CAMPOS = [
  'id', 'numero_processo', 'numero_contrato', 'licitacao.id', 'licitacao.numero', 'licitacao.ano',
  'slug', 'categoria', 'secretaria.nome', 'secretaria.slug', 'objeto_resumo', 'objeto', 'endereco',
  'empresa_executora', 'empresa_cnpj', 'responsavel_tecnico', 'art_rrt', 'fonte_recurso', 'numero_convenio',
  'valor_contratado', 'valor_aditivado', 'valor_pago', 'data_ordem_servico', 'data_prevista_termino',
  'data_termino_real', 'situacao', 'motivo_situacao', 'percentual_execucao', 'observacoes',
  'data_publicacao', 'demonstracao', 'date_updated',
].join(',');

export async function todas(): Promise<{ dados: Obra[]; indisponivel: boolean }> {
  return listar<Obra>('obras', {
    fields: CAMPOS,
    filter: JSON.stringify({ status: { _eq: 'publicado' } }),
    sort: '-data_publicacao',
    limit: 2000,
  });
}

export async function porSlug(slug: string): Promise<Obra | null> {
  const { dados } = await todas();
  return dados.find((o) => o.slug === slug) ?? null;
}

export async function anexosDe(id: string): Promise<AnexoObra[]> {
  const r = await listar<AnexoObra>('obra_anexos', {
    // NUNCA pedir arquivo.filename_download: o papel público não tem
    // permissão nesse campo de directus_files, e o Directus recusa a
    // consulta INTEIRA (não só o campo) — via lib/licitacoes.ts, que tinha
    // o mesmo pedido e sumia com a lista inteira de anexos da licitação.
    fields: 'id,titulo,categoria,arquivo.id,arquivo.type,arquivo.filesize,data_referencia,descricao,ordem',
    filter: JSON.stringify({ obra: { _eq: id } }),
    sort: 'ordem,data_referencia',
    limit: 200,
  });
  return r.dados;
}

export async function medicoesDe(id: string): Promise<MedicaoObra[]> {
  const r = await listar<MedicaoObra>('obra_medicoes', {
    fields: 'id,numero,data_referencia,percentual_acumulado,valor_medido,valor_acumulado,boletim.id,boletim.filesize,observacoes',
    filter: JSON.stringify({ obra: { _eq: id } }),
    sort: 'numero',
    limit: 200,
  });
  return r.dados;
}

/* ─────────────────────────  busca e filtros  ───────────────────────── */

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function textoBuscavel(o: Obra): string {
  return semAcento(
    [o.objeto_resumo, o.objeto?.replace(/<[^>]+>/g, ' '), o.numero_processo, o.numero_contrato,
     rotuloCategoria(o.categoria), o.secretaria?.nome, o.empresa_executora, o.endereco].filter(Boolean).join(' '),
  );
}

export function buscar(lista: Obra[], termo: string): Obra[] {
  const limpo = semAcento(termo).trim();
  if (!limpo) return lista;
  const palavras = limpo.split(/\s+/).filter((p) => p.length >= 2);
  return lista.filter((o) => {
    const alvo = textoBuscavel(o);
    return palavras.every((p) => alvo.includes(p));
  });
}

export interface FiltrosObra { q: string; categoria: string; situacao: string; secretaria: string }
export const FILTROS_VAZIOS: FiltrosObra = { q: '', categoria: '', situacao: '', secretaria: '' };

export function lerFiltros(url: URL): FiltrosObra {
  const p = (n: string) => (url.searchParams.get(n) ?? '').trim();
  return { q: p('q'), categoria: p('categoria'), situacao: p('situacao'), secretaria: p('secretaria') };
}

export function paraQuery(f: Partial<FiltrosObra>, base: FiltrosObra = FILTROS_VAZIOS): string {
  const juntos = { ...base, ...f };
  const p = new URLSearchParams();
  for (const chave of ['q', 'categoria', 'situacao', 'secretaria'] as const) if (juntos[chave]) p.set(chave, juntos[chave]);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function aplicarFiltros(lista: Obra[], f: FiltrosObra): Obra[] {
  let r = lista;
  if (f.q) r = buscar(r, f.q);
  if (f.categoria) r = r.filter((o) => o.categoria === f.categoria);
  if (f.situacao) r = r.filter((o) => o.situacao === f.situacao);
  if (f.secretaria) r = r.filter((o) => o.secretaria?.slug === f.secretaria);
  return r;
}

export function contar(lista: Obra[], f: FiltrosObra) {
  const semDimensao = (dimensao: keyof FiltrosObra) => aplicarFiltros(lista, { ...f, [dimensao]: '' });
  const contaPor = <T extends string>(itens: Obra[], chave: (o: Obra) => T | null | undefined) => {
    const m = new Map<string, number>();
    for (const o of itens) { const k = chave(o); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  };
  return {
    categoria: contaPor(semDimensao('categoria'), (o) => o.categoria),
    situacao: contaPor(semDimensao('situacao'), (o) => o.situacao),
    secretaria: contaPor(semDimensao('secretaria'), (o) => o.secretaria?.slug),
  };
}

/** Valor total do contrato já considerando aditivos — o número que responde
 *  "quanto essa obra custou de verdade", não só o valor original assinado. */
export function valorAtual(o: Pick<Obra, 'valor_contratado' | 'valor_aditivado'>): number | null {
  const base = numero(o.valor_contratado);
  if (base === null) return null;
  return base + (numero(o.valor_aditivado) ?? 0);
}

/** Link de localização sem depender de mapa embutido (sem chave de API, sem
 *  biblioteca nova): abre o endereço direto no serviço de mapas do celular
 *  ou navegador de quem clica. */
export function urlMapa(endereco: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${endereco}, Cambuí, MG`)}`;
}
