/**
 * Acesso a dados e busca do Órgão Oficial.
 *
 * A UNIDADE É A MATÉRIA, NÃO A EDIÇÃO. Quem chega aqui procura "a portaria que
 * me exonerou" ou "o decreto do ponto facultativo" — ninguém procura "a edição
 * 412". A edição é o continente; a matéria é o que se cita, se compartilha e se
 * anexa a processo. Por isso a matéria tem página própria, URL permanente e é
 * ela que o índice de busca indexa.
 *
 * POR QUE ÍNDICE EM MEMÓRIA, E ATÉ QUANDO
 * Cambuí publica algo entre 1.500 e 3.000 matérias por ano. Dez anos de acervo
 * são ~25 mil matérias; com o corpo em texto puro, algo em torno de 40 MB no
 * processo — que um Node com 16 GiB carrega sem esforço, e que responde em
 * milissegundos sem uma segunda via de acesso ao banco.
 *
 * O caminho de migração está escrito e é curto: coluna tsvector gerada +
 * índice GIN + unaccent, consultada por SQL. O SQL está no ARQUITETURA.md. O
 * gatilho para migrar é a memória do processo passar de ~150 MB ou a carga
 * inicial passar de 3 s — o que acontece perto de 100 mil matérias.
 * Antes disso, trocar seria complexidade sem cliente.
 */
import { listar, unico } from '../directus';
import type { Veiculo, Caderno, Edicao, Materia, MateriaCompleta } from './tipos';
import { TIPOS_ATO, rotuloTipoAto } from './vocabulario';
import { normalizar, textoDe, reconhecerAto, referenciaCitacao } from './dominio.mjs';

const VALIDADE_MS = 60_000;

const CAMPOS_EDICAO = [
  'id', 'numero', 'ano', 'volume', 'tipo', 'situacao', 'data_disponibilizacao',
  'data_publicacao_legal', 'justificativa_extraordinaria', 'total_paginas', 'arquivo_pdf',
  'sha256', 'codigo_verificador', 'assinatura_signatario', 'assinatura_documento',
  'assinatura_emissor', 'assinatura_em', 'assinatura_algoritmo', 'assinatura_carimbo',
  'anulada', 'anulada_motivo', 'anulada_justificativa', 'anulada_em', 'anulada_por_edicao',
  'importada_acervo', 'fonte_acervo', 'demonstracao',
].join(',');

const CAMPOS_MATERIA = [
  'id', 'edicao', 'caderno', 'secretaria.nome', 'secretaria.slug', 'orgao_texto', 'ordem',
  'pagina_inicial', 'pagina_final', 'tipo_ato', 'numero_ato', 'ano_ato', 'ementa', 'corpo',
  'slug', 'situacao', 'processo_administrativo', 'licitacao', 'vigencia_inicio',
  'retifica', 'republica', 'revoga', 'motivo_republicacao', 'demonstracao',
].join(',');

interface Acervo {
  em: number;
  veiculo: Veiculo | null;
  cadernos: Caderno[];
  edicoes: Edicao[];
  materias: MateriaCompleta[];
  porId: Map<string, MateriaCompleta>;
  porSlug: Map<string, MateriaCompleta>;
  indisponivel: boolean;
}

let cache: Acervo | null = null;
let carregando: Promise<Acervo> | null = null;

async function montar(): Promise<Acervo> {
  const [rVeiculo, rCadernos, rEdicoes, rMaterias] = await Promise.all([
    unico<Veiculo>('diario_veiculo'),
    listar<Caderno>('diario_cadernos', { fields: 'id,slug,nome,ordem,descricao,dados_pessoais,indexavel', sort: 'ordem', limit: 50 }),
    listar<Edicao>('diario_edicoes', {
      fields: CAMPOS_EDICAO,
      filter: JSON.stringify({ status: { _eq: 'publicado' }, situacao: { _eq: 'publicada' } }),
      sort: '-numero', limit: 5000,
    }),
    listar<Materia>('diario_materias', {
      fields: CAMPOS_MATERIA,
      filter: JSON.stringify({ status: { _eq: 'publicado' }, situacao: { _eq: 'publicada' } }),
      sort: '-id', limit: 50_000,
    }),
  ]);

  const indisponivel = rEdicoes.indisponivel && rMaterias.indisponivel;
  const cadernos = rCadernos.dados;
  const edicoes = rEdicoes.dados;
  const porEdicao = new Map(edicoes.map((e) => [e.id, e]));
  const porCaderno = new Map(cadernos.map((c) => [c.id, c]));

  const materias: MateriaCompleta[] = rMaterias.dados
    /* Matéria cuja edição não está publicada não existe para o público. É a
     * regra que impede uma pauta em montagem de vazar pela busca. */
    .filter((m) => m.edicao && porEdicao.has(m.edicao))
    .map((m) => {
      const texto = textoDe(m.corpo);
      return {
        ...m,
        edicaoObj: porEdicao.get(m.edicao!) ?? null,
        cadernoObj: m.caderno ? porCaderno.get(m.caderno) ?? null : null,
        orgao: m.orgao_texto || m.secretaria?.nome || 'Prefeitura Municipal de Cambuí',
        titulo: tituloDe(m),
        texto,
      };
    });

  return {
    em: Date.now(),
    veiculo: rVeiculo.dado,
    cadernos, edicoes, materias,
    porId: new Map(materias.map((m) => [m.id, m])),
    porSlug: new Map(materias.map((m) => [m.slug, m])),
    indisponivel,
  };
}

