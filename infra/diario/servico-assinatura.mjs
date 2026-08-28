#!/usr/bin/env node
/**
 * Serviço de assinatura do Diário Oficial.
 *
 * POR QUE ISTO É UM PROCESSO SEPARADO
 * A chave privada que assina como o Município é o ativo mais sensível deste
 * portal: com ela se fabrica um ato administrativo. O processo web atende a
 * internet, renderiza HTML vindo do CMS e recebe upload de arquivo — é a maior
 * superfície de ataque do sistema. Dar a ele a chave seria trocar toda a
 * garantia do módulo por comodidade de arquitetura.
 *
 * Então: este serviço detém a chave e o Chromium; o processo web só sabe pedir.
 * É a mesma separação já usada no envio de e-mail (portal-avisos detém a
 * credencial SMTP; o portal só enfileira).
 *
 * Escuta em 127.0.0.1 e exige um segredo compartilhado. Não é exposto pelo
 * Nginx e não fala com a internet.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';

import { abrirSessao } from './cromo.mjs';
import { emitirCertidao, fecharEdicao, prepararMaterias } from './publicar.mjs';
import { garantirCertificadoDemo, CAMINHOS } from './certificado-demo.mjs';
import { verificarPdf } from '../../apps/web/src/lib/diario/verificar.mjs';
import { dataBr, codigoVerificador, textoDe } from '../../apps/web/src/lib/diario/dominio.mjs';
import { tipoDeAto } from '../directus/diario/enums.mjs';

const PORTA = Number(process.env.DIARIO_SERVICO_PORTA || 4322);
const ENDERECO = process.env.DIARIO_SERVICO_HOST || '127.0.0.1';
const SEGREDO = process.env.DIARIO_SERVICO_SEGREDO || '';
const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const TOKEN = process.env.DIARIO_TOKEN_DIRECTUS || process.env.DIRECTUS_TOKEN_ESQUEMA || '';
const URL_BASE = process.env.PUBLIC_SITE_URL || 'https://portal.cambui.mg.gov.br';

if (!SEGREDO) {
  console.error('DIARIO_SERVICO_SEGREDO não definido. O serviço recusa subir sem ele — ' +
    'sem segredo, qualquer processo local poderia mandar assinar documento.');
  process.exit(1);
}

/* Certificado: em produção, o A1 do município. Aqui, o de demonstração. */
const certificados = {
  cert: process.env.DIARIO_CERT || null,
  chave: process.env.DIARIO_CHAVE || null,
  cadeia: process.env.DIARIO_CADEIA || null,
  signatario: process.env.DIARIO_SIGNATARIO || 'AUTORIDADE SIGNATÁRIA',
  demonstracao: false,
};
if (!certificados.cert) {
  const c = await garantirCertificadoDemo({ silencioso: true });
  Object.assign(certificados, {
    cert: c.signCert, chave: c.signChave, cadeia: c.raizCert,
    signatario: 'SIGNATÁRIO DE DEMONSTRAÇÃO — NÃO É ICP-BRASIL',
    demonstracao: true,
  });
  console.warn('[diario] usando certificado de DEMONSTRAÇÃO. Configure DIARIO_CERT/DIARIO_CHAVE antes da produção.');
}

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, { ...opcoes,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(opcoes.headers ?? {}) } });
  if (!r.ok) throw new Error(`${opcoes.method ?? 'GET'} ${caminho} → ${r.status} ${(await r.text()).slice(0, 250)}`);
  return r.status === 204 ? null : (await r.json()).data;
}

async function enviarPdf(buffer, nome, titulo) {
  const pastas = await api('/folders?filter[name][_eq]=diario-oficial&limit=1');
  const pasta = pastas[0]?.id ?? (await api('/folders', { method: 'POST', body: JSON.stringify({ name: 'diario-oficial' }) })).id;
  const forma = new FormData();
  forma.append('folder', pasta);
  forma.append('title', titulo);
  forma.append('file', new Blob([buffer], { type: 'application/pdf' }), nome);
  const r = await fetch(`${BASE}/files`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: forma });
  if (!r.ok) throw new Error(`upload: HTTP ${r.status}`);
  return (await r.json()).data.id;
}

/* Uma sessão de Chromium de pé, reaproveitada. */
let sessao = null;
async function navegador() {
  if (!sessao) sessao = await abrirSessao();
  return sessao;
}

/* ─────────────────────── certidão de publicação ────────────────────────── */

