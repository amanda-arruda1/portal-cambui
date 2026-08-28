#!/usr/bin/env node
/**
 * Infraestrutura de envio dos avisos por e-mail.
 *
 * Cria:
 *  1. a coleção `licitacao_envios` — a FILA. O portal não envia e-mail: ele
 *     escreve na fila. Quem envia é o serviço `portal-avisos`, separado.
 *
 *     Por que separado: o `portal-web` roda com IPAddressDeny=any e só alcança
 *     o loopback. Dar saída para a internet ao processo que atende requisição
 *     de qualquer cidadão, só para mandar e-mail, aumentaria a superfície de
 *     ataque sem necessidade. Enfileirar também dá, de graça: repetição em caso
 *     de falha, limite de vazão, e um servidor de e-mail fora do ar não trava
 *     o cadastro de ninguém.
 *
 *  2. o papel de serviço e o TOKEN que o portal usa para confirmar e
 *     descadastrar — com permissão estreitíssima, nada além disso.
 */
const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');

const COLECAO = {
  nome: 'licitacao_envios',
  meta: { icon: 'outgoing_mail', note: 'Fila de e-mails. Escrita pelo portal, consumida pelo serviço portal-avisos.', display_template: '{{estado}} — {{destinatario}}', sort_field: 'criado_em' },
  campos: [
    { campo: 'destinatario', tipo: 'string', obrigatorio: true },
    { campo: 'assunto', tipo: 'string', obrigatorio: true },
    { campo: 'corpo_texto', tipo: 'text', obrigatorio: true },
    { campo: 'corpo_html', tipo: 'text' },
    { campo: 'tipo', tipo: 'string', obrigatorio: true, interface: 'select-dropdown',
      opcoes: { choices: [
        { text: 'Confirmação de cadastro', value: 'confirmacao' },
        { text: 'Aviso de nova licitação', value: 'aviso' },
      ] } },
    { campo: 'estado', tipo: 'string', obrigatorio: true, padrao: 'pendente', interface: 'select-dropdown',
      opcoes: { choices: [
        { text: 'Pendente', value: 'pendente' },
        { text: 'Enviado', value: 'enviado' },
        { text: 'Falhou', value: 'falhou' },
        { text: 'Desistiu', value: 'desistiu' },
      ] } },
    { campo: 'tentativas', tipo: 'integer', padrao: 0 },
    { campo: 'ultimo_erro', tipo: 'text' },
    { campo: 'criado_em', tipo: 'timestamp' },
    { campo: 'enviado_em', tipo: 'timestamp' },
    { campo: 'assinante', tipo: 'relacao', para: 'licitacao_assinantes' },
    { campo: 'licitacao', tipo: 'relacao', para: 'licitacoes' },
  ],
};

const INTERFACE = { string: 'input', text: 'input-multiline', integer: 'input', boolean: 'boolean', timestamp: 'datetime' };

