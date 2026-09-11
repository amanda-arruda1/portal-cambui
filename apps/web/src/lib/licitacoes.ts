/**
 * Consulta, busca e filtros de licitações.
 *
 * DECISÃO CENTRAL — a busca e os filtros rodam EM MEMÓRIA, não no CMS.
 *
 * Uma prefeitura deste porte publica de 100 a 200 licitações por ano. Carregar
 * o conjunto publicado inteiro e filtrar em JavaScript é mais simples, mais
 * previsível e mais rápido do que montar filtros relacionais no Directus — e
 * é o que permite, sem depender do banco:
 *   · ignorar acento ("pregao" acha "Pregão");
 *   · expandir sinônimos ("merenda" acha "gêneros alimentícios");
 *   · tolerar erro de digitação ("licitacao", "asfaudo");
 *   · contar quantos resultados CADA filtro daria, que é o que impede o
 *     usuário de cair num filtro vazio sem aviso.
 *
 * Se um dia o município passar de alguns milhares de registros, o ponto de
 * troca é este arquivo — e só ele.
 */

import { listar } from './directus';

/* ─────────────────────────  enums do domínio  ───────────────────────── */

export const MODALIDADES = [
  { valor: 'pregao_eletronico',   rotulo: 'Pregão Eletrônico',        prazoMinimoDias: 8 },
  { valor: 'pregao_presencial',   rotulo: 'Pregão Presencial',        prazoMinimoDias: 8 },
  { valor: 'concorrencia',        rotulo: 'Concorrência',             prazoMinimoDias: 35 },
  { valor: 'concurso',            rotulo: 'Concurso',                 prazoMinimoDias: 35 },
  { valor: 'leilao',              rotulo: 'Leilão',                   prazoMinimoDias: 15 },
  { valor: 'dialogo_competitivo', rotulo: 'Diálogo Competitivo',      prazoMinimoDias: 25 },
  { valor: 'dispensa',            rotulo: 'Dispensa de Licitação',    prazoMinimoDias: 3 },
  { valor: 'dispensa_eletronica', rotulo: 'Dispensa Eletrônica',      prazoMinimoDias: 3 },
  { valor: 'inexigibilidade',     rotulo: 'Inexigibilidade',          prazoMinimoDias: 0 },
  { valor: 'chamamento_publico',  rotulo: 'Chamamento Público',       prazoMinimoDias: 15 },
  { valor: 'credenciamento',      rotulo: 'Credenciamento',           prazoMinimoDias: 15 },
  { valor: 'pre_qualificacao',    rotulo: 'Pré-qualificação',         prazoMinimoDias: 15 },
  { valor: 'adesao_ata',          rotulo: 'Adesão a Ata de Registro de Preços', prazoMinimoDias: 0 },
  { valor: 'cotacao_eletronica',  rotulo: 'Cotação Eletrônica',       prazoMinimoDias: 3 },
] as const;

export const CRITERIOS: Record<string, string> = {
  menor_preco: 'Menor preço', maior_desconto: 'Maior desconto',
  melhor_tecnica: 'Melhor técnica ou conteúdo artístico', tecnica_e_preco: 'Técnica e preço',
  maior_lance: 'Maior lance', maior_retorno_economico: 'Maior retorno econômico',
};

export const MODOS_DISPUTA: Record<string, string> = {
  aberto: 'Aberto', fechado: 'Fechado', aberto_fechado: 'Aberto e fechado',
  fechado_aberto: 'Fechado e aberto', nao_se_aplica: 'Não se aplica',
};

/** `tom` decide a cor da etiqueta. 'alerta' é reservado ao que muda a decisão
 *  de quem se preparou para participar — suspensa, revogada, anulada. */
