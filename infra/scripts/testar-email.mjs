#!/usr/bin/env node
/**
 * Envia (ou enfileira) um e-mail de teste do sistema de avisos.
 *
 *   node infra/scripts/testar-email.mjs <destinatario>
 *   ... --previa            só grava o HTML em disco, não toca em nada
 *
 * Serve para a TI conferir três coisas de uma vez: se a credencial SMTP está
 * certa, se a mensagem chega (e não cai no lixo eletrônico), e como ela fica
 * no cliente de e-mail real de quem vai receber.
 *
 * Sem SMTP_USER/SMTP_PASSWORD, ele ENFILEIRA em vez de falhar: a mensagem sai
 * sozinha na primeira execução do portal-avisos depois que a credencial for
 * preenchida.
 */
import { writeFile } from 'node:fs/promises';
import { enviar } from './smtp.mjs';

const destino = process.argv.find((a) => a.includes('@'));
const SO_PREVIA = process.argv.includes('--previa');
if (!destino) { console.error('Uso: node testar-email.mjs <destinatario> [--previa]'); process.exit(1); }

const BASE_CMS = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const SITE = (process.env.PUBLIC_SITE_URL || 'https://portal.cambui.mg.gov.br').replace(/\/+$/, '');
const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

const assunto = 'Teste do sistema de avisos de licitação — Prefeitura de Cambuí';

const texto = [
  'Prefeitura Municipal de Cambuí — teste do sistema de avisos',
  '',
  'Se você está lendo isto, três coisas funcionaram:',
  '',
  '  1. a credencial do servidor de e-mail do município está correta;',
  '  2. a fila e o serviço de entrega estão no ar;',
  '  3. a mensagem passou pelos filtros e chegou à caixa de entrada.',
  '',
  `Enviado em ${agora} (horário de Brasília) a partir do portal.`,
  '',
  'É assim que o fornecedor vai receber o aviso de uma nova licitação:',
  'com o objeto, a data da sessão e o link direto para o edital.',
  '',
  `Licitações abertas: ${SITE}/licitacoes`,
  '',
  '--',
  'Mensagem de teste, enviada a pedido. Nenhum cadastro foi criado.',
  'A divulgação oficial das licitações ocorre no PNCP e no veículo oficial do',
  'Município. Em caso de divergência, prevalece o edital publicado oficialmente.',
].join('\n');

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${assunto}</title></head>
<body style="margin:0;padding:24px;background:#e9edea;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#141c18;line-height:1.6">
<table role="presentation" style="max-width:560px;margin:0 auto;background:#fff;border-radius:6px;border-top:5px solid #0c5430" cellpadding="0" cellspacing="0" width="100%">
<tr><td style="padding:28px 28px 4px">
<p style="margin:0;font-size:13px;letter-spacing:.09em;text-transform:uppercase;color:#4c5a51">Prefeitura Municipal de Cambuí</p>
<h1 style="margin:8px 0 0;font-size:23px;line-height:1.25">Teste do sistema de avisos de licitação</h1>
</td></tr>
<tr><td style="padding:16px 28px">
<p style="margin:0 0 14px">Se você está lendo isto, três coisas funcionaram:</p>
<ol style="margin:0 0 20px;padding-left:20px">
<li style="margin-bottom:6px">a credencial do servidor de e-mail do município está correta;</li>
<li style="margin-bottom:6px">a fila e o serviço de entrega estão no ar;</li>
<li>a mensagem passou pelos filtros e chegou à caixa de entrada.</li>
</ol>
<p style="margin:0 0 20px;padding:12px 14px;background:#f2f5f3;border-left:4px solid #a8303c;border-radius:0 4px 4px 0;font-size:14px">
Enviado em <strong>${agora}</strong> (horário de Brasília).</p>
<p style="margin:0 0 20px">É assim que o fornecedor vai receber o aviso de uma nova licitação: com o objeto, a data da sessão e o link direto para o edital.</p>
<p style="margin:0"><a href="${SITE}/licitacoes" style="display:inline-block;background:#0c5430;color:#fff;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:4px">Ver as licitações abertas</a></p>
</td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid #e9edea;font-size:12px;color:#4c5a51">
<p style="margin:0 0 6px">Mensagem de teste, enviada a pedido. Nenhum cadastro foi criado.</p>
<p style="margin:0">A divulgação oficial das licitações ocorre no PNCP e no veículo oficial do Município. Em caso de divergência, prevalece o edital publicado oficialmente.</p>
</td></tr></table></body></html>`;

const caminhoPrevia = '/opt/portal-cambui/data/avisos/previa-teste.html';
await writeFile(caminhoPrevia, html, 'utf8');
console.log(`  prévia gravada em ${caminhoPrevia}`);
if (SO_PREVIA) process.exit(0);

const temCredencial = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);

if (temCredencial) {
  await enviar(
    { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT || 587,
      usuario: process.env.SMTP_USER, senha: process.env.SMTP_PASSWORD, nome: 'portal.cambui.mg.gov.br' },
    { de: process.env.AVISOS_REMETENTE || process.env.SMTP_USER,
      deNome: 'Prefeitura Municipal de Cambuí',
      para: destino, assunto, texto, html,
      responderPara: process.env.AVISOS_RESPONDER_PARA || undefined },
  );
  console.log(`  ENVIADO para ${destino}`);
  process.exit(0);
}

/* Sem credencial: enfileira. A mensagem sai sozinha assim que SMTP_USER e
   SMTP_PASSWORD forem preenchidos — não se perde nada por tentar agora. */
const token = process.env.AVISOS_TOKEN_ENTREGA;
if (!token) { console.error('  Sem SMTP e sem AVISOS_TOKEN_ENTREGA — nada a fazer além da prévia.'); process.exit(1); }

const r = await fetch(`${BASE_CMS}/items/licitacao_envios`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    destinatario: destino, assunto, corpo_texto: texto, corpo_html: html,
    tipo: 'confirmacao', estado: 'pendente', tentativas: 0, criado_em: new Date().toISOString(),
  }),
});
if (!r.ok) { console.error('  falha ao enfileirar:', r.status, (await r.text()).slice(0, 200)); process.exit(1); }

console.log(`
  SMTP_USER/SMTP_PASSWORD não estão preenchidos, então a mensagem foi
  ENFILEIRADA para ${destino}.

  Ela sai sozinha, sem repetir este comando, assim que a credencial entrar em
  /opt/portal-cambui/.env — o serviço portal-avisos roda de 5 em 5 minutos.
`);
