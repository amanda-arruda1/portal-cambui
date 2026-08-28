#!/usr/bin/env node
/**
 * Permissões do módulo de licitações.
 *
 * Separado do papeis.json geral porque o setor de licitações NÃO segue o
 * escopo por secretaria do resto do portal: ele publica para todas as pastas,
 * e o fluxo editorial de notícia (redator → revisor → publicador) não se
 * aplica a edital, que tem prazo legal e um responsável só.
 *
 * DECISÃO QUE IMPORTA: anexos, lotes e eventos NÃO têm visibilidade própria —
 * são visíveis se, e somente se, a licitação-pai estiver publicada. O filtro é
 * relacional (`{ licitacao: { status: { _eq: 'publicado' } } }`). A alternativa
 * seria gerenciar `status` em cada anexo, e um anexo publicado por engano numa
 * licitação em rascunho é exatamente o vazamento que não pode acontecer.
 */
const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const NOME_POLITICA_PUBLICA = '$t:public_label';
const SIMULAR = process.argv.includes('--simular');

/** Campos que o portal público pode ler. Lista fechada: `motivo_situacao` e
 *  `valor_estimado` entram porque são informação pública; nada de
 *  `user_created` ou `date_updated`, que expõem a rotina interna. */
const CAMPOS_PUBLICOS = {
  licitacoes: [
    'id', 'status', 'numero_processo', 'numero', 'ano', 'slug', 'modalidade', 'forma',
    'justificativa_presencial', 'criterio_julgamento', 'modo_disputa', 'registro_precos',
    'secretaria', 'objeto_resumo', 'objeto', 'valor_estimado', 'orcamento_sigiloso',
    'data_publicacao', 'data_abertura_propostas', 'data_sessao', 'prazo_impugnacao',
    'prazo_esclarecimentos', 'situacao', 'motivo_situacao', 'pncp_id', 'pncp_url',
    'sistema_sessao_url', 'demonstracao', 'date_updated',
  ],
  licitacao_anexos: ['id', 'licitacao', 'titulo', 'tipo', 'arquivo', 'url_externa', 'data_publicacao', 'versao', 'substitui', 'superado', 'ordem'],
  licitacao_lotes: ['id', 'licitacao', 'numero', 'descricao', 'valor_estimado', 'situacao', 'vencedor_razao_social', 'vencedor_cnpj', 'valor_homologado'],
  licitacao_eventos: ['id', 'licitacao', 'data', 'tipo', 'descricao', 'anexo'],
};

const COLECOES = Object.keys(CAMPOS_PUBLICOS);

/* A política pública lê licitação publicada; os filhos seguem o pai. */
function permissoesPublicas() {
  return COLECOES.map((colecao) => ({
    collection: colecao,
    action: 'read',
    permissions: colecao === 'licitacoes'
      ? { status: { _eq: 'publicado' } }
      : { licitacao: { status: { _eq: 'publicado' } } },
    validation: null,
    presets: null,
    fields: CAMPOS_PUBLICOS[colecao].join(','),
  }));
}

/* O setor de licitações escreve tudo, em qualquer situação, e não apaga:
   licitação nunca é excluída, só muda de estado. */
function permissoesDoSetor() {
  const linhas = [];
  for (const colecao of COLECOES) {
    for (const acao of ['create', 'read', 'update']) {
      linhas.push({ collection: colecao, action: acao, permissions: {}, validation: null, presets: null, fields: '*' });
    }
  }
  // Precisa enxergar as secretarias para escolher o órgão demandante.
  linhas.push({ collection: 'secretarias', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' });
  return linhas;
}

/* Leitor: acompanha sem poder mexer. Serve para controladoria interna e para
   quem só precisa conferir o que foi publicado. */
function permissoesDoLeitor() {
  return [...COLECOES, 'secretarias'].map((colecao) => ({
    collection: colecao, action: 'read', permissions: {}, validation: null, presets: null, fields: '*',
  }));
}

const POLITICAS = [
  {
    nome: 'Portal — Setor de licitações',
    icone: 'gavel',
    descricao: 'Publica e mantém licitações e contratações diretas. Não apaga: licitação muda de estado.',
    app_access: true, admin_access: false, enforce_tfa: false,
    permissoes: permissoesDoSetor(),
  },
  {
    nome: 'Portal — Leitor de licitações',
    icone: 'visibility',
    descricao: 'Acompanha o que o setor publicou, sem poder alterar.',
    app_access: true, admin_access: false, enforce_tfa: false,
    permissoes: permissoesDoLeitor(),
  },
];

const PAPEIS = [
  { nome: 'Setor de licitações', icone: 'gavel', descricao: 'Publica editais e mantém o andamento das licitações.', politicas: ['Portal — Setor de licitações'] },
  { nome: 'Leitor de licitações', icone: 'visibility', descricao: 'Somente leitura do módulo de licitações.', politicas: ['Portal — Leitor de licitações'] },
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

console.log('\nPermissões de licitações aplicadas.\n');
