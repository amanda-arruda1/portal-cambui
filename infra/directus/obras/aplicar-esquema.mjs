#!/usr/bin/env node
/**
 * Cria no Directus as coleções do módulo de obras públicas.
 *
 *   DIRECTUS_EMAIL=<admin> DIRECTUS_SENHA=<...> node aplicar-esquema.mjs
 *   ... --simular
 *
 * Idempotente: o que já existe é pulado. NUNCA remove campo nem coleção —
 * mesma regra de infra/directus/licitacoes/aplicar-esquema.mjs, e pela mesma
 * razão: obra é registro que o TCE audita por anos depois de concluída.
 *
 * OS TRÊS CAMPOS QUE UMA AUDITORIA DE OBRA PÚBLICA PROCURA PRIMEIRO —
 * responsável técnico com ART/RRT, valor contratado × valor pago, e situação
 * atual — são obrigatórios ou centrais no modelo abaixo de propósito. Uma
 * obra sem ART é irregularidade típica; uma obra "em execução" sem nenhuma
 * medição há meses é o outro achado clássico, e é o que `obra_medicoes`
 * existe para tornar visível.
 */
import { CATEGORIAS, SITUACOES, FONTES_RECURSO, TIPOS_ANEXO } from './enums.mjs';

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const SIMULAR = process.argv.includes('--simular');

const opcoes = (lista) => ({ choices: lista.map((i) => ({ text: i.rotulo, value: i.valor })) });

/* ---------- definição das coleções ---------- */

