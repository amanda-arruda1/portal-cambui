#!/usr/bin/env node
/**
 * Atualiza os indicadores econômicos (IPCA, Selic, CDI, Dólar) no Directus.
 *
 *   node atualizar-indicadores.mjs            busca e grava
 *   node atualizar-indicadores.mjs --simular  só imprime o que gravaria
 *
 * Roda pelo timer `portal-indicadores`, SEPARADO do processo web — mesmo
 * raciocínio de enviar-avisos.mjs: o portal-web roda com IPAddressDeny=any
 * e não alcança a internet; este script é o único ponto que fala com
 * api.bcb.gov.br e economia.awesomeapi.com.br.
 *
 * Duas fontes:
 *   - SGS/Banco Central para as três taxas oficiais (IPCA, Selic, CDI);
 *   - AwesomeAPI só para o dólar — cotação corrente com variação do dia já
 *     calculada, que é o que "o dólar hoje" costuma significar (o SGS
 *     também tem série de câmbio, mas é fechamento do dia anterior).
 *
 * Cada indicador é buscado de forma independente: uma fonte fora do ar não
 * derruba as outras três, e o script GRAVA o que conseguiu — nunca zera um
 * indicador que já tinha valor bom só porque a fonte falhou nesta rodada
 * (ver mesclarComExistente, abaixo).
 *
 * Variável (em /opt/portal-cambui/.env): INDICADORES_TOKEN — gerado por
 * infra/directus/indicadores/aplicar.mjs.
 */

const BASE_CMS = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const TOKEN = process.env.INDICADORES_TOKEN;
const SIMULAR = process.argv.includes('--simular');
const TEMPO_LIMITE_MS = 8000;

if (!TOKEN) { console.error('ERRO: defina INDICADORES_TOKEN (está em /opt/portal-cambui/.env).'); process.exit(1); }

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${BASE_CMS}${caminho}`, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(opcoes.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${opcoes.method ?? 'GET'} ${caminho} → ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : (await r.json()).data;
}

/* ---------- SGS/Banco Central ---------- */

const SGS = { ipca: 13522, selic: 432, cdiDiario: 12 };

function paraNumero(bruto) {
  return Number.parseFloat(String(bruto).replace(',', '.'));
}

function mesAno(dataBr) {
  const [, mes, ano] = dataBr.split('/');
  const d = new Date(Number(ano), Number(mes) - 1, 1);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(d);
}

async function buscarSGS(codigo, ultimos) {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/${ultimos}?formato=json`;
  const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
  if (!r.ok) throw new Error(`SGS ${codigo}: HTTP ${r.status}`);
  const corpo = await r.json();
  if (!Array.isArray(corpo) || corpo.length === 0) throw new Error(`SGS ${codigo}: resposta vazia`);
  return corpo;
}

async function buscarIpca() {
  const pontos = await buscarSGS(SGS.ipca, 2);
  const atual = pontos.at(-1);
  const anterior = pontos.at(-2);
  return {
    chave: 'ipca', rotulo: 'IPCA', descricao: 'Inflação acumulada em 12 meses',
    valor: paraNumero(atual.valor), unidade: 'percentual',
    variacao: anterior ? paraNumero(atual.valor) - paraNumero(anterior.valor) : null,
    referencia: mesAno(atual.data), fonte: 'Banco Central (SGS)',
  };
}

async function buscarSelic() {
  const pontos = await buscarSGS(SGS.selic, 2);
  const atual = pontos.at(-1);
  const anterior = pontos.at(-2);
  return {
    chave: 'selic', rotulo: 'Selic', descricao: 'Taxa básica de juros (meta Copom, ao ano)',
    valor: paraNumero(atual.valor), unidade: 'percentual',
    variacao: anterior ? paraNumero(atual.valor) - paraNumero(anterior.valor) : null,
    referencia: mesAno(atual.data), fonte: 'Banco Central (SGS)',
  };
}

