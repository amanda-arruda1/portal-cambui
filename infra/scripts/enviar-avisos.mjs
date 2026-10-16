#!/usr/bin/env node
/**
 * Serviço de avisos de licitação — consome a fila e detecta novidades.
 *
 *   node enviar-avisos.mjs            entrega a fila e enfileira novos avisos
 *   node enviar-avisos.mjs --so-fila  só entrega o que está pendente
 *   node enviar-avisos.mjs --simular  mostra o que faria, sem enviar nada
 *
 * Roda pelo timer `portal-avisos`, separado do processo web. O portal escreve
 * na fila; quem fala com a internet é este script.
 *
 * Variáveis (em /opt/portal-cambui/.env):
 *   SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD
 *   AVISOS_REMETENTE       endereço que aparece no "De:"
 *   AVISOS_RESPONDER_PARA  opcional, para onde vai a resposta de quem responder
 *   PUBLIC_SITE_URL        base dos links do e-mail
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { enviar } from './smtp.mjs';

const BASE_CMS = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
/* Token do ENTREGADOR, não o do portal. São credenciais diferentes: o token do
 * processo web só escreve na fila; este lê e atualiza. Ver
 * infra/directus/licitacoes/aplicar-avisos.mjs. */
const TOKEN = process.env.AVISOS_TOKEN_ENTREGA;
/* Migração Directus → Payload: CMS_AVISOS=payload leva assinantes e fila de LICITAÇÕES para o Payload (conta de serviço
 * `servico_avisos_entrega`, chave em PAYLOAD_TOKEN_ENTREGA). O Diário Oficial segue no Directus. */
const USA_PAYLOAD = process.env.CMS_AVISOS === 'payload';
const BASE_PAYLOAD = (process.env.PAYLOAD_INTERNAL_URL || 'http://127.0.0.1:3000/cms').replace(/\/+$/, '');
const TOKEN_PAYLOAD = process.env.PAYLOAD_TOKEN_ENTREGA;
const SITE = (process.env.PUBLIC_SITE_URL || 'https://www.prefeituradecambui.mg.gov.br').replace(/\/+$/, '');
/* Diretório próprio, do usuário do serviço. O restante de data/ pertence ao
 * root (volumes do Docker), e o serviço roda como portal-web — escrever
 * direto em data/ dava EACCES. */
const MARCA_ULTIMA = '/opt/portal-cambui/data/avisos/ultima-execucao.json';

const SIMULAR = process.argv.includes('--simular');
const SO_FILA = process.argv.includes('--so-fila');

/** Depois de 5 tentativas o endereço é dado por perdido. Insistir para sempre
 *  num e-mail que não existe queima a reputação do domínio da prefeitura. */
const MAX_TENTATIVAS = 5;
/** Vazão: o Mail Protect, como qualquer relay, limita rajada. */
const PAUSA_ENTRE_ENVIOS_MS = 1200;
const MAX_POR_EXECUCAO = 200;

if (!TOKEN) { console.error('ERRO: defina AVISOS_TOKEN_ENTREGA (está em /opt/portal-cambui/.env).'); process.exit(1); }
if (USA_PAYLOAD && !TOKEN_PAYLOAD) { console.error('ERRO: CMS_AVISOS=payload exige PAYLOAD_TOKEN_ENTREGA em /opt/portal-cambui/.env.'); process.exit(1); }

const cfgSmtp = {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  usuario: process.env.SMTP_USER,
  senha: process.env.SMTP_PASSWORD,
  nome: 'portal.cambui.mg.gov.br',
};
const REMETENTE = process.env.AVISOS_REMETENTE || cfgSmtp.usuario;

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${BASE_CMS}${caminho}`, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(opcoes.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${opcoes.method ?? 'GET'} ${caminho} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : (await r.json()).data;
}

/** Payload: devolve o JSON cru (`docs`, `doc`...). */
async function apiPayload(caminho, opcoes = {}) {
  const r = await fetch(`${BASE_PAYLOAD}${caminho}`, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', Authorization: `contas-servico API-Key ${TOKEN_PAYLOAD}`, ...(opcoes.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`${opcoes.method ?? 'GET'} ${caminho.split('?')[0]} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : await r.json();
}

