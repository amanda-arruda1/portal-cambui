/**
 * Melhorias do formulário de conteúdo no navegador.
 *
 * Tudo aqui é OPCIONAL: com o script bloqueado, o formulário continua
 * funcionando — o endereço de página é gerado no servidor, o texto vai como
 * HTML digitado e o arquivo sobe junto com o envio. Este arquivo só torna o
 * trabalho da secretaria menos penoso.
 *
 * Nada aqui é controle de segurança. O que a barra de formatação produz é
 * sanitizado no servidor de qualquer forma (lib/sanitizar.ts), e o arquivo
 * passa pela mesma inspeção pelos dois caminhos.
 */

/* ---------- endereço de página sugerido enquanto se digita ---------- */

function ligarSugestaoDeEndereco(): void {
  document.querySelectorAll<HTMLInputElement>('input[data-slug-de]').forEach((destino) => {
    const origem = document.getElementById(destino.dataset.slugDe ?? '') as HTMLInputElement | null;
    if (!origem) return;

    // Se já veio preenchido do servidor, é endereço existente: não mexer.
    // Trocar o endereço de uma notícia publicada quebra o link que já circulou.
    let intocado = destino.value.trim() === '';

    destino.addEventListener('input', () => {
      intocado = false;
    });

    origem.addEventListener('input', () => {
      if (!intocado) return;
      destino.value = origem.value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    });
  });
}

/* ---------- barra de formatação do texto ---------- */

interface Ferramenta {
  rotulo: string;
  titulo: string;
  comando: string;
  valor?: string;
}

const FERRAMENTAS: Ferramenta[] = [
  { rotulo: 'N', titulo: 'Negrito', comando: 'bold' },
  { rotulo: 'I', titulo: 'Itálico', comando: 'italic' },
  { rotulo: 'Título', titulo: 'Título de seção', comando: 'formatBlock', valor: 'h2' },
  { rotulo: 'Subtítulo', titulo: 'Subtítulo', comando: 'formatBlock', valor: 'h3' },
  { rotulo: 'Parágrafo', titulo: 'Parágrafo comum', comando: 'formatBlock', valor: 'p' },
  { rotulo: 'Lista', titulo: 'Lista com marcadores', comando: 'insertUnorderedList' },
  { rotulo: 'Lista nº', titulo: 'Lista numerada', comando: 'insertOrderedList' },
  { rotulo: 'Citação', titulo: 'Citação', comando: 'formatBlock', valor: 'blockquote' },
];