export const SITUACOES = [
  { valor: 'publicada',     rotulo: 'Publicada',           tom: 'aviso',  emAndamento: true },
  { valor: 'aberta',        rotulo: 'Recebendo propostas',  tom: 'ok',     emAndamento: true },
  { valor: 'em_sessao',     rotulo: 'Em sessão pública',    tom: 'ok',     emAndamento: true },
  { valor: 'em_julgamento', rotulo: 'Em julgamento',        tom: 'aviso',  emAndamento: true },
  { valor: 'homologada',    rotulo: 'Homologada',           tom: 'neutro', emAndamento: false },
  { valor: 'adjudicada',    rotulo: 'Adjudicada',           tom: 'neutro', emAndamento: false },
  { valor: 'contratada',    rotulo: 'Contratada',           tom: 'neutro', emAndamento: false },
  { valor: 'suspensa',      rotulo: 'Suspensa',             tom: 'alerta', emAndamento: true },
  { valor: 'retificada',    rotulo: 'Retificada',           tom: 'alerta', emAndamento: true },
  { valor: 'revogada',      rotulo: 'Revogada',             tom: 'alerta', emAndamento: false },
  { valor: 'anulada',       rotulo: 'Anulada',              tom: 'alerta', emAndamento: false },
  { valor: 'fracassada',    rotulo: 'Fracassada',           tom: 'neutro', emAndamento: false },
  { valor: 'deserta',       rotulo: 'Deserta',              tom: 'neutro', emAndamento: false },
] as const;

export const TIPOS_ANEXO: Array<{ valor: string; rotulo: string; ordem: number }> = [
  { valor: 'edital', rotulo: 'Edital', ordem: 1 },
  { valor: 'anexo_do_edital', rotulo: 'Anexos do edital', ordem: 2 },
  { valor: 'termo_de_referencia', rotulo: 'Termo de referência', ordem: 3 },
  { valor: 'planilha', rotulo: 'Planilhas', ordem: 4 },
  { valor: 'minuta_de_contrato', rotulo: 'Minuta de contrato', ordem: 5 },
  { valor: 'retificacao', rotulo: 'Retificações', ordem: 6 },
  { valor: 'errata', rotulo: 'Erratas', ordem: 7 },
  { valor: 'impugnacao', rotulo: 'Impugnações', ordem: 8 },
  { valor: 'resposta_a_impugnacao', rotulo: 'Respostas a impugnações', ordem: 9 },
  { valor: 'esclarecimento', rotulo: 'Esclarecimentos', ordem: 10 },
  { valor: 'ata_da_sessao', rotulo: 'Atas de sessão', ordem: 11 },
  { valor: 'resultado_do_julgamento', rotulo: 'Resultado do julgamento', ordem: 12 },
  { valor: 'mapa_de_lances', rotulo: 'Mapa de lances', ordem: 13 },
  { valor: 'homologacao', rotulo: 'Homologação', ordem: 14 },
  { valor: 'contrato', rotulo: 'Contrato', ordem: 15 },
  { valor: 'ata_de_registro_de_precos', rotulo: 'Ata de registro de preços', ordem: 16 },
];

export const TIPOS_EVENTO: Record<string, string> = {
  publicacao: 'Edital publicado', retificacao: 'Retificação', suspensao: 'Suspensão',
  impugnacao: 'Impugnação recebida', esclarecimento: 'Esclarecimento', sessao: 'Sessão pública',
  resultado: 'Resultado do julgamento', homologacao: 'Homologação', adjudicacao: 'Adjudicação',
  contratacao: 'Contratação', revogacao: 'Revogação', anulacao: 'Anulação',
};

export const rotuloModalidade = (v: string) => MODALIDADES.find((m) => m.valor === v)?.rotulo ?? v;
export const situacaoDe = (v: string) => SITUACOES.find((s) => s.valor === v) ?? SITUACOES[0];
export const paraSlug = (v: string) => v.replace(/_/g, '-');
export const deSlug = (s: string) => s.replace(/-/g, '_');

/* ─────────────────────────  tipos  ───────────────────────── */

export interface ArquivoAnexo { id: string; type: string | null; filesize: number | null; filename_download: string | null }
export interface Anexo {
  id: string; titulo: string; tipo: string; arquivo: ArquivoAnexo | null; url_externa: string | null;
  data_publicacao: string; versao: number; substitui: string | null; superado: boolean; ordem: number | null;
}
export interface Lote {
  id: string; numero: number; descricao: string; valor_estimado: number | string | null; situacao: string;
  vencedor_razao_social: string | null; vencedor_cnpj: string | null; valor_homologado: number | string | null;
}
export interface Evento { id: string; data: string; tipo: string; descricao: string | null; anexo: string | null }

