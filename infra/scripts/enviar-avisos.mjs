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
  const novas = await api(`/items/licitacoes?${p}`);
  if (!novas.length) { await writeFile(MARCA_ULTIMA, JSON.stringify({ em: agora }, null, 2) + '\n'); return 0; }

  const assinantes = await api('/items/licitacao_assinantes?limit=-1&fields=id,email,token,confirmado,modalidades,palavras_chave&filter[confirmado][_eq]=true');
  const { MODALIDADES } = await import('../directus/licitacoes/enums.mjs');
  const rotulo = (v) => MODALIDADES.find((m) => m.valor === v)?.rotulo ?? v;

  let enfileirados = 0;
  for (const l of novas) {
    l.modalidade_rotulo = rotulo(l.modalidade);
    for (const a of assinantes) {
      if (!interessa(a, l)) continue;
      const c = corpoAviso(l, a);
      if (SIMULAR) { console.log(`  [simulação] aviso de ${l.numero}/${l.ano} → ${a.email}`); enfileirados++; continue; }
      await api('/items/licitacao_envios', { method: 'POST', body: JSON.stringify({
        destinatario: a.email, assunto: c.assunto, corpo_texto: c.texto, corpo_html: c.html,
        tipo: 'aviso', estado: 'pendente', tentativas: 0,
        criado_em: new Date().toISOString(), assinante: a.id, licitacao: l.id,
      }) });
      enfileirados++;
    }
  }

  if (!SIMULAR) await writeFile(MARCA_ULTIMA, JSON.stringify({ em: agora }, null, 2) + '\n');
  console.log(`  ${novas.length} licitação(ões) nova(s) · ${enfileirados} aviso(s) enfileirado(s)`);
  return enfileirados;
}

/* ───────────────────────  2. entregar a fila  ─────────────────── */

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
  const p = new URLSearchParams({
    limit: String(MAX_POR_EXECUCAO), sort: 'criado_em',
    fields: 'id,destinatario,assunto,corpo_texto,corpo_html,tipo,tentativas,assinante.token',
    'filter[estado][_eq]': 'pendente',
  });
  const fila = await api(`/items/${colecao}?${p}`);
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
      await api(`/items/${colecao}/${m.id}`, { method: 'PATCH', body: JSON.stringify({
        estado: 'enviado', enviado_em: new Date().toISOString(), tentativas: (m.tentativas ?? 0) + 1,
      }) });
      enviados++;
      // Nunca registrar o endereço no journal: base de assinante é dado
      // pessoal, e log de servidor não é lugar para ela. O identificador do
      // relay, sim: é o que permite rastrear a entrega no painel do provedor.
      console.log(`  enviado (${m.tipo}) — ${aceite}`);
    } catch (erro) {
      const tentativas = (m.tentativas ?? 0) + 1;
      const desistiu = tentativas >= MAX_TENTATIVAS;
      await api(`/items/${colecao}/${m.id}`, { method: 'PATCH', body: JSON.stringify({
        estado: desistiu ? 'desistiu' : 'falhou', tentativas, ultimo_erro: String(erro.message).slice(0, 400),
      }) });
      falhas++;
      console.warn(`  FALHA (${m.tipo}, tentativa ${tentativas}${desistiu ? ' — desistindo' : ''}): ${erro.message}`);
    }
    await new Promise((r) => setTimeout(r, PAUSA_ENTRE_ENVIOS_MS));
  }
  return { enviados, falhas };
}

/** Devolve à fila o que falhou e ainda tem tentativa — espera crescente. */
async function reagendarFalhas(colecao) {
  const fila = await api(`/items/${colecao}?limit=100&fields=id,tentativas,date_created&filter[estado][_eq]=falhou`);
  let voltaram = 0;
  for (const m of fila) {
    const espera = Math.min(2 ** (m.tentativas ?? 1), 60) * 60_000; // 2, 4, 8… até 60 min
    if (Date.now() - new Date(m.date_created).getTime() < espera) continue;
    if (!SIMULAR) await api(`/items/${colecao}/${m.id}`, { method: 'PATCH', body: JSON.stringify({ estado: 'pendente' }) });
    voltaram++;
  }
  if (voltaram) console.log(`  ${voltaram} mensagem(ns) reagendada(s) para nova tentativa`);
}

