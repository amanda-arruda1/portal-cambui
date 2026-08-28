/**
 * Cliente SMTP mínimo — conecta, negocia TLS, autentica e entrega.
 *
 * Escrito à mão porque SMTP é protocolo de linha e cabe em 150 linhas. A
 * alternativa seria uma dependência a mais para alguém atualizar daqui a
 * cinco anos, num servidor de prefeitura, para enviar mensagem de texto.
 *
 * Suporta o que o servidor do município oferece (medido em 28/08/2026):
 * porta 587 com STARTTLS e AUTH PLAIN/LOGIN. Porta 465 (TLS direto) também.
 */
import net from 'node:net';
import tls from 'node:tls';

/** Lê uma resposta SMTP inteira: pode vir em várias linhas ("250-" continua,
 *  "250 " encerra). Ler só a primeira linha é o erro clássico. */
function lerResposta(socket, tempoLimite) {
  return new Promise((resolver, rejeitar) => {
    let buffer = '';
    const relogio = setTimeout(() => { limpar(); rejeitar(new Error('SMTP: tempo esgotado esperando resposta')); }, tempoLimite);
    const aoReceber = (parte) => {
      buffer += parte.toString('utf8');
      const linhas = buffer.split('\r\n').filter(Boolean);
      const ultima = linhas[linhas.length - 1];
      if (!ultima || !/^\d{3} /.test(ultima)) return;
      limpar();
      resolver({ codigo: Number(ultima.slice(0, 3)), texto: buffer.trim() });
    };
    const aoErrar = (e) => { limpar(); rejeitar(e); };
    const limpar = () => { clearTimeout(relogio); socket.off('data', aoReceber); socket.off('error', aoErrar); };
    socket.on('data', aoReceber);
    socket.on('error', aoErrar);
  });
}

async function conversar(socket, comando, esperado, tempoLimite) {
  if (comando !== null) socket.write(comando + '\r\n');
  const r = await lerResposta(socket, tempoLimite);
  if (esperado && !esperado.includes(r.codigo)) {
    // Nunca ecoar o comando: ele pode carregar a senha em base64.
    throw new Error(`SMTP ${r.codigo}: ${r.texto.split('\r\n')[0]}`);
  }
  return r;
}

/**
 * @param {object} cfg  { host, port, usuario, senha, seguro, nome }
 * @param {object} msg  { de, deNome, para, assunto, texto, html, responderPara, listaDescadastro }
 */