export interface Licitacao {
  id: string; numero_processo: string; numero: number; ano: number; slug: string;
  modalidade: string; forma: string; justificativa_presencial: string | null;
  criterio_julgamento: string; modo_disputa: string; registro_precos: boolean;
  secretaria: { nome: string; slug: string } | null;
  objeto_resumo: string; objeto: string | null;
  valor_estimado: number | string | null; orcamento_sigiloso: boolean;
  data_publicacao: string; data_abertura_propostas: string | null; data_sessao: string | null;
  prazo_impugnacao: string | null; prazo_esclarecimentos: string | null;
  situacao: string; motivo_situacao: string | null;
  pncp_id: string | null; pncp_url: string | null; sistema_sessao_url: string | null;
  demonstracao: boolean; date_updated: string | null;
}

/* ─────────────────────────  carga  ───────────────────────── */

const CAMPOS = [
  'id', 'numero_processo', 'numero', 'ano', 'slug', 'modalidade', 'forma', 'justificativa_presencial',
  'criterio_julgamento', 'modo_disputa', 'registro_precos', 'secretaria.nome', 'secretaria.slug',
  'objeto_resumo', 'objeto', 'valor_estimado', 'orcamento_sigiloso', 'data_publicacao',
  'data_abertura_propostas', 'data_sessao', 'prazo_impugnacao', 'prazo_esclarecimentos',
  'situacao', 'motivo_situacao', 'pncp_id', 'pncp_url', 'sistema_sessao_url', 'demonstracao', 'date_updated',
].join(',');

/** Todas as licitações publicadas. Falha silenciosa: se o CMS cair, a página
 *  mostra estado vazio honesto em vez de erro — mesma regra do resto do portal. */
export async function todas(): Promise<{ dados: Licitacao[]; indisponivel: boolean }> {
  return listar<Licitacao>('licitacoes', {
    fields: CAMPOS,
    filter: JSON.stringify({ status: { _eq: 'publicado' } }),
    sort: '-data_publicacao',
    limit: 2000,
  });
}

export async function porSlug(ano: number, slug: string): Promise<Licitacao | null> {
  const { dados } = await todas();
  return dados.find((l) => l.ano === ano && l.slug === slug) ?? null;
}

export async function anexosDe(id: string): Promise<Anexo[]> {
  const r = await listar<Anexo>('licitacao_anexos', {
    // tamanho e formato vêm junto: quem consulta do celular em 4G de serra
    // precisa saber se são 200 KB ou 40 MB ANTES de tocar no link.
    fields: 'id,titulo,tipo,arquivo.id,arquivo.type,arquivo.filesize,arquivo.filename_download,url_externa,data_publicacao,versao,substitui,superado,ordem',
    filter: JSON.stringify({ licitacao: { _eq: id } }),
    sort: 'ordem,data_publicacao',
    limit: 200,
  });
  return r.dados;
}

export async function lotesDe(id: string): Promise<Lote[]> {
  const r = await listar<Lote>('licitacao_lotes', {
    fields: 'id,numero,descricao,valor_estimado,situacao,vencedor_razao_social,vencedor_cnpj,valor_homologado',
    filter: JSON.stringify({ licitacao: { _eq: id } }), sort: 'numero', limit: 200,
  });
  return r.dados;
}

export async function eventosDe(id: string): Promise<Evento[]> {
  const r = await listar<Evento>('licitacao_eventos', {
    fields: 'id,data,tipo,descricao,anexo',
    filter: JSON.stringify({ licitacao: { _eq: id } }), sort: 'data', limit: 200,
  });
  return r.dados;
}

/* ─────────────────────────  busca  ───────────────────────── */

const semAcento = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Sinônimos do cidadão → vocabulário do edital.
 *
 * É a peça que faz "merenda" achar "gêneros alimentícios para a alimentação
 * escolar". Um índice de texto do banco não resolveria isso sozinho: os dois
 * termos não compartilham radical. Um dicionário curto e explícito, que
 * qualquer servidor consegue editar, resolve — e é auditável.
 */