async function gerarCertidao(idMateria, solicitante) {
  const materias = await api(`/items/diario_materias?filter[id][_eq]=${idMateria}&limit=1&fields=*,secretaria.nome`);
  const m = materias[0];
  if (!m) return { erro: 404, mensagem: 'Matéria não encontrada.' };
  if (m.situacao !== 'publicada') return { erro: 409, mensagem: 'A matéria ainda não foi publicada — não há o que certificar.' };

  const edicao = (await api(`/items/diario_edicoes?filter[id][_eq]=${m.edicao}&limit=1`))[0];
  if (!edicao) return { erro: 409, mensagem: 'A edição da matéria não foi encontrada.' };
  const veiculo = await api('/items/diario_veiculo');

  const codigo = codigoVerificador(`certidao-${m.id}-${Date.now()}`);
  const { pdf, sha256 } = await emitirCertidao({
    veiculo, edicao,
    materia: {
      ...m,
      titulo: `${tipoDeAto(m.tipo_ato).rotulo}${m.numero_ato ? ` nº ${m.numero_ato}/${m.ano_ato}` : ''}`,
      ementa: textoDe(m.ementa),
      orgao: m.orgao_texto || m.secretaria?.nome || 'Prefeitura Municipal de Cambuí',
      dataDisponibilizacao: dataBr(edicao.data_disponibilizacao),
      dataPublicacaoLegal: dataBr(edicao.data_publicacao_legal),
    },
    codigo, urlBase: URL_BASE,
    certificado: certificados.cert, chave: certificados.chave, cadeia: certificados.cadeia,
    signatario: certificados.signatario,
  });

  /* A emissão fica registrada. Não para controlar quem pede — certidão de ato
   * público não exige identificação (LAI, art. 10, §3º) — mas para que a
   * própria certidão possa ser conferida depois pelo seu código. */
  const idArquivo = await enviarPdf(pdf, `certidao-${codigo}.pdf`, `Certidão de publicação ${codigo}`);
  await api('/items/diario_certidoes', { method: 'POST', body: JSON.stringify({
    codigo, materia: m.id, emitida_em: new Date().toISOString(), sha256,
    arquivo_pdf: idArquivo, solicitante: solicitante || null,
  }) });
  await api('/items/diario_auditoria', { method: 'POST', body: JSON.stringify({
    acao: 'certidao_emitida', quando: new Date().toISOString(),
    quem_nome: solicitante || 'solicitação pública', materia: m.id, edicao: edicao.id,
    detalhe: `Certidão ${codigo} emitida.`,
  }) });

  return { pdf, codigo, sha256 };
}

/* ───────────────────────── fechamento de edição ────────────────────────── */

async function fechar(idEdicao, quemNome) {
  const edicao = (await api(`/items/diario_edicoes?filter[id][_eq]=${idEdicao}&limit=1`))[0];
  if (!edicao) return { erro: 404, mensagem: 'Edição não encontrada.' };
  if (edicao.situacao === 'publicada') return { erro: 409, mensagem: 'Edição já publicada: é imutável.' };

  const materias = await api(`/items/diario_materias?filter[edicao][_eq]=${idEdicao}&limit=-1&sort=ordem&fields=*,secretaria.nome`);
  if (!materias.length) {
    return { erro: 422, mensagem: 'Edição sem matérias não fecha. Uma edição vazia publicada é um defeito que não se conserta depois.' };
  }

  const veiculo = await api('/items/diario_veiculo');
  const cadernos = await api('/items/diario_cadernos?limit=-1&sort=ordem');
  if (!edicao.codigo_verificador) {
    await api(`/items/diario_edicoes/${idEdicao}`, { method: 'PATCH', body: JSON.stringify({
      codigo_verificador: codigoVerificador(`cambui-${edicao.numero}-${edicao.ano}-${edicao.data_publicacao_legal}`),
    }) });
    edicao.codigo_verificador = codigoVerificador(`cambui-${edicao.numero}-${edicao.ano}-${edicao.data_publicacao_legal}`);
  }

  const preparadas = prepararMaterias({
    edicao, materias, cadernos,
    rotuloTipo: (t) => tipoDeAto(t).rotulo,
    nomeOrgao: (m) => m.orgao_texto || m.secretaria?.nome || 'Prefeitura Municipal de Cambuí',
  });

  const r = await fecharEdicao({
    veiculo, edicao, cadernos, materias: preparadas, urlBase: URL_BASE,
    certificado: certificados.cert, chave: certificados.chave, cadeia: certificados.cadeia,
    signatario: certificados.signatario,
  });

  const idArquivo = await enviarPdf(r.pdf,
    `diario-cambui-edicao-${String(edicao.numero).padStart(5, '0')}.pdf`,
    `Edição nº ${edicao.numero} — ${dataBr(edicao.data_publicacao_legal)}`);

  /* Por ID, não por posição: r.materias vem na ordem do DOCUMENTO e `materias`
   * na ordem da consulta. Ver a nota no seed. */
  await api('/items/diario_materias', { method: 'PATCH', body: JSON.stringify(
    r.materias.map((m) => ({ id: m.id, pagina_inicial: m.pagina_inicial, pagina_final: m.pagina_final })),
  ) });

  await api(`/items/diario_edicoes/${idEdicao}`, { method: 'PATCH', body: JSON.stringify({
    arquivo_pdf: idArquivo, sha256: r.sha256, total_paginas: r.totalPaginas,
    situacao: 'aguardando_assinatura', fechada_em: new Date().toISOString(),
    assinatura_signatario: certificados.signatario,
    assinatura_emissor: certificados.demonstracao ? 'AC DEMONSTRAÇÃO — NÃO É ICP-BRASIL' : null,
    assinatura_em: new Date().toISOString(),
    assinatura_algoritmo: 'SHA-256 com RSA (PAdES-B-B)',
    assinatura_carimbo: false,
  }) });

  await api('/items/diario_auditoria', { method: 'POST', body: JSON.stringify({
    acao: 'edicao_fechada', quando: new Date().toISOString(), quem_nome: quemNome ?? 'painel',
    edicao: idEdicao,
    detalhe: `Edição fechada e assinada: ${r.materias.length} matérias, ${r.totalPaginas} páginas, SHA-256 ${r.sha256.slice(0, 16)}…`,
  }) });

  return { ok: true, totalPaginas: r.totalPaginas, sha256: r.sha256, materias: r.materias.length };
}

