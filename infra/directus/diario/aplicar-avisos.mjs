#!/usr/bin/env node
/**
 * Estende as duas políticas de aviso por e-mail para cobrir o Diário Oficial.
 *
 * Reaproveita as MESMAS credenciais já criadas para licitações
 * (infra/directus/licitacoes/aplicar-avisos.mjs) em vez de criar um terceiro e
 * um quarto token. A separação que importa continua de pé, e é entre ESCREVER
 * na fila e DRENAR a fila:
 *
 *   token do portal    → cadastra assinante e enfileira. NÃO lê a fila.
 *   token da entrega   → lê e atualiza a fila. NÃO cadastra ninguém.
 *
 * Multiplicar tokens por módulo não acrescentaria isolamento: o processo web já
 * tem o primeiro, e o serviço de entrega já tem o segundo. Acrescentaria só
 * mais dois segredos para alguém esquecer de rotacionar.
 */
const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const SIMULAR = process.argv.includes('--simular');

const PERMISSOES_PORTAL = [
  { collection: 'diario_assinantes', action: 'create', permissions: {}, validation: null,
    presets: { confirmado: false }, fields: 'email,cadernos,secretarias,palavras_chave,token,criado_em,confirmado' },
  { collection: 'diario_assinantes', action: 'read', permissions: {}, validation: null, presets: null,
    fields: 'id,email,token,confirmado,cadernos,secretarias,palavras_chave' },
  { collection: 'diario_assinantes', action: 'update', permissions: {}, validation: null, presets: null,
    fields: 'confirmado,confirmado_em,cadernos,secretarias,palavras_chave' },
  { collection: 'diario_assinantes', action: 'delete', permissions: {}, validation: null, presets: null, fields: null },
  { collection: 'diario_envios', action: 'create', permissions: {}, validation: null,
    presets: { estado: 'pendente', tentativas: 0 },
    fields: 'destinatario,assunto,corpo_texto,corpo_html,tipo,criado_em,assinante,edicao,estado,tentativas' },
];

const PERMISSOES_ENTREGA = [
  { collection: 'diario_envios', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
  { collection: 'diario_envios', action: 'update', permissions: {}, validation: null, presets: null,
    fields: 'estado,tentativas,ultimo_erro,enviado_em' },
  { collection: 'diario_envios', action: 'create', permissions: {}, validation: null, presets: null, fields: '*' },
  { collection: 'diario_assinantes', action: 'read', permissions: {}, validation: null, presets: null,
    fields: 'id,email,token,confirmado,cadernos,secretarias,palavras_chave' },
  /* Para montar o assunto e o corpo do aviso de nova edição. */
  { collection: 'diario_edicoes', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
  { collection: 'diario_materias', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
  { collection: 'diario_cadernos', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
  { collection: 'diario_veiculo', action: 'read', permissions: {}, validation: null, presets: null, fields: '*' },
];

if (SIMULAR) {
  console.log('\n=== SIMULAÇÃO — avisos do Diário ===\n');
  console.log('Serviço — avisos de licitação (token do portal), acréscimo:');
  for (const p of PERMISSOES_PORTAL) console.log(`  ${p.action.padEnd(6)} ${p.collection}`);
  console.log('\nServiço — entrega de avisos (token do entregador), acréscimo:');
  for (const p of PERMISSOES_ENTREGA) console.log(`  ${p.action.padEnd(6)} ${p.collection}`);
  process.exit(0);
}

const token = process.env.DIRECTUS_TOKEN_ESQUEMA || process.env.DIRECTUS_TOKEN;
if (!token) { console.error('Defina DIRECTUS_TOKEN_ESQUEMA.'); process.exit(1); }

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, { ...opcoes,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opcoes.headers ?? {}) } });
  if (!r.ok) throw new Error(`${opcoes.method ?? 'GET'} ${caminho} → ${r.status} ${(await r.text()).slice(0, 250)}`);
  return r.status === 204 ? null : (await r.json()).data;
}

const politicas = await api('/policies?limit=-1');
const existentes = await api('/permissions?limit=-1');

async function estender(nome, permissoes) {
  const politica = politicas.find((p) => p.name === nome);
  if (!politica) {
    console.error(`! política "${nome}" não existe. Rode antes: node infra/directus/licitacoes/aplicar-avisos.mjs`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n${nome}`);
  for (const p of permissoes) {
    const antiga = existentes.find((x) => x.policy === politica.id && x.collection === p.collection && x.action === p.action);
    const corpo = { ...p, policy: politica.id };
    if (antiga) await api(`/permissions/${antiga.id}`, { method: 'PATCH', body: JSON.stringify(corpo) });
    else await api('/permissions', { method: 'POST', body: JSON.stringify(corpo) });
    console.log(`  ${p.action.padEnd(6)} ${p.collection}`);
  }
}

await estender('Serviço — avisos de licitação', PERMISSOES_PORTAL);
await estender('Serviço — entrega de avisos', PERMISSOES_ENTREGA);
console.log('\nAvisos do Diário Oficial habilitados.\n');
