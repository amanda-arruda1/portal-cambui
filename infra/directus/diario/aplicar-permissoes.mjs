#!/usr/bin/env node
/**
 * Permissões e papéis do Órgão Oficial.
 *
 *   node infra/directus/diario/aplicar-permissoes.mjs [--simular]
 *
 * QUATRO PAPÉIS, e a separação entre eles não é burocracia:
 *
 *   Redator setorial   — a secretaria escreve e envia. NÃO publica.
 *   Editor do Diário   — revisa, devolve, monta a pauta, fecha. NÃO assina.
 *   Autoridade signatária — assina a edição. NÃO edita matéria.
 *   Administrador      — configura o veículo e audita.
 *
 * Quem escreve não publica; quem publica não assina. É a mesma lógica da
 * segregação de funções em controle interno: um ato administrativo que uma só
 * pessoa consegue redigir, aprovar e assinar sozinha não tem controle nenhum.
 *
 * NADA APAGA. Não existe permissão `delete` para edição nem para matéria em
 * papel algum — nem para o administrador. Removê-las da interface é a primeira
 * barreira; o gatilho do banco (imutabilidade.sql) é a que vale.
 */
const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const NOME_POLITICA_PUBLICA = '$t:public_label';
const SIMULAR = process.argv.includes('--simular');

/* ─────────────────────────── o que é público ───────────────────────────── */

/** Lista fechada. Nada de `user_created`/`date_updated`: a rotina interna do
 *  setor não é informação pública, e expô-la só serve para engenharia social. */
const CAMPOS_PUBLICOS = {
  diario_veiculo: ['id', 'nome_veiculo', 'nome_curto', 'ente', 'cnpj', 'lei_numero', 'lei_data',
    'lei_link', 'lei_ementa', 'inicio_circulacao', 'veiculo_anterior', 'periodicidade',
    'dias_circulacao', 'horario_fechamento', 'regra_prazo', 'responsavel_publicacao',
    'expediente', 'endereco', 'telefone', 'email_contato', 'ano_volume_inicial', 'nota_legal'],
  diario_cadernos: ['id', 'status', 'slug', 'nome', 'ordem', 'descricao', 'dados_pessoais', 'indexavel'],
  diario_edicoes: ['id', 'status', 'numero', 'ano', 'volume', 'tipo', 'situacao',
    'data_disponibilizacao', 'data_publicacao_legal', 'justificativa_extraordinaria',
    'total_paginas', 'arquivo_pdf', 'sha256', 'codigo_verificador',
    'assinatura_signatario', 'assinatura_documento', 'assinatura_emissor', 'assinatura_em',
    'assinatura_algoritmo', 'assinatura_carimbo', 'assinatura_valida_ate',
    'anulada', 'anulada_motivo', 'anulada_justificativa', 'anulada_em', 'anulada_por_edicao',
    'importada_acervo', 'fonte_acervo', 'demonstracao'],
  diario_materias: ['id', 'status', 'edicao', 'caderno', 'secretaria', 'orgao_texto', 'ordem',
    'pagina_inicial', 'pagina_final', 'tipo_ato', 'numero_ato', 'ano_ato', 'ementa', 'corpo',
    'slug', 'situacao', 'processo_administrativo', 'licitacao', 'vigencia_inicio',
    'retifica', 'republica', 'revoga', 'motivo_republicacao', 'demonstracao'],
};

/**
 * O público lê edição PUBLICADA e matéria PUBLICADA cuja edição também esteja
 * publicada. A dupla condição não é redundante: sem a segunda, uma matéria
 * marcada por engano como publicada dentro de uma pauta em montagem vazaria o
 * texto antes da hora — e num diário oficial, texto que vazou antes da
 * assinatura é um problema sério.
 */
