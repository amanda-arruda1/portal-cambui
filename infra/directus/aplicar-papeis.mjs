#!/usr/bin/env node
/**
 * Cria no Directus as políticas, os papéis e as permissões de papeis.json.
 *
 *   DIRECTUS_TOKEN=<token de admin> node aplicar-papeis.mjs
 *   DIRECTUS_EMAIL=<...> DIRECTUS_SENHA=<...> node aplicar-papeis.mjs
 *   node aplicar-papeis.mjs --simular       imprime a matriz, sem contatar o CMS
 *
 * ESTADO: escrito, NÃO EXECUTADO. Depende de um administrador do Directus, que
 * depende do e-mail institucional ainda não definido. Rodar depois do
 * aplicar-esquema.mjs — permissão referencia coleção que precisa existir.
 *
 * Idempotente: identifica política, papel e permissão pelo que já existe e
 * atualiza no lugar. NUNCA apaga permissão que não esteja no arquivo — se
 * alguém concedeu algo pelo painel, cabe a uma pessoa decidir remover. O que o
 * script faz é avisar.
 *
 * --simular funciona SEM token e SEM Directus no ar: a tradução da matriz para
 * o formato do Directus é pura, então dá para revisar o que será concedido bem
 * antes de existir com quem aplicar.
 */
import { readFile } from 'node:fs/promises';

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const SIMULAR = process.argv.includes('--simular');

const cfg = JSON.parse(await readFile(new URL('./papeis.json', import.meta.url), 'utf8'));

/* Nome que o Directus dá à política de acesso público na instalação. Conferido
 * no banco desta instalação (directus_policies), não presumido. */
const NOME_POLITICA_PUBLICA = '$t:public_label';

/* ---------- tradução da matriz para o formato do Directus ---------- */

/** Filtro de linha correspondente ao escopo declarado. */
function filtroDeEscopo(escopo) {
  switch (escopo) {
    case 'tudo':
      return null;
    case 'secretaria':
      return { secretaria: { _eq: '$CURRENT_USER.secretaria' } };
    case 'propria_secretaria':
      // Na coleção 'secretarias' o vínculo é a própria chave primária.
      return { id: { _eq: '$CURRENT_USER.secretaria' } };
    default:
      throw new Error(`Escopo desconhecido em papeis.json: "${escopo}"`);
  }
}

function juntarFiltros(...filtros) {
  const validos = filtros.filter((f) => f && Object.keys(f).length > 0);
  if (validos.length === 0) return {};
  if (validos.length === 1) return validos[0];
  return { _and: validos };
}

/**
 * Uma entrada da matriz vira até três linhas em directus_permissions.
 *
 * A distinção que importa e que é fácil errar:
 *   'permissions' diz QUAIS LINHAS a ação alcança (o que já está no banco);
 *   'validation'  diz QUE VALORES o resultado pode ter (o que vai para o banco).
 * O fluxo editorial precisa das duas: sem 'permissions' o redator editaria um
 * item já publicado; sem 'validation' ele editaria o próprio rascunho e, na
 * mesma requisição, mudaria o status para 'publicado'.
 */
function permissoesDaColecao(colecao, regra) {
  const escopo = filtroDeEscopo(regra.escopo);
  const linhas = [];

  for (const acao of regra.acoes) {
    if (acao === 'read') {
      linhas.push({
        collection: colecao,
        action: 'read',
        permissions: juntarFiltros(escopo, { status: { _in: regra.situacoes_visiveis } }),
        validation: null,
        presets: null,
        fields: '*',
      });
    } else if (acao === 'create') {
      const presets = { status: regra.situacao_ao_criar };
      // Item nasce carimbado com a secretaria de quem criou: assim o próprio
      // filtro de escopo continua valendo no instante seguinte.
      if (regra.escopo === 'secretaria') presets.secretaria = '$CURRENT_USER.secretaria';
      linhas.push({
        collection: colecao,
        action: 'create',
        permissions: {},
        validation: { status: { _eq: regra.situacao_ao_criar } },
        presets,
        fields: '*',
      });
    } else if (acao === 'update') {
      linhas.push({
        collection: colecao,
        action: 'update',
        permissions: juntarFiltros(escopo, { status: { _in: regra.situacoes_editaveis } }),
        validation: { status: { _in: regra.situacoes_destino } },
        presets: null,
        fields: '*',
      });
    } else if (acao === 'delete') {
      throw new Error(`papeis.json concede 'delete' em ${colecao} — a política do projeto é arquivar, não apagar.`);
    } else {
      throw new Error(`Ação desconhecida em papeis.json: "${acao}"`);
    }
  }
  return linhas;
}

