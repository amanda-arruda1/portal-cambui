/**
 * Editor de licitações no navegador: gravação automática, importação do PNCP e
 * envio de anexos com barra de progresso.
 *
 * Tudo aqui é melhoria. Sem JavaScript o formulário continua inteiro numa
 * página só, com os botões "Salvar rascunho" e "Publicar" funcionando pelo
 * envio normal — que é o que faz este módulo ser utilizável num computador
 * antigo de secretaria.
 */

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
      if (k === 'acao' || k === 'justificativa_prazo') continue;
      dados[k] = typeof v === 'string' ? v : '';
    }
    // Caixas desmarcadas não são enviadas pelo FormData: ausência é 'false'.
    for (const nome of ['registro_precos', 'orcamento_sigiloso']) {
      dados[nome] = form.querySelector<HTMLInputElement>(`[name="${nome}"]`)?.checked ?? false;
    }
    // Datas vão como estão; o servidor as interpreta no fuso de Brasília.
    for (const nome of ['numero', 'ano']) {
      const v = dados[nome];
      dados[nome] = v ? Number(v) : null;
    }
    if (dados.valor_estimado) {
      dados.valor_estimado = Number(String(dados.valor_estimado).replace(/\./g, '').replace(',', '.')) || null;
    } else dados.valor_estimado = null;
    for (const nome of ['data_publicacao', 'data_abertura_propostas', 'data_sessao', 'prazo_impugnacao', 'prazo_esclarecimentos']) {
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
      const r = await fetch('/painel/api/licitacao-salvar', {
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
    // 1,2s depois da última tecla: não grava a cada letra, e não deixa o
    // servidor 20 minutos sem rede de segurança.
    pendente = setTimeout(gravar, 1200);
  });
  // Trocar de aba ou fechar também grava — é quando a sessão costuma morrer.
  document.addEventListener('visibilitychange', () => { if (document.hidden) gravar(); });
}

/* ── justificativa só quando a forma é presencial ─────────────────────── */

const forma = document.querySelector<HTMLSelectElement>('[data-forma]');
const blocoPresencial = document.querySelector<HTMLElement>('[data-so-presencial]');
forma?.addEventListener('change', () => {
  if (blocoPresencial) blocoPresencial.hidden = forma.value !== 'presencial';
});

/* ── importação do PNCP ──────────────────────────────────────────────── */

const refPncp = document.querySelector<HTMLInputElement>('[data-pncp-ref]');
const btnPncp = document.querySelector<HTMLButtonElement>('[data-pncp-buscar]');
const estadoPncp = document.querySelector<HTMLElement>('[data-pncp-estado]');

btnPncp?.addEventListener('click', async () => {
  const referencia = refPncp?.value.trim();
  if (!referencia || !estadoPncp) return;
  btnPncp.disabled = true;
  estadoPncp.textContent = 'Consultando o PNCP…';
  estadoPncp.style.color = '';
  try {
    const r = await fetch('/painel/api/pncp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referencia }),
    });
    const c = await r.json();
    if (!r.ok) {
      // Degradação silenciosa: o painel continua utilizável.
      estadoPncp.textContent = c.erro;
      estadoPncp.style.color = 'var(--color-trigo)';
      return;
    }
    let preenchidos = 0;
    for (const [campo, valor] of Object.entries(c.dados as Record<string, unknown>)) {
      if (valor === null || valor === undefined || valor === '') continue;
      const el = form?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${campo}"]`);
      if (!el) continue;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') { el.checked = Boolean(valor); preenchidos++; continue; }
      if (el instanceof HTMLInputElement && el.type === 'datetime-local') {
        const d = new Date(String(valor));
        if (!Number.isNaN(d.getTime())) { el.value = new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 16); preenchidos++; }
        continue;
      }
      el.value = String(valor);
      preenchidos++;
    }
    forma?.dispatchEvent(new Event('change'));
    estadoPncp.textContent = `${preenchidos} campo(s) preenchidos a partir do PNCP. Confira antes de publicar — a conferência é sua.`;
    estadoPncp.style.color = 'var(--color-verde-texto)';
    form?.dispatchEvent(new Event('input'));
  } catch {
    estadoPncp.textContent = 'Não foi possível falar com o PNCP. Preencha manualmente e siga.';
    estadoPncp.style.color = 'var(--color-trigo)';
  } finally { btnPncp.disabled = false; }
});

