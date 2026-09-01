/**
 * Editor de obras no navegador: gravação automática e envio de anexos com
 * barra de progresso. Mesmo espírito de scripts/painel-licitacoes.ts — tudo
 * aqui é melhoria progressiva; sem JavaScript o formulário continua inteiro
 * numa página só, com "Salvar" e "Publicar" funcionando pelo envio normal.
 */

// Força este arquivo a ser tratado como módulo (escopo isolado) pelo
// TypeScript: sem nenhum import/export, ele e painel-licitacoes.ts — que
// declara as mesmas variáveis de topo — colidiriam no escopo global do
// checador, mesmo carregados em páginas diferentes.
export {};

const form = document.querySelector<HTMLFormElement>('[data-form]');
const id = form?.dataset.id;
const marcaSalvo = document.querySelector<HTMLElement>('[data-salvo]');

/* ── gravação automática ─────────────────────────────────────────────── */

if (form && id) {
  let pendente: ReturnType<typeof setTimeout> | null = null;
  let salvando = false;

  const coletar = () => {
    const dados: Record<string, unknown> = {};
    const f = new FormData(form);
    for (const [k, v] of f.entries()) {
      if (k === 'acao') continue;
      dados[k] = typeof v === 'string' ? v : '';
    }
    for (const nome of ['valor_contratado', 'valor_aditivado', 'valor_pago']) {
      const v = dados[nome];
      dados[nome] = v ? Number(String(v).replace(/\./g, '').replace(',', '.')) || null : null;
    }
    if (dados.percentual_execucao) dados.percentual_execucao = Number(dados.percentual_execucao) || null;
    for (const nome of ['data_ordem_servico', 'data_prevista_termino', 'data_termino_real']) {
      const v = dados[nome];
      dados[nome] = v ? new Date(`${v}:00-03:00`).toISOString() : null;
    }
    return dados;
  };

  const gravar = async () => {
    if (salvando) return;
    salvando = true;
    if (marcaSalvo) marcaSalvo.textContent = 'salvando…';
    try {
      const r = await fetch('/painel/api/obra-salvar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, dados: coletar() }),
      });
      const c = await r.json();
      if (marcaSalvo) {
        marcaSalvo.textContent = r.ok
          ? `salvo às ${new Date(c.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
          : `não salvo: ${c.erro ?? 'erro'}`;
        marcaSalvo.style.color = r.ok ? 'var(--color-verde-texto)' : 'var(--color-vermelho)';
      }
    } catch {
      if (marcaSalvo) { marcaSalvo.textContent = 'sem conexão — não salvo'; marcaSalvo.style.color = 'var(--color-vermelho)'; }
    } finally { salvando = false; }
  };

  form.addEventListener('input', () => {
    if (pendente) clearTimeout(pendente);
    pendente = setTimeout(gravar, 1200);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) gravar(); });
}

/* ── campos condicionais ──────────────────────────────────────────────── */

const fonte = document.querySelector<HTMLSelectElement>('[data-fonte]');
const blocoConvenio = document.querySelector<HTMLElement>('[data-so-convenio]');
fonte?.addEventListener('change', () => {
  if (blocoConvenio) blocoConvenio.hidden = !['estadual', 'federal'].includes(fonte.value);
});

const situacao = document.querySelector<HTMLSelectElement>('[data-situacao]');
const blocoParalisada = document.querySelector<HTMLElement>('[data-so-paralisada]');
situacao?.addEventListener('change', () => {
  if (blocoParalisada) blocoParalisada.hidden = !['paralisada', 'cancelada'].includes(situacao.value);
});

/* ── anexos: arrastar, soltar e barra de progresso ────────────────────── */

const solta = document.querySelector<HTMLElement>('[data-solta]');
const entradaArquivos = document.querySelector<HTMLInputElement>('[data-arquivos]');
const fila = document.querySelector<HTMLUListElement>('[data-fila]');

function tituloLegivel(nome: string): string {
  const semExtensao = nome.replace(/\.[a-z0-9]+$/i, '');
  const limpo = semExtensao
    .replace(/[_-]+/g, ' ')
    .replace(/\(\d+\)/g, '')
    .replace(/\b(final|atualizado|corrigida?|assinad[oa].*|v\d+)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase();
}

function adivinharCategoria(nome: string): string {
  const n = nome.toLowerCase();
  if (/\bart\b|\brrt\b/.test(n)) return 'art_rrt';
  if (/projeto.*execut/.test(n)) return 'projeto_executivo';
  if (/projeto/.test(n)) return 'projeto_basico';
  if (/edital/.test(n)) return 'edital_licitacao';
  if (/aditivo/.test(n)) return 'aditivo';
  if (/contrato/.test(n)) return 'contrato';
  if (/ordem.*servi|^os\b/.test(n)) return 'ordem_servico';
  if (/fiscaliz|relatorio/.test(n)) return 'relatorio_fiscalizacao';
  if (/\.(png|jpe?g)$/.test(n)) return 'foto';
  return 'outro';
}

const CATEGORIAS_ANEXO: Array<[string, string]> = [
  ['projeto_basico', 'Projeto básico'], ['projeto_executivo', 'Projeto executivo'],
  ['art_rrt', 'ART/RRT do responsável técnico'], ['edital_licitacao', 'Edital da licitação'],
  ['contrato', 'Contrato'], ['aditivo', 'Termo aditivo'], ['ordem_servico', 'Ordem de serviço'],
  ['relatorio_fiscalizacao', 'Relatório de fiscalização'], ['foto', 'Foto do andamento'], ['outro', 'Outro documento'],
];

async function enviarArquivo(arquivo: File) {
  if (!fila || !id) return;
  const item = document.createElement('li');
  item.innerHTML = `<strong>${arquivo.name}</strong><div class="barra"><i></i></div><p class="t-micro"></p>`;
  const barra = item.querySelector<HTMLElement>('.barra i')!;
  const recado = item.querySelector<HTMLElement>('p')!;
  fila.appendChild(item);

  const corpo = new FormData();
  corpo.append('arquivo', arquivo);

  const enviado: { id?: string } = await new Promise((resolver) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/painel/api/upload');
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) barra.style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
    });
    xhr.addEventListener('load', () => {
      barra.style.width = '100%';
      try {
        const c = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) { recado.textContent = c.erro ?? 'Envio recusado.'; recado.style.color = 'var(--color-vermelho)'; resolver({}); }
        else resolver(c);
      } catch { recado.textContent = 'Resposta inesperada do servidor.'; resolver({}); }
    });
    xhr.addEventListener('error', () => { recado.textContent = 'Falha de rede no envio.'; resolver({}); });
    xhr.send(corpo);
  });

  if (!enviado.id) return;

  const titulo = tituloLegivel(arquivo.name);
  const categoria = adivinharCategoria(arquivo.name);
  recado.innerHTML = `
    <label>Título <input value="${titulo.replace(/"/g, '&quot;')}" data-titulo /></label>
    <label>Tipo <select data-categoria>${CATEGORIAS_ANEXO.map(([v, r]) => `<option value="${v}"${v === categoria ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
    <button type="button" data-anexar>Anexar à obra</button>`;

  item.querySelector<HTMLButtonElement>('[data-anexar]')?.addEventListener('click', async function () {
    this.disabled = true;
    const r = await fetch('/painel/api/obra-anexo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        obra: id,
        titulo: item.querySelector<HTMLInputElement>('[data-titulo]')!.value,
        categoria: item.querySelector<HTMLSelectElement>('[data-categoria]')!.value,
        arquivo: enviado.id,
      }),
    });
    const c = await r.json();
    recado.textContent = r.ok ? 'Anexado. Recarregue para ver na lista.' : (c.erro ?? 'Não foi possível anexar.');
    recado.style.color = r.ok ? 'var(--color-verde-texto)' : 'var(--color-vermelho)';
  });
}

solta?.addEventListener('click', () => entradaArquivos?.click());
solta?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entradaArquivos?.click(); }
});
entradaArquivos?.addEventListener('change', () => {
  for (const a of Array.from(entradaArquivos.files ?? [])) enviarArquivo(a);
  entradaArquivos.value = '';
});
for (const evento of ['dragenter', 'dragover']) {
  solta?.addEventListener(evento, (e) => { e.preventDefault(); solta.classList.add('sobre'); });
}
for (const evento of ['dragleave', 'drop']) {
  solta?.addEventListener(evento, (e) => { e.preventDefault(); solta.classList.remove('sobre'); });
}
solta?.addEventListener('drop', (e) => {
  const arquivos = (e as DragEvent).dataTransfer?.files;
  for (const a of Array.from(arquivos ?? [])) enviarArquivo(a);
});
