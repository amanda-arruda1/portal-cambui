#!/usr/bin/env node
/**
 * Cria no Directus as coleções do módulo de licitações.
 *
 *   DIRECTUS_EMAIL=<admin> DIRECTUS_SENHA=<...> node aplicar-esquema.mjs
 *   ... --simular
 *
 * Idempotente: o que já existe é pulado. NUNCA remove campo nem coleção —
 * retirar campo de licitação leva o dado junto, e licitação é registro que a
 * Prefeitura precisa guardar por anos.
 */
import { MODALIDADES, CRITERIOS, MODOS_DISPUTA, SITUACOES, TIPOS_ANEXO, TIPOS_EVENTO, SITUACOES_LOTE } from './enums.mjs';

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const SIMULAR = process.argv.includes('--simular');

const opcoes = (lista) => ({ choices: lista.map((i) => ({ text: i.rotulo, value: i.valor })) });

/* ---------- definição das coleções ---------- */

const COLECOES = [
  {
    nome: 'licitacoes',
    meta: { icon: 'gavel', note: 'Licitações e contratações diretas do município.', display_template: '{{numero}}/{{ano}} — {{objeto_resumo}}', sort_field: 'data_sessao' },
    campos: [
      /* — identificação — */
      { campo: 'numero_processo', tipo: 'string', obrigatorio: true, unico: true, nota: 'Processo administrativo. Ex.: 1014/2026' },
      { campo: 'numero', tipo: 'integer', obrigatorio: true, nota: 'Número sequencial da licitação no ano.' },
      { campo: 'ano', tipo: 'integer', obrigatorio: true },
      { campo: 'slug', tipo: 'string', obrigatorio: true, unico: true, nota: 'URL permanente: /licitacoes/<ano>/<slug>. Nunca mudar depois de publicada — link de edital circula por anos no WhatsApp.' },
      { campo: 'modalidade', tipo: 'string', obrigatorio: true, interface: 'select-dropdown', opcoes: opcoes(MODALIDADES) },
      { campo: 'forma', tipo: 'string', obrigatorio: true, padrao: 'eletronica', interface: 'select-dropdown',
        opcoes: { choices: [{ text: 'Eletrônica', value: 'eletronica' }, { text: 'Presencial', value: 'presencial' }] } },
      { campo: 'justificativa_presencial', tipo: 'text', nota: 'OBRIGATÓRIA quando a forma é presencial — art. 17 §2º da Lei 14.133/2021.' },
      { campo: 'criterio_julgamento', tipo: 'string', obrigatorio: true, interface: 'select-dropdown', opcoes: opcoes(CRITERIOS) },
      { campo: 'modo_disputa', tipo: 'string', padrao: 'aberto', interface: 'select-dropdown', opcoes: opcoes(MODOS_DISPUTA) },
      { campo: 'registro_precos', tipo: 'boolean', padrao: false, nota: 'Sistema de Registro de Preços.' },
      { campo: 'secretaria', tipo: 'relacao', para: 'secretarias', nota: 'Órgão demandante.' },

      /* — objeto e valores — */
      /* TEXT, não VARCHAR(255). Objeto de edital real passa de 255 caracteres
         com frequência — "aquisição de X, em atendimento às unidades Y,
         mediante ordem de fornecimento…". Cortar em 255 obrigaria o servidor a
         resumir o objeto oficial, que é justamente o que não se pode fazer.
         Descoberto no seed, com o caso de objeto longo. */
      { campo: 'objeto_resumo', tipo: 'text', obrigatorio: true, interface: 'input-multiline',
        nota: 'Uma linha para a listagem e a busca. O ideal são ~200 caracteres, mas não há corte: objeto de edital é texto oficial.' },
      { campo: 'objeto', tipo: 'text', interface: 'input-rich-text-html', nota: 'Descrição completa do objeto.' },
      { campo: 'valor_estimado', tipo: 'decimal', nota: 'Em reais. Vazio quando não houver valor estimado divulgado.' },
      { campo: 'orcamento_sigiloso', tipo: 'boolean', padrao: false, nota: 'Oculta o valor no portal SEM apagar o dado — art. 24 da Lei 14.133/2021.' },

      /* — datas — */
      { campo: 'data_publicacao', tipo: 'timestamp', obrigatorio: true },
      { campo: 'data_abertura_propostas', tipo: 'timestamp' },
      { campo: 'data_sessao', tipo: 'timestamp', nota: 'Abertura da sessão pública. É a data que a contagem regressiva usa.' },
      { campo: 'prazo_impugnacao', tipo: 'timestamp', nota: 'Derivado da sessão, mas editável.' },
      { campo: 'prazo_esclarecimentos', tipo: 'timestamp', nota: 'Derivado da sessão, mas editável.' },

      /* — ciclo de vida — */
      { campo: 'situacao', tipo: 'string', obrigatorio: true, padrao: 'publicada', interface: 'select-dropdown', opcoes: opcoes(SITUACOES),
        nota: 'Estado do PROCESSO. Diferente de "status", que é a visibilidade no portal.' },
      { campo: 'motivo_situacao', tipo: 'text', nota: 'Por que foi suspensa, revogada, anulada. Aparece em destaque no portal.' },

      /* — PNCP — */
      { campo: 'pncp_id', tipo: 'string', nota: 'numeroControlePNCP. Ex.: 18675983000121-1-000032/2026' },
      { campo: 'pncp_url', tipo: 'string', nota: 'Link canônico do registro no PNCP.' },
      { campo: 'sistema_sessao_url', tipo: 'string', nota: 'Onde a sessão eletrônica acontece (Compras.gov.br, BLL, BNC…).' },

      /* — controle — */
      { campo: 'demonstracao', tipo: 'boolean', padrao: false, nota: 'Registro de demonstração. Some com o script de remoção do seed.' },
    ],
  },

  {
    nome: 'licitacao_anexos',
    meta: { icon: 'attach_file', note: 'Documentos de cada licitação. Versionados: nada é sobrescrito.', display_template: '{{titulo}}', sort_field: 'ordem' },
    campos: [
      { campo: 'licitacao', tipo: 'relacao', para: 'licitacoes', obrigatorio: true },
      { campo: 'titulo', tipo: 'string', obrigatorio: true },
      { campo: 'tipo', tipo: 'string', obrigatorio: true, interface: 'select-dropdown', opcoes: opcoes(TIPOS_ANEXO) },
      { campo: 'arquivo', tipo: 'uuid', interface: 'file', arquivo: true },
      { campo: 'url_externa', tipo: 'string', nota: 'Quando o documento vive em sistema de terceiro.' },
      { campo: 'data_publicacao', tipo: 'timestamp', obrigatorio: true },
      { campo: 'versao', tipo: 'integer', padrao: 1 },
      { campo: 'substitui', tipo: 'relacao', para: 'licitacao_anexos', nota: 'Documento que esta versão substitui.' },
      { campo: 'superado', tipo: 'boolean', padrao: false, nota: 'Continua visível como histórico, marcado como superado. NUNCA some.' },
      { campo: 'ordem', tipo: 'integer' },
      { campo: 'demonstracao', tipo: 'boolean', padrao: false },
    ],
  },

  {
    nome: 'licitacao_lotes',
    meta: { icon: 'view_list', note: 'Lotes ou itens, com o vencedor de cada um.', display_template: 'Lote {{numero}} — {{descricao}}', sort_field: 'numero' },
    campos: [
      { campo: 'licitacao', tipo: 'relacao', para: 'licitacoes', obrigatorio: true },
      { campo: 'numero', tipo: 'integer', obrigatorio: true },
      { campo: 'descricao', tipo: 'string', obrigatorio: true },
      { campo: 'valor_estimado', tipo: 'decimal' },
      { campo: 'situacao', tipo: 'string', padrao: 'em_disputa', interface: 'select-dropdown', opcoes: opcoes(SITUACOES_LOTE) },
      { campo: 'vencedor_razao_social', tipo: 'string' },
      { campo: 'vencedor_cnpj', tipo: 'string', nota: 'CNPJ de pessoa jurídica é público. CPF de pessoa física NUNCA entra aqui sem máscara.' },
      { campo: 'valor_homologado', tipo: 'decimal' },
      { campo: 'demonstracao', tipo: 'boolean', padrao: false },
    ],
  },

  {
    nome: 'licitacao_eventos',
    meta: { icon: 'timeline', note: 'Linha do tempo do processo. A ordem carrega informação.', display_template: '{{data}} — {{tipo}}', sort_field: 'data' },
    campos: [
      { campo: 'licitacao', tipo: 'relacao', para: 'licitacoes', obrigatorio: true },
      { campo: 'data', tipo: 'timestamp', obrigatorio: true },
      { campo: 'tipo', tipo: 'string', obrigatorio: true, interface: 'select-dropdown', opcoes: opcoes(TIPOS_EVENTO) },
      { campo: 'descricao', tipo: 'text' },
      { campo: 'anexo', tipo: 'relacao', para: 'licitacao_anexos' },
      { campo: 'demonstracao', tipo: 'boolean', padrao: false },
    ],
  },

  {
    nome: 'licitacao_assinantes',
    meta: { icon: 'mark_email_unread', note: 'Aviso de novas licitações por e-mail. Base mínima: só e-mail e preferências.', display_template: '{{email}}' },
    campos: [
      /* LGPD: a base é deliberadamente MÍNIMA. Nada de nome, telefone, CNPJ ou
         qualquer coisa que permita perfilar. Só o que o serviço exige. */
      { campo: 'email', tipo: 'string', obrigatorio: true, unico: true },
      { campo: 'modalidades', tipo: 'text', nota: 'Valores separados por vírgula. Vazio = todas.' },
      { campo: 'palavras_chave', tipo: 'text', nota: 'Separadas por vírgula. Vazio = todas.' },
      { campo: 'confirmado', tipo: 'boolean', padrao: false, nota: 'Duplo opt-in: só recebe depois de confirmar pelo link do e-mail.' },
      { campo: 'token', tipo: 'string', nota: 'Confirmação e descadastro em um clique.' },
      { campo: 'criado_em', tipo: 'timestamp' },
      { campo: 'confirmado_em', tipo: 'timestamp' },
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
    /* Auditoria: quem criou, quem alterou, quando. O Directus ainda mantém
       directus_revisions com o DIFF de cada alteração — é o log imutável que
       responde "quem mexeu na data", e não vale a pena reconstruir. */
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

console.log('\nEsquema de licitações aplicado.\n');
