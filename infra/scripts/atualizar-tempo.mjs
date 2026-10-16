#!/usr/bin/env node
/**
 * Atualiza a previsão do tempo de Cambuí/MG no Payload (Global `previsao-tempo`).
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
 * Variável (em /opt/portal-cambui/.env): PAYLOAD_TOKEN_DADOS — gerada por
 * novo-cms-payload/scripts/criar-conta-dados-externos.ts.
 */

// Destino: Global `previsao-tempo` do Payload (conta de serviço `dados_externos`, chave em PAYLOAD_TOKEN_DADOS).
const BASE_PAYLOAD = (process.env.PAYLOAD_INTERNAL_URL || 'http://127.0.0.1:3000/cms').replace(/\/+$/, '');
const TOKEN_PAYLOAD = process.env.PAYLOAD_TOKEN_DADOS;
const SIMULAR = process.argv.includes('--simular');
const TEMPO_LIMITE_MS = 8000;

if (!TOKEN_PAYLOAD) { console.error('ERRO: defina PAYLOAD_TOKEN_DADOS em /opt/portal-cambui/.env.'); process.exit(1); }

// Cambuí/MG — mesmas coordenadas de apps/web/src/pages/a-cidade.astro (MAPA).
const LATITUDE = -22.6122501;
const LONGITUDE = -46.0572137;

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

const agora = new Date().toISOString();
{
  const r = await fetch(`${BASE_PAYLOAD}/api/globals/previsao-tempo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `contas-servico API-Key ${TOKEN_PAYLOAD}` },
    body: JSON.stringify({
      temperatura: dados.temperatura, sensacaoTermica: dados.sensacao_termica, codigoTempo: dados.codigo_tempo,
      umidade: dados.umidade, ventoKmh: dados.vento_kmh, atualizadoEm: agora,
    }),
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
  if (!r.ok) throw new Error(`Payload: POST previsao-tempo → ${r.status} ${(await r.text()).slice(0, 300)}`);
}
console.log('previsao-tempo atualizada.');