function permissoesPublicas() {
  return [
    { collection: 'diario_veiculo', action: 'read', permissions: {}, validation: null, presets: null,
      fields: CAMPOS_PUBLICOS.diario_veiculo.join(',') },
    { collection: 'diario_cadernos', action: 'read', permissions: { status: { _eq: 'publicado' } },
      validation: null, presets: null, fields: CAMPOS_PUBLICOS.diario_cadernos.join(',') },
    { collection: 'diario_edicoes', action: 'read',
      permissions: { _and: [{ status: { _eq: 'publicado' } }, { situacao: { _eq: 'publicada' } }] },
      validation: null, presets: null, fields: CAMPOS_PUBLICOS.diario_edicoes.join(',') },
    { collection: 'diario_materias', action: 'read',
      permissions: { _and: [
        { status: { _eq: 'publicado' } },
        { situacao: { _eq: 'publicada' } },
        { edicao: { situacao: { _eq: 'publicada' } } },
      ] },
      validation: null, presets: null, fields: CAMPOS_PUBLICOS.diario_materias.join(',') },
    /* O portal exibe o nome do órgão de origem. */
    { collection: 'secretarias', action: 'read', permissions: { status: { _eq: 'publicado' } },
      validation: null, presets: null, fields: 'id,nome,slug' },
  ];
}

/* ─────────────────────── ler o próprio perfil ──────────────────────────── */

/**
 * TODA política de painel precisa disto, e a falta é invisível até alguém tentar
 * entrar.
 *
 * O portal lê o perfil com
 *   /users/me?fields=id,first_name,last_name,email,tfa_secret,role.name,secretaria.id,secretaria.nome
 * e `secretaria` é um campo CUSTOMIZADO em directus_users. Quando a política não
 * enxerga um campo relacional pedido, o Directus não devolve erro: ele
 * **descarta a projeção inteira** e responde só `{id}`. O portal então conclui
 * "conta sem função definida" e recusa a entrada — com uma mensagem que manda a
 * pessoa procurar a TI por um problema que não é dela.
 *
 * Descoberto ao criar os usuários de demonstração: nenhum papel não-administrador
 * conseguia entrar. Ver também infra/directus/corrigir-perfil-painel.mjs, que
 * aplica a mesma correção às políticas anteriores a este módulo.
 */
function permissaoDePerfil() {
  return [
    { collection: 'directus_users', action: 'read',
      /* Só o próprio registro. Ninguém lista os colegas por esta permissão. */
      permissions: { id: { _eq: '$CURRENT_USER' } },
      validation: null, presets: null,
      fields: 'id,first_name,last_name,email,tfa_secret,role,secretaria,status' },
    /* `secretaria.nome` exige ler a coleção de secretarias. */
    { collection: 'secretarias', action: 'read', permissions: {}, validation: null, presets: null,
      fields: 'id,nome,slug' },
  ];
}

/* ───────────────────────────── papéis internos ─────────────────────────── */

const CAMPOS_REDATOR = [
  'id', 'status', 'demonstracao', 'caderno', 'secretaria', 'orgao_texto', 'tipo_ato', 'numero_ato', 'ano_ato',
  'ementa', 'corpo', 'slug', 'situacao', 'processo_administrativo', 'licitacao',
  'data_alvo', 'vigencia_inicio', 'retifica', 'republica', 'revoga', 'motivo_republicacao',
].join(',');

/** Redator setorial: escreve e envia. Não enxerga edição em montagem, não
 *  pauta, não publica. `edicao` fica de fora dos campos que pode escrever —
 *  é o editor quem aloca matéria em edição. */