/* ──────────────────────────────── servidor ─────────────────────────────── */

function autorizado(req) {
  const dado = String(req.headers['x-diario-segredo'] ?? '');
  const a = Buffer.from(dado.padEnd(64, '\0').slice(0, 64));
  const b = Buffer.from(SEGREDO.padEnd(64, '\0').slice(0, 64));
  return timingSafeEqual(a, b);
}

const corpoDe = (req) => new Promise((resolve, reject) => {
  let bruto = '';
  req.on('data', (p) => {
    bruto += p;
    if (bruto.length > 64_000) { reject(new Error('corpo grande demais')); req.destroy(); }
  });
  req.on('end', () => { try { resolve(JSON.parse(bruto || '{}')); } catch { reject(new Error('JSON inválido')); } });
  req.on('error', reject);
});

const servidor = createServer(async (req, res) => {
  const responder = (codigo, corpo, tipo = 'application/json') => {
    res.writeHead(codigo, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
    res.end(tipo === 'application/json' ? JSON.stringify(corpo) : corpo);
  };

  try {
    if (req.url === '/saude') {
      return responder(200, { ok: true, demonstracao: certificados.demonstracao, signatario: certificados.signatario });
    }
    if (!autorizado(req)) return responder(401, { erro: 'não autorizado' });
    if (req.method !== 'POST') return responder(405, { erro: 'use POST' });

    const dados = await corpoDe(req);

    if (req.url === '/certidao') {
      await navegador();
      const r = await gerarCertidao(dados.materia, dados.solicitante);
      if (r.erro) return responder(r.erro, { erro: r.mensagem });
      /* Confere a própria obra antes de entregar: uma certidão que não passa na
       * verificação é pior do que nenhuma certidão. */
      const laudo = verificarPdf(r.pdf, { ancoras: [await readFile(certificados.cadeia, 'utf8')] });
      if (!laudo.integro || !laudo.cobreTudo) {
        return responder(500, { erro: 'a certidão gerada não passou na própria verificação', laudo });
      }
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="certidao-${r.codigo}.pdf"`,
        'X-Diario-Codigo': r.codigo, 'X-Diario-Sha256': r.sha256, 'Cache-Control': 'no-store',
      });
      return res.end(r.pdf);
    }

    if (req.url === '/fechar-edicao') {
      await navegador();
      const r = await fechar(dados.edicao, dados.quem);
      return responder(r.erro ?? 200, r.erro ? { erro: r.mensagem } : r);
    }

    return responder(404, { erro: 'rota desconhecida' });
  } catch (e) {
    console.error('[diario] falha:', e);
    return responder(500, { erro: 'falha ao processar', detalhe: String(e.message ?? e).slice(0, 300) });
  }
});

servidor.listen(PORTA, ENDERECO, () => {
  console.log(`[diario] serviço de assinatura em ${ENDERECO}:${PORTA}` +
    `${certificados.demonstracao ? '  (certificado de DEMONSTRAÇÃO)' : ''}`);
});

for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, async () => {
    servidor.close();
    await sessao?.fechar().catch(() => {});
    process.exit(0);
  });
}
