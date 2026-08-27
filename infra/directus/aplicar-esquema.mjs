#!/usr/bin/env node
/**
 * Cria no Directus as coleções declaradas em esquema.json.
 *
 *   DIRECTUS_TOKEN=<token de admin> node aplicar-esquema.mjs
 *   DIRECTUS_EMAIL=<...> DIRECTUS_SENHA=<...> node aplicar-esquema.mjs
 *   ... --simular      mostra o que faria, sem escrever nada
 *
 * ESTADO: escrito, NÃO EXECUTADO. Depende de um administrador do Directus, que
 * por sua vez depende do e-mail institucional ainda não definido. Rodar com
 * --simular primeiro.
 *
 * É idempotente: o que já existe é pulado, então rodar duas vezes não duplica
 * campo nem apaga dado. Nunca remove nada — retirar campo é decisão manual,
 * porque leva o conteúdo junto.
 */
import { readFile } from 'node:fs/promises';

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const SIMULAR = process.argv.includes('--simular');

const esquema = JSON.parse(await readFile(new URL('./esquema.json', import.meta.url), 'utf8'));

/* ---------- autenticação ---------- */

async function obterToken() {
  if (process.env.DIRECTUS_TOKEN) return process.env.DIRECTUS_TOKEN;

  const email = process.env.DIRECTUS_EMAIL;
  const senha = process.env.DIRECTUS_SENHA;
  if (!email || !senha) {
    throw new Error(
      'Defina DIRECTUS_TOKEN, ou DIRECTUS_EMAIL e DIRECTUS_SENHA, de um administrador do Directus.',
    );
  }

  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  });
  if (!r.ok) throw new Error(`Falha no login: HTTP ${r.status} ${await r.text()}`);
  const corpo = await r.json();
  return corpo.data.access_token;
}

const token = SIMULAR && !process.env.DIRECTUS_TOKEN && !process.env.DIRECTUS_EMAIL
  ? null
  : await obterToken();

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opcoes.headers ?? {}),
    },
  });
  return r;
}

/* ---------- tradução do nosso formato para o do Directus ---------- */

const TIPO_INTERFACE = {
  string: 'input',
  text: 'input-multiline',
  integer: 'input',
  boolean: 'boolean',
  date: 'datetime',
  timestamp: 'datetime',
  uuid: 'file',
};

/** Campos que TODA coleção de conteúdo tem. O 'status' carrega o fluxo
 *  editorial exigido pela prefeitura; o portal só lê 'publicado'. */
function camposPadrao(situacoes) {
  return [
    {
      field: 'id',
      type: 'uuid',
      meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
      schema: { is_primary_key: true, length: 36, has_auto_increment: false },
    },
    {
      field: 'status',
      type: 'string',
      meta: {
        width: 'full',
        interface: 'select-dropdown',
        options: { choices: situacoes.map((s) => ({ text: s, value: s })) },
        display: 'labels',
        note: 'Somente "publicado" aparece no portal.',
      },
      schema: { default_value: 'rascunho', is_nullable: false },
    },
    {
      field: 'user_created',
      type: 'uuid',
      meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' },
      schema: {},
    },
    {
      field: 'date_created',
      type: 'timestamp',
      meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
      schema: {},
    },
    {
      field: 'user_updated',
      type: 'uuid',
      meta: { special: ['user-updated'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' },
      schema: {},
    },
    {
      field: 'date_updated',
      type: 'timestamp',
      meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
      schema: {},
    },
  ];
}

function traduzirCampo(campo) {
  // Relação vira campo uuid + entrada em /relations; tratada à parte.
  const tipo = campo.tipo === 'relacao' ? 'uuid' : campo.tipo;

  const meta = {
    interface: campo.interface ?? TIPO_INTERFACE[tipo] ?? 'input',
    required: Boolean(campo.obrigatorio),
    note: campo.nota ?? null,
    width: 'full',
  };

  if (campo.opcoes) {
    meta.interface = 'select-dropdown';
    meta.options = { choices: campo.opcoes.map((o) => ({ text: o, value: o })) };
  }
  if (campo.arquivo) meta.special = ['file'];

  const schema = {
    is_nullable: !campo.obrigatorio,
    is_unique: Boolean(campo.unico),
  };
  if (campo.padrao !== undefined) schema.default_value = campo.padrao;

  return { field: campo.campo, type: tipo, meta, schema };
}

/* ---------- aplicação ---------- */

let criadas = 0;
let puladas = 0;

for (const colecao of esquema.colecoes) {
  const existe = await api(`/collections/${colecao.nome}`);
  if (existe.ok) {
    console.log(`= ${colecao.nome}: já existe, pulando.`);
    puladas += 1;
    continue;
  }

  const corpo = {
    collection: colecao.nome,
    meta: {
      icon: colecao.icone,
      note: colecao.nota,
      display_template: `{{${colecao.campos[0].campo}}}`,
      archive_field: 'status',
      archive_value: 'arquivado',
      unarchive_value: 'rascunho',
      sort_field: null,
      translations: [
        {
          language: 'pt-BR',
          translation: colecao.rotulo.plural,
          singular: colecao.rotulo.singular,
          plural: colecao.rotulo.plural,
        },
      ],
    },
    schema: { name: colecao.nome },
    fields: [
      ...camposPadrao(esquema.situacoes),
      ...colecao.campos.map(traduzirCampo),
    ],
  };

  if (SIMULAR) {
    console.log(`+ ${colecao.nome}: criaria com ${corpo.fields.length} campos.`);
    criadas += 1;
    continue;
  }

  const r = await api('/collections', { method: 'POST', body: JSON.stringify(corpo) });
  if (!r.ok) {
    console.error(`! ${colecao.nome}: HTTP ${r.status} — ${await r.text()}`);
    process.exitCode = 1;
    continue;
  }
  console.log(`+ ${colecao.nome}: criada.`);
  criadas += 1;
}

/* Relações depois de todas as coleções existirem: 'noticias.secretaria' não
   pode apontar para uma tabela que ainda não foi criada. */
for (const colecao of esquema.colecoes) {
  for (const campo of colecao.campos.filter((c) => c.tipo === 'relacao')) {
    const corpo = {
      collection: colecao.nome,
      field: campo.campo,
      related_collection: campo.para,
      meta: { sort_field: null },
      // SET NULL, não CASCADE: apagar uma secretaria não pode apagar o
      // histórico de notícias dela.
      schema: { on_delete: 'SET NULL' },
    };

    if (SIMULAR) {
      console.log(`+ relação ${colecao.nome}.${campo.campo} -> ${campo.para}`);
      continue;
    }

    const r = await api('/relations', { method: 'POST', body: JSON.stringify(corpo) });
    if (r.ok) console.log(`+ relação ${colecao.nome}.${campo.campo} -> ${campo.para}`);
    else if (r.status === 400) console.log(`= relação ${colecao.nome}.${campo.campo}: já existe.`);
    else {
      console.error(`! relação ${colecao.nome}.${campo.campo}: HTTP ${r.status} — ${await r.text()}`);
      process.exitCode = 1;
    }
  }
}

console.log(`\n${criadas} coleção(ões) ${SIMULAR ? 'seriam criadas' : 'criadas'}, ${puladas} já existiam.`);
console.log(
  '\nFALTA FAZER NO PAINEL (não automatizado de propósito — permissões erradas vazam rascunho):\n' +
  '  Configurações > Políticas de acesso > Público: dar apenas LEITURA em\n' +
  '  noticias, secretarias, servicos, documentos, paginas, links_uteis e directus_files,\n' +
  '  cada uma com o filtro  status = publicado.',
);
