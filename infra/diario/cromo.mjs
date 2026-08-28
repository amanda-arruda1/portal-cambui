/**
 * Renderização de HTML para PDF pelo Chromium, falando o Chrome DevTools
 * Protocol direto no WebSocket.
 *
 * POR QUE ESTE CAMINHO, e não uma biblioteca de PDF:
 *
 *   1. O PDF do Diário e a página HTML da matéria saem do MESMO HTML. Isso não
 *      é economia de código, é garantia jurídica: o que o cidadão lê na tela
 *      acessível é literalmente o que está no documento assinado. Com dois
 *      geradores, um dia eles divergem — e a divergência entre o que se leu e
 *      o que se assinou é vício de publicação.
 *   2. Sai marcado (Tagged PDF) com ordem de leitura e idioma, que é o que
 *      leitor de tela precisa. Bibliotecas de desenho de PDF produzem, por
 *      padrão, um amontoado de texto posicionado — ilegível para quem depende
 *      de leitor de tela.
 *   3. Sumário com links internos navegáveis sai de <a href="#ancora">.
 *   4. Zero dependência nova: o Chromium já estava instalado para o Lighthouse,
 *      e o Node 22 tem WebSocket nativo. Puppeteer traria 300 MB e uma segunda
 *      cópia do navegador.
 *
 * O CUSTO, declarado: cada renderização sobe um processo Chromium (~1,5 s,
 * ~200 MB). Para um diário que fecha uma edição por dia e emite certidão sob
 * demanda, é irrelevante. Se um dia virar geração em lote de milhares, troque
 * por um pool — a interface desta função não muda.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BINARIO = process.env.CHROMIUM || 'chromium-browser';

/** Sobe um Chromium headless com porta de depuração efêmera. */
async function subirNavegador() {
  const perfil = await mkdtemp(join(tmpdir(), 'diario-cromo-'));
  const proc = spawn(BINARIO, [
    '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    /* Sem rede: o documento é montado a partir de arquivos locais e data:
     * URIs. Um diário oficial não pode ter o seu PDF dependendo de um recurso
     * remoto que pode sumir — nem vazar para fora o que ainda não foi
     * publicado. */
    '--disable-component-update', '--disable-background-networking',
    /* O relatório de falhas do Chromium tenta abrir uma base própria no HOME
     * do usuário. Num serviço de sistema sem HOME — e com ProtectHome — ele
     * falha com "chrome_crashpad_handler: --database is required" e derruba o
     * navegador inteiro. Não serve para nada aqui: desligado. */
    '--disable-crash-reporter', '--disable-breakpad', '--no-crashpad',
    '--disable-features=Crashpad',
    `--crash-dumps-dir=${perfil}`,
    `--user-data-dir=${perfil}`, '--remote-debugging-port=0', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const endereco = await new Promise((resolve, reject) => {
    let acumulado = '';
    const prazo = setTimeout(() => reject(new Error('Chromium não anunciou a porta de depuração em 30s')), 30_000);
    proc.stderr.on('data', (bloco) => {
      acumulado += bloco;
      const achado = acumulado.match(/ws:\/\/[^\s]+/);
      if (achado) { clearTimeout(prazo); resolve(achado[0]); }
    });
    proc.on('exit', (codigo) => { clearTimeout(prazo); reject(new Error(`Chromium saiu com código ${codigo}: ${acumulado.slice(-400)}`)); });
  });

  return {
    endereco,
    async encerrar() {
      proc.kill('SIGTERM');
      await new Promise((r) => { proc.once('exit', r); setTimeout(r, 3000); });
      await rm(perfil, { recursive: true, force: true }).catch(() => {});
    },
  };
}

/** Cliente CDP mínimo: numera as mensagens e casa resposta com pedido. */
function conectar(endereco) {
  const ws = new WebSocket(endereco);
  const pendentes = new Map();
  const eventos = new Map();
  let sequencia = 0;

  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pendentes.has(m.id)) {
      const { resolver, rejeitar } = pendentes.get(m.id);
      pendentes.delete(m.id);
      m.error ? rejeitar(new Error(`${m.error.message} (${m.error.code})`)) : resolver(m.result);
    } else if (m.method && eventos.has(m.method)) {
      eventos.get(m.method).forEach((f) => f(m.params));
    }
  });

  const pronto = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('falha ao conectar no Chromium')), { once: true });
  });

  return {
    pronto,
    ao(metodo, f) { if (!eventos.has(metodo)) eventos.set(metodo, []); eventos.get(metodo).push(f); },
    enviar(metodo, params = {}, sessionId) {
      const id = ++sequencia;
      return new Promise((resolver, rejeitar) => {
        pendentes.set(id, { resolver, rejeitar });
        ws.send(JSON.stringify({ id, method: metodo, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    fechar() { try { ws.close(); } catch { /* já fechado */ } },
  };
}

/* ─────────────────────────── sessão reutilizável ────────────────────────── */

/**
 * Abre um Chromium e o mantém de pé para várias renderizações.
 *
 * Existe porque o seed gera ~300 documentos: subir e derrubar o navegador a
 * cada um custaria uns 20 minutos só de partida de processo. Cada documento
 * ainda ganha uma ABA NOVA, que é fechada ao fim — assim um documento nunca
 * enxerga o estado do anterior.
 */
export async function abrirSessao() {
  const navegador = await subirNavegador();
  const cdp = conectar(navegador.endereco);
  await cdp.pronto;

  return {
    async render({ arquivoHtml, cabecalho, rodape, margens = {} }) {
      const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true });
      try {
        await cdp.enviar('Page.enable', {}, sessionId);
        const carregou = new Promise((resolve) => {
          const f = (p) => { if (p && p.sessionId !== undefined) return; resolve(); };
          cdp.ao('Page.loadEventFired', f);
        });
        await cdp.enviar('Page.navigate', { url: `file://${arquivoHtml}` }, sessionId);
        await Promise.race([carregou, new Promise((r) => setTimeout(r, 20_000))]);

        /* As fontes precisam estar prontas ANTES de paginar: se o PDF for
         * gerado com a fonte substituta, a paginação muda depois — e o número
         * impresso no rodapé deixa de bater com o sumário. */
        await cdp.enviar('Runtime.evaluate', {
          expression: 'document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))',
          awaitPromise: true,
        }, sessionId);

        const { data } = await cdp.enviar('Page.printToPDF', {
          printBackground: true,
          preferCSSPageSize: true,
          generateTaggedPDF: true,          // ordem de leitura para leitor de tela
          generateDocumentOutline: true,    // marcadores a partir dos <h*>
          displayHeaderFooter: Boolean(cabecalho || rodape),
          headerTemplate: cabecalho ?? '<span></span>',
          footerTemplate: rodape ?? '<span></span>',
          marginTop: margens.topo ?? 0.9,
          marginBottom: margens.base ?? 0.75,
          marginLeft: margens.esquerda ?? 0,
          marginRight: margens.direita ?? 0,
        }, sessionId);
        return Buffer.from(data, 'base64');
      } finally {
        await cdp.enviar('Target.closeTarget', { targetId }).catch(() => {});
      }
    },

    /** Mesma coisa, a partir de uma string. */
    async renderString(html, opcoes = {}) {
      const pasta = await mkdtemp(join(tmpdir(), 'diario-html-'));
      const caminho = join(pasta, 'documento.html');
      await writeFile(caminho, html, 'utf8');
      try {
        return await this.render({ ...opcoes, arquivoHtml: caminho });
      } finally {
        await rm(pasta, { recursive: true, force: true }).catch(() => {});
      }
    },

    async fechar() {
      cdp.fechar();
      await navegador.encerrar();
    },
  };
}

/* ──────────────────────────── uso avulso ───────────────────────────────── */

/** Converte um arquivo HTML local em PDF, subindo e derrubando um navegador. */
export async function htmlParaPdf(opcoes) {
  const sessao = await abrirSessao();
  try { return await sessao.render(opcoes); } finally { await sessao.fechar(); }
}

/** Atalho para quem já tem o HTML em memória. */
export async function stringParaPdf(html, opcoes = {}) {
  const sessao = await abrirSessao();
  try { return await sessao.renderString(html, opcoes); } finally { await sessao.fechar(); }
}