function permissoesDaPolitica(politica) {
  return Object.entries(politica.colecoes)
    .filter(([nome]) => !nome.startsWith('_'))
    .flatMap(([nome, regra]) => permissoesDaColecao(nome, regra));
}

function permissoesPublicas(pastaPublicaId) {
  const pub = cfg.publico;
  const linhas = Object.entries(pub.colecoes).map(([colecao, campos]) => ({
    collection: colecao,
    action: 'read',
    permissions: { status: { _eq: pub.filtro_situacao } },
    validation: null,
    presets: null,
    fields: campos.join(','),
  }));

  linhas.push({
    collection: 'directus_files',
    action: 'read',
    // Sem pasta resolvida (modo --simular offline) o filtro sai pelo nome, só
    // para inspeção; na aplicação real vai o id, que é o que o Directus indexa.
    permissions: pastaPublicaId
      ? { folder: { _eq: pastaPublicaId } }
      : { folder: { name: { _eq: pub.arquivos.pasta_publica } } },
    validation: null,
    presets: null,
    fields: pub.arquivos.campos.join(','),
  });

  return linhas;
}

/* ---------- modo simulação: não depende de Directus nenhum ---------- */

function imprimirPlano() {
  const linha = (t) => console.log(t);
  linha('\n=== SIMULAÇÃO — nada será escrito ===\n');

  linha(`Campo a criar em directus_users: "${cfg.campo_secretaria_no_usuario.campo}" → ${cfg.campo_secretaria_no_usuario.colecao_destino}\n`);

  for (const p of cfg.politicas) {
    linha(`POLÍTICA  ${p.nome}`);
    linha(`          app_access=${p.app_access}  admin_access=${p.admin_access}  2FA obrigatório=${p.enforce_tfa ? 'SIM' : 'não'}`);
    for (const perm of permissoesDaPolitica(p)) {
      linha(`   ${perm.action.padEnd(6)} ${perm.collection.padEnd(13)} linhas=${JSON.stringify(perm.permissions)}`);
      if (perm.validation) linha(`          ${' '.repeat(6)} ${' '.repeat(13)} valores=${JSON.stringify(perm.validation)}`);
      if (perm.presets) linha(`          ${' '.repeat(6)} ${' '.repeat(13)} padrão=${JSON.stringify(perm.presets)}`);
    }
    linha('');
  }

  for (const papel of cfg.papeis) {
    linha(`PAPEL     ${papel.nome}  ←  ${papel.politicas.join(' + ')}`);
  }

  linha(`\nPOLÍTICA PÚBLICA (${NOME_POLITICA_PUBLICA}) — somente leitura`);
  for (const perm of permissoesPublicas(null)) {
    linha(`   read   ${perm.collection.padEnd(15)} ${JSON.stringify(perm.permissions)}`);
    linha(`          ${' '.repeat(15)} campos: ${perm.fields}`);
  }

  const total = cfg.politicas.reduce((s, p) => s + permissoesDaPolitica(p).length, 0) + permissoesPublicas(null).length;
  linha(`\nTotal: ${cfg.politicas.length} políticas, ${cfg.papeis.length} papéis, ${total} permissões.\n`);
}