/** Carga com cache. Requisições simultâneas compartilham a mesma carga —
 *  sem isto, um pico de acessos dispararia N cargas idênticas do acervo. */
export async function acervo(): Promise<Acervo> {
  if (cache && Date.now() - cache.em < VALIDADE_MS) return cache;
  if (carregando) return carregando;
  carregando = montar()
    .then((a) => {
      /* Falha do CMS não derruba a página: serve o acervo antigo. Um diário
       * fora do ar é pior do que um diário com um minuto de atraso. */
      if (a.indisponivel && cache) return cache;
      cache = a;
      return a;
    })
    .finally(() => { carregando = null; });
  return carregando;
}

export function tituloDe(m: { tipo_ato: string; numero_ato: string | null; ano_ato: number | null }): string {
  const base = rotuloTipoAto(m.tipo_ato);
  if (!m.numero_ato) return base;
  return `${base} nº ${m.numero_ato}${m.ano_ato ? `/${m.ano_ato}` : ''}`;
}

/* ─────────────────────────────── remissões ─────────────────────────────── */

/**
 * Remissões nos DOIS sentidos, a partir de um único campo gravado.
 *
 * O banco guarda só "A retifica B". O sentido inverso ("B foi retificada por
 * A") é calculado aqui. É de propósito: gravar os dois lados permitiria o
 * estado impossível em que um aponta e o outro não — numa publicação oficial,
 * isso é uma remissão falsa, e remissão falsa induz a erro quem lê.
 */
export interface Remissoes {
  retifica: MateriaCompleta | null;
  republica: MateriaCompleta | null;
  revoga: MateriaCompleta | null;
  retificadaPor: MateriaCompleta[];
  republicadaPor: MateriaCompleta[];
  revogadaPor: MateriaCompleta[];
}

export function remissoesDe(a: Acervo, m: MateriaCompleta): Remissoes {
  const ref = (id: string | null) => (id ? a.porId.get(id) ?? null : null);
  return {
    retifica: ref(m.retifica),
    republica: ref(m.republica),
    revoga: ref(m.revoga),
    retificadaPor: a.materias.filter((x) => x.retifica === m.id),
    republicadaPor: a.materias.filter((x) => x.republica === m.id),
    revogadaPor: a.materias.filter((x) => x.revoga === m.id),
  };
}

/** Situação do ato, em uma frase, para exibir no alto da matéria. */
export function situacaoDoAto(r: Remissoes): { rotulo: string; tom: 'vigente' | 'alterado' | 'revogado' } {
  if (r.revogadaPor.length) return { rotulo: 'Revogado', tom: 'revogado' };
  if (r.republicadaPor.length) return { rotulo: 'Republicado por incorreção', tom: 'alterado' };
  if (r.retificadaPor.length) return { rotulo: 'Retificado por errata', tom: 'alterado' };
  return { rotulo: 'Sem retificação ou revogação registrada', tom: 'vigente' };
}

/* ──────────────────────────────── busca ────────────────────────────────── */

/** Distância de edição limitada a 1, para tolerar erro de digitação. */
function proximo(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, erros = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++erros > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return erros + (a.length - i) + (b.length - j) <= 1;
}

