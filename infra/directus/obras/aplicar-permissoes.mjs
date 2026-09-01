#!/usr/bin/env node
/**
 * Permissões do módulo de obras públicas.
 *
 * Mesmo padrão de infra/directus/licitacoes/aplicar-permissoes.mjs, e pela
 * mesma razão: obra pública não segue o fluxo editorial de notícia (redator
 * → revisor → publicador) — tem um setor responsável e prazo de fiscalização
 * legal, não uma redação a revisar.
 *
 * DECISÃO QUE IMPORTA: anexos e medições NÃO têm visibilidade própria — são
 * visíveis se, e somente se, a obra-mãe estiver publicada. Filtro relacional
 * (`{ obra: { status: { _eq: 'publicado' } } }`), igual licitação_anexos.
 */
const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const NOME_POLITICA_PUBLICA = '$t:public_label';
const SIMULAR = process.argv.includes('--simular');

const CAMPOS_PUBLICOS = {
  obras: [
    'id', 'status', 'numero_processo', 'numero_contrato', 'licitacao', 'slug', 'categoria', 'secretaria',
    'objeto_resumo', 'objeto', 'endereco', 'empresa_executora', 'empresa_cnpj', 'responsavel_tecnico', 'art_rrt',
    'fonte_recurso', 'numero_convenio', 'valor_contratado', 'valor_aditivado', 'valor_pago',
    'data_ordem_servico', 'data_prevista_termino', 'data_termino_real',
    'situacao', 'motivo_situacao', 'percentual_execucao', 'observacoes', 'data_publicacao', 'demonstracao', 'date_updated',
  ],
  obra_anexos: ['id', 'obra', 'titulo', 'categoria', 'arquivo', 'data_referencia', 'descricao', 'ordem'],
  obra_medicoes: ['id', 'obra', 'numero', 'data_referencia', 'percentual_acumulado', 'valor_medido', 'valor_acumulado', 'boletim', 'observacoes'],
};

const COLECOES = Object.keys(CAMPOS_PUBLICOS);

function permissoesPublicas() {
  return COLECOES.map((colecao) => ({
    collection: colecao,
    action: 'read',
    permissions: colecao === 'obras'
      ? { status: { _eq: 'publicado' } }
      : { obra: { status: { _eq: 'publicado' } } },
    validation: null,
    presets: null,
    fields: CAMPOS_PUBLICOS[colecao].join(','),
  }));
}

/* O setor de obras escreve tudo, em qualquer situação, e não apaga: obra
   nunca é excluída, só muda de situação (planejada → … → concluída/cancelada). */
