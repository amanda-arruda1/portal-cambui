/**
 * Máquina de aplicar esquema no Directus, compartilhada pelos módulos.
 *
 * Extraída de infra/directus/licitacoes/aplicar-esquema.mjs, que continua com
 * a sua cópia: é código no ar, e reescrevê-lo para ganhar elegância trocaria
 * risco real por benefício estético. TODO: convergir os dois na próxima vez
 * que licitações precisar de campo novo.
 *
 * REGRA: nunca remove campo nem coleção. Retirar campo leva o dado junto, e
 * dado de diário oficial é acervo permanente por definição legal.
 */

export const INTERFACE_POR_TIPO = {
  string: 'input', text: 'input-multiline', integer: 'input', decimal: 'input',
  boolean: 'boolean', timestamp: 'datetime', date: 'datetime', json: 'input-code',
};

export const opcoes = (lista) => ({ choices: lista.map((i) => ({ text: i.rotulo, value: i.valor })) });

export function camposPadrao({ comStatus = true } = {}) {
  return [
    { field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
      schema: { is_primary_key: true, length: 36, has_auto_increment: false } },
    ...(comStatus ? [{
      field: 'status', type: 'string',
      meta: { width: 'full', interface: 'select-dropdown', display: 'labels',
        options: { choices: [{ text: 'rascunho', value: 'rascunho' }, { text: 'publicado', value: 'publicado' }, { text: 'arquivado', value: 'arquivado' }] },
        note: 'Visibilidade no portal. Só "publicado" aparece para o cidadão.' },
      schema: { default_value: 'rascunho', is_nullable: false },
    }] : []),
    { field: 'user_created', type: 'uuid', meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true }, schema: {} },
    { field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true }, schema: {} },
    { field: 'user_updated', type: 'uuid', meta: { special: ['user-updated'], interface: 'select-dropdown-m2o', readonly: true, hidden: true }, schema: {} },
    { field: 'date_updated', type: 'timestamp', meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true }, schema: {} },
  ];
}

/* PEGADINHA já paga em 2026-09-02 (indicadores_economicos): o tipo 'json' do
 * Directus cria coluna Postgres `json`, não `jsonb`. `json` puro não tem
 * operador de ordenação — e o Directus, com uma política restrita (não
 * admin), monta um ORDER BY implícito na primeira consulta e o Postgres
 * recusa com "could not identify an ordering operator for type json"
 * (erro 42883), 500 sem mensagem clara pro chamador. Corrigido A POSTERIORI
 * com `ALTER TABLE ... ALTER COLUMN ... TYPE jsonb USING ...::jsonb`, direto
 * no banco — a API de criação de campo do Directus não expõe como pedir
 * jsonb na hora de criar. Campo 'json' NOVO com política não-admin: alterar
 * a coluna pra jsonb depois de aplicar o esquema, antes de testar com o
 * token de serviço. */
export function traduzir(c) {
  if (c.tipo === 'relacao') {
    return { field: c.campo, type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: c.nota, required: !!c.obrigatorio }, schema: {} };
  }
  if (c.tipo === 'arquivo') {
    return { field: c.campo, type: 'uuid',
      meta: { interface: 'file', special: ['file'], note: c.nota, required: !!c.obrigatorio }, schema: {} };
  }
  const tipo = c.tipo;
  const schema = { is_nullable: !c.obrigatorio };
  if (c.padrao !== undefined) schema.default_value = c.padrao;
  if (c.unico) schema.is_unique = true;
  if (tipo === 'decimal') { schema.numeric_precision = 14; schema.numeric_scale = 2; }
  return {
    field: c.campo, type: tipo === 'json' ? 'json' : tipo,
    meta: {
      interface: c.interface ?? INTERFACE_POR_TIPO[tipo] ?? 'input',
      options: c.opcoes, note: c.nota, required: !!c.obrigatorio,
      ...(tipo === 'json' ? { special: ['cast-json'] } : {}),
      width: ['boolean', 'integer', 'timestamp', 'date', 'decimal'].includes(tipo) ? 'half' : 'full',
    },
    schema,
  };
}

/** Cliente autenticado. Aceita token (preferido) ou e-mail/senha. */
export async function abrirApi({ base, token, email, senha }) {
  const BASE = (base || process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
  let chave = token || process.env.DIRECTUS_TOKEN_ESQUEMA || process.env.DIRECTUS_TOKEN;
  if (!chave) {
    const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email ?? process.env.DIRECTUS_EMAIL, password: senha ?? process.env.DIRECTUS_SENHA }) });
    if (!r.ok) throw new Error(`Login: HTTP ${r.status} ${await r.text()}`);
    chave = (await r.json()).data.access_token;
  }
  return async function api(caminho, opcoes = {}) {
    const r = await fetch(`${BASE}${caminho}`, { ...opcoes,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}`, ...(opcoes.headers ?? {}) } });
    if (!r.ok) {
      const texto = await r.text();
      const erro = new Error(`${opcoes.method ?? 'GET'} ${caminho} → ${r.status} ${texto.slice(0, 400)}`);
      erro.status = r.status;
      throw erro;
    }
    return r.status === 204 ? null : (await r.json()).data;
  };
}

/** Cria coleções e campos que faltam. Idempotente. */
export async function aplicarColecoes(api, colecoes, { dizer = console.log } = {}) {
  const existentes = new Set((await api('/collections')).map((c) => c.collection));

  for (const c of colecoes) {
    if (existentes.has(c.nome)) dizer(`= coleção ${c.nome}`);
    else {
      dizer(`+ coleção ${c.nome}`);
      await api('/collections', { method: 'POST',
        body: JSON.stringify({ collection: c.nome, meta: c.meta, schema: {}, fields: camposPadrao({ comStatus: c.comStatus !== false }) }) });
    }

    const jaTem = new Set((await api(`/fields/${c.nome}`)).map((f) => f.field));
    for (const campo of c.campos) {
      if (jaTem.has(campo.campo)) continue;
      dizer(`  + ${c.nome}.${campo.campo}`);
      await api(`/fields/${c.nome}`, { method: 'POST', body: JSON.stringify(traduzir(campo)) });
      if (campo.tipo === 'relacao') {
        await api('/relations', { method: 'POST',
          body: JSON.stringify({ collection: c.nome, field: campo.campo, related_collection: campo.para }) });
      }
      if (campo.tipo === 'arquivo') {
        await api('/relations', { method: 'POST',
          body: JSON.stringify({ collection: c.nome, field: campo.campo, related_collection: 'directus_files' }) });
      }
    }
  }
}