/** CDI anualizado a partir da taxa diária — (1 + diária)^252 − 1, base 252
 *  (dias úteis do ano financeiro brasileiro, convenção de mercado). É o
 *  mesmo cálculo que qualquer corretora usa para anunciar "CDI a.a."; a série
 *  mensal do SGS (4391) é a variação DO MÊS corrente, não o anualizado que o
 *  público reconhece como "o CDI". */
async function buscarCdi() {
  const pontos = await buscarSGS(SGS.cdiDiario, 2);
  const atual = pontos.at(-1);
  const anterior = pontos.at(-2);
  const anualizar = (diariaPct) => (Math.pow(1 + diariaPct / 100, 252) - 1) * 100;
  const valor = anualizar(paraNumero(atual.valor));
  const valorAnterior = anterior ? anualizar(paraNumero(anterior.valor)) : null;
  return {
    chave: 'cdi', rotulo: 'CDI', descricao: 'Certificado de Depósito Interbancário, anualizado',
    valor, unidade: 'percentual',
    variacao: valorAnterior !== null ? valor - valorAnterior : null,
    referencia: `dia útil ${atual.data}`, fonte: 'Banco Central (SGS), taxa diária anualizada',
  };
}

async function buscarDolar() {
  const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
  if (!r.ok) throw new Error(`AwesomeAPI USD-BRL: HTTP ${r.status}`);
  const corpo = await r.json();
  const c = corpo.USDBRL;
  if (!c) throw new Error('AwesomeAPI USD-BRL: campo USDBRL ausente');

  const d = new Date(c.create_date.replace(' ', 'T'));
  const referencia = Number.isNaN(d.getTime())
    ? null
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(d);

  return {
    chave: 'dolar', rotulo: 'Dólar comercial', descricao: 'Cotação em reais (compra)',
    valor: paraNumero(c.bid), unidade: 'moeda', variacao: paraNumero(c.pctChange),
    referencia, fonte: 'AwesomeAPI',
  };
}

/* ---------- execução ---------- */

const BUSCADORES = { ipca: buscarIpca, selic: buscarSelic, cdi: buscarCdi, dolar: buscarDolar };

const resultados = await Promise.allSettled(Object.values(BUSCADORES).map((f) => f()));
const chaves = Object.keys(BUSCADORES);

const novosPorChave = {};
resultados.forEach((resultado, i) => {
  const chave = chaves[i];
  if (resultado.status === 'fulfilled') {
    novosPorChave[chave] = resultado.value;
    console.log(`+ ${chave}: ${resultado.value.valor}`);
  } else {
    console.warn(`! ${chave}: ${resultado.reason?.message ?? resultado.reason}`);
  }
});

if (Object.keys(novosPorChave).length === 0) {
  console.error('Nenhuma fonte respondeu — nada gravado, o cartão continua com o último valor bom.');
  process.exit(1);
}

/* Não apaga o que uma fonte fora do ar não conseguiu atualizar agora — só
 * sobrescreve o item cuja busca desta rodada deu certo. */
async function mesclarComExistente() {
  try {
    const atual = await api('/items/indicadores_economicos?fields=itens');
    return Array.isArray(atual?.itens) ? atual.itens : [];
  } catch {
    return [];
  }
}

const existentes = await mesclarComExistente();
const itens = chaves.map((chave) => novosPorChave[chave] ?? existentes.find((i) => i.chave === chave) ?? null).filter(Boolean);

if (SIMULAR) {
  console.log('\n--simular: gravaria em indicadores_economicos:');
  console.log(JSON.stringify({ itens, atualizado_em: new Date().toISOString() }, null, 2));
  process.exit(0);
}

const corpo = JSON.stringify({ itens, atualizado_em: new Date().toISOString() });
try {
  await api('/items/indicadores_economicos', { method: 'PATCH', body: corpo });
} catch (erroPatch) {
  // Singleton sem linha ainda (primeira execução deste serviço): cria.
  await api('/items/indicadores_economicos', { method: 'POST', body: corpo });
}

console.log(`\n${Object.keys(novosPorChave).length}/${chaves.length} indicador(es) atualizado(s) nesta rodada, ${itens.length}/${chaves.length} publicados no total.`);