const semAcento = (t) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ───────────────────────  1. detectar novas licitações  ─────────────────── */

async function marcaAnterior() {
  if (!existsSync(MARCA_ULTIMA)) return null;
  try { return JSON.parse(await readFile(MARCA_ULTIMA, 'utf8')).em ?? null; } catch { return null; }
}

/** Assinante interessado? Sem modalidade e sem palavra marcadas = tudo. */
function interessa(assinante, licitacao) {
  const modalidades = (assinante.modalidades ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (modalidades.length && !modalidades.includes(licitacao.modalidade)) return false;

  const palavras = (assinante.palavras_chave ?? '').split(',').map((s) => semAcento(s.trim())).filter(Boolean);
  if (!palavras.length) return true;
  const alvo = semAcento(`${licitacao.objeto_resumo} ${licitacao.numero_processo}`);
  return palavras.some((p) => alvo.includes(p));
}

function corpoAviso(licitacao, assinante) {
  const link = `${SITE}/licitacoes/${licitacao.ano}/${licitacao.slug}`;
  const sair = `${SITE}/licitacoes/avisos/sair?t=${assinante.token}`;
  const quando = licitacao.data_sessao
    ? new Date(licitacao.data_sessao).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : null;
  const numero = `${String(licitacao.numero).padStart(3, '0')}/${licitacao.ano}`;

  const texto = [
    'Prefeitura Municipal de Cambuí — nova licitação publicada',
    '',
    `${licitacao.modalidade_rotulo} nº ${numero}`,
    licitacao.objeto_resumo,
    '',
    quando ? `Sessão pública: ${quando} (horário de Brasília)` : 'Sessão pública: data ainda não divulgada',
    `Processo administrativo: ${licitacao.numero_processo}`,
    '',
    `Edital e demais documentos: ${link}`,
    '',
    '--',
    'Você recebe este aviso porque cadastrou seu e-mail no portal da Prefeitura.',
    `Para sair da lista, em um clique: ${sair}`,
    '',
    'A divulgação oficial ocorre no PNCP e no veículo oficial do Município.',
    'Em caso de divergência, prevalece o edital publicado oficialmente.',
  ].join('\n');

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#e9edea;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#141c18;line-height:1.6">
<table role="presentation" style="max-width:560px;margin:0 auto;background:#fff;border-radius:6px;border-top:5px solid #0c5430" cellpadding="0" cellspacing="0" width="100%">
<tr><td style="padding:28px 28px 4px">
<p style="margin:0;font-size:13px;letter-spacing:.09em;text-transform:uppercase;color:#4c5a51">Nova licitação · Prefeitura de Cambuí</p>
<p style="margin:10px 0 0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#a8303c">${escapar(licitacao.modalidade_rotulo)} nº ${numero}</p>
<h1 style="margin:6px 0 0;font-size:22px;line-height:1.25">${escapar(licitacao.objeto_resumo)}</h1>
</td></tr>
<tr><td style="padding:16px 28px">
<p style="margin:0 0 6px"><strong>Sessão pública:</strong> ${quando ? escapar(quando) + ' (horário de Brasília)' : 'data ainda não divulgada'}</p>
<p style="margin:0 0 20px"><strong>Processo:</strong> ${escapar(licitacao.numero_processo)}</p>
<p style="margin:0 0 8px"><a href="${link}" style="display:inline-block;background:#0c5430;color:#fff;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:4px">Ver o edital e os anexos</a></p>
</td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid #e9edea;font-size:12px;color:#4c5a51">
<p style="margin:0 0 6px">Você recebe este aviso porque cadastrou seu e-mail no portal. <a href="${sair}" style="color:#a8303c">Sair da lista em um clique</a>.</p>
<p style="margin:0">A divulgação oficial ocorre no PNCP e no veículo oficial do Município. Em caso de divergência, prevalece o edital publicado oficialmente.</p>
</td></tr></table></body></html>`;

  return { assunto: `Nova licitação em Cambuí: ${licitacao.objeto_resumo.slice(0, 70)}`, texto, html, sair };
}

async function enfileirarNovidades() {
  const desde = await marcaAnterior();
  const agora = new Date().toISOString();

  if (!desde) {
    // Primeira execução: NÃO dispara aviso retroativo de tudo o que já existe.
    await writeFile(MARCA_ULTIMA, JSON.stringify({ em: agora }, null, 2) + '\n');
    console.log('  primeira execução — marco gravado, nenhum aviso retroativo enviado');
    return 0;
  }

  const p = new URLSearchParams({
    limit: '100', sort: 'data_publicacao',
    fields: 'id,numero,ano,slug,modalidade,objeto_resumo,numero_processo,data_sessao,data_publicacao',
    'filter[status][_eq]': 'publicado',
    'filter[data_publicacao][_gt]': desde,
  });
  let novas;
  if (USA_PAYLOAD) {
    // O gatilho é o EVENTO `publicacao` (criado pelo hook no instante em que a licitação vai ao ar), não `dataPublicacao`:
    // essa é a data do edital e quase sempre é anterior ao dia em que o setor publica no portal — filtrar por ela perderia o aviso.
    const q = new URLSearchParams({ limit: '100', depth: '1', sort: 'createdAt', 'where[tipo][equals]': 'publicacao', 'where[createdAt][greater_than]': desde });
    const vistos = new Set();
    novas = (await apiPayload(`/api/licitacao-eventos?${q}`)).docs
      .map((e) => e.licitacao)
      .filter((d) => d && typeof d === 'object' && d.status === 'publicado' && !vistos.has(d.id) && vistos.add(d.id))
      .map((d) => ({
        id: d.id, numero: d.numero, ano: d.ano, slug: d.slug, modalidade: d.modalidade, objeto_resumo: d.objetoResumo,
        numero_processo: d.numeroProcesso, data_sessao: d.dataSessao, data_publicacao: d.dataPublicacao,
      }));
  } else {
    novas = await api(`/items/licitacoes?${p}`);
  }
  if (!novas.length) { await writeFile(MARCA_ULTIMA, JSON.stringify({ em: agora }, null, 2) + '\n'); return 0; }

  const assinantes = USA_PAYLOAD
    ? (await apiPayload('/api/licitacao-assinantes?limit=0&pagination=false&depth=0&where[confirmado][equals]=true')).docs.map((a) => ({
        id: a.id, email: a.email, token: a.token, confirmado: a.confirmado, modalidades: a.modalidades, palavras_chave: a.palavrasChave,
      }))
    : await api('/items/licitacao_assinantes?limit=-1&fields=id,email,token,confirmado,modalidades,palavras_chave&filter[confirmado][_eq]=true');
  const { MODALIDADES } = await import('../directus/licitacoes/enums.mjs');
  const rotulo = (v) => MODALIDADES.find((m) => m.valor === v)?.rotulo ?? v;

  let enfileirados = 0;
  for (const l of novas) {
    l.modalidade_rotulo = rotulo(l.modalidade);
    for (const a of assinantes) {
      if (!interessa(a, l)) continue;
      const c = corpoAviso(l, a);
      if (SIMULAR) { console.log(`  [simulação] aviso de ${l.numero}/${l.ano} → ${a.email}`); enfileirados++; continue; }
      if (USA_PAYLOAD) {
        await apiPayload('/api/licitacao-envios', { method: 'POST', body: JSON.stringify({
          destinatario: a.email, assunto: c.assunto, corpoTexto: c.texto, corpoHtml: c.html,
          tipo: 'aviso', estado: 'pendente', tentativas: 0, criadoEm: new Date().toISOString(), assinante: a.id, licitacao: l.id,
        }) });
      } else {
        await api('/items/licitacao_envios', { method: 'POST', body: JSON.stringify({
          destinatario: a.email, assunto: c.assunto, corpo_texto: c.texto, corpo_html: c.html,
          tipo: 'aviso', estado: 'pendente', tentativas: 0,
          criado_em: new Date().toISOString(), assinante: a.id, licitacao: l.id,
        }) });
      }
      enfileirados++;
    }
  }

  if (!SIMULAR) await writeFile(MARCA_ULTIMA, JSON.stringify({ em: agora }, null, 2) + '\n');
  console.log(`  ${novas.length} licitação(ões) nova(s) · ${enfileirados} aviso(s) enfileirado(s)`);
  return enfileirados;
}

/* ───────────────────────  2. entregar a fila  ─────────────────── */

/* Acesso às filas. `licitacao_envios` vai ao Payload quando CMS_AVISOS=payload.
 * Todas devolvem/aceitam o formato do Directus (snake_case) para o resto do script não saber de onde veio. */
const noPayload = (colecao) => USA_PAYLOAD && colecao === 'licitacao_envios';

async function listarPendentes(colecao) {
  if (noPayload(colecao)) {
    const q = new URLSearchParams({ limit: String(MAX_POR_EXECUCAO), depth: '1', sort: 'criadoEm', 'where[estado][equals]': 'pendente' });
    return (await apiPayload(`/api/licitacao-envios?${q}`)).docs.map((d) => ({
      id: d.id, destinatario: d.destinatario, assunto: d.assunto, corpo_texto: d.corpoTexto, corpo_html: d.corpoHtml,
      tipo: d.tipo, tentativas: d.tentativas, assinante: d.assinante && typeof d.assinante === 'object' ? { token: d.assinante.token } : null,
    }));
  }
  const p = new URLSearchParams({
    limit: String(MAX_POR_EXECUCAO), sort: 'criado_em',
    fields: 'id,destinatario,assunto,corpo_texto,corpo_html,tipo,tentativas,assinante.token',
    'filter[estado][_eq]': 'pendente',
  });
  return api(`/items/${colecao}?${p}`);
}

async function listarFalhas(colecao) {
  if (noPayload(colecao)) {
    const q = new URLSearchParams({ limit: '100', depth: '0', 'where[estado][equals]': 'falhou' });
    return (await apiPayload(`/api/licitacao-envios?${q}`)).docs.map((d) => ({ id: d.id, tentativas: d.tentativas, date_created: d.createdAt }));
  }
  return api(`/items/${colecao}?limit=100&fields=id,tentativas,date_created&filter[estado][_eq]=falhou`);
}

async function atualizarEnvio(colecao, id, campos) {
  if (noPayload(colecao)) {
    const mapa = { enviado_em: 'enviadoEm', ultimo_erro: 'ultimoErro' };
    const corpo = Object.fromEntries(Object.entries(campos).map(([k, v]) => [mapa[k] ?? k, v]));
    return apiPayload(`/api/licitacao-envios/${id}`, { method: 'PATCH', body: JSON.stringify(corpo) });
  }
  return api(`/items/${colecao}/${id}`, { method: 'PATCH', body: JSON.stringify(campos) });
}

/**
 * Drena UMA fila. Parametrizada porque agora existem duas — licitações e
 * Diário Oficial — e duplicar esta função seria garantir que, no dia em que
 * alguém corrigir um defeito de entrega, corrija só numa delas.
 *
 * @param {string} colecao       nome da coleção da fila
 * @param {string} caminhoSaida  rota de descadastro, para o List-Unsubscribe
 * @param {string} rotulo        o que aparece no log
 */
async function entregarFila(colecao, caminhoSaida, rotulo) {
  const fila = await listarPendentes(colecao);
  if (!fila.length) { console.log(`  fila de ${rotulo}: vazia`); return { enviados: 0, falhas: 0 }; }

  if (!cfgSmtp.host) {
    console.log(`  ${fila.length} mensagem(ns) na fila, mas SMTP_HOST não está definido — nada enviado.`);
    console.log('  A fila é durável: assim que o SMTP for configurado, tudo sai na próxima execução.');
    return { enviados: 0, falhas: 0 };
  }

  let enviados = 0, falhas = 0;
  for (const m of fila) {
    if (SIMULAR) { console.log(`  [simulação] ${m.tipo} → ${m.destinatario}`); enviados++; continue; }
    try {
      const aceite = await enviar(cfgSmtp, {
        de: REMETENTE,
        deNome: 'Prefeitura Municipal de Cambuí',
        para: m.destinatario,
        assunto: m.assunto,
        texto: m.corpo_texto,
        html: m.corpo_html,
        responderPara: process.env.AVISOS_RESPONDER_PARA || undefined,
        listaDescadastro: m.assinante?.token ? `${SITE}${caminhoSaida}?t=${m.assinante.token}` : undefined,
      });
      await atualizarEnvio(colecao, m.id, { estado: 'enviado', enviado_em: new Date().toISOString(), tentativas: (m.tentativas ?? 0) + 1 });
      enviados++;
      // Nunca registrar o endereço no journal: base de assinante é dado
      // pessoal, e log de servidor não é lugar para ela. O identificador do
      // relay, sim: é o que permite rastrear a entrega no painel do provedor.
      console.log(`  enviado (${m.tipo}) — ${aceite}`);
    } catch (erro) {
      const tentativas = (m.tentativas ?? 0) + 1;
      const desistiu = tentativas >= MAX_TENTATIVAS;
      await atualizarEnvio(colecao, m.id, { estado: desistiu ? 'desistiu' : 'falhou', tentativas, ultimo_erro: String(erro.message).slice(0, 400) });
      falhas++;
      console.warn(`  FALHA (${m.tipo}, tentativa ${tentativas}${desistiu ? ' — desistindo' : ''}): ${erro.message}`);
    }
    await new Promise((r) => setTimeout(r, PAUSA_ENTRE_ENVIOS_MS));
  }
  return { enviados, falhas };
}

/** Devolve à fila o que falhou e ainda tem tentativa — espera crescente. */
async function reagendarFalhas(colecao) {
  const fila = await listarFalhas(colecao);
  let voltaram = 0;
  for (const m of fila) {
    const espera = Math.min(2 ** (m.tentativas ?? 1), 60) * 60_000; // 2, 4, 8… até 60 min
    if (Date.now() - new Date(m.date_created).getTime() < espera) continue;
    if (!SIMULAR) await atualizarEnvio(colecao, m.id, { estado: 'pendente' });
    voltaram++;
  }
  if (voltaram) console.log(`  ${voltaram} mensagem(ns) reagendada(s) para nova tentativa`);
}

/* ───────────────────────  execução  ─────────────────── */

console.log(`avisos do portal — ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}${SIMULAR ? ' (SIMULAÇÃO)' : ''}`);

if (!SO_FILA) {
  await enfileirarNovidades();
}

/* Fila de entrega. Hoje só há a de licitações; a lista fica para acolher outras no mesmo SMTP. */
const FILAS = [
  { colecao: 'licitacao_envios', saida: '/licitacoes/avisos/sair', rotulo: 'licitações' },
];

let enviados = 0, falhas = 0;
for (const f of FILAS) {
  await reagendarFalhas(f.colecao);
  const r = await entregarFila(f.colecao, f.saida, f.rotulo);
  enviados += r.enviados; falhas += r.falhas;
}
console.log(`  resultado: ${enviados} enviada(s), ${falhas} falha(s)`);