function permissoesDoSetor() {
  const linhas = [];
  for (const colecao of COLECOES) {
    for (const acao of ['create', 'read', 'update']) {
      linhas.push({ collection: colecao, action: acao, permissions: {}, validation: null, presets: null, fields: '*' });
    }
  }
  // Precisa enxergar secretarias e licitações (para vincular a obra à
  // licitação de origem, quando existir).
  linhas.push({ collection: 'secretarias', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' });
  linhas.push({ collection: 'licitacoes', action: 'read', permissions: {}, validation: null, presets: null, fields: 'id,numero_processo,numero,ano,objeto_resumo' });
  linhas.push(...permissaoAutoLeitura());
  return linhas;
}

function permissoesDoLeitor() {
  return [
    ...[...COLECOES, 'secretarias'].map((colecao) => ({
      collection: colecao, action: 'read', permissions: {}, validation: null, presets: null, fields: '*',
    })),
    ...permissaoAutoLeitura(),
  ];
}

/**
 * ARMADILHA PAGA (2026-09-01): sem isto, o LOGIN no painel fica quebrado para
 * qualquer papel deste módulo. `lib/painel/sessao.ts` lê o próprio perfil em
 * `/users/me?fields=...,role.name,secretaria.id,secretaria.nome` logo após
 * autenticar — e `secretaria` é um campo de `directus_users`, não de
 * `secretarias`. Sem permissão de LEITURA em `directus_users` (mesmo só do
 * próprio registro), o Directus não erra: devolve a projeção inteira cortada
 * para `{id}` (mesma armadilha de "campo relacional fora da política" já
 * documentada para o Diário Oficial) — `role.name` some, `usuario.papel` fica
 * nulo, e a entrada é recusada com "Sua conta não tem função definida no
 * portal", mesmo com e-mail e senha corretos. Restrito à própria linha
 * (`id = $CURRENT_USER`) e a só dois campos — não abre a base de usuários. */
function permissaoAutoLeitura() {
  return [{
    collection: 'directus_users', action: 'read',
    permissions: { id: { _eq: '$CURRENT_USER' } }, validation: null, presets: null,
    fields: 'id,secretaria',
  }];
}

const POLITICAS = [
  {
    nome: 'Portal — Setor de obras',
    icone: 'construction',
    descricao: 'Publica e mantém o andamento das obras públicas — valores, prazos, situação e medições.',
    app_access: true, admin_access: false, enforce_tfa: false,
    permissoes: permissoesDoSetor(),
  },
  {
    nome: 'Portal — Leitor de obras',
    icone: 'visibility',
    descricao: 'Acompanha o que o setor publicou, sem poder alterar.',
    app_access: true, admin_access: false, enforce_tfa: false,
    permissoes: permissoesDoLeitor(),
  },
];

const PAPEIS = [
  { nome: 'Setor de obras', icone: 'construction', descricao: 'Publica e mantém obras públicas, valores e medições.', politicas: ['Portal — Setor de obras'] },
  { nome: 'Leitor de obras', icone: 'visibility', descricao: 'Somente leitura do módulo de obras públicas.', politicas: ['Portal — Leitor de obras'] },
];

if (SIMULAR) {
  console.log('\n=== SIMULAÇÃO ===\n');
  for (const p of POLITICAS) {
    console.log(`POLÍTICA ${p.nome} — ${p.permissoes.length} permissões`);
    for (const x of p.permissoes) console.log(`   ${x.action.padEnd(6)} ${x.collection}`);
    console.log('');
  }
  console.log('PÚBLICO (somente leitura):');
  for (const x of permissoesPublicas()) console.log(`   read   ${x.collection.padEnd(20)} ${JSON.stringify(x.permissions)}`);
  console.log('');
  process.exit(0);
}

async function obterToken() {
  if (process.env.DIRECTUS_TOKEN) return process.env.DIRECTUS_TOKEN;
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.DIRECTUS_EMAIL, password: process.env.DIRECTUS_SENHA }) });
  if (!r.ok) throw new Error(`Login: HTTP ${r.status}`);
  return (await r.json()).data.access_token;
}
const token = await obterToken();
async function api(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opcoes.headers ?? {}) } });
  if (!r.ok) throw new Error(`${opcoes.method ?? 'GET'} ${caminho} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : (await r.json()).data;
}

const politicas = await api('/policies?limit=-1');
const idPorPolitica = new Map(politicas.map((p) => [p.name, p.id]));

for (const p of POLITICAS) {
  const corpo = { name: p.nome, icon: p.icone, description: p.descricao, app_access: p.app_access, admin_access: p.admin_access, enforce_tfa: p.enforce_tfa };
  if (idPorPolitica.has(p.nome)) {
    await api(`/policies/${idPorPolitica.get(p.nome)}`, { method: 'PATCH', body: JSON.stringify(corpo) });
    console.log(`~ política "${p.nome}"`);
  } else {
    const criada = await api('/policies', { method: 'POST', body: JSON.stringify(corpo) });
    idPorPolitica.set(p.nome, criada.id);
    console.log(`+ política "${p.nome}"`);
  }
}

const papeis = await api('/roles?limit=-1');
const idPorPapel = new Map(papeis.map((r) => [r.name, r.id]));
for (const papel of PAPEIS) {
  let id = idPorPapel.get(papel.nome);
  if (!id) {
    id = (await api('/roles', { method: 'POST', body: JSON.stringify({ name: papel.nome, icon: papel.icone, description: papel.descricao }) })).id;
    console.log(`+ papel "${papel.nome}"`);
  }
  const acessos = await api(`/access?limit=-1&filter[role][_eq]=${id}`);
  for (const nomePolitica of papel.politicas) {
    const idPol = idPorPolitica.get(nomePolitica);
    if (!acessos.some((a) => a.policy === idPol)) {
      await api('/access', { method: 'POST', body: JSON.stringify({ role: id, policy: idPol }) });
      console.log(`  + "${papel.nome}" → "${nomePolitica}"`);
    }
  }
}

const existentes = await api('/permissions?limit=-1');
const chave = (p) => `${p.policy}|${p.collection}|${p.action}`;
const porChave = new Map(existentes.map((p) => [chave(p), p]));

async function aplicar(idPolitica, rotulo, linhas) {
  for (const linha of linhas) {
    const corpo = { ...linha, policy: idPolitica };
    const antiga = porChave.get(chave(corpo));
    if (antiga) await api(`/permissions/${antiga.id}`, { method: 'PATCH', body: JSON.stringify(corpo) });
    else await api('/permissions', { method: 'POST', body: JSON.stringify(corpo) });
  }
  console.log(`  ${rotulo}: ${linhas.length} permissões`);
}

console.log('\nPermissões:');
for (const p of POLITICAS) await aplicar(idPorPolitica.get(p.nome), p.nome, p.permissoes);
await aplicar(idPorPolitica.get(NOME_POLITICA_PUBLICA), 'acesso público', permissoesPublicas());

console.log('\nPermissões de obras públicas aplicadas.\n');