/** Sinônimos do cidadão → vocabulário do ato administrativo. */
export const SINONIMOS: Record<string, string[]> = {
  demissao: ['exoneracao', 'exonera', 'dispensa'],
  demitido: ['exonerado', 'exonera'],
  contratado: ['nomeado', 'nomeia', 'admitido'],
  contratacao: ['nomeacao', 'nomeia', 'admissao'],
  feriado: ['ponto facultativo', 'expediente'],
  aposentadoria: ['aposenta', 'inatividade', 'proventos'],
  salario: ['vencimento', 'subsidio', 'remuneracao'],
  aumento: ['reajuste', 'revisao geral anual'],
  concurso: ['certame', 'processo seletivo', 'edital'],
  licenca: ['afastamento'],
  merenda: ['generos alimenticios', 'alimentacao escolar'],
  lixo: ['residuos solidos', 'coleta'],
  remedio: ['medicamento', 'farmacia basica'],
  obra: ['reforma', 'construcao', 'recapeamento', 'pavimentacao'],
  professor: ['professor de educacao basica', 'magisterio', 'docente'],
  creche: ['educacao infantil', 'centro municipal de educacao'],
  posto: ['unidade basica de saude', 'ubs'],
  onibus: ['transporte escolar', 'transporte'],
  imposto: ['iptu', 'tributo', 'issqn'],
  rua: ['logradouro', 'via publica'],
};

const textoBuscavel = (m: MateriaCompleta) => normalizar([
  m.titulo, m.ementa, m.texto, m.orgao, m.processo_administrativo,
  m.numero_ato ? `${m.numero_ato}/${m.ano_ato ?? ''}` : '',
  m.edicaoObj ? `edicao ${m.edicaoObj.numero}` : '',
].filter(Boolean).join(' '));

/** Cache do texto normalizado: normalizar 25 mil corpos a cada busca custaria
 *  segundos. Chaveado pelo id, invalidado junto com o acervo. */
const normalizados = new WeakMap<MateriaCompleta, string>();
function alvoDe(m: MateriaCompleta): string {
  let v = normalizados.get(m);
  if (v === undefined) { v = textoBuscavel(m); normalizados.set(m, v); }
  return v;
}

export interface Resultado {
  materia: MateriaCompleta;
  /** Pontuação: título e ementa pesam mais do que o corpo. */
  peso: number;
  trecho: string;
}

/**
 * Busca de texto integral no CORPO das matérias, não só no título.
 * Devolve trecho de contexto com os termos marcados.
 */
export function buscar(lista: MateriaCompleta[], termo: string): Resultado[] {
  const limpo = normalizar(termo).trim();
  if (!limpo) return lista.map((m) => ({ materia: m, peso: 0, trecho: '' }));

  const palavras = limpo.split(/\s+/).filter((p) => p.length >= 2);
  if (!palavras.length) return lista.map((m) => ({ materia: m, peso: 0, trecho: '' }));

  const saida: Resultado[] = [];
  for (const m of lista) {
    const alvo = alvoDe(m);
    const cabecalho = normalizar(`${m.titulo} ${m.ementa}`);
    let peso = 0;
    let todas = true;

    for (const p of palavras) {
      const variantes = [p, ...(SINONIMOS[p] ?? [])];
      if (variantes.some((v) => cabecalho.includes(v))) { peso += 10; continue; }
      if (variantes.some((v) => alvo.includes(v))) { peso += 3; continue; }
      /* Erro de digitação só para palavra longa: com 4 letras, "casa" e "caso"
       * ficam a uma edição de distância e a busca vira ruído. */
      if (p.length >= 5 && alvo.split(/[^a-z0-9]+/).some((t) => t.length >= 5 && proximo(p, t))) { peso += 1; continue; }
      todas = false; break;
    }
    if (todas) saida.push({ materia: m, peso, trecho: trechoDe(m, palavras) });
  }
  return saida.sort((a, b) => b.peso - a.peso);
}

/** Trecho do corpo em torno da primeira ocorrência, com os termos marcados. */
export function trechoDe(m: MateriaCompleta, palavras: string[], largura = 190): string {
  const texto = m.texto || m.ementa;
  const alvo = normalizar(texto);
  let pos = -1;
  for (const p of palavras) {
    const i = alvo.indexOf(p);
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }
  if (pos < 0) return texto.slice(0, largura).trim() + (texto.length > largura ? '…' : '');

  const ini = Math.max(0, pos - Math.floor(largura / 3));
  const fim = Math.min(texto.length, ini + largura);
  const bruto = (ini > 0 ? '…' : '') + texto.slice(ini, fim).trim() + (fim < texto.length ? '…' : '');
  return marcar(bruto, palavras);
}

