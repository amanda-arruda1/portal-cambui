/**
 * Cliente do clamd — varredura no ato do envio.
 *
 * Fala o protocolo INSTREAM direto no socket unix, sem dependência externa.
 * INSTREAM e não SCAN por caminho: o portal-web roda com PrivateTmp=true, ou
 * seja, o /tmp que ele enxerga é privado do serviço e o clamd (que roda como
 * usuário clamscan, fora desse namespace) simplesmente não encontraria o
 * arquivo. Mandando os bytes pelo socket, nada precisa tocar o disco.
 *
 * REGRA: falha FECHADA. Se o clamd não responder, o envio é recusado. Um
 * upload perdido é um aborrecimento; um arquivo infectado hospedado no domínio
 * .gov.br do município é um incidente.
 */

import net from 'node:net';

const SOCKET = process.env.CLAMD_SOCKET || '/run/clamd.scan/clamd.sock';

/** Documento grande em rede lenta ainda precisa caber; acima disso é o clamd
 *  que está com problema, não o arquivo. */
const TEMPO_LIMITE_MS = Number(process.env.CLAMD_TIMEOUT_MS || 30_000);

/** O clamd corta o fluxo acima do StreamMaxLength dele (100 MiB nesta
 *  instalação). Nossa política já recusa bem antes; o pedaço é só o tamanho de
 *  cada bloco enviado. */
const BLOCO = 64 * 1024;

export type Veredito =
  | { estado: 'limpo' }
  | { estado: 'infectado'; assinatura: string }
  | { estado: 'indisponivel'; detalhe: string };

export async function varrer(dados: Uint8Array): Promise<Veredito> {
  return new Promise((resolver) => {
    let resolvido = false;
    const concluir = (v: Veredito) => {
      if (resolvido) return;
      resolvido = true;
      clearTimeout(relogio);
      socket.destroy();
      resolver(v);
    };

    const socket = net.connect({ path: SOCKET });
    socket.setNoDelay(true);

    const relogio = setTimeout(
      () => concluir({ estado: 'indisponivel', detalhe: `clamd não respondeu em ${TEMPO_LIMITE_MS} ms` }),
      TEMPO_LIMITE_MS,
    );

    let resposta = '';

    socket.on('error', (erro) => {
      concluir({ estado: 'indisponivel', detalhe: erro.message });
    });

    socket.on('connect', () => {
      // Prefixo 'z': comando terminado em NUL. O 'n' (terminado em \n) é
      // legado e o clamd recusa misturar os dois estilos.
      socket.write(Buffer.from('zINSTREAM\0', 'ascii'));

      for (let i = 0; i < dados.length; i += BLOCO) {
        const pedaco = dados.subarray(i, Math.min(i + BLOCO, dados.length));
        const tamanho = Buffer.alloc(4);
        tamanho.writeUInt32BE(pedaco.length, 0);
        socket.write(tamanho);
        socket.write(pedaco);
      }

      // Bloco de tamanho zero encerra o fluxo.
      socket.write(Buffer.alloc(4));
    });

    socket.on('data', (parte) => {
      resposta += parte.toString('ascii');
      if (!resposta.includes('\0')) return;

      const linha = resposta.split('\0')[0].trim();

      // "stream: OK"
      if (/\bOK$/.test(linha)) return concluir({ estado: 'limpo' });

      // "stream: Eicar-Test-Signature FOUND"
      const achado = linha.match(/^stream:\s*(.+?)\s+FOUND$/);
      if (achado) return concluir({ estado: 'infectado', assinatura: achado[1] });

      // "INSTREAM size limit exceeded. ERROR" e afins.
      concluir({ estado: 'indisponivel', detalhe: linha || 'resposta vazia do clamd' });
    });

    socket.on('close', () => {
      concluir({ estado: 'indisponivel', detalhe: 'clamd encerrou a conexão sem responder' });
    });
  });
}

/** Diagnóstico: o clamd está de pé e com base carregada? Usado pela página de
 *  estado do painel, para a secretaria saber ANTES de preencher o formulário
 *  que o envio de arquivo está fora do ar. */
export async function disponivel(): Promise<{ ok: boolean; detalhe: string }> {
  return new Promise((resolver) => {
    let resolvido = false;
    const concluir = (ok: boolean, detalhe: string) => {
      if (resolvido) return;
      resolvido = true;
      clearTimeout(relogio);
      socket.destroy();
      resolver({ ok, detalhe });
    };

    const socket = net.connect({ path: SOCKET });
    const relogio = setTimeout(() => concluir(false, 'sem resposta ao PING'), 5000);

    socket.on('error', (erro) => concluir(false, erro.message));
    socket.on('connect', () => socket.write(Buffer.from('zPING\0', 'ascii')));
    socket.on('data', (parte) => {
      const texto = parte.toString('ascii').replace(/\0/g, '').trim();
      concluir(texto === 'PONG', texto || 'resposta vazia');
    });
    socket.on('close', () => concluir(false, 'conexão encerrada'));
  });
}