/* ─────────────────  novas edições do Diário Oficial  ───────────────── */

/** Interessa a este assinante? Caderno, secretaria ou palavra-chave; vazio = tudo. */
function interessaEdicao(assinante, materias, cadernosPorId, secretariaPorId) {
  const cadernos = (assinante.cadernos ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const secretarias = (assinante.secretarias ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const palavras = (assinante.palavras_chave ?? '').split(',').map((x) => semAcento(x.trim())).filter(Boolean);

  let relevantes = materias;
  if (cadernos.length) relevantes = relevantes.filter((m) => cadernos.includes(cadernosPorId.get(m.caderno)));
  if (secretarias.length) relevantes = relevantes.filter((m) => secretarias.includes(secretariaPorId.get(m.secretaria)));
  if (palavras.length) {
    relevantes = relevantes.filter((m) => {
      const alvo = semAcento(`${m.ementa ?? ''} ${String(m.corpo ?? '').replace(/<[^>]*>/g, ' ')}`);
      return palavras.some((pa) => alvo.includes(pa));
    });
  }
  return relevantes;
}

function corpoEdicao(veiculo, edicao, materias) {
  const url = `${SITE}/diario-oficial/edicao/${edicao.numero}`;
  const data = String(edicao.data_publicacao_legal).slice(0, 10).split('-').reverse().join('/');
  const disp = String(edicao.data_disponibilizacao).slice(0, 10).split('-').reverse().join('/');
  const lista = materias.slice(0, 30);

  const texto = [
    `${veiculo.nome_veiculo}`,
    `Edição nº ${edicao.numero} — publicação legal em ${data}`,
    '',
    `Disponibilizada em ${disp}. Prazos contam a partir de ${data}.`,
    '',
    `${materias.length} matéria(s) de seu interesse nesta edição:`,
    '',
    ...lista.map((m) => `• ${m.rotulo} — ${m.ementa}`),
    materias.length > lista.length ? `\n… e mais ${materias.length - lista.length} matéria(s).` : '',
    '',
    `Edição completa: ${url}`,
    '',
    '--',
    'Envio automático; não responda a esta mensagem.',
    'Este aviso NÃO substitui a publicação oficial. O que produz efeitos é a',
    'edição publicada, na data de publicação legal acima.',
  ].filter(Boolean).join('\n');

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#e9edea;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#141c18;line-height:1.6">
<table role="presentation" style="max-width:600px;margin:0 auto;background:#fff;border-radius:6px;border-top:5px solid #0c5430" cellpadding="0" cellspacing="0" width="100%">
<tr><td style="padding:26px 26px 6px">
<p style="margin:0;font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#4c5a51">${escapar(veiculo.nome_veiculo)}</p>
<h1 style="margin:6px 0 0;font-size:23px;line-height:1.2">Edição nº ${edicao.numero}</h1>
<p style="margin:6px 0 0;color:#4c5a51;font-size:14px">Disponibilizada em ${disp} · <strong style="color:#141c18">publicação legal em ${data}</strong></p>
</td></tr>
<tr><td style="padding:14px 26px">
<p style="margin:0 0 12px;font-size:15px">${materias.length} matéria(s) de seu interesse:</p>
<ul style="margin:0 0 18px;padding-left:18px;font-size:15px">
${lista.map((m) => `<li style="margin-bottom:8px"><strong>${escapar(m.rotulo)}</strong> — ${escapar(m.ementa)}</li>`).join('')}
</ul>
${materias.length > lista.length ? `<p style="margin:0 0 18px;color:#4c5a51;font-size:14px">… e mais ${materias.length - lista.length} matéria(s).</p>` : ''}
<p style="margin:0 0 6px"><a href="${url}" style="display:inline-block;background:#0c5430;color:#fff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:4px">Ver a edição completa</a></p>
</td></tr>
<tr><td style="padding:18px 26px;border-top:1px solid #e9edea;font-size:12px;color:#4c5a51">
<p style="margin:0 0 6px">Envio automático — não responda a esta mensagem.</p>
<p style="margin:0">Este aviso não substitui a publicação oficial. O que produz efeitos é a edição publicada, na data de publicação legal acima.</p>
</td></tr></table></body></html>`;

  return { assunto: `Diário Oficial de Cambuí — Edição nº ${edicao.numero}, de ${data}`, texto, html };
}

async function enfileirarEdicoes() {
  const desde = await marcaAnterior();
  if (!desde) return;

  const p = new URLSearchParams({
    limit: '20', sort: '-numero',
    fields: 'id,numero,data_publicacao_legal,data_disponibilizacao,publicada_em',
    'filter[situacao][_eq]': 'publicada',
    'filter[publicada_em][_gt]': desde,
  });
  const edicoes = await api(`/items/diario_edicoes?${p}`);
  if (!edicoes.length) { console.log('  Diário: nenhuma edição nova'); return; }

  const veiculo = await api('/items/diario_veiculo');
  const cadernos = await api('/items/diario_cadernos?limit=-1&fields=id,slug,nome');
  const cadernosPorId = new Map(cadernos.map((c) => [c.id, c.slug]));
  const secretarias = await api('/items/secretarias?limit=-1&fields=id,slug').catch(() => []);
  const secretariaPorId = new Map(secretarias.map((s) => [s.id, s.slug]));

  const assinantes = await api('/items/diario_assinantes?limit=-1&fields=id,email,token,confirmado,cadernos,secretarias,palavras_chave&filter[confirmado][_eq]=true');
  if (!assinantes.length) { console.log('  Diário: nenhum assinante confirmado'); return; }

  for (const edicao of edicoes) {
    const materias = await api(`/items/diario_materias?limit=-1&fields=id,ementa,corpo,caderno,secretaria,tipo_ato,numero_ato,ano_ato&filter[edicao][_eq]=${edicao.id}`);
    const comRotulo = materias.map((m) => ({
      ...m,
      rotulo: `${(m.tipo_ato ?? '').replace(/_/g, ' ')}${m.numero_ato ? ` nº ${m.numero_ato}/${m.ano_ato}` : ''}`
        .replace(/^\w/, (c) => c.toUpperCase()),
    }));

    for (const a of assinantes) {
      const relevantes = interessaEdicao(a, comRotulo, cadernosPorId, secretariaPorId);
      if (!relevantes.length) continue;
      const corpo = corpoEdicao(veiculo, edicao, relevantes);
      if (SIMULAR) { console.log(`  [simulação] edição ${edicao.numero} → 1 assinante (${relevantes.length} matérias)`); continue; }
      await api('/items/diario_envios', { method: 'POST', body: JSON.stringify({
        destinatario: a.email, assunto: corpo.assunto,
        corpo_texto: corpo.texto, corpo_html: corpo.html,
        tipo: 'edicao', estado: 'pendente', tentativas: 0,
        criado_em: new Date().toISOString(), assinante: a.id, edicao: edicao.id,
      }) });
    }
    console.log(`  Diário: edição nº ${edicao.numero} avaliada para ${assinantes.length} assinante(s)`);
  }
}

/* ───────────────────────  execução  ─────────────────── */

console.log(`avisos do portal — ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}${SIMULAR ? ' (SIMULAÇÃO)' : ''}`);

if (!SO_FILA) {
  await enfileirarNovidades();
  await enfileirarEdicoes();
}

/* As duas filas, na mesma execução. Separadas no banco porque carregam vínculos
 * diferentes (licitação x edição), mas entregues pelo mesmo caminho — uma só
 * conexão SMTP, um só limite de vazão. */
const FILAS = [
  { colecao: 'licitacao_envios', saida: '/licitacoes/avisos/sair', rotulo: 'licitações' },
  { colecao: 'diario_envios', saida: '/diario-oficial/avisos/sair', rotulo: 'Diário Oficial' },
];

let enviados = 0, falhas = 0;
for (const f of FILAS) {
  await reagendarFalhas(f.colecao);
  const r = await entregarFila(f.colecao, f.saida, f.rotulo);
  enviados += r.enviados; falhas += r.falhas;
}
console.log(`  resultado: ${enviados} enviada(s), ${falhas} falha(s)`);
