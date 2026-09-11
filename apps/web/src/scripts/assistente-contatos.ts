/**
 * Assistente de contatos — comportamento do painel de conversa.
 *
 * Abre/fecha, foco e teclado continuam como antes (nada disso existia no
 * projeto antes deste componente; sem biblioteca, sem "focus-trap" importado).
 * O que mudou é a resposta: em vez de filtrar uma lista ao vivo, cada
 * pergunta vira um turno de chat — `responderContato()`
 * (`lib/contatos-busca.ts`) decide O QUÊ responder; este arquivo só decide
 * COMO desenhar isso como mensagem.
 */
import { responderContato, type RegistroContato, type RespostaAssistente } from '../lib/contatos-busca';
import { linkMapa, linkTelefone, linkWhatsapp, numerosTelefone } from '../lib/formato';

const raiz = document.querySelector<HTMLDivElement>('.assistente-contatos');
const botao = document.getElementById('assistente-botao') as HTMLButtonElement | null;
const onda = botao?.querySelector<HTMLSpanElement>('.onda') ?? null;
const painel = document.getElementById('assistente-painel') as HTMLDivElement | null;
const fechar = document.getElementById('assistente-fechar') as HTMLButtonElement | null;
const form = document.getElementById('assistente-form') as HTMLFormElement | null;
const campo = document.getElementById('assistente-campo') as HTMLInputElement | null;
const mensagens = document.getElementById('assistente-mensagens') as HTMLDivElement | null;
const digitando = document.getElementById('assistente-digitando') as HTMLDivElement | null;
const dadosEl = document.getElementById('assistente-dados');

