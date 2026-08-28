#!/usr/bin/env node
/**
 * Concede a TODA política de painel o direito de ler o PRÓPRIO perfil.
 *
 * O PROBLEMA, que é silencioso e por isso perigoso: o portal lê o perfil com
 *
 *   /users/me?fields=id,first_name,last_name,email,tfa_secret,role.name,secretaria.id,secretaria.nome
 *
 * e `secretaria` é um campo CUSTOMIZADO em directus_users. Quando a política do
 * usuário não enxerga um campo relacional pedido, o Directus **não devolve
 * erro**: ele descarta a projeção inteira e responde apenas `{id}`. O portal
 * então conclui "conta sem função definida no portal" e recusa a entrada — com
 * uma mensagem que manda a pessoa procurar a TI por um problema que não é dela.
 *
 * Consequência: NENHUM usuário sem admin_access conseguia entrar no painel.
 * Como até aqui só o Administrator havia entrado, ninguém tinha visto.
 *
 *   node infra/directus/corrigir-perfil-painel.mjs [--simular]
 */
const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const SIMULAR = process.argv.includes('--simular');
const token = process.env.DIRECTUS_TOKEN_ESQUEMA || process.env.DIRECTUS_TOKEN;
if (!token) { console.error('Defina DIRECTUS_TOKEN_ESQUEMA.'); process.exit(1); }

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, { ...opcoes,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opcoes.headers ?? {}) } });
  if (!r.ok) throw new Error(`${opcoes.method ?? 'GET'} ${caminho} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : (await r.json()).data;
}

const PERMISSOES = [
  { collection: 'directus_users', action: 'read',
    /* Só o próprio registro: ninguém lista os colegas por esta permissão. */
    permissions: { id: { _eq: '$CURRENT_USER' } }, validation: null, presets: null,
    fields: 'id,first_name,last_name,email,tfa_secret,role,secretaria,status' },
  { collection: 'secretarias', action: 'read', permissions: {}, validation: null, presets: null,
    fields: 'id,nome,slug' },
];

const politicas = (await api('/policies?limit=-1'))
  .filter((p) => p.app_access && !p.admin_access);

if (SIMULAR) {
  console.log('\n=== SIMULAÇÃO ===\n');
  for (const p of politicas) console.log(`  ${p.name}`);
  console.log(`\n${politicas.length} política(s) de painel receberiam leitura do próprio perfil.\n`);
  process.exit(0);
}

const existentes = await api('/permissions?limit=-1');
for (const p of politicas) {
  for (const perm of PERMISSOES) {
    const antiga = existentes.find((x) => x.policy === p.id && x.collection === perm.collection && x.action === perm.action);
    const corpo = { ...perm, policy: p.id };
    if (antiga) await api(`/permissions/${antiga.id}`, { method: 'PATCH', body: JSON.stringify(corpo) });
    else await api('/permissions', { method: 'POST', body: JSON.stringify(corpo) });
  }
  console.log(`  ✓ ${p.name}`);
}
console.log(`\n${politicas.length} política(s) corrigida(s). Agora todo papel de painel lê o próprio perfil.\n`);