export const SINONIMOS: Record<string, string[]> = {
  merenda: ['generos alimenticios', 'alimentacao escolar', 'alimenticio'],
  comida: ['generos alimenticios', 'alimentacao escolar'],
  remedio: ['medicamento', 'farmacia basica'],
  farmacia: ['medicamento'],
  asfalto: ['pavimentacao', 'recapeamento', 'concreto betuminoso'],
  rua: ['pavimentacao', 'via urbana', 'iluminacao publica'],
  lixo: ['residuos solidos', 'coleta', 'aterro'],
  luz: ['iluminacao publica', 'luminaria', 'led'],
  lampada: ['iluminacao publica', 'luminaria'],
  poste: ['iluminacao publica'],
  onibus: ['transporte escolar'],
  van: ['transporte escolar'],
  perua: ['transporte escolar'],
  computador: ['informatica', 'microcomputador', 'notebook'],
  ti: ['informatica', 'rede'],
  internet: ['link dedicado', 'telefonia'],
  dentista: ['odontologico'],
  trator: ['patrulha mecanizada', 'agricola'],
  carro: ['veiculo', 'locacao de veiculos', 'frota'],
  gasolina: ['combustivel'],
  diesel: ['combustivel'],
  show: ['atracoes artisticas', 'festival'],
  banda: ['atracoes artisticas', 'festival'],
  obra: ['pavimentacao', 'construcao', 'engenharia'],
  creche: ['educacao infantil', 'construcao'],
  cesta: ['cestas de alimentos', 'seguranca alimentar'],
  leito: ['servicos de saude', 'credenciamento'],
  sucata: ['inserviveis', 'leilao'],
  uniforme: ['uniformes escolares', 'kit escolar'],
  cimento: ['material de construcao'],
  seguro: ['apolice', 'frota'],
};

/** Distância de Levenshtein com teto — só para tolerar erro de digitação em
 *  palavra de 5+ letras. Sem teto, "sim" casaria com metade do dicionário. */
function proximo(a: string, b: string, teto = 1): boolean {
  if (Math.abs(a.length - b.length) > teto) return false;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    anterior = atual;
  }
  return anterior[b.length] <= teto;
}

function textoBuscavel(l: Licitacao): string {
  return semAcento(
    [l.objeto_resumo, l.objeto?.replace(/<[^>]+>/g, ' '), l.numero_processo,
     `${l.numero}/${l.ano}`, rotuloModalidade(l.modalidade), l.secretaria?.nome, l.pncp_id].filter(Boolean).join(' '),
  );
}

export function buscar(lista: Licitacao[], termo: string): Licitacao[] {
  const limpo = semAcento(termo).trim();
  if (!limpo) return lista;

  const palavras = limpo.split(/\s+/).filter((p) => p.length >= 2);
  const expandidas = palavras.flatMap((p) => [p, ...(SINONIMOS[p] ?? [])]);

  return lista.filter((l) => {
    const alvo = textoBuscavel(l);
    // Toda palavra digitada precisa aparecer (ou um sinônimo dela). Buscar
    // "merenda 2026" tem de exigir as duas coisas, não uma ou outra.
    return palavras.every((p) => {
      const variantes = [p, ...(SINONIMOS[p] ?? [])];
      if (variantes.some((v) => alvo.includes(v))) return true;
      // erro de digitação: só para palavra longa o bastante, e comparando com
      // cada palavra do alvo.
      if (p.length < 5) return false;
      return alvo.split(/[^a-z0-9]+/).some((t) => t.length >= 5 && proximo(p, t));
    });
  });
}

/* ─────────────────────────  filtros  ───────────────────────── */

export type AtalhoTempo = 'abertas' | 'proximos-7' | 'proximos-30' | 'encerradas' | '';

export interface Filtros {
  q: string; modalidade: string; situacao: string; ano: string; secretaria: string;
  valorMin: string; valorMax: string; tempo: AtalhoTempo; ordem: string;
}

export const FILTROS_VAZIOS: Filtros = {
  q: '', modalidade: '', situacao: '', ano: '', secretaria: '', valorMin: '', valorMax: '', tempo: '', ordem: '',
};

