#!/usr/bin/env node
/**
 * Atualiza a previsão do tempo de Cambuí/MG no Directus.
 *
 *   node atualizar-tempo.mjs            busca e grava
 *   node atualizar-tempo.mjs --simular  só imprime o que gravaria
 *
 * Roda pelo timer `portal-tempo`, SEPARADO do processo web — mesmo
 * raciocínio de atualizar-indicadores.mjs: o portal-web roda com
 * IPAddressDeny=any e não alcança a internet.
 *
 * Fonte: Open-Meteo (api.open-meteo.com) — sem chave, gratuita, sem limite
 * de requisições relevante para este uso. Coordenadas são as MESMAS já
 * geocodificadas (OSM/Nominatim, não estimadas) usadas no mapa da página
 * "A cidade" (apps/web/src/pages/a-cidade.astro, constante MAPA).
 *
 * Variável (em /opt/portal-cambui/.env): TEMPO_TOKEN — gerado por
 * infra/directus/tempo/aplicar.mjs.
 */

const BASE_CMS = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const TOKEN = process.env.TEMPO_TOKEN;
const SIMULAR = process.argv.includes('--simular');
const TEMPO_LIMITE_MS = 8000;

if (!TOKEN) { console.error('ERRO: defina TEMPO_TOKEN (está em /opt/portal-cambui/.env).'); process.exit(1); }

// Cambuí/MG — mesmas coordenadas de apps/web/src/pages/a-cidade.astro (MAPA).
const LATITUDE = -22.6122501;
const LONGITUDE = -46.0572137;

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${BASE_CMS}${caminho}`, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(opcoes.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${opcoes.method ?? 'GET'} ${caminho} → ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : (await r.json()).data;
}

async function buscarTempo() {
  const parametros = new URLSearchParams({
    latitude: String(LATITUDE),
    longitude: String(LONGITUDE),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
    timezone: 'America/Sao_Paulo',
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${parametros}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
  if (!r.ok) throw new Error(`Open-Meteo: HTTP ${r.status}`);
  const corpo = await r.json();
  const c = corpo.current;
  if (!c || typeof c.temperature_2m !== 'number') throw new Error('Open-Meteo: resposta sem "current" válido');

  return {
    temperatura: c.temperature_2m,
    sensacao_termica: c.apparent_temperature ?? null,
    codigo_tempo: c.weather_code,
    umidade: c.relative_humidity_2m ?? null,
    vento_kmh: c.wind_speed_10m ?? null,
  };
}

const dados = await buscarTempo();
console.log(`+ temperatura: ${dados.temperatura}°C, sensação ${dados.sensacao_termica}°C, código WMO ${dados.codigo_tempo}`);

if (SIMULAR) {
  console.log('\n--simular: gravaria em previsao_tempo:');
  console.log(JSON.stringify({ ...dados, atualizado_em: new Date().toISOString() }, null, 2));
  process.exit(0);
}

const corpo = JSON.stringify({ ...dados, atualizado_em: new Date().toISOString() });
try {
  await api('/items/previsao_tempo', { method: 'PATCH', body: corpo });
} catch (erroPatch) {
  // Singleton sem linha ainda (primeira execução deste serviço): cria.
  await api('/items/previsao_tempo', { method: 'POST', body: corpo });
}

console.log('previsao_tempo atualizada.');