const COLECOES = [
  {
    nome: 'obras',
    meta: { icon: 'construction', note: 'Obras públicas do município: contratação, execução e fiscalização.', display_template: '{{objeto_resumo}}', sort_field: 'data_publicacao' },
    campos: [
      /* — identificação e origem — */
      { campo: 'numero_processo', tipo: 'string', obrigatorio: true, nota: 'Processo administrativo. Ex.: 1014/2026' },
      { campo: 'numero_contrato', tipo: 'string', nota: 'Número do contrato ou instrumento equivalente.' },
      { campo: 'licitacao', tipo: 'relacao', para: 'licitacoes', nota: 'Licitação de origem, quando existir. Contratação direta fica sem vínculo.' },
      { campo: 'slug', tipo: 'string', obrigatorio: true, unico: true, nota: 'URL permanente: /obras/<slug>. Nunca mudar depois de publicada.' },
      { campo: 'categoria', tipo: 'string', obrigatorio: true, interface: 'select-dropdown', opcoes: opcoes(CATEGORIAS) },
      { campo: 'secretaria', tipo: 'relacao', para: 'secretarias', nota: 'Órgão responsável pela obra.' },

      /* — objeto e local — */
      { campo: 'objeto_resumo', tipo: 'text', obrigatorio: true, interface: 'input-multiline',
        nota: 'Uma linha para a listagem e a busca. Ex.: "Pavimentação asfáltica da Rua X, Bairro Y".' },
      { campo: 'objeto', tipo: 'text', interface: 'input-rich-text-html', nota: 'Descrição completa do objeto.' },
      { campo: 'endereco', tipo: 'string', nota: 'Logradouro, bairro ou referência — usado no link "ver no mapa".' },

      /* — execução e responsabilidade técnica — */
      { campo: 'empresa_executora', tipo: 'string', nota: 'Razão social da empresa contratada.' },
      { campo: 'empresa_cnpj', tipo: 'string', nota: 'CNPJ de pessoa jurídica é público.' },
      { campo: 'responsavel_tecnico', tipo: 'string', nota: 'Engenheiro(a) ou arquiteto(a) responsável pela obra.' },
      { campo: 'art_rrt', tipo: 'string', nota: 'Número da ART (engenharia) ou RRT (arquitetura) do responsável técnico. Obra sem ART/RRT é irregularidade típica de auditoria.' },

      /* — recursos e valores — */
      { campo: 'fonte_recurso', tipo: 'string', obrigatorio: true, interface: 'select-dropdown', opcoes: opcoes(FONTES_RECURSO) },
      { campo: 'numero_convenio', tipo: 'string', nota: 'Obrigatório quando a fonte é convênio estadual ou federal.' },
      { campo: 'valor_contratado', tipo: 'decimal', nota: 'Valor original do contrato, em reais.' },
      { campo: 'valor_aditivado', tipo: 'decimal', padrao: 0, nota: 'Soma de todos os termos aditivos de valor.' },
      { campo: 'valor_pago', tipo: 'decimal', padrao: 0, nota: 'Total pago até o momento. Deveria bater com a soma das medições (obra_medicoes).' },

      /* — prazos — */
      { campo: 'data_ordem_servico', tipo: 'timestamp', nota: 'Início efetivo da execução (ordem de serviço).' },
      { campo: 'data_prevista_termino', tipo: 'timestamp' },
      { campo: 'data_termino_real', tipo: 'timestamp', nota: 'Preenchido só quando a obra é concluída de fato.' },

      /* — situação — */
      { campo: 'situacao', tipo: 'string', obrigatorio: true, padrao: 'planejada', interface: 'select-dropdown', opcoes: opcoes(SITUACOES) },
      { campo: 'motivo_situacao', tipo: 'text', nota: 'Obrigatório quando paralisada ou cancelada — por quê, e desde quando.' },
      { campo: 'percentual_execucao', tipo: 'integer', padrao: 0, nota: 'Percentual físico executado (0 a 100), atualizado a cada medição.' },

      { campo: 'observacoes', tipo: 'text' },
      { campo: 'data_publicacao', tipo: 'timestamp', obrigatorio: true },
      { campo: 'demonstracao', tipo: 'boolean', padrao: false, nota: 'Registro de demonstração. Some com o script de remoção do seed.' },
    ],
  },

  {
    nome: 'obra_anexos',
    meta: { icon: 'attach_file', note: 'Documentos e fotos de cada obra.', display_template: '{{titulo}}', sort_field: 'ordem' },
    campos: [
      { campo: 'obra', tipo: 'relacao', para: 'obras', obrigatorio: true },
      { campo: 'titulo', tipo: 'string', obrigatorio: true },
      { campo: 'categoria', tipo: 'string', obrigatorio: true, interface: 'select-dropdown', opcoes: opcoes(TIPOS_ANEXO) },
      { campo: 'arquivo', tipo: 'uuid', interface: 'file', arquivo: true },
      { campo: 'data_referencia', tipo: 'timestamp', obrigatorio: true, nota: 'Data do documento ou da foto — não a data do upload.' },
      { campo: 'descricao', tipo: 'text', nota: 'Para foto: o que ela mostra ("vista da fachada, agosto/2026").' },
      { campo: 'ordem', tipo: 'integer' },
      { campo: 'demonstracao', tipo: 'boolean', padrao: false },
    ],
  },

  {
    nome: 'obra_medicoes',
    meta: { icon: 'payments', note: 'Execução financeira: boletim de medição a boletim de medição. É o que mostra se o dinheiro pago acompanha a obra executada.', display_template: 'Medição {{numero}}', sort_field: 'numero' },
    campos: [
      { campo: 'obra', tipo: 'relacao', para: 'obras', obrigatorio: true },
      { campo: 'numero', tipo: 'integer', obrigatorio: true, nota: 'Sequencial da medição (1ª, 2ª, 3ª…).' },
      { campo: 'data_referencia', tipo: 'timestamp', obrigatorio: true, nota: 'Mês ou período de referência da medição.' },
      { campo: 'percentual_acumulado', tipo: 'integer', nota: 'Percentual físico acumulado até esta medição (0 a 100).' },
      { campo: 'valor_medido', tipo: 'decimal', nota: 'Valor pago nesta medição.' },
      { campo: 'valor_acumulado', tipo: 'decimal', nota: 'Soma de todas as medições até esta.' },
      { campo: 'boletim', tipo: 'uuid', interface: 'file', arquivo: true, nota: 'PDF do boletim de medição, quando houver.' },
      { campo: 'observacoes', tipo: 'text' },
      { campo: 'demonstracao', tipo: 'boolean', padrao: false },
    ],
  },
];

/* ---------- tradução para o Directus ---------- */

const INTERFACE_POR_TIPO = {
  string: 'input', text: 'input-multiline', integer: 'input', decimal: 'input',
  boolean: 'boolean', timestamp: 'datetime', date: 'datetime', uuid: 'file',
};