export function lerFiltros(url: URL): Filtros {
  const p = (n: string) => (url.searchParams.get(n) ?? '').trim();
  return {
    q: p('q'), modalidade: p('modalidade'), situacao: p('situacao'), ano: p('ano'),
    secretaria: p('secretaria'), valorMin: p('valor_min'), valorMax: p('valor_max'),
    tempo: p('tempo') as AtalhoTempo, ordem: p('ordem'),
  };
}

/** Reconstrói a query string. É isto que faz o estado do filtro morar na URL —
 *  compartilhável, indexável e reproduzível numa aba anônima. */
export function paraQuery(f: Partial<Filtros>, base: Filtros = FILTROS_VAZIOS): string {
  const juntos = { ...base, ...f };
  const p = new URLSearchParams();
  const mapa: Array<[keyof Filtros, string]> = [
    ['q', 'q'], ['modalidade', 'modalidade'], ['situacao', 'situacao'], ['ano', 'ano'],
    ['secretaria', 'secretaria'], ['valorMin', 'valor_min'], ['valorMax', 'valor_max'],
    ['tempo', 'tempo'], ['ordem', 'ordem'],
  ];
  for (const [chave, nome] of mapa) if (juntos[chave]) p.set(nome, String(juntos[chave]));
  const s = p.toString();
  return s ? `?${s}` : '';
}

const DIA = 86400000;

function dentroDoTempo(l: Licitacao, atalho: AtalhoTempo, agora: number): boolean {
  if (!atalho) return true;
  const sessao = l.data_sessao ? new Date(l.data_sessao).getTime() : null;
  const situacao = situacaoDe(l.situacao);
  switch (atalho) {
    case 'abertas': return situacao.emAndamento && (sessao === null || sessao >= agora);
    case 'proximos-7': return sessao !== null && sessao >= agora && sessao <= agora + 7 * DIA;
    case 'proximos-30': return sessao !== null && sessao >= agora && sessao <= agora + 30 * DIA;
    case 'encerradas': return !situacao.emAndamento || (sessao !== null && sessao < agora);
    default: return true;
  }
}

export function aplicarFiltros(lista: Licitacao[], f: Filtros, agora = Date.now()): Licitacao[] {
  let r = lista;
  if (f.q) r = buscar(r, f.q);
  if (f.modalidade) r = r.filter((l) => l.modalidade === f.modalidade);
  if (f.situacao) r = r.filter((l) => l.situacao === f.situacao);
  if (f.ano) r = r.filter((l) => String(l.ano) === f.ano);
  if (f.secretaria) r = r.filter((l) => l.secretaria?.slug === f.secretaria);
  if (f.valorMin) r = r.filter((l) => (numero(l.valor_estimado) ?? 0) >= Number(f.valorMin));
  if (f.valorMax) r = r.filter((l) => (numero(l.valor_estimado) ?? Infinity) <= Number(f.valorMax));
  if (f.tempo) r = r.filter((l) => dentroDoTempo(l, f.tempo, agora));
  return ordenar(r, f.ordem, agora);
}

export function ordenar(lista: Licitacao[], ordem: string, agora = Date.now()): Licitacao[] {
  const copia = [...lista];
  if (ordem === 'publicacao') {
    return copia.sort((a, b) => +new Date(b.data_publicacao) - +new Date(a.data_publicacao));
  }
  if (ordem === 'valor') {
    return copia.sort((a, b) => (numero(b.valor_estimado) ?? -1) - (numero(a.valor_estimado) ?? -1));
  }
  /* Padrão: proximidade da abertura. O que abre logo vem primeiro; o que já
     passou vai para o fim, do mais recente para o mais antigo. É a ordem que
     responde "ainda dá tempo?", que é a pergunta real de quem chega aqui. */
  return copia.sort((a, b) => {
    const sa = a.data_sessao ? +new Date(a.data_sessao) : null;
    const sb = b.data_sessao ? +new Date(b.data_sessao) : null;
    const futA = sa !== null && sa >= agora;
    const futB = sb !== null && sb >= agora;
    if (futA && futB) return sa! - sb!;
    if (futA) return -1;
    if (futB) return 1;
    return (sb ?? 0) - (sa ?? 0);
  });
}