if (raiz && botao && painel && fechar && form && campo && mensagens && digitando && dadosEl) {
  const dadosOriginais: RegistroContato[] = JSON.parse(dadosEl.textContent ?? '[]');
  const reduzirMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const focaveisDoPainel = () =>
    Array.from(painel.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')).filter(
      (el) => !el.hasAttribute('disabled'),
    );

  /* ── Montagem de mensagens ────────────────────────────────────────────── */

  function adicionarMensagem(remetente: 'usuario' | 'assistente', montar: (msg: HTMLDivElement) => void) {
    const msg = document.createElement('div');
    msg.className = `msg msg-${remetente}`;
    montar(msg);
    mensagens!.append(msg);
    mensagens!.scrollTop = mensagens!.scrollHeight;
  }

  function linhaTexto(pai: HTMLElement, texto: string) {
    const p = document.createElement('p');
    p.textContent = texto;
    pai.append(p);
  }

  function blocoDeContato(pai: HTMLElement, r: RegistroContato) {
    const bloco = document.createElement('div');
    bloco.className = 'bloco-contato';

    const titulo = document.createElement('p');
    const forte = document.createElement('strong');
    forte.textContent = r.subtitulo ? `${r.titulo} (${r.subtitulo})` : r.titulo;
    titulo.append(forte);
    bloco.append(titulo);

    const mapa = linkMapa(r.endereco);
    if (mapa) {
      const link = document.createElement('a');
      link.className = 'endereco';
      link.href = mapa;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `📍 ${r.endereco}`;
      bloco.append(link);
    }

    if (r.telefone) {
      // Pode ter mais de um número (ex.: "(35) 1111-1111 / (35) 2222-2222")
      // — cada um vira seu próprio link. Celular de verdade (DDD + 9
      // dígitos) já abre o WhatsApp direto — mesma regra de /telefones e da
      // página de secretaria. Fixo continua indo para tel:.
      for (const n of numerosTelefone(r.telefone)) {
        const whatsapp = linkWhatsapp(n.numero, n.nota);
        const mostrarNota = n.nota && !/^whatsapp$/i.test(n.nota);
        const link = document.createElement('a');
        link.className = 'telefone';
        link.href = whatsapp ?? linkTelefone(n.numero);
        link.textContent = `${whatsapp ? '💬' : '☎'} ${n.numero}${mostrarNota ? ` (${n.nota})` : ''}`;
        if (whatsapp) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
        bloco.append(link);
      }
    } else {
      const p = document.createElement('p');
      p.className = 'pendente';
      p.textContent = 'Telefone ainda não publicado';
      bloco.append(p);
    }

    if (r.email) {
      const p = document.createElement('p');
      p.className = 'pendente';
      const link = document.createElement('a');
      link.href = `mailto:${r.email}`;
      link.textContent = r.email;
      p.append('✉ ', link);
      bloco.append(p);
    }

    if (r.destino) {
      const link = document.createElement('a');
      link.className = 'ver-secretaria';
      link.href = r.destino;
      link.textContent = 'Ver a secretaria →';
      bloco.append(link);
    }

    pai.append(bloco);
  }

  function botaoSugestao(pai: HTMLElement, r: RegistroContato) {
    const botaoSug = document.createElement('button');
    botaoSug.type = 'button';
    botaoSug.className = 'sugestao';
    botaoSug.textContent = r.subtitulo ? `${r.titulo} (${r.subtitulo})` : r.titulo;
    botaoSug.addEventListener('click', () => processarPergunta(r.titulo));
    pai.append(botaoSug);
  }

  function renderizarResposta(resposta: RespostaAssistente) {
    adicionarMensagem('assistente', (msg) => {
      switch (resposta.tipo) {
        case 'contato': {
          const intro =
            resposta.registros.length === 1
              ? `Encontrei o contato de ${resposta.registros[0].titulo}:`
              : 'Encontrei estes contatos:';
          linhaTexto(msg, intro);
          resposta.registros.forEach((r) => blocoDeContato(msg, r));
          if (resposta.truncado) linhaTexto(msg, 'Há mais resultados — tente descrever de um jeito mais específico.');
          break;
        }
        case 'sugestoes': {
          linhaTexto(msg, 'Não encontrei um setor exatamente com esse nome. Você quis dizer:');
          resposta.sugestoes.forEach((r) => botaoSugestao(msg, r));
          break;
        }
        case 'vazio': {
          linhaTexto(msg, 'Me conta qual secretaria, setor ou serviço você procura — por exemplo "Saúde" ou "RH".');
          break;
        }
        case 'nao-encontrado': {
          linhaTexto(msg, 'Não encontrei nada parecido com isso. Você pode falar com a Ouvidoria, ou tentar outro termo.');
          const link = document.createElement('a');
          link.className = 'ver-secretaria';
          link.href = '/contato';
          link.textContent = 'Ver contato geral da Prefeitura →';
          msg.append(link);
          break;
        }
      }
    });
  }

  function mostrarDigitando(mostrar: boolean) {
    digitando!.hidden = !mostrar;
    if (mostrar) mensagens!.scrollTop = mensagens!.scrollHeight;
  }

  function processarPergunta(texto: string) {
    const limpo = texto.trim();
    if (!limpo) return;

    adicionarMensagem('usuario', (msg) => linhaTexto(msg, limpo));
    campo!.value = '';
    campo!.focus();

    // O "digitando" é só ritmo de conversa — a resposta já está pronta
    // (tudo roda no navegador, sem rede). Sem pedido de menos movimento,
    // uma pausa curta; com o pedido, a resposta aparece na hora.
    const atraso = reduzirMovimento ? 0 : 450;
    mostrarDigitando(true);
    setTimeout(() => {
      mostrarDigitando(false);
      renderizarResposta(responderContato(dadosOriginais, limpo));
    }, atraso);
  }

  /* ── Abrir/fechar ──────────────────────────────────────────────────────── */

  function abrir() {
    painel!.removeAttribute('inert');
    painel!.classList.add('aberto');
    botao!.setAttribute('aria-expanded', 'true');
    pararOnda();
    // O foco só entra no campo depois que a transição de abertura já
    // disparou — sem isso, alguns leitores de tela anunciam o diálogo antes
    // dele estar visualmente presente.
    campo!.focus();
    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('click', aoClicarFora, true);
  }

  function fecharPainel() {
    painel!.classList.remove('aberto');
    painel!.setAttribute('inert', '');
    botao!.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', aoTeclar);
    document.removeEventListener('click', aoClicarFora, true);
    botao!.focus();
    iniciarOnda();
  }

  function estaAberto() {
    return botao!.getAttribute('aria-expanded') === 'true';
  }

  function aoTeclar(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      fecharPainel();
      return;
    }
    // Laço de foco: Tab no último item volta pro primeiro, e vice-versa —
    // sem isso o teclado escaparia do diálogo para o resto da página.
    if (e.key === 'Tab') {
      const alvos = focaveisDoPainel();
      if (alvos.length === 0) return;
      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }
  }

  function aoClicarFora(e: MouseEvent) {
    if (!raiz!.contains(e.target as Node)) fecharPainel();
  }

  botao.addEventListener('click', () => (estaAberto() ? fecharPainel() : abrir()));
  fechar.addEventListener('click', fecharPainel);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    processarPergunta(campo!.value);
  });

  raiz.querySelectorAll<HTMLButtonElement>('[data-chip]').forEach((chip) => {
    chip.addEventListener('click', () => processarPergunta(chip.dataset.chip ?? ''));
  });

  /* ── Onda ocasional: só um lembrete discreto, nunca com o painel aberto,
     nunca com pedido de menos movimento. */
  let temporizadorOnda: ReturnType<typeof setInterval> | undefined;
  function iniciarOnda() {
    if (reduzirMovimento || !onda) return;
    clearInterval(temporizadorOnda);
    temporizadorOnda = setInterval(() => {
      onda.classList.remove('tocar');
      // Força reflow pra poder retocar a mesma animação de novo.
      void onda.offsetWidth;
      onda.classList.add('tocar');
    }, 11000);
  }
  function pararOnda() {
    clearInterval(temporizadorOnda);
    onda?.classList.remove('tocar');
  }
  iniciarOnda();
}