function camposPadrao() {
  return [
    { field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
      schema: { is_primary_key: true, length: 36, has_auto_increment: false } },
    { field: 'status', type: 'string',
      meta: { width: 'full', interface: 'select-dropdown', display: 'labels',
        options: { choices: [{ text: 'rascunho', value: 'rascunho' }, { text: 'publicado', value: 'publicado' }, { text: 'arquivado', value: 'arquivado' }] },
        note: 'Visibilidade no portal. Só "publicado" aparece para o cidadão.' },
      schema: { default_value: 'rascunho', is_nullable: false } },
    { field: 'user_created', type: 'uuid', meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true }, schema: {} },
    { field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true }, schema: {} },
    { field: 'user_updated', type: 'uuid', meta: { special: ['user-updated'], interface: 'select-dropdown-m2o', readonly: true, hidden: true }, schema: {} },
    { field: 'date_updated', type: 'timestamp', meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true }, schema: {} },
  ];
}

function traduzir(c) {
  if (c.tipo === 'relacao') {
    return { field: c.campo, type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: c.nota, required: !!c.obrigatorio },
      schema: {} };
  }
  const tipo = c.tipo === 'decimal' ? 'decimal' : c.tipo;
  const schema = { is_nullable: !c.obrigatorio };
  if (c.padrao !== undefined) schema.default_value = c.padrao;
  if (c.unico) schema.is_unique = true;
  if (tipo === 'decimal') { schema.numeric_precision = 14; schema.numeric_scale = 2; }
  return {
    field: c.campo, type: tipo,
    meta: {
      interface: c.interface ?? INTERFACE_POR_TIPO[tipo] ?? 'input',
      options: c.opcoes,
      note: c.nota,
      required: !!c.obrigatorio,
      width: ['boolean', 'integer', 'timestamp', 'date', 'decimal'].includes(tipo) ? 'half' : 'full',
      ...(c.arquivo ? { special: ['file'] } : {}),
    },
    schema,
  };
}

/* ---------- execução ---------- */

if (SIMULAR) {
  console.log('\n=== SIMULAÇÃO ===\n');
  for (const c of COLECOES) {
    console.log(`${c.nome} (${c.campos.length + camposPadrao().length} campos)`);
    for (const f of c.campos) console.log(`   ${f.campo.padEnd(26)} ${f.tipo}${f.obrigatorio ? ' *' : ''}${f.para ? ' → ' + f.para : ''}`);
    console.log('');
  }
  process.exit(0);
}

async function obterToken() {
  if (process.env.DIRECTUS_TOKEN) return process.env.DIRECTUS_TOKEN;
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.DIRECTUS_EMAIL, password: process.env.DIRECTUS_SENHA }) });
  if (!r.ok) throw new Error(`Login: HTTP ${r.status} ${await r.text()}`);
  return (await r.json()).data.access_token;
}
const token = await obterToken();

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, { ...opcoes,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opcoes.headers ?? {}) } });
  if (!r.ok) {
    const texto = await r.text();
    throw new Error(`${opcoes.method ?? 'GET'} ${caminho} → ${r.status} ${texto.slice(0, 300)}`);
  }
  return r.status === 204 ? null : (await r.json()).data;
}

const existentes = new Set((await api('/collections')).map((c) => c.collection));

for (const c of COLECOES) {
  if (existentes.has(c.nome)) {
    console.log(`= coleção ${c.nome} já existe`);
  } else {
    console.log(`+ coleção ${c.nome}`);
    await api('/collections', { method: 'POST', body: JSON.stringify({ collection: c.nome, meta: c.meta, schema: {}, fields: camposPadrao() }) });
  }

  const jaTem = new Set((await api(`/fields/${c.nome}`)).map((f) => f.field));
  for (const campo of c.campos) {
    if (jaTem.has(campo.campo)) continue;
    console.log(`  + ${c.nome}.${campo.campo}`);
    await api(`/fields/${c.nome}`, { method: 'POST', body: JSON.stringify(traduzir(campo)) });
    if (campo.tipo === 'relacao') {
      await api('/relations', { method: 'POST', body: JSON.stringify({ collection: c.nome, field: campo.campo, related_collection: campo.para }) });
    }
    if (campo.arquivo) {
      await api('/relations', { method: 'POST', body: JSON.stringify({ collection: c.nome, field: campo.campo, related_collection: 'directus_files' }) });
    }
  }
}

console.log('\nEsquema de obras públicas aplicado.\n');
