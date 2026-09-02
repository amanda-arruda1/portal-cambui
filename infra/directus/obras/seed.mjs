#!/usr/bin/env node
/**
 * Popula o módulo de obras públicas com dados de demonstração.
 *
 *   node infra/directus/obras/seed.mjs [--aplicar]
 *   node infra/directus/obras/seed.mjs --reset            remove tudo o que este seed criou
 *   node infra/directus/obras/seed.mjs --reset --aplicar   remove e recria
 *
 * Mesmas regras do seed de licitações (ver infra/directus/licitacoes/seed.mjs):
 * datas relativas, idempotente, tudo marcado `demonstracao: true`, PDFs de
 * verdade com marca d'água, CNPJ sintaticamente válido e claramente fictício.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CATEGORIAS, FONTES_RECURSO } from './enums.mjs';
import { OBRAS, EMPRESAS, RESPONSAVEIS_TECNICOS } from './dados-demo.mjs';
import { gerarPdf } from '../licitacoes/pdf.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
/* Fotos de "andamento" GERADAS (degradê + traço tipo planta baixa), não
   fotos de verdade — mesmo raciocínio das miniaturas do Instagram: uma foto
   de mentira pareceria registro real de obra. */
const FOTOS_DEMO = [1, 2, 3, 4].map((n) => readFileSync(join(AQUI, 'fotos-demo', `andamento-${n}.webp`)));

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const RESET = process.argv.includes('--reset');
const APLICAR = process.argv.includes('--aplicar') || !RESET;