export async function enviar(cfg, msg) {
  const tempoLimite = cfg.tempoLimiteMs ?? 20_000;
  const seguro = cfg.seguro ?? Number(cfg.port) === 465;
  const nome = cfg.nome || 'portal-cambui';

  let socket = seguro
    ? tls.connect({ host: cfg.host, port: Number(cfg.port), servername: cfg.host })
    : net.connect({ host: cfg.host, port: Number(cfg.port) });

  await new Promise((r, j) => {
    socket.once(seguro ? 'secureConnect' : 'connect', r);
    socket.once('error', j);
    socket.setTimeout(tempoLimite, () => j(new Error('SMTP: tempo esgotado na conexão')));
  });
  socket.setTimeout(0);

  try {
    await conversar(socket, null, [220], tempoLimite);
    let ehlo = await conversar(socket, `EHLO ${nome}`, [250], tempoLimite);

    if (!seguro && /STARTTLS/i.test(ehlo.texto)) {
      await conversar(socket, 'STARTTLS', [220], tempoLimite);
      socket = tls.connect({ socket, servername: cfg.host });
      await new Promise((r, j) => { socket.once('secureConnect', r); socket.once('error', j); });
      // Depois do STARTTLS o EHLO precisa ser refeito: a lista de recursos
      // muda, e é só aí que o AUTH costuma aparecer.
      ehlo = await conversar(socket, `EHLO ${nome}`, [250], tempoLimite);
    }

    if (cfg.usuario) {
      if (/AUTH[^\r\n]*\bLOGIN\b/i.test(ehlo.texto)) {
        await conversar(socket, 'AUTH LOGIN', [334], tempoLimite);
        await conversar(socket, Buffer.from(cfg.usuario, 'utf8').toString('base64'), [334], tempoLimite);
        await conversar(socket, Buffer.from(cfg.senha, 'utf8').toString('base64'), [235], tempoLimite);
      } else if (/AUTH[^\r\n]*\bPLAIN\b/i.test(ehlo.texto)) {
        const credencial = Buffer.from(`\0${cfg.usuario}\0${cfg.senha}`, 'utf8').toString('base64');
        await conversar(socket, `AUTH PLAIN ${credencial}`, [235], tempoLimite);
      } else {
        throw new Error('SMTP: o servidor não oferece AUTH LOGIN nem AUTH PLAIN');
      }
    }

    await conversar(socket, `MAIL FROM:<${msg.de}>`, [250], tempoLimite);
    await conversar(socket, `RCPT TO:<${msg.para}>`, [250, 251], tempoLimite);
    await conversar(socket, 'DATA', [354], tempoLimite);
    socket.write(montarMensagem(msg));
    /* A resposta ao ponto final carrega o identificador que o relay deu à
       mensagem. É por ele que se rastreia a entrega no painel do provedor —
       sem guardar isso, "o fornecedor diz que não recebeu" não tem resposta. */
    const aceite = await conversar(socket, '.', [250], tempoLimite);
    await conversar(socket, 'QUIT', [221], tempoLimite).catch(() => {});
    return aceite.texto.split('\r\n').pop().trim();
  } finally {
    socket.destroy();
  }
}

/** Assunto com acento vira palavra codificada da RFC 2047 — sem isso o Outlook
 *  mostra "LicitaÃ§Ã£o". */
const codificarCabecalho = (t) =>
  /^[\x20-\x7E]*$/.test(t) ? t : `=?UTF-8?B?${Buffer.from(t, 'utf8').toString('base64')}?=`;

const base64Dobrado = (t) => (Buffer.from(t, 'utf8').toString('base64').match(/.{1,76}/g) ?? []).join('\r\n');

function montarMensagem(msg) {
  const limite = `=_cambui_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
  const cabecalhos = [
    `From: ${msg.deNome ? `${codificarCabecalho(msg.deNome)} <${msg.de}>` : msg.de}`,
    `To: ${msg.para}`,
    `Subject: ${codificarCabecalho(msg.assunto)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${limite}@prefeituradecambui.mg.gov.br>`,
    'MIME-Version: 1.0',
    // Diz aos filtros que isto é envio automático — evita resposta automática
    // de férias voltando para a fila.
    'Auto-Submitted: auto-generated',
    'X-Auto-Response-Suppress: All',
  ];
  if (msg.responderPara) cabecalhos.push(`Reply-To: ${msg.responderPara}`);
  /* List-Unsubscribe é o que faz o botão nativo de "cancelar inscrição"
     aparecer no Gmail e no Outlook. Sem ele, quem quer sair marca como spam —
     e a reputação do domínio da prefeitura paga. */
  if (msg.listaDescadastro) {
    cabecalhos.push(`List-Unsubscribe: <${msg.listaDescadastro}>`);
    cabecalhos.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  }

  const partes = [
    `Content-Type: multipart/alternative; boundary="${limite}"`,
    '',
    `--${limite}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Dobrado(msg.texto),
  ];
  if (msg.html) {
    partes.push(
      `--${limite}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      base64Dobrado(msg.html),
    );
  }
  partes.push(`--${limite}--`, '');

  // base64 nunca gera linha começando com ponto, mas a proteção fica: um dia
  // alguém troca a codificação e o "dot stuffing" some sem ninguém notar.
  return [...cabecalhos, ...partes].join('\r\n').replace(/\r\n\./g, '\r\n..') + '\r\n';
}