function camposPadrao() {
  return [
    { field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
      schema: { is_primary_key: true, length: 36, has_auto_increment: false } },
    { field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true }, schema: {} },
  ];
}
function traduzir(c) {
  if (c.tipo === 'relacao') return { field: c.campo, type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'] }, schema: {} };
  const schema = { is_nullable: !c.obrigatorio };
  if (c.padrao !== undefined) schema.default_value = c.padrao;
  return { field: c.campo, type: c.tipo,
    meta: { interface: c.interface ?? INTERFACE[c.tipo] ?? 'input', options: c.opcoes, note: c.nota, required: !!c.obrigatorio,
      width: ['integer', 'timestamp', 'boolean'].includes(c.tipo) ? 'half' : 'full' },
    schema };
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
  if (!r.ok) throw new Error(`${opcoes.method ?? 'GET'} ${caminho} → ${r.status} ${(await r.text()).slice(0, 220)}`);
  return r.status === 204 ? null : (await r.json()).data;
}

/* 1. coleção da fila */
const colecoes = new Set((await api('/collections')).map((c) => c.collection));
if (!colecoes.has(COLECAO.nome)) {
  console.log(`+ coleção ${COLECAO.nome}`);
  await api('/collections', { method: 'POST', body: JSON.stringify({ collection: COLECAO.nome, meta: COLECAO.meta, schema: {}, fields: camposPadrao() }) });
} else console.log(`= coleção ${COLECAO.nome} já existe`);

const jaTem = new Set((await api(`/fields/${COLECAO.nome}`)).map((f) => f.field));
for (const campo of COLECAO.campos) {
  if (jaTem.has(campo.campo)) continue;
  console.log(`  + ${campo.campo}`);
  await api(`/fields/${COLECAO.nome}`, { method: 'POST', body: JSON.stringify(traduzir(campo)) });
  if (campo.tipo === 'relacao') {
    await api('/relations', { method: 'POST', body: JSON.stringify({ collection: COLECAO.nome, field: campo.campo, related_collection: campo.para }) });
  }
}

/* 2. papel de serviço com permissão estreitíssima */
const NOME_POLITICA = 'Serviço — avisos de licitação';
const politicas = await api('/policies?limit=-1');
let politica = politicas.find((p) => p.name === NOME_POLITICA);
const corpoPolitica = {
  name: NOME_POLITICA, icon: 'smart_toy', app_access: false, admin_access: false, enforce_tfa: false,
  description: 'Token do portal para cadastrar, confirmar e descadastrar avisos. Além disso, enxerga apenas o que qualquer visitante anônimo enxerga — o Directus SOMA a política pública a qualquer token.',
};
if (politica) { await api(`/policies/${politica.id}`, { method: 'PATCH', body: JSON.stringify(corpoPolitica) }); console.log(`~ política "${NOME_POLITICA}"`); }
else { politica = await api('/policies', { method: 'POST', body: JSON.stringify(corpoPolitica) }); console.log(`+ política "${NOME_POLITICA}"`); }

/* O mínimo indispensável, campo a campo.

   ATENÇÃO AO QUE ISTO NÃO SIGNIFICA: o Directus SOMA a política pública às
   políticas do usuário. Este token, portanto, também lê tudo o que um visitante
   anônimo lê — licitação publicada, notícia, secretaria. Foi medido: campo
   interno (user_created) dá 403, rascunho não aparece, /users dá 403.

   O acréscimo real deste token sobre o anônimo é: escrever assinante, ler o
   e-mail e o token de um assinante, confirmar, descadastrar e enfileirar
   e-mail. Se ele vazar, o estrago possível é mexer em inscrição de aviso e ler
   a lista de e-mails inscritos — que é exatamente por que ele não vive no
   mesmo lugar que as demais credenciais. */
const PERMISSOES = [
  { collection: 'licitacao_assinantes', action: 'create', permissions: {}, validation: null, presets: { confirmado: false }, fields: 'email,modalidades,palavras_chave,token,criado_em,confirmado' },
  { collection: 'licitacao_assinantes', action: 'read',   permissions: {}, validation: null, presets: null, fields: 'id,email,token,confirmado,modalidades,palavras_chave' },
  { collection: 'licitacao_assinantes', action: 'update', permissions: {}, validation: null, presets: null, fields: 'confirmado,confirmado_em' },
  { collection: 'licitacao_assinantes', action: 'delete', permissions: {}, validation: null, presets: null, fields: null },
  { collection: 'licitacao_envios',     action: 'create', permissions: {}, validation: null, presets: { estado: 'pendente', tentativas: 0 }, fields: 'destinatario,assunto,corpo_texto,corpo_html,tipo,criado_em,assinante,licitacao,estado,tentativas' },
];

const existentes = await api('/permissions?limit=-1');
for (const p of PERMISSOES) {
  const antiga = existentes.find((x) => x.policy === politica.id && x.collection === p.collection && x.action === p.action);
  const corpo = { ...p, policy: politica.id };
  if (antiga) await api(`/permissions/${antiga.id}`, { method: 'PATCH', body: JSON.stringify(corpo) });
  else await api('/permissions', { method: 'POST', body: JSON.stringify(corpo) });
  console.log(`  ${p.action.padEnd(6)} ${p.collection}`);
}

/* 2b. O SEGUNDO papel: quem DRENA a fila.
 *
 * Duas credenciais, de propósito. O token do portal só ESCREVE na fila; ele
 * não consegue nem ler o que já está lá. O token do entregador lê e atualiza a
 * fila, mas não cadastra ninguém.
 *
 * A propriedade que isso compra: a fila carrega corpo de e-mail e token de
 * descadastro de cada assinante. Se o token que vive no processo web vazar — e
 * é ele que está exposto à internet —, o atacante não lê a fila. */
const NOME_POLITICA_ENTREGA = 'Serviço — entrega de avisos';
let politicaEntrega = politicas.find((p) => p.name === NOME_POLITICA_ENTREGA);
const corpoEntrega = {
  name: NOME_POLITICA_ENTREGA, icon: 'send', app_access: false, admin_access: false, enforce_tfa: false,
  description: 'Token do serviço portal-avisos: drena a fila de e-mail. Não cadastra assinante, não escreve conteúdo.',
};
if (politicaEntrega) { await api(`/policies/${politicaEntrega.id}`, { method: 'PATCH', body: JSON.stringify(corpoEntrega) }); }
else { politicaEntrega = await api('/policies', { method: 'POST', body: JSON.stringify(corpoEntrega) }); }
console.log(`${politicaEntrega ? '~' : '+'} política "${NOME_POLITICA_ENTREGA}"`);

const PERMISSOES_ENTREGA = [
  { collection: 'licitacao_envios',     action: 'read',   permissions: {}, validation: null, presets: null, fields: '*' },
  { collection: 'licitacao_envios',     action: 'update', permissions: {}, validation: null, presets: null, fields: 'estado,tentativas,ultimo_erro,enviado_em' },
  { collection: 'licitacao_envios',     action: 'create', permissions: {}, validation: null, presets: null, fields: '*' },
  /* Sem filtro por 'confirmado': o entregador precisa do token de QUEM AINDA
     NÃO CONFIRMOU para montar o cabeçalho List-Unsubscribe do próprio e-mail
     de confirmação. E restringir aqui não protegeria nada — este token já lê a
     fila inteira, que carrega os mesmos links dentro do corpo das mensagens. */
  { collection: 'licitacao_assinantes', action: 'read',   permissions: {}, validation: null, presets: null, fields: 'id,email,token,confirmado,modalidades,palavras_chave' },
];
for (const p of PERMISSOES_ENTREGA) {
  const antiga = existentes.find((x) => x.policy === politicaEntrega.id && x.collection === p.collection && x.action === p.action);
  const corpo = { ...p, policy: politicaEntrega.id };
  if (antiga) await api(`/permissions/${antiga.id}`, { method: 'PATCH', body: JSON.stringify(corpo) });
  else await api('/permissions', { method: 'POST', body: JSON.stringify(corpo) });
  console.log(`  ${p.action.padEnd(6)} ${p.collection}  (entrega)`);
}

/* 3. os usuários de serviço que carregam os tokens estáticos */
/* O ideal seria um domínio .invalid (RFC 2606), que nunca pode ser roteado —
 * mas o validador do Directus recusa TLD desconhecido. Fica o domínio do
 * próprio município com um endereço que não tem caixa postal: é conta de
 * serviço, não recebe e não envia nada, e o token é o que importa. */
const EMAIL_SERVICO = 'servico-avisos@prefeituradecambui.mg.gov.br';
const usuarios = await api(`/users?limit=-1&fields=id,email,token&filter[email][_eq]=${encodeURIComponent(EMAIL_SERVICO)}`);
let usuario = usuarios[0];
const novoToken = 'avisos_' + [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');

/* O Directus MASCARA o campo token na leitura — devolve "**********". Não dá
 * para recuperar um token existente: só para definir um novo. Por isso o
 * script sempre GRAVA um token e imprime o valor que ele mesmo gerou; rodar de
 * novo rotaciona a credencial, o que é comportamento desejável. */
if (!usuario) {
  usuario = await api('/users', { method: 'POST', body: JSON.stringify({
    email: EMAIL_SERVICO, first_name: 'Serviço', last_name: 'Avisos de licitação',
    status: 'active', token: novoToken,
  }) });
  await api('/access', { method: 'POST', body: JSON.stringify({ user: usuario.id, policy: politica.id }) });
  console.log('+ usuário de serviço criado');
} else {
  await api(`/users/${usuario.id}`, { method: 'PATCH', body: JSON.stringify({ token: novoToken, status: 'active' }) });
  const acessos = await api(`/access?limit=-1&filter[user][_eq]=${usuario.id}`);
  if (!acessos.some((a) => a.policy === politica.id)) {
    await api('/access', { method: 'POST', body: JSON.stringify({ user: usuario.id, policy: politica.id }) });
  }
  console.log('~ usuário de serviço já existia — token ROTACIONADO');
}

/* O entregador, com a sua própria credencial. */
const EMAIL_ENTREGA = 'servico-entrega-avisos@prefeituradecambui.mg.gov.br';
const tokenEntrega = 'entrega_' + [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
const existentesEntrega = await api(`/users?limit=-1&fields=id,email&filter[email][_eq]=${encodeURIComponent(EMAIL_ENTREGA)}`);
let usuarioEntrega = existentesEntrega[0];
if (!usuarioEntrega) {
  usuarioEntrega = await api('/users', { method: 'POST', body: JSON.stringify({
    email: EMAIL_ENTREGA, first_name: 'Serviço', last_name: 'Entrega de avisos', status: 'active', token: tokenEntrega,
  }) });
  await api('/access', { method: 'POST', body: JSON.stringify({ user: usuarioEntrega.id, policy: politicaEntrega.id }) });
  console.log('+ usuário de entrega criado');
} else {
  await api(`/users/${usuarioEntrega.id}`, { method: 'PATCH', body: JSON.stringify({ token: tokenEntrega, status: 'active' }) });
  const acessos = await api(`/access?limit=-1&filter[user][_eq]=${usuarioEntrega.id}`);
  if (!acessos.some((a) => a.policy === politicaEntrega.id)) {
    await api('/access', { method: 'POST', body: JSON.stringify({ user: usuarioEntrega.id, policy: politicaEntrega.id }) });
  }
  console.log('~ usuário de entrega já existia — token ROTACIONADO');
}

console.log(`
  DOIS tokens, dois lugares diferentes:

  1) .env.web  (lido pelo processo web, exposto à internet)
     DIRECTUS_TOKEN_AVISOS=${novoToken}
     Cadastra, confirma, descadastra e ESCREVE na fila. Não lê a fila.

  2) .env      (lido pelo serviço portal-avisos, sem porta aberta)
     AVISOS_TOKEN_ENTREGA=${tokenEntrega}
     Lê e atualiza a fila, lê assinante confirmado. Não cadastra ninguém.
`);