if (SIMULAR && !process.env.DIRECTUS_TOKEN && !process.env.DIRECTUS_EMAIL) {
  imprimirPlano();
  process.exit(0);
}

/* ---------- autenticação ---------- */

async function obterToken() {
  if (process.env.DIRECTUS_TOKEN) return process.env.DIRECTUS_TOKEN;
  const email = process.env.DIRECTUS_EMAIL;
  const senha = process.env.DIRECTUS_SENHA;
  if (!email || !senha) {
    throw new Error('Defina DIRECTUS_TOKEN, ou DIRECTUS_EMAIL e DIRECTUS_SENHA, de um administrador do Directus.');
  }
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  });
  if (!r.ok) throw new Error(`Falha no login: HTTP ${r.status} ${await r.text()}`);
  return (await r.json()).data.access_token;
}

const token = await obterToken();

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opcoes.headers ?? {}),
    },
  });
  return r;
}

async function pegar(caminho) {
  const r = await api(caminho);
  if (!r.ok) throw new Error(`GET ${caminho} → HTTP ${r.status} ${await r.text()}`);
  return (await r.json()).data;
}

async function enviar(metodo, caminho, corpo) {
  if (SIMULAR) {
    console.log(`  [simulação] ${metodo} ${caminho}`);
    return { id: '(simulado)' };
  }
  const r = await api(caminho, { method: metodo, body: JSON.stringify(corpo) });
  if (!r.ok) throw new Error(`${metodo} ${caminho} → HTTP ${r.status} ${await r.text()}`);
  return (await r.json()).data;
}

/* ---------- aplicação ---------- */

console.log(`Directus em ${BASE}${SIMULAR ? '  (SIMULAÇÃO)' : ''}\n`);

// 1. campo que liga a pessoa à secretaria
{
  const { campo, colecao_destino, nota } = cfg.campo_secretaria_no_usuario;
  const campos = await pegar('/fields/directus_users');
  if (campos.some((c) => c.field === campo)) {
    console.log(`= campo directus_users.${campo} já existe`);
  } else {
    console.log(`+ criando campo directus_users.${campo} → ${colecao_destino}`);
    await enviar('POST', '/fields/directus_users', {
      field: campo,
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: nota, width: 'half' },
      schema: {},
    });
    await enviar('POST', '/relations', {
      collection: 'directus_users',
      field: campo,
      related_collection: colecao_destino,
    });
  }
}

// 2. pasta dos arquivos públicos
let pastaPublicaId = null;
{
  const nome = cfg.publico.arquivos.pasta_publica;
  const pastas = await pegar('/folders?limit=-1');
  const achada = pastas.find((p) => p.name === nome);
  if (achada) {
    pastaPublicaId = achada.id;
    console.log(`= pasta de arquivos "${nome}" já existe`);
  } else {
    console.log(`+ criando pasta de arquivos "${nome}"`);
    const criada = await enviar('POST', '/folders', { name: nome });
    pastaPublicaId = criada.id;
  }
}

// 3. políticas
const politicasExistentes = await pegar('/policies?limit=-1');
const idPorPolitica = new Map(politicasExistentes.map((p) => [p.name, p.id]));

for (const p of cfg.politicas) {
  const corpo = {
    name: p.nome,
    icon: p.icone,
    description: p.descricao,
    app_access: p.app_access,
    admin_access: p.admin_access,
    enforce_tfa: p.enforce_tfa,
  };
  if (idPorPolitica.has(p.nome)) {
    console.log(`~ atualizando política "${p.nome}"`);
    await enviar('PATCH', `/policies/${idPorPolitica.get(p.nome)}`, corpo);
  } else {
    console.log(`+ criando política "${p.nome}"${p.enforce_tfa ? '  [2FA obrigatório]' : ''}`);
    const criada = await enviar('POST', '/policies', corpo);
    idPorPolitica.set(p.nome, criada.id);
  }
}