function ligarEditorDeTexto(): void {
  document.querySelectorAll<HTMLTextAreaElement>('textarea[data-editor-rico]').forEach((area) => {
    if (area.disabled) return;

    const caixa = document.createElement('div');
    caixa.className = 'mt-1 rounded-md border border-prata bg-papel';

    const barra = document.createElement('div');
    barra.className = 'flex flex-wrap gap-1 border-b border-prata p-2';
    barra.setAttribute('role', 'toolbar');
    barra.setAttribute('aria-label', `Formatação de ${area.id}`);

    const area_edicao = document.createElement('div');
    area_edicao.className = 'conteudo-rico min-h-48 p-3 focus:outline-2 focus:outline-azul';
    area_edicao.contentEditable = 'true';
    area_edicao.setAttribute('role', 'textbox');
    area_edicao.setAttribute('aria-multiline', 'true');
    area_edicao.setAttribute('aria-labelledby', `${area.id}-rotulo`);
    area_edicao.innerHTML = area.value;

    const rotulo = document.querySelector<HTMLLabelElement>(`label[for="${area.id}"]`);
    if (rotulo) rotulo.id = `${area.id}-rotulo`;

    for (const f of FERRAMENTAS) {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.textContent = f.rotulo;
      botao.title = f.titulo;
      botao.className =
        'rounded border border-prata px-2 py-1 text-sm font-semibold text-grafite hover:border-azul hover:text-azul';
      botao.addEventListener('click', () => {
        area_edicao.focus();
        // execCommand é obsoleto e não tem substituto de mesmo alcance sem
        // trazer um editor inteiro como dependência. Para negrito, lista e
        // cabeçalho ele funciona em todos os navegadores atuais — e o
        // resultado passa pelo sanitizador do servidor de qualquer jeito.
        document.execCommand(f.comando, false, f.valor);
        sincronizar();
      });
      barra.appendChild(botao);
    }

    const limpar = document.createElement('button');
    limpar.type = 'button';
    limpar.textContent = 'Limpar formatação';
    limpar.title = 'Remove a formatação do trecho selecionado — útil ao colar do Word';
    limpar.className =
      'rounded border border-prata px-2 py-1 text-sm font-semibold text-grafite hover:border-azul hover:text-azul';
    limpar.addEventListener('click', () => {
      area_edicao.focus();
      document.execCommand('removeFormat');
      sincronizar();
    });
    barra.appendChild(limpar);

    function sincronizar(): void {
      area.value = area_edicao.innerHTML;
    }

    area_edicao.addEventListener('input', sincronizar);
    area_edicao.addEventListener('blur', sincronizar);

    // Colar do Word traz uma montanha de marcação de apresentação. Colar como
    // texto puro é o que a secretaria quase sempre quer; a formatação se
    // refaz com a barra em dois cliques.
    area_edicao.addEventListener('paste', (evento) => {
      evento.preventDefault();
      const texto = evento.clipboardData?.getData('text/plain') ?? '';
      document.execCommand('insertText', false, texto);
      sincronizar();
    });

    area.style.display = 'none';
    area.setAttribute('aria-hidden', 'true');
    area.tabIndex = -1;
    caixa.appendChild(barra);
    caixa.appendChild(area_edicao);
    area.parentElement?.insertBefore(caixa, area);

    area.form?.addEventListener('submit', sincronizar);
  });
}

/* ---------- envio de arquivo com resposta imediata ---------- */

function ligarEnvioDeArquivo(): void {
  document.querySelectorAll<HTMLElement>('[data-campo-arquivo]').forEach((bloco) => {
    const entrada = bloco.querySelector<HTMLInputElement>('input[type="file"]');
    const oculto = bloco.querySelector<HTMLInputElement>('input[data-arquivo-id]');
    const estado = bloco.querySelector<HTMLElement>('[data-arquivo-estado]');
    const remover = bloco.querySelector<HTMLButtonElement>('[data-arquivo-remover]');
    if (!entrada || !oculto || !estado) return;

    remover?.addEventListener('click', () => {
      oculto.value = '';
      estado.textContent = 'Arquivo removido. Salve para confirmar.';
      remover.closest('p')?.remove();
    });

    entrada.addEventListener('change', async () => {
      const arquivo = entrada.files?.[0];
      if (!arquivo) return;

      estado.className = 'mt-1 text-sm text-grafite';
      estado.textContent = `Verificando "${arquivo.name}"…`;

      const corpo = new FormData();
      corpo.append('arquivo', arquivo);

      try {
        const resposta = await fetch('/painel/api/upload', { method: 'POST', body: corpo });
        const dados = await resposta.json();

        if (!resposta.ok) {
          estado.className = 'mt-1 text-sm font-semibold text-vermelho';
          estado.textContent = dados.erro ?? 'Não foi possível enviar o arquivo.';
          entrada.value = '';
          return;
        }

        oculto.value = dados.id;
        // Limpa o campo de arquivo: sem isso o binário subiria DE NOVO no
        // envio do formulário, e o CMS ficaria com duas cópias.
        entrada.value = '';
        estado.className = 'mt-1 text-sm font-semibold text-verde-texto';
        estado.textContent = `"${dados.nome}" verificado e guardado. Salve para vincular ao item.`;
      } catch {
        estado.className = 'mt-1 text-sm font-semibold text-vermelho';
        estado.textContent = 'Falha de rede ao enviar o arquivo. O envio junto com o formulário ainda funciona.';
      }
    });
  });
}

ligarSugestaoDeEndereco();
ligarEditorDeTexto();
ligarEnvioDeArquivo();
