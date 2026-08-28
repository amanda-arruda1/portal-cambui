/**
 * Fluxo editorial do Diário Oficial, no painel.
 *
 * SEGREGAÇÃO DE FUNÇÕES. Quem escreve não publica; quem publica não assina.
 * As permissões de verdade estão no Directus (infra/directus/diario/
 * aplicar-permissoes.mjs) e a imutabilidade está no banco; o que existe aqui é
 * a camada que evita mostrar botão que vai dar erro — e que roda as validações
 * que o CMS não consegue expressar.
 *
 * Tela NÃO é controle de acesso. Nunca inverter essa ordem.
 */
import type { Sessao } from './sessao.ts';
import { rastrearSensiveis, paraSlug, textoDe, publicacaoLegal, ehDiaUtil, dataBr, comoDia } from '../diario/dominio.mjs';
import { rotuloTipoAto, TIPOS_ATO } from '../diario/vocabulario';

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const TEMPO_LIMITE_MS = 10_000;

export type Saida<T> = { ok: true; dados: T } | { ok: false; status: number; motivo: string };

async function chamar<T>(sessao: Sessao, caminho: string, opcoes: RequestInit = {}): Promise<Saida<T>> {
  try {
    const r = await fetch(`${BASE}${caminho}`, {
      ...opcoes,
      headers: {
        Authorization: `Bearer ${sessao.acesso}`,
        ...(opcoes.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(opcoes.headers ?? {}),
      },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (r.status === 401) return { ok: false, status: 401, motivo: 'Sua sessão expirou. Entre novamente.' };
    if (r.status === 403) return { ok: false, status: 403, motivo: 'Sua função no portal não permite esta operação.' };
    if (r.status === 404) return { ok: false, status: 404, motivo: 'Este item não existe mais ou está fora do seu alcance.' };
    if (!r.ok) {
      const corpo = await r.json().catch(() => ({}) as any);
      const e = corpo?.errors?.[0];
      /* O gatilho de imutabilidade do banco chega aqui. A mensagem dele já é
       * escrita para humano — repassá-la é melhor do que traduzi-la para
       * "erro interno". */
      const bruto = String(e?.message ?? '');
      if (/imutáve|publicada|não pode ser removida/i.test(bruto)) {
        return { ok: false, status: 409, motivo: bruto };
      }
      return { ok: false, status: r.status, motivo: bruto || `O sistema respondeu ${r.status}.` };
    }
    if (r.status === 204) return { ok: true, dados: undefined as T };
    return { ok: true, dados: (await r.json()).data as T };
  } catch {
    return { ok: false, status: 503, motivo: 'O sistema de publicações não respondeu.' };
  }
}

/* ─────────────────────────────── papéis ────────────────────────────────── */

export type PapelDiario = 'redator' | 'editor' | 'signataria' | 'administrador' | 'nenhum';

export function papelDiario(sessao: Sessao): PapelDiario {
  const p = sessao.usuario.papel ?? '';
  /* O Administrator do Directus ignora permissão de linha por definição —
   * esconder botão dele não protegeria nada e impediria a TI de operar o
   * módulo antes de os papéis serem distribuídos. */
  if (p === 'Administrator') return 'administrador';
  if (p === 'Diário — Redator setorial') return 'redator';
  if (p === 'Diário — Editor') return 'editor';
  if (p === 'Diário — Autoridade signatária') return 'signataria';
  if (p === 'Diário — Administrador') return 'administrador';
  return 'nenhum';
}

export type AcaoDiario =
  | 'redigir' | 'enviar' | 'revisar' | 'devolver' | 'aprovar'
  | 'montar_pauta' | 'fechar' | 'reabrir' | 'assinar' | 'publicar' | 'anular' | 'configurar';

const PODE: Record<PapelDiario, AcaoDiario[]> = {
  redator: ['redigir', 'enviar'],
  editor: ['redigir', 'enviar', 'revisar', 'devolver', 'aprovar', 'montar_pauta', 'fechar', 'reabrir'],
  signataria: ['assinar', 'publicar'],
  /* O administrador configura e audita. NÃO assina: assinatura tem nome, e o
   * nome tem de ser o da autoridade, não o do administrador do sistema. */
  administrador: ['redigir', 'enviar', 'revisar', 'devolver', 'aprovar', 'montar_pauta',
    'fechar', 'reabrir', 'publicar', 'anular', 'configurar'],
  nenhum: [],
};

export const pode = (sessao: Sessao, acao: AcaoDiario): boolean =>
  PODE[papelDiario(sessao)].includes(acao);

/**
 * Ninguém aprova o próprio texto. É a regra que o Directus não consegue
 * expressar como permissão de linha, porque depende de comparar o autor do item
 * com quem está pedindo. O autor vem do CMS, nunca do formulário — forjar um
 * campo escondido já foi ataque real neste portal.
 */
export function conflitoDeInteresse(sessao: Sessao, autor: string | null, acao: AcaoDiario): boolean {
  if (acao !== 'aprovar' && acao !== 'publicar') return false;
  if (papelDiario(sessao) === 'administrador') return false;
  return Boolean(autor) && autor === sessao.usuario.id;
}

/* ───────────────────────────── validações ──────────────────────────────── */

export interface Problema {
  campo: string;
  gravidade: 'impede' | 'confirma' | 'avisa';
  texto: string;
  conselho?: string;
}

export interface DadosMateria {
  caderno: string; secretaria: string | null; orgao_texto: string | null;
  tipo_ato: string; numero_ato: string | null; ano_ato: number | null;
  ementa: string; corpo: string;
  processo_administrativo: string | null;
  data_alvo: string | null; vigencia_inicio: string | null;
  retifica: string | null; republica: string | null; revoga: string | null;
  motivo_republicacao: string | null;
}

/**
 * Validações que existem porque o erro delas não se conserta depois.
 * Três gravidades, e a diferença importa:
 *   impede   — não deixa seguir. Vício certo.
 *   confirma — deixa seguir, mas exige um "sim, é isso mesmo" consciente.
 *   avisa    — informa e não atrapalha.
 */
export function validarMateria(d: DadosMateria, contexto: { dataPublicacao?: string } = {}): Problema[] {
  const p: Problema[] = [];

  if (!d.ementa?.trim()) {
    p.push({ campo: 'ementa', gravidade: 'impede', texto: 'A ementa é obrigatória.',
      conselho: 'É ela que aparece no sumário, na listagem e na busca — sem ementa, ninguém acha o ato.' });
  } else if (textoDe(d.ementa).length > 400) {
    p.push({ campo: 'ementa', gravidade: 'avisa', texto: 'A ementa está longa para um sumário.',
      conselho: 'Ementas acima de ~250 caracteres quebram a leitura do sumário no celular.' });
  }

  if (!d.corpo?.trim() || textoDe(d.corpo).length < 20) {
    p.push({ campo: 'corpo', gravidade: 'impede', texto: 'O texto do ato está vazio.' });
  }
  if (!d.caderno) p.push({ campo: 'caderno', gravidade: 'impede', texto: 'Escolha o caderno.' });
  if (!d.secretaria && !d.orgao_texto?.trim()) {
    p.push({ campo: 'secretaria', gravidade: 'impede', texto: 'Informe o órgão de origem.' });
  }

  const grupo = TIPOS_ATO.find((t) => t.valor === d.tipo_ato)?.grupo;

  /* Aviso de licitação sem processo: o tribunal de contas cruza publicação com
   * processo administrativo, e a falta é achado de auditoria. */
  if (grupo === 'licitacao' && !d.processo_administrativo?.trim()) {
    p.push({ campo: 'processo_administrativo', gravidade: 'confirma',
      texto: 'Ato de licitação sem número de processo administrativo.',
      conselho: 'O controle externo cruza a publicação com o processo. Confirme se realmente não há número.' });
  }

  /* Vigência anterior à publicação = efeito retroativo. Existe e é legítimo em
   * certos atos, mas nunca por descuido. */
  if (d.vigencia_inicio && contexto.dataPublicacao) {
    if (comoDia(d.vigencia_inicio) < comoDia(contexto.dataPublicacao)) {
      p.push({ campo: 'vigencia_inicio', gravidade: 'confirma',
        texto: `A vigência começa em ${dataBr(d.vigencia_inicio)}, antes da publicação em ${dataBr(contexto.dataPublicacao)}.`,
        conselho: 'Isso dá efeito retroativo ao ato. É possível, mas precisa ser deliberado — e o ato deve dizê-lo expressamente.' });
    }
  }

  if ((d.tipo_ato === 'errata' && !d.retifica) || (d.tipo_ato === 'republicacao' && !d.republica)) {
    p.push({ campo: 'retifica', gravidade: 'impede',
      texto: `Toda ${d.tipo_ato === 'errata' ? 'errata' : 'republicação'} precisa apontar a matéria que corrige.`,
      conselho: 'Sem a remissão, o leitor da matéria original nunca fica sabendo que ela foi corrigida.' });
  }
  if (d.tipo_ato === 'republicacao' && !d.motivo_republicacao?.trim()) {
    p.push({ campo: 'motivo_republicacao', gravidade: 'confirma',
      texto: 'Republicação sem motivo declarado.' });
  }

  /* LGPD antes da publicação — porque depois não há desfazer. */
  for (const achado of rastrearSensiveis(`${d.ementa} ${d.corpo}`)) {
    p.push({
      campo: 'corpo', gravidade: achado.chave === 'cpf_completo' ? 'confirma' : 'avisa',
      texto: `${achado.rotulo}: ${achado.quantidade} ocorrência(s), a começar por "${achado.exemplo}".`,
      conselho: achado.conselho,
    });
  }

  return p;
}

export interface DadosEdicao {
  numero: number; ano: number; tipo: string;
  data_disponibilizacao: string; data_publicacao_legal: string;
  justificativa_extraordinaria: string | null;
}

/** Validações do fechamento. É a última porta antes do irreversível. */
export function validarFechamento(
  e: DadosEdicao,
  contexto: { quantasMaterias: number; ultimoNumero: number | null; diasCirculacao: number[] },
): Problema[] {
  const p: Problema[] = [];

  if (contexto.quantasMaterias === 0) {
    p.push({ campo: 'materias', gravidade: 'impede', texto: 'Edição sem matérias não fecha.',
      conselho: 'Uma edição vazia publicada é um defeito que não se conserta: ela não pode ser apagada nem alterada.' });
  }

  /* Sequência sem lacuna é a primeira coisa que um auditor confere. */
  if (contexto.ultimoNumero !== null && e.numero !== contexto.ultimoNumero + 1) {
    p.push({
      campo: 'numero', gravidade: e.numero <= contexto.ultimoNumero ? 'impede' : 'confirma',
      texto: e.numero <= contexto.ultimoNumero
        ? `O número ${e.numero} já foi usado ou é anterior à última edição (${contexto.ultimoNumero}).`
        : `Pulou de ${contexto.ultimoNumero} para ${e.numero}: ficariam ${e.numero - contexto.ultimoNumero - 1} número(s) sem edição.`,
      conselho: 'A numeração do veículo é contínua e não se reaproveita. Lacuna na sequência é achado de auditoria.',
    });
  }

  const dia = comoDia(e.data_disponibilizacao);
  const previsto = contexto.diasCirculacao.includes(dia.getUTCDay()) && ehDiaUtil(dia);
  if (!previsto && e.tipo === 'ordinaria') {
    p.push({ campo: 'tipo', gravidade: 'impede',
      texto: `${dataBr(dia)} não é dia de circulação previsto na lei do veículo.`,
      conselho: 'Para circular fora do calendário, marque a edição como EXTRAORDINÁRIA e registre a justificativa.' });
  }
  if (e.tipo === 'extraordinaria' && !e.justificativa_extraordinaria?.trim()) {
    p.push({ campo: 'justificativa_extraordinaria', gravidade: 'impede',
      texto: 'Edição extraordinária exige justificativa.',
      conselho: 'Ela vai impressa na capa e é o que responde, anos depois, por que aquela edição circulou fora do calendário.' });
  }

  const legal = publicacaoLegal(e.data_disponibilizacao, 'primeiro_dia_util_seguinte');
  if (legal.toISOString().slice(0, 10) !== String(e.data_publicacao_legal).slice(0, 10)) {
    p.push({ campo: 'data_publicacao_legal', gravidade: 'confirma',
      texto: `A data de publicação legal informada (${dataBr(e.data_publicacao_legal)}) difere da calculada pela regra do veículo (${dataBr(legal)}).`,
      conselho: 'A regra do veículo é a da lei municipal. Alterar à mão muda a contagem de prazo de todos os atos desta edição.' });
  }

  return p;
}

export const impedimentos = (p: Problema[]) => p.filter((x) => x.gravidade === 'impede');
export const confirmacoes = (p: Problema[]) => p.filter((x) => x.gravidade === 'confirma');

/* ───────────────────────── operações no CMS ────────────────────────────── */

export interface MateriaPainel {
  id: string; tipo_ato: string; numero_ato: string | null; ano_ato: number | null;
  ementa: string; situacao: string; caderno: string | null; edicao: string | null;
  ordem: number | null; data_alvo: string | null; user_created: string | null;
  date_updated: string | null; secretaria: { nome: string } | null; orgao_texto: string | null;
}

const CAMPOS_MATERIA = 'id,tipo_ato,numero_ato,ano_ato,ementa,situacao,caderno,edicao,ordem,data_alvo,user_created,date_updated,secretaria.nome,orgao_texto';

export async function filaDeMaterias(sessao: Sessao, filtro: Record<string, string> = {}): Promise<Saida<MateriaPainel[]>> {
  const p = new URLSearchParams({ limit: '300', sort: 'situacao,-date_updated', fields: CAMPOS_MATERIA, ...filtro });
  return chamar<MateriaPainel[]>(sessao, `/items/diario_materias?${p}`);
}

export async function obterMateria(sessao: Sessao, id: string): Promise<Saida<any>> {
  return chamar(sessao, `/items/diario_materias/${id}?fields=*,secretaria.nome,secretaria.id`);
}

export async function criarMateria(sessao: Sessao, dados: Record<string, unknown>): Promise<Saida<{ id: string }>> {
  return chamar(sessao, '/items/diario_materias', { method: 'POST', body: JSON.stringify(dados) });
}

export async function atualizarMateria(sessao: Sessao, id: string, dados: Record<string, unknown>): Promise<Saida<any>> {
  return chamar(sessao, `/items/diario_materias/${id}`, { method: 'PATCH', body: JSON.stringify(dados) });
}

/**
 * Devolver EXIGE motivo, e o motivo vira registro permanente. Devolução sem
 * explicação só produz o mesmo texto reenviado com o mesmo problema.
 */
export async function devolver(sessao: Sessao, id: string, motivo: string): Promise<Saida<unknown>> {
  if (!motivo.trim()) return { ok: false, status: 422, motivo: 'Diga o que precisa ser corrigido — a secretaria vai ler isto.' };
  const r = await chamar(sessao, '/items/diario_devolucoes', {
    method: 'POST',
    body: JSON.stringify({
      materia: id, motivo: motivo.trim(), devolvida_em: new Date().toISOString(),
      devolvida_por_nome: sessao.usuario.nome,
    }),
  });
  if (!r.ok) return r;
  return atualizarMateria(sessao, id, { situacao: 'devolvida' });
}

/** Aprovar, com a checagem de conflito lida do CMS — nunca do formulário. */
export async function aprovar(sessao: Sessao, id: string): Promise<Saida<unknown>> {
  const atual = await chamar<{ user_created: string | null; situacao: string }>(
    sessao, `/items/diario_materias/${id}?fields=user_created,situacao`);
  if (!atual.ok) return atual;
  if (conflitoDeInteresse(sessao, atual.dados.user_created, 'aprovar')) {
    return { ok: false, status: 409,
      motivo: 'Você redigiu esta matéria. Quem escreve não aprova o próprio texto — peça a outro editor.' };
  }
  return atualizarMateria(sessao, id, { situacao: 'aprovada' });
}

export async function registrarAuditoria(
  sessao: Sessao, acao: string, dados: { edicao?: string; materia?: string; detalhe: string },
): Promise<void> {
  await chamar(sessao, '/items/diario_auditoria', {
    method: 'POST',
    body: JSON.stringify({
      acao, quando: new Date().toISOString(),
      quem_nome: sessao.usuario.nome, quem_papel: sessao.usuario.papel,
      edicao: dados.edicao ?? null, materia: dados.materia ?? null, detalhe: dados.detalhe,
    }),
  });
}

/* ───────────────────────────── edições ─────────────────────────────────── */

export async function listarEdicoes(sessao: Sessao, filtro: Record<string, string> = {}): Promise<Saida<any[]>> {
  const p = new URLSearchParams({
    limit: '100', sort: '-numero',
    fields: 'id,numero,ano,volume,tipo,situacao,data_disponibilizacao,data_publicacao_legal,total_paginas,anulada,codigo_verificador,sha256,arquivo_pdf,justificativa_extraordinaria,reaberturas',
    ...filtro,
  });
  return chamar<any[]>(sessao, `/items/diario_edicoes?${p}`);
}

export async function obterEdicao(sessao: Sessao, id: string): Promise<Saida<any>> {
  return chamar(sessao, `/items/diario_edicoes/${id}`);
}

export async function criarEdicao(sessao: Sessao, dados: Record<string, unknown>): Promise<Saida<{ id: string }>> {
  return chamar(sessao, '/items/diario_edicoes', { method: 'POST', body: JSON.stringify(dados) });
}

export async function atualizarEdicao(sessao: Sessao, id: string, dados: Record<string, unknown>): Promise<Saida<any>> {
  return chamar(sessao, `/items/diario_edicoes/${id}`, { method: 'PATCH', body: JSON.stringify(dados) });
}

/** Reordenar a pauta em uma requisição só. */
export async function reordenarPauta(sessao: Sessao, ordem: Array<{ id: string; ordem: number }>): Promise<Saida<unknown>> {
  return chamar(sessao, '/items/diario_materias', { method: 'PATCH', body: JSON.stringify(ordem) });
}

export async function cadernos(sessao: Sessao): Promise<Saida<any[]>> {
  return chamar<any[]>(sessao, '/items/diario_cadernos?limit=-1&sort=ordem&fields=id,slug,nome,ordem,dados_pessoais');
}

export async function veiculo(sessao: Sessao): Promise<Saida<any>> {
  return chamar(sessao, '/items/diario_veiculo');
}

export async function secretarias(sessao: Sessao): Promise<Saida<any[]>> {
  return chamar<any[]>(sessao, '/items/secretarias?limit=-1&sort=nome&fields=id,nome,slug');
}

/* ───────────────────────── modelos de ato ──────────────────────────────── */

/**
 * Estrutura pré-formatada por tipo de ato.
 *
 * É o que faz o servidor da secretaria acertar sem treinamento — e é o que
 * padroniza a forma do diário sem depender de alguém lembrar do padrão. O
 * texto entre colchetes é o que ele troca.
 */
export const MODELOS: Record<string, { ementa: string; corpo: string; dica: string }> = {
  portaria: {
    ementa: '[Verbo no presente: Designa / Institui / Autoriza…] […]',
    corpo: `<p>A Prefeita Municipal de Cambuí, Estado de Minas Gerais, no uso das atribuições que lhe confere a Lei Orgânica do Município, <strong>RESOLVE</strong>:</p>
<p><strong>Art. 1º</strong> [o que se determina].</p>
<p><strong>Art. 2º</strong> [prazo, responsável ou condição, se houver].</p>
<p><strong>Art. 3º</strong> Esta Portaria entra em vigor na data de sua publicação, revogadas as disposições em contrário.</p>`,
    dica: 'A ementa começa com verbo no presente e resume o ato inteiro em uma linha.',
  },
  decreto: {
    ementa: '[Dispõe sobre / Regulamenta / Declara] […]',
    corpo: `<p>A <strong>PREFEITA MUNICIPAL DE CAMBUÍ</strong>, Estado de Minas Gerais, no uso das atribuições que lhe confere o art. 71 da Lei Orgânica do Município,</p>
<p><strong>DECRETA:</strong></p>
<p><strong>Art. 1º</strong> [o que se decreta].</p>
<p><strong>Art. 2º</strong> [providências].</p>
<p><strong>Art. 3º</strong> Este Decreto entra em vigor na data de sua publicação.</p>`,
    dica: 'Decreto regulamenta lei ou dispõe sobre a administração. Se cria obrigação nova para o cidadão, provavelmente é caso de lei.',
  },
  ato_de_pessoal: {
    ementa: '[Nomeia / Exonera / Concede licença a] [NOME] [para o cargo de / do cargo de] […]',
    corpo: `<p>A Prefeita Municipal de Cambuí, no uso de suas atribuições legais, <strong>RESOLVE</strong>:</p>
<p><strong>Art. 1º</strong> Fica [nomeado(a)/exonerado(a)] <strong>[NOME COMPLETO]</strong>, portador(a) do CPF nº ***.[XXX].[XXX]-**, [para exercer o cargo de / do cargo de] <strong>[CARGO]</strong>, [de provimento efetivo, em virtude de aprovação em concurso público / de provimento em comissão], lotado(a) na [SECRETARIA].</p>
<p><strong>Art. 2º</strong> Este ato entra em vigor na data de sua publicação.</p>`,
    dica: 'O CPF vai MASCARADO: ***.456.789-**. Publicidade legal autoriza publicar o ato, não expor o documento inteiro de quem é objeto dele.',
  },
  aviso_de_licitacao: {
    ementa: '[Modalidade] nº [NN]/[AAAA] — [objeto resumido].',
    corpo: `<p>O <strong>Município de Cambuí/MG</strong> torna público que fará realizar licitação na modalidade <strong>[MODALIDADE]</strong>, do tipo [menor preço / maior desconto], para [objeto].</p>
<table><tbody>
<tr><th>Processo administrativo</th><td>[NNNN]/[AAAA]</td></tr>
<tr><th>Valor estimado</th><td>R$ [0,00]</td></tr>
<tr><th>Abertura das propostas</th><td>[DD/MM/AAAA], às [HH]h[MM]</td></tr>
<tr><th>Local</th><td>[sistema/endereço]</td></tr>
</tbody></table>
<p>O edital e seus anexos estão à disposição no sítio oficial do Município e no Portal Nacional de Contratações Públicas (PNCP), nos termos da Lei Federal nº 14.133/2021.</p>`,
    dica: 'Se a licitação já está cadastrada no módulo de Licitações, use "Importar do módulo" em vez deste modelo — os dados vêm prontos e os dois módulos ficam ligados.',
  },
  extrato_de_contrato: {
    ementa: 'Extrato do Contrato nº [NN]/[AAAA] — [CONTRATADA].',
    corpo: `<table><tbody>
<tr><th>Instrumento</th><td>Contrato nº [NN]/[AAAA]</td></tr>
<tr><th>Contratante</th><td>Município de Cambuí/MG</td></tr>
<tr><th>Contratada</th><td>[RAZÃO SOCIAL] — CNPJ [00.000.000/0001-00]</td></tr>
<tr><th>Objeto</th><td>[objeto]</td></tr>
<tr><th>Valor</th><td>R$ [0,00]</td></tr>
<tr><th>Vigência</th><td>[NN] meses, contados da assinatura</td></tr>
<tr><th>Dotação orçamentária</th><td>[classificação]</td></tr>
<tr><th>Fundamento legal</th><td>Lei Federal nº 14.133/2021</td></tr>
</tbody></table>
<p>Data da assinatura: [DD/MM/AAAA].</p>`,
    dica: 'CNPJ de pessoa jurídica é público e vai inteiro. CPF de pessoa física, não.',
  },
  errata: {
    ementa: 'Errata à [ATO], publicada na Edição nº [NN].',
    corpo: `<p>Na publicação da <strong>[ATO]</strong>, veiculada na Edição nº [NN] deste Diário Oficial, de [DD/MM/AAAA],</p>
<p><strong>ONDE SE LÊ:</strong> "[texto publicado]";</p>
<p><strong>LEIA-SE:</strong> "[texto correto]".</p>
<p>Ficam ratificados os demais termos do ato retificado.</p>`,
    dica: 'Não esqueça de apontar a matéria original no campo "Retifica" — é o que cria a remissão nos dois sentidos.',
  },
};

export const modeloDe = (tipo: string) => MODELOS[tipo] ?? null;

/** Sugere o slug a partir do ato. Nunca muda depois de publicado. */
export function sugerirSlug(d: { tipo_ato: string; numero_ato: string | null; ano_ato: number | null; ementa: string }): string {
  const base = `${rotuloTipoAto(d.tipo_ato)}-${d.numero_ato ?? ''}-${d.ano_ato ?? ''}-${textoDe(d.ementa).slice(0, 45)}`;
  return paraSlug(base);
}