const idPublica = idPorPolitica.get(NOME_POLITICA_PUBLICA);
if (!idPublica && !SIMULAR) {
  throw new Error(`Política pública "${NOME_POLITICA_PUBLICA}" não encontrada — instalação do Directus fora do esperado.`);
}

// 4. papéis e a ligação papel → política (tabela directus_access)
const papeisExistentes = await pegar('/roles?limit=-1');
const idPorPapel = new Map(papeisExistentes.map((r) => [r.name, r.id]));

for (const papel of cfg.papeis) {
  let idPapel = idPorPapel.get(papel.nome);
  if (idPapel) {
    console.log(`= papel "${papel.nome}" já existe`);
  } else {
    console.log(`+ criando papel "${papel.nome}"`);
    const criado = await enviar('POST', '/roles', {
      name: papel.nome,
      icon: papel.icone,
      description: papel.descricao,
    });
    idPapel = criado.id;
    idPorPapel.set(papel.nome, idPapel);
  }

  const acessos = await pegar(`/access?limit=-1&filter[role][_eq]=${idPapel}`).catch(() => []);
  for (const nomePolitica of papel.politicas) {
    const idPolitica = idPorPolitica.get(nomePolitica);
    if (!idPolitica) throw new Error(`Papel "${papel.nome}" cita política inexistente "${nomePolitica}".`);
    if (acessos.some((a) => a.policy === idPolitica)) {
      console.log(`  = "${papel.nome}" já carrega "${nomePolitica}"`);
    } else {
      console.log(`  + ligando "${papel.nome}" → "${nomePolitica}"`);
      await enviar('POST', '/access', { role: idPapel, policy: idPolitica });
    }
  }
}

// 5. permissões
const permissoesExistentes = await pegar('/permissions?limit=-1');
const chave = (p) => `${p.policy}|${p.collection}|${p.action}`;
const existentePorChave = new Map(permissoesExistentes.map((p) => [chave(p), p]));
const declaradas = new Set();

async function aplicarPermissoes(idPolitica, rotulo, linhas) {
  for (const linha of linhas) {
    const corpo = { ...linha, policy: idPolitica };
    const k = chave(corpo);
    declaradas.add(k);
    const antiga = existentePorChave.get(k);
    if (antiga) {
      console.log(`  ~ ${rotulo}: ${linha.action} em ${linha.collection}`);
      await enviar('PATCH', `/permissions/${antiga.id}`, corpo);
    } else {
      console.log(`  + ${rotulo}: ${linha.action} em ${linha.collection}`);
      await enviar('POST', '/permissions', corpo);
    }
  }
}

console.log('\nPermissões:');
for (const p of cfg.politicas) {
  await aplicarPermissoes(idPorPolitica.get(p.nome), p.nome, permissoesDaPolitica(p));
}
if (idPublica) {
  await aplicarPermissoes(idPublica, 'acesso público', permissoesPublicas(pastaPublicaId));
}

// 6. o que existe no CMS e NÃO está no arquivo
const alheias = permissoesExistentes.filter((p) => {
  const nossa = [...idPorPolitica.entries()].some(
    ([nome, id]) => id === p.policy && (nome === NOME_POLITICA_PUBLICA || cfg.politicas.some((c) => c.nome === nome)),
  );
  return nossa && !declaradas.has(chave(p));
});

if (alheias.length) {
  console.log('\nATENÇÃO — permissões concedidas fora deste arquivo (o script NÃO as removeu):');
  for (const p of alheias) {
    console.log(`  ! ${p.action} em ${p.collection} (permissão #${p.id})`);
  }
  console.log('  Conferir no painel se foram concedidas de propósito. Remover é decisão de uma pessoa.');
}

console.log(`\n${SIMULAR ? 'Simulação concluída.' : 'Papéis e permissões aplicados.'}`);