/**
 * Contadores de cada opção de filtro, calculados com os DEMAIS filtros
 * aplicados. Filtro que leva a zero sem avisar é armadilha — aqui a opção
 * aparece com "(0)" e o usuário decide antes de clicar.
 */
export function contar(lista: Licitacao[], f: Filtros, agora = Date.now()) {
  const semDimensao = (dimensao: keyof Filtros) =>
    aplicarFiltros(lista, { ...f, [dimensao]: '' } as Filtros, agora);

  const contaPor = <T extends string>(itens: Licitacao[], chave: (l: Licitacao) => T | null | undefined) => {
    const m = new Map<string, number>();
    for (const l of itens) { const k = chave(l); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  };

  return {
    modalidade: contaPor(semDimensao('modalidade'), (l) => l.modalidade),
    situacao: contaPor(semDimensao('situacao'), (l) => l.situacao),
    ano: contaPor(semDimensao('ano'), (l) => String(l.ano)),
    secretaria: contaPor(semDimensao('secretaria'), (l) => l.secretaria?.slug),
    tempo: new Map<string, number>(
      (['abertas', 'proximos-7', 'proximos-30', 'encerradas'] as AtalhoTempo[]).map((t) => [
        t, semDimensao('tempo').filter((l) => dentroDoTempo(l, t, agora)).length,
      ]),
    ),
  };
}

/* ─────────────────────────  derivados de tempo  ───────────────────────── */

export interface Prazo { aberta: boolean; diasRestantes: number; horasRestantes: number; texto: string }

/** "abre em 6 dias" é mais acionável que "12/09/2026" — o briefing pede os dois,
 *  e este é o texto curto. A data absoluta sempre aparece ao lado. */
export function prazoAte(iso: string | null, agora = Date.now()): Prazo | null {
  if (!iso) return null;
  const alvo = +new Date(iso);
  if (Number.isNaN(alvo)) return null;
  const ms = alvo - agora;
  const dias = Math.floor(ms / DIA);
  const horas = Math.floor(ms / 3600000);
  if (ms < 0) {
    const d = Math.abs(dias);
    return { aberta: false, diasRestantes: dias, horasRestantes: horas,
      texto: d === 0 ? 'encerrou hoje' : d === 1 ? 'encerrou ontem' : `encerrou há ${d} dias` };
  }
  if (horas < 1) return { aberta: true, diasRestantes: 0, horasRestantes: horas, texto: 'abre em menos de 1 hora' };
  if (horas < 24) return { aberta: true, diasRestantes: 0, horasRestantes: horas, texto: `abre em ${horas} h` };
  return { aberta: true, diasRestantes: dias, horasRestantes: horas,
    texto: dias === 1 ? 'abre amanhã' : `abre em ${dias} dias` };
}

/**
 * Valor em reais.
 *
 * Aceita texto porque é ASSIM que o Directus devolve DECIMAL — "2145578.00", e
 * não 2145578. Chamar toLocaleString num texto devolve o próprio texto, então a
 * página exibia o número cru. Pego olhando a tela pronta, não o código.
 */
export function moeda(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

/** Mesma armadilha do DECIMAL: normaliza para número antes de comparar ou somar. */
export const numero = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** CNPJ é público. CPF de pessoa física NUNCA — se aparecer, é mascarado. */
export function documentoPublico(doc: string | null): string {
  if (!doc) return '—';
  const so = doc.replace(/\D/g, '');
  if (so.length === 11) return `***.${so.slice(3, 6)}.${so.slice(6, 9)}-**`;
  return doc;
}

/** Tamanho de arquivo em português, arredondado para o que importa. */
export function tamanhoLegivel(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Extensão a partir do MIME, para dizer "PDF" e não "application/pdf". */
export function formatoLegivel(mime: string | null | undefined): string {
  if (!mime) return 'arquivo';
  const mapa: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.oasis.opendocument.text': 'ODT',
    'application/vnd.oasis.opendocument.spreadsheet': 'ODS',
    'text/csv': 'CSV',
  };
  return mapa[mime] ?? mime.split('/').pop()?.toUpperCase() ?? 'arquivo';
}