let semente = 20260901;
const aleatorio = () => ((semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const escolher = (lista) => lista[Math.floor(aleatorio() * lista.length)];
const inteiro = (min, max) => Math.floor(min + aleatorio() * (max - min + 1));

const AGORA = new Date();
const dias = (n) => new Date(AGORA.getTime() + n * 86400000);

function cnpjFicticio(indice) {
  const base = `11111${String(300 + indice).padStart(3, '0')}0001`;
  const dv = (nums, pesos) => { const s = nums.reduce((a, n, i) => a + n * pesos[i], 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  const n = base.split('').map(Number);
  const d1 = dv(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...n, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const c = `${base}${d1}${d2}`;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

async function obterToken() {
  if (process.env.DIRECTUS_TOKEN) return process.env.DIRECTUS_TOKEN;
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.DIRECTUS_EMAIL, password: process.env.DIRECTUS_SENHA }) });
  if (!r.ok) throw new Error(`Login: HTTP ${r.status}. Defina DIRECTUS_EMAIL e DIRECTUS_SENHA.`);
  return (await r.json()).data.access_token;
}
const token = await obterToken();

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, { ...opcoes,
    headers: { Authorization: `Bearer ${token}`, ...(opcoes.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(opcoes.headers ?? {}) } });
  if (!r.ok) {
    const detalhe = opcoes.body instanceof FormData ? '(multipart)' : String(opcoes.body ?? '').slice(0, 700);
    throw new Error(`${opcoes.method ?? 'GET'} ${caminho} → ${r.status} ${(await r.text()).slice(0, 260)}\n  corpo: ${detalhe}`);
  }
  return r.status === 204 ? null : (await r.json()).data;
}

if (RESET) {
  console.log('==> removendo dados de demonstração de obras públicas');
  for (const colecao of ['obra_medicoes', 'obra_anexos', 'obras']) {
    const itens = await api(`/items/${colecao}?limit=-1&fields=id&filter[demonstracao][_eq]=true`);
    for (const i of itens) await api(`/items/${colecao}/${i.id}`, { method: 'DELETE' });
    console.log(`  - ${colecao}: ${itens.length}`);
  }
  const arquivos = await api('/files?limit=-1&fields=id,title&filter[title][_starts_with]=DEMO-OBRA ');
  for (const a of arquivos) await api(`/files/${a.id}`, { method: 'DELETE' });
  console.log(`  - arquivos: ${arquivos.length}`);
  if (!APLICAR) { console.log('\nRemoção concluída.\n'); process.exit(0); }
}

const secretarias = await api('/items/secretarias?limit=-1&fields=id,nome,slug');
const idSecretaria = Object.fromEntries(secretarias.map((s) => [s.slug, s.id]));
const pasta = (await api('/folders?limit=-1&fields=id,name')).find((f) => f.name === 'publicos');
if (!pasta) throw new Error("Pasta 'publicos' não existe. Rode infra/directus/aplicar-papeis.mjs antes.");

const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugificar = (t) => semAcento(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);

/* Plano de distribuição de situações — é o que faz a home e a listagem
   pública terem exemplo de cada estado, inclusive o mais sensível
   (paralisada), que é o que mais interessa ao cidadão e ao controle. */
const PLANO = [
  'em_execucao', 'em_execucao', 'em_execucao',
  'concluida', 'concluida',
  'paralisada',
  'nao_iniciada',
  'em_licitacao',
  'planejada',
  'concluida',
];

console.log(`==> criando ${OBRAS.length} obras de demonstração`);

let criadas = 0, anexosCriados = 0, medicoesCriadas = 0;

for (const [i, O] of OBRAS.entries()) {
  const situacao = PLANO[i % PLANO.length];
  const meta = CATEGORIAS.find((c) => c.valor === O.categoria);
  const fonte = escolher(FONTES_RECURSO);
  const valorContratado = inteiro(O.faixa[0], O.faixa[1]);
  const temAditivo = aleatorio() > 0.6;
  const valorAditivado = temAditivo ? Math.round(valorContratado * (0.03 + aleatorio() * 0.12)) : 0;

  const inicioOS = dias(-inteiro(30, 540));
  const prazoDias = inteiro(90, 360);
  const previsaoTermino = new Date(inicioOS.getTime() + prazoDias * 86400000);
  const concluida = situacao === 'concluida';
  const terminoReal = concluida ? new Date(previsaoTermino.getTime() + inteiro(-15, 40) * 86400000) : null;

  const percentual = { planejada: 0, em_licitacao: 0, nao_iniciada: 0, em_execucao: inteiro(15, 85), paralisada: inteiro(20, 60), concluida: 100, cancelada: inteiro(0, 40) }[situacao];

  const slug = `${slugificar(O.resumo)}-${String(1000 + i)}`;

  const corpo = {
    status: 'publicado',
    demonstracao: true,
    numero_processo: `${2000 + i}/${inicioOS.getFullYear()}`,
    numero_contrato: ['planejada', 'em_licitacao'].includes(situacao) ? null : `${140 + i}/${inicioOS.getFullYear()}`,
    slug,
    categoria: O.categoria,
    secretaria: idSecretaria[O.secretaria] ?? null,
    objeto_resumo: O.resumo,
    objeto: `<p>${O.resumo}, incluindo os serviços preliminares, execução e limpeza final da área, conforme projeto básico e memorial descritivo integrantes do processo administrativo.</p>`,
    endereco: `${O.resumo.split(',').slice(-1)[0].trim()}, Cambuí/MG`,
    empresa_executora: ['planejada', 'em_licitacao'].includes(situacao) ? null : escolher(EMPRESAS),
    empresa_cnpj: ['planejada', 'em_licitacao'].includes(situacao) ? null : cnpjFicticio(i),
    responsavel_tecnico: ['planejada', 'em_licitacao'].includes(situacao) ? null : escolher(RESPONSAVEIS_TECNICOS),
    art_rrt: ['planejada', 'em_licitacao'].includes(situacao) ? null : `MG${inteiro(20260000000, 20269999999)}`,
    fonte_recurso: fonte.valor,
    numero_convenio: fonte.exigeConvenio ? `${inteiro(800000, 899999)}/${inicioOS.getFullYear()}` : null,
    valor_contratado: ['planejada', 'em_licitacao'].includes(situacao) ? null : valorContratado,
    valor_aditivado: valorAditivado,
    valor_pago: situacao === 'em_execucao' || situacao === 'paralisada' ? Math.round(valorContratado * (percentual / 100) * 0.96)
      : concluida ? valorContratado + valorAditivado : 0,
    data_ordem_servico: ['planejada', 'em_licitacao'].includes(situacao) ? null : inicioOS.toISOString(),
    data_prevista_termino: ['planejada', 'em_licitacao'].includes(situacao) ? null : previsaoTermino.toISOString(),
    data_termino_real: terminoReal ? terminoReal.toISOString() : null,
    situacao,
    motivo_situacao: situacao === 'paralisada'
      ? 'Obra paralisada para readequação do projeto de drenagem, aprovada pela Secretaria de Obras. Retomada prevista após a estação chuvosa.'
      : null,
    percentual_execucao: percentual,
    observacoes: null,
    data_publicacao: inicioOS.toISOString(),
  };

  const criada = await api('/items/obras', { method: 'POST', body: JSON.stringify(corpo) });
  criadas++;

  /* ---- anexos ---- */
  const camposPdf = [
    ['Processo administrativo', corpo.numero_processo],
    ['Categoria', meta.rotulo],
    ['Fonte de recurso', fonte.rotulo],
    ['Valor contratado', corpo.valor_contratado ? corpo.valor_contratado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Em licitação'],
  ];
  async function anexar({ titulo, categoria, quando, ordem = 0 }) {
    const pdf = gerarPdf({ titulo: O.resumo, subtitulo: titulo, objeto: corpo.objeto.replace(/<[^>]+>/g, ''), campos: camposPdf });
    const forma = new FormData();
    forma.append('folder', pasta.id);
    forma.append('title', `DEMO-OBRA ${O.resumo} — ${titulo}`);
    forma.append('file', new Blob([pdf], { type: 'application/pdf' }), `${slug}-${slugificar(titulo)}.pdf`);
    const arquivo = await api('/files', { method: 'POST', body: forma });
    await api('/items/obra_anexos', { method: 'POST', body: JSON.stringify({
      status: 'publicado', demonstracao: true, obra: criada.id, titulo, categoria,
      arquivo: arquivo.id, data_referencia: quando.toISOString(), ordem,
    }) });
    anexosCriados++;
  }

  async function anexarFoto({ titulo, quando, ordem = 0 }) {
    const foto = FOTOS_DEMO[(i + ordem) % FOTOS_DEMO.length];
    const forma = new FormData();
    forma.append('folder', pasta.id);
    forma.append('title', `DEMO-OBRA ${O.resumo} — ${titulo}`);
    forma.append('file', new Blob([foto], { type: 'image/webp' }), `${slug}-foto-${ordem}.webp`);
    const arquivo = await api('/files', { method: 'POST', body: forma });
    await api('/items/obra_anexos', { method: 'POST', body: JSON.stringify({
      status: 'publicado', demonstracao: true, obra: criada.id, titulo, categoria: 'foto',
      arquivo: arquivo.id, data_referencia: quando.toISOString(),
      descricao: titulo, ordem,
    }) });
    anexosCriados++;
  }

  await anexar({ titulo: 'Projeto básico', categoria: 'projeto_basico', quando: inicioOS, ordem: 1 });
  if (!['planejada', 'em_licitacao'].includes(situacao)) {
    await anexar({ titulo: 'ART/RRT do responsável técnico', categoria: 'art_rrt', quando: inicioOS, ordem: 2 });
    await anexar({ titulo: 'Contrato', categoria: 'contrato', quando: inicioOS, ordem: 3 });
    await anexar({ titulo: 'Ordem de serviço', categoria: 'ordem_servico', quando: inicioOS, ordem: 4 });
    if (temAditivo) await anexar({ titulo: 'Termo aditivo de prazo e valor', categoria: 'aditivo', quando: dias(-inteiro(10, 60)), ordem: 5 });
  }

  /* ---- fotos do andamento: só faz sentido para quem já começou a obra ---- */
  if (['em_execucao', 'paralisada', 'concluida'].includes(situacao)) {
    await anexarFoto({ titulo: 'Canteiro de obras — início dos trabalhos', quando: inicioOS, ordem: 1 });
    await anexarFoto({ titulo: 'Vista geral do andamento', quando: dias(inteiro(-60, -20)), ordem: 2 });
    if (concluida) await anexarFoto({ titulo: 'Obra concluída', quando: terminoReal ?? dias(-10), ordem: 3 });
  }

  /* ---- medições: execução financeira, mês a mês ---- */
  if (['em_execucao', 'paralisada', 'concluida'].includes(situacao)) {
    const quantasMedicoes = concluida ? inteiro(4, 8) : inteiro(2, 5);
    let acumulado = 0;
    const valorPorMedicao = Math.round((corpo.valor_pago || 0) / quantasMedicoes);
    for (let m = 1; m <= quantasMedicoes; m++) {
      acumulado += valorPorMedicao;
      const percentualAcumulado = Math.round((percentual / quantasMedicoes) * m);
      await api('/items/obra_medicoes', { method: 'POST', body: JSON.stringify({
        status: 'publicado', demonstracao: true, obra: criada.id, numero: m,
        data_referencia: new Date(inicioOS.getTime() + m * 30 * 86400000).toISOString(),
        percentual_acumulado: Math.min(percentualAcumulado, 100),
        valor_medido: valorPorMedicao, valor_acumulado: acumulado,
        observacoes: m === quantasMedicoes && concluida ? 'Medição final — obra concluída e recebida.' : null,
      }) });
      medicoesCriadas++;
    }
  }

  if ((i + 1) % 5 === 0) console.log(`  ${i + 1}/${OBRAS.length}…`);
}

console.log(`
  ${criadas} obras · ${anexosCriados} anexos (PDF de verdade) · ${medicoesCriadas} medições

  Para desfazer:  node infra/directus/obras/seed.mjs --reset
`);