/** Envolve as ocorrências em <mark>. Escapa antes — o corpo vem do CMS. */
export function marcar(texto: string, palavras: string[]): string {
  const seguro = texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!palavras.length) return seguro;
  const alvo = normalizar(seguro);
  const faixas: Array<[number, number]> = [];
  for (const p of palavras) {
    if (p.length < 2) continue;
    let i = alvo.indexOf(p);
    while (i >= 0) { faixas.push([i, i + p.length]); i = alvo.indexOf(p, i + p.length); }
  }
  if (!faixas.length) return seguro;
  faixas.sort((a, b) => a[0] - b[0]);
  const juntas: Array<[number, number]> = [];
  for (const f of faixas) {
    const u = juntas[juntas.length - 1];
    if (u && f[0] <= u[1]) u[1] = Math.max(u[1], f[1]);
    else juntas.push([...f] as [number, number]);
  }
  let saida = '', cursor = 0;
  for (const [a, b] of juntas) {
    saida += seguro.slice(cursor, a) + '<mark>' + seguro.slice(a, b) + '</mark>';
    cursor = b;
  }
  return saida + seguro.slice(cursor);
}

/* ─────────────────────────────── filtros ───────────────────────────────── */

export type Atalho = '' | 'ultima-edicao' | 'esta-semana' | 'este-mes' | 'licitacoes' | 'pessoal';

export interface Filtros {
  q: string; caderno: string; secretaria: string; tipo: string;
  de: string; ate: string; ano: string; numero: string; edicao: string;
  atalho: Atalho; ordem: string; pagina: string;
}

export const FILTROS_VAZIOS: Filtros = {
  q: '', caderno: '', secretaria: '', tipo: '', de: '', ate: '',
  ano: '', numero: '', edicao: '', atalho: '', ordem: '', pagina: '',
};

export function lerFiltros(url: URL): Filtros {
  const p = (n: string) => (url.searchParams.get(n) ?? '').trim();
  return {
    q: p('q'), caderno: p('caderno'), secretaria: p('secretaria'), tipo: p('tipo'),
    de: p('de'), ate: p('ate'), ano: p('ano'), numero: p('numero'), edicao: p('edicao'),
    atalho: p('atalho') as Atalho, ordem: p('ordem'), pagina: p('pagina'),
  };
}

/** Estado do filtro mora na URL: link compartilhável, indexável, e — o que
 *  mais importa aqui — funciona com o JavaScript desligado. */