function permissoesRedator() {
  return [
    { collection: 'diario_materias', action: 'create', permissions: {}, validation: null,
      presets: { situacao: 'rascunho', status: 'rascunho' }, fields: CAMPOS_REDATOR },
    /* Só as próprias, e só enquanto não foram para a pauta. Depois de aprovada,
       a matéria sai das mãos de quem escreveu — senão o texto muda depois do
       aval do editor, e o que se publica não é o que foi aprovado. */
    { collection: 'diario_materias', action: 'read',
      permissions: { user_created: { _eq: '$CURRENT_USER' } }, validation: null, presets: null, fields: '*' },
    { collection: 'diario_materias', action: 'update',
      permissions: { _and: [
        { user_created: { _eq: '$CURRENT_USER' } },
        { situacao: { _in: ['rascunho', 'devolvida'] } },
      ] },
      validation: null, presets: null, fields: CAMPOS_REDATOR },
    { collection: 'diario_devolucoes', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_cadernos', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_edicoes', action: 'read',
      permissions: { situacao: { _eq: 'publicada' } }, validation: null, presets: null, fields: '*' },
    { collection: 'secretarias', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'licitacoes', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
  ];
}

/** Editor do Diário: revisa, devolve, monta a pauta, fecha. Não assina e não
 *  apaga. Pode editar matéria — inclusive de outros — porque revisão de diário
 *  oficial é isso; tudo fica no log. */
function permissoesEditor() {
  return [
    { collection: 'diario_materias', action: 'create', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_materias', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_materias', action: 'update',
      /* Matéria publicada é imutável. A regra também está no banco; aqui ela
         evita que a interface sequer ofereça o botão. */
      permissions: { situacao: { _neq: 'publicada' } }, validation: null, presets: null, fields: '*' },
    { collection: 'diario_edicoes', action: 'create', permissions: {}, validation: null,
      presets: { situacao: 'em_montagem', status: 'rascunho' }, fields: '*' },
    { collection: 'diario_edicoes', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_edicoes', action: 'update',
      permissions: { situacao: { _neq: 'publicada' } }, validation: null, presets: null, fields: '*' },
    { collection: 'diario_devolucoes', action: 'create', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_devolucoes', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_auditoria', action: 'create', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_auditoria', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_cadernos', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_veiculo', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_certidoes', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'secretarias', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'licitacoes', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'directus_files', action: 'create', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'directus_files', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
  ];
}

/** Autoridade signatária: assina e publica. Não redige e não altera texto. */
function permissoesSignataria() {
  return [
    { collection: 'diario_edicoes', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_edicoes', action: 'update',
      permissions: { situacao: { _in: ['fechada', 'aguardando_assinatura'] } }, validation: null, presets: null,
      /* `status` entra porque é ele que torna a edição visível ao público: sem
       * o campo na lista, a publicação volta 403 e a edição fica presa em
       * "aguardando assinatura" para sempre. Descoberto percorrendo o rito
       * inteiro pela interface — a leitura do código não revelava. */
      fields: 'status,situacao,arquivo_pdf,sha256,total_paginas,assinatura_signatario,assinatura_documento,assinatura_emissor,assinatura_em,assinatura_algoritmo,assinatura_carimbo,assinatura_valida_ate,publicada_em' },
    /* Publicar a edição implica marcar as matérias como publicadas. */
    { collection: 'diario_materias', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_materias', action: 'update',
      permissions: { situacao: { _eq: 'pautada' } }, validation: null, presets: null,
      fields: 'status,situacao,pagina_inicial,pagina_final' },
    { collection: 'diario_auditoria', action: 'create', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_auditoria', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_cadernos', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_veiculo', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'directus_files', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
  ];
}

/** Administrador do Diário: configura o veículo e audita. NÃO ganha `delete`
 *  em edição nem matéria — ninguém ganha. */
function permissoesAdministrador() {
  const linhas = [];
  for (const c of ['diario_veiculo', 'diario_cadernos']) {
    for (const acao of ['create', 'read', 'update']) {
      linhas.push({ collection: c, action: acao, permissions: {}, validation: null, presets: null, fields: '*' });
    }
  }
  for (const c of ['diario_edicoes', 'diario_materias', 'diario_devolucoes', 'diario_auditoria', 'diario_certidoes', 'diario_assinantes']) {
    linhas.push({ collection: c, action: 'read', permissions: {}, validation: null, presets: null, fields: '*' });
  }
  linhas.push({ collection: 'secretarias', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' });
  return linhas;
}

/** Serviço de assinatura: a conta que o serviço privilegiado usa. Faz o que
 *  precisa e nada além — e é ele, não o processo web, que detém a chave. */
function permissoesServico() {
  return [
    { collection: 'diario_edicoes', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_edicoes', action: 'update',
      permissions: { situacao: { _neq: 'publicada' } }, validation: null, presets: null, fields: '*' },
    { collection: 'diario_materias', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_materias', action: 'update',
      permissions: { situacao: { _neq: 'publicada' } }, validation: null, presets: null, fields: '*' },
    { collection: 'diario_cadernos', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_veiculo', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_certidoes', action: 'create', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_certidoes', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'diario_auditoria', action: 'create', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'secretarias', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'directus_files', action: 'create', permissions: {}, validation: null, presets: null, fields: '*' },
    { collection: 'directus_files', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
  ];
}

const POLITICAS = [
  { nome: 'Diário — Redator setorial', icone: 'edit_note', app_access: true, admin_access: false, enforce_tfa: false,
    descricao: 'A secretaria escreve e envia matéria para o Diário. Não publica.',
    permissoes: [...permissoesRedator(), ...permissaoDePerfil()] },
  { nome: 'Diário — Editor', icone: 'fact_check', app_access: true, admin_access: false, enforce_tfa: true,
    descricao: 'Revisa, devolve, monta a pauta e fecha a edição. Não assina.',
    permissoes: [...permissoesEditor(), ...permissaoDePerfil()] },
  { nome: 'Diário — Autoridade signatária', icone: 'draw', app_access: true, admin_access: false, enforce_tfa: true,
    descricao: 'Assina e publica a edição. Não redige nem altera texto.',
    permissoes: [...permissoesSignataria(), ...permissaoDePerfil()] },
  { nome: 'Diário — Administrador', icone: 'settings', app_access: true, admin_access: false, enforce_tfa: true,
    descricao: 'Configura o veículo oficial e audita. Não apaga nada.',
    permissoes: [...permissoesAdministrador(), ...permissaoDePerfil()] },
  { nome: 'Diário — Serviço de assinatura', icone: 'key', app_access: false, admin_access: false, enforce_tfa: false,
    descricao: 'Conta do serviço que gera e assina os PDFs. Detém a chave; o processo web não.', permissoes: permissoesServico() },
];

const PAPEIS = [
  { nome: 'Diário — Redator setorial', icone: 'edit_note', descricao: 'Envia matérias da sua secretaria.', politicas: ['Diário — Redator setorial'] },
  { nome: 'Diário — Editor', icone: 'fact_check', descricao: 'Edita o Diário Oficial.', politicas: ['Diário — Editor'] },
  { nome: 'Diário — Autoridade signatária', icone: 'draw', descricao: 'Assina as edições.', politicas: ['Diário — Autoridade signatária'] },
  { nome: 'Diário — Administrador', icone: 'settings', descricao: 'Configura e audita o Diário.', politicas: ['Diário — Administrador'] },
];

if (SIMULAR) {
  console.log('\n=== SIMULAÇÃO — permissões do Diário ===\n');
  for (const p of POLITICAS) {
    console.log(`POLÍTICA ${p.nome}${p.enforce_tfa ? '  [exige 2FA]' : ''} — ${p.permissoes.length} permissões`);
    const porColecao = new Map();
    for (const x of p.permissoes) {
      if (!porColecao.has(x.collection)) porColecao.set(x.collection, []);
      porColecao.get(x.collection).push(x.action);
    }
    for (const [c, acoes] of porColecao) console.log(`   ${c.padEnd(22)} ${acoes.join(', ')}`);
    console.log('');
  }
  console.log('PÚBLICO (somente leitura):');
  for (const x of permissoesPublicas()) console.log(`   read   ${x.collection.padEnd(20)} ${JSON.stringify(x.permissions)}`);
  console.log('\nNENHUMA política tem "delete" em diario_edicoes ou diario_materias.');
  process.exit(0);
}

async function obterToken() {
  const t = process.env.DIRECTUS_TOKEN_ESQUEMA || process.env.DIRECTUS_TOKEN;
  if (t) return t;
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.DIRECTUS_EMAIL, password: process.env.DIRECTUS_SENHA }) });
  if (!r.ok) throw new Error(`Login: HTTP ${r.status}`);
  return (await r.json()).data.access_token;
}
const token = await obterToken();

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, { ...opcoes,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opcoes.headers ?? {}) } });
  if (!r.ok) throw new Error(`${opcoes.method ?? 'GET'} ${caminho} → ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : (await r.json()).data;
}

const politicas = await api('/policies?limit=-1');
const idPorPolitica = new Map(politicas.map((p) => [p.name, p.id]));

for (const p of POLITICAS) {
  const corpo = { name: p.nome, icon: p.icone, description: p.descricao,
    app_access: p.app_access, admin_access: p.admin_access, enforce_tfa: p.enforce_tfa };
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

console.log('\nPermissões do Diário Oficial aplicadas.\n');