/* ── anexos: arrastar, soltar e barra de progresso ────────────────────── */

const solta = document.querySelector<HTMLElement>('[data-solta]');
const entradaArquivos = document.querySelector<HTMLInputElement>('[data-arquivos]');
const fila = document.querySelector<HTMLUListElement>('[data-fila]');

/** "EDITAL_PE_032_2026_versao FINAL(2).pdf" → "Edital pe 032 2026 versao final"
 *  O servidor edita depois; o que não pode é ele digitar tudo do zero. */
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

/** Adivinha o tipo pelo nome — e deixa o servidor corrigir num seletor. */
function adivinharTipo(nome: string): string {
  const n = nome.toLowerCase();
  if (/retifica/.test(n)) return 'retificacao';
  if (/errata/.test(n)) return 'errata';
  if (/ata/.test(n)) return 'ata_da_sessao';
  if (/homologa/.test(n)) return 'homologacao';
  if (/contrato/.test(n)) return 'contrato';
  if (/planilha|orcament/.test(n)) return 'planilha';
  if (/termo.*refer|^tr\b/.test(n)) return 'termo_de_referencia';
  if (/impugna/.test(n)) return 'impugnacao';
  if (/esclarec/.test(n)) return 'esclarecimento';
  if (/anexo/.test(n)) return 'anexo_do_edital';
  return 'edital';
}

const TIPOS: Array<[string, string]> = [
  ['edital', 'Edital'], ['anexo_do_edital', 'Anexo do edital'], ['termo_de_referencia', 'Termo de referência'],
  ['planilha', 'Planilha'], ['minuta_de_contrato', 'Minuta de contrato'], ['retificacao', 'Retificação'],
  ['errata', 'Errata'], ['impugnacao', 'Impugnação'], ['resposta_a_impugnacao', 'Resposta à impugnação'],
  ['esclarecimento', 'Esclarecimento'], ['ata_da_sessao', 'Ata da sessão'], ['resultado_do_julgamento', 'Resultado do julgamento'],
  ['mapa_de_lances', 'Mapa de lances'], ['homologacao', 'Homologação'], ['contrato', 'Contrato'],
  ['ata_de_registro_de_precos', 'Ata de registro de preços'],
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
  const tipo = adivinharTipo(arquivo.name);
  recado.innerHTML = `
    <label>Título <input value="${titulo.replace(/"/g, '&quot;')}" data-titulo /></label>
    <label>Tipo <select data-tipo>${TIPOS.map(([v, r]) => `<option value="${v}"${v === tipo ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
    <label><input type="checkbox" data-substitui-edital /> Substitui o edital atual (retificação)</label>
    <button type="button" data-anexar>Anexar à licitação</button>`;

  item.querySelector<HTMLButtonElement>('[data-anexar]')?.addEventListener('click', async function () {
    this.disabled = true;
    const r = await fetch('/painel/api/licitacao-anexo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licitacao: id,
        titulo: item.querySelector<HTMLInputElement>('[data-titulo]')!.value,
        tipo: item.querySelector<HTMLSelectElement>('[data-tipo]')!.value,
        arquivo: enviado.id,
        substitui: item.querySelector<HTMLInputElement>('[data-substitui-edital]')!.checked
          ? (document.querySelector<HTMLElement>('[data-edital-atual]')?.dataset.editalAtual ?? null)
          : null,
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