export function paraQuery(f: Partial<Filtros>, base: Filtros = FILTROS_VAZIOS): string {
  const juntos = { ...base, ...f };
  const p = new URLSearchParams();
  for (const chave of Object.keys(FILTROS_VAZIOS) as Array<keyof Filtros>) {
    if (juntos[chave]) p.set(chave, String(juntos[chave]));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const temFiltro = (f: Filtros) =>
  (Object.keys(FILTROS_VAZIOS) as Array<keyof Filtros>).some((k) => k !== 'pagina' && k !== 'ordem' && f[k]);

const DIA = 86400000;

function dentroDoAtalho(m: MateriaCompleta, atalho: Atalho, agora: number, ultimaEdicao: number | null): boolean {
  if (!atalho) return true;
  const data = m.edicaoObj ? new Date(m.edicaoObj.data_publicacao_legal).getTime() : 0;
  switch (atalho) {
    case 'ultima-edicao': return m.edicaoObj?.numero === ultimaEdicao;
    case 'esta-semana': return data >= agora - 7 * DIA;
    case 'este-mes': return data >= agora - 31 * DIA;
    case 'licitacoes': return m.cadernoObj?.slug === 'licitacoes-e-contratos';
    case 'pessoal': return m.cadernoObj?.slug === 'atos-de-pessoal';
    default: return true;
  }
}

export function aplicarFiltros(
  lista: MateriaCompleta[], f: Filtros, opcoes: { agora?: number; ultimaEdicao?: number | null } = {},
): Resultado[] {
  const agora = opcoes.agora ?? Date.now();
  let r = lista;

  if (f.caderno) r = r.filter((m) => m.cadernoObj?.slug === f.caderno);
  if (f.secretaria) r = r.filter((m) => m.secretaria?.slug === f.secretaria);
  if (f.tipo) r = r.filter((m) => m.tipo_ato === f.tipo);
  if (f.ano) r = r.filter((m) => String(m.ano_ato) === f.ano || String(m.edicaoObj?.ano) === f.ano);
  if (f.numero) r = r.filter((m) => (m.numero_ato ?? '').replace(/\D/g, '') === f.numero.replace(/\D/g, ''));
  if (f.edicao) r = r.filter((m) => String(m.edicaoObj?.numero) === f.edicao);
  if (f.de) r = r.filter((m) => (m.edicaoObj?.data_publicacao_legal ?? '') >= f.de);
  if (f.ate) r = r.filter((m) => (m.edicaoObj?.data_publicacao_legal ?? '') <= f.ate);
  if (f.atalho) r = r.filter((m) => dentroDoAtalho(m, f.atalho, agora, opcoes.ultimaEdicao ?? null));

  const resultados = buscar(r, f.q);

  const porData = (a: Resultado, b: Resultado) =>
    (b.materia.edicaoObj?.numero ?? 0) - (a.materia.edicaoObj?.numero ?? 0) ||
    (a.materia.ordem ?? 0) - (b.materia.ordem ?? 0);

  switch (f.ordem) {
    case 'antigas': return resultados.sort((a, b) => -porData(a, b));
    case 'relevancia': return resultados; // já vem ordenado por peso
    default: return f.q ? resultados : resultados.sort(porData);
  }
}

/** Contadores por faceta, calculados sobre o resultado dos OUTROS filtros —
 *  para que o número ao lado de cada opção seja o que ela realmente daria. */
export function contar(lista: MateriaCompleta[], f: Filtros, opcoes: { ultimaEdicao?: number | null } = {}) {
  const semA = (chave: keyof Filtros) => aplicarFiltros(lista, { ...f, [chave]: '' }, opcoes).map((r) => r.materia);
  const contaPor = <T>(itens: MateriaCompleta[], chave: (m: MateriaCompleta) => T | null | undefined) => {
    const mapa = new Map<T, number>();
    for (const m of itens) { const v = chave(m); if (v != null) mapa.set(v, (mapa.get(v) ?? 0) + 1); }
    return mapa;
  };
  return {
    cadernos: contaPor(semA('caderno'), (m) => m.cadernoObj?.slug),
    secretarias: contaPor(semA('secretaria'), (m) => m.secretaria?.slug),
    tipos: contaPor(semA('tipo'), (m) => m.tipo_ato),
    anos: contaPor(semA('ano'), (m) => m.edicaoObj?.ano),
  };
}

/* ───────────────────────── consulta direta por ato ─────────────────────── */

/**
 * "Decreto 1.245/2026" deve levar DIRETO à matéria, não a uma lista.
 * Devolve a matéria quando a busca identifica um ato específico e existe um
 * único candidato — na dúvida, devolve null e a listagem normal acontece.
 */
export function atalhoParaAto(a: Acervo, termo: string): MateriaCompleta | null {
  const alvo = reconhecerAto(termo);
  if (!alvo) return null;
  const candidatos = a.materias.filter((m) =>
    m.tipo_ato === alvo.tipo_ato &&
    (m.numero_ato ?? '').replace(/\D/g, '') === alvo.numero &&
    (alvo.ano === null || m.ano_ato === alvo.ano));
  return candidatos.length === 1 ? candidatos[0] : null;
}

/* ───────────────────────────── conveniências ───────────────────────────── */

export async function edicaoPorNumero(numero: number): Promise<Edicao | null> {
  const a = await acervo();
  return a.edicoes.find((e) => e.numero === numero) ?? null;
}

export async function materiaPorSlug(slug: string): Promise<MateriaCompleta | null> {
  const a = await acervo();
  return a.porSlug.get(slug) ?? null;
}

export function materiasDaEdicao(a: Acervo, edicao: Edicao): MateriaCompleta[] {
  return a.materias
    .filter((m) => m.edicao === edicao.id)
    .sort((x, y) => {
      const cx = a.cadernos.findIndex((c) => c.id === x.caderno);
      const cy = a.cadernos.findIndex((c) => c.id === y.caderno);
      return cx - cy || (x.ordem ?? 0) - (y.ordem ?? 0);
    });
}

export function citacaoDe(a: Acervo, m: MateriaCompleta): string {
  return referenciaCitacao({ veiculo: a.veiculo, edicao: m.edicaoObj, materia: m });
}

export { TIPOS_ATO, rotuloTipoAto };
