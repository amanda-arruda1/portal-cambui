#!/usr/bin/env node
/**
 * Popula o módulo de licitações com dados de demonstração.
 *
 *   npm run seed:licitacoes            (a partir de apps/web)
 *   node seed.mjs --reset              remove tudo o que este seed criou
 *   node seed.mjs --reset --aplicar    remove e recria
 *
 * REGRAS QUE O SEED RESPEITA:
 *  - datas RELATIVAS ao momento da execução. Rodar daqui a três meses continua
 *    produzindo "próximos 30 dias" corretos;
 *  - idempotente: `--reset` antes de recriar, e nada é criado em duplicidade;
 *  - todo registro marcado com `demonstracao: true`, que é o que o script de
 *    remoção usa e o que faz o portal exibir a faixa de aviso;
 *  - PDFs de verdade, com marca d'água — link quebrado não valida nada;
 *  - CNPJ sintaticamente válido e claramente fictício; razões sociais
 *    inventadas. Nenhuma empresa real.
 */
import { MODALIDADES, SITUACOES, TIPOS_ANEXO } from './enums.mjs';
import { OBJETOS, FORNECEDORES, NOMES_FEIOS } from './dados-demo.mjs';
import { gerarPdf } from './pdf.mjs';

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const RESET = process.argv.includes('--reset');
const APLICAR = process.argv.includes('--aplicar') || !RESET;
const TOTAL = 40;

/* Gerador pseudoaleatório com semente fixa: rodar duas vezes produz o MESMO
 * conjunto (salvo as datas, que são relativas). Sem isso, cada execução mudaria
 * os números de processo e a validação viraria adivinhação. */
let semente = 20260828;
const aleatorio = () => ((semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const escolher = (lista) => lista[Math.floor(aleatorio() * lista.length)];
const inteiro = (min, max) => Math.floor(min + aleatorio() * (max - min + 1));

const AGORA = new Date();
const dias = (n) => new Date(AGORA.getTime() + n * 86400000);
/** Encaixa a hora comercial: sessão de licitação não abre às 3h da manhã. */
function comHora(data, hora, minuto = 0) {
  const d = new Date(data);
  d.setHours(hora, minuto, 0, 0);
  return d;
}

/* ---------- CNPJ fictício, sintaticamente válido ---------- */
function cnpjFicticio(indice) {
  // Raiz 11.111.xxx: existe, é válida na conta dos dígitos, e é obviamente
  // inventada para quem conhece o formato.
  const base = `11111${String(200 + indice).padStart(3, '0')}0001`;
  const dv = (nums, pesos) => {
    const soma = nums.reduce((s, n, i) => s + n * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const n = base.split('').map(Number);
  const d1 = dv(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...n, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const c = `${base}${d1}${d2}`;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

/* ---------- API ---------- */
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
    // Mostra o corpo enviado junto com o erro: sem isso, "campo X é longo
    // demais" não diz QUAL registro nem com que valor, e a depuração vira
    // adivinhação num seed de 40 itens.
    const detalhe = opcoes.body instanceof FormData ? '(multipart)' : String(opcoes.body ?? '').slice(0, 700);
    throw new Error(`${opcoes.method ?? 'GET'} ${caminho} → ${r.status} ${(await r.text()).slice(0, 260)}\n  corpo: ${detalhe}`);
  }
  return r.status === 204 ? null : (await r.json()).data;
}

/* ---------- reset ---------- */
if (RESET) {
  console.log('==> removendo dados de demonstração de licitações');
  for (const colecao of ['licitacao_eventos', 'licitacao_lotes', 'licitacao_anexos', 'licitacoes']) {
    const itens = await api(`/items/${colecao}?limit=-1&fields=id&filter[demonstracao][_eq]=true`);
    for (const i of itens) await api(`/items/${colecao}/${i.id}`, { method: 'DELETE' });
    console.log(`  - ${colecao}: ${itens.length}`);
  }
  const arquivos = await api('/files?limit=-1&fields=id,title&filter[title][_starts_with]=DEMO ');
  for (const a of arquivos) await api(`/files/${a.id}`, { method: 'DELETE' });
  console.log(`  - arquivos: ${arquivos.length}`);
  if (!APLICAR) { console.log('\nRemoção concluída.\n'); process.exit(0); }
}

/* ---------- referências ---------- */
const secretarias = await api('/items/secretarias?limit=-1&fields=id,nome,slug');
const idSecretaria = Object.fromEntries(secretarias.map((s) => [s.slug, s.id]));
const pasta = (await api('/folders?limit=-1&fields=id,name')).find((f) => f.name === 'publicos');
if (!pasta) throw new Error("Pasta 'publicos' não existe. Rode infra/directus/aplicar-papeis.mjs antes.");

/* ---------- desenho do conjunto ----------
 * A distribuição temporal é o coração do seed: é ela que faz a chamada da home
 * ter o que mostrar e o filtro "abertas agora" não vir vazio. */
const PLANO = [
  { quantos: 1,  abertura: 2,   situacao: 'publicada' },   // abre em 2 dias — o caso urgente
  { quantos: 5,  abertura: [4, 20], situacao: 'publicada' },
  { quantos: 1,  abertura: 29,  situacao: 'publicada' },   // abre em 29 dias — o limite da janela
  { quantos: 1,  abertura: 45,  situacao: 'publicada' },   // fora da janela, de propósito
  { quantos: 5,  abertura: [-3, -1], situacao: 'aberta' }, // recebendo propostas agora
  { quantos: 2,  abertura: [-25, -8], situacao: 'em_julgamento' },
  { quantos: 1,  abertura: -12, situacao: 'suspensa' },
  { quantos: 1,  abertura: 9,   situacao: 'retificada' },  // com duas versões de edital
  { quantos: 10, abertura: [-540, -60], situacao: 'homologada' },
  { quantos: 4,  abertura: [-480, -90], situacao: 'contratada' },
  { quantos: 3,  abertura: [-420, -70], situacao: 'fracassada' },
  { quantos: 2,  abertura: [-380, -100], situacao: 'deserta' },
  { quantos: 2,  abertura: [-300, -110], situacao: 'revogada' },
  { quantos: 1,  abertura: -200, situacao: 'anulada' },
  { quantos: 1,  abertura: [-160, -120], situacao: 'adjudicada' },
];

const licitacoes = [];
let sequencial = 0;
for (const bloco of PLANO) {
  for (let k = 0; k < bloco.quantos; k++) {
    sequencial++;
    const deslocamento = Array.isArray(bloco.abertura) ? inteiro(bloco.abertura[0], bloco.abertura[1]) : bloco.abertura;
    const objeto = OBJETOS[(sequencial * 7) % OBJETOS.length];
    const modalidade = escolher(objeto.modalidades.length ? objeto.modalidades : ['pregao_eletronico']);
    const meta = MODALIDADES.find((m) => m.valor === modalidade);
    const sessao = comHora(dias(deslocamento), inteiro(8, 14), escolher([0, 30]));
    const publicacao = new Date(sessao.getTime() - (meta.prazoMinimoDias + inteiro(1, 12)) * 86400000);
    licitacoes.push({ sequencial, objeto, modalidade, meta, sessao, publicacao, situacao: bloco.situacao, deslocamento });
  }
}

console.log(`==> criando ${licitacoes.length} licitações de demonstração`);

const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugificar = (t) => semAcento(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);

let criadas = 0, anexosCriados = 0, lotesCriados = 0, eventosCriados = 0;

for (const [i, L] of licitacoes.entries()) {
  const ano = L.sessao.getFullYear();
  const numero = 1 + i;
  const rotuloModalidade = L.meta.rotulo;
  const slug = `${slugificar(rotuloModalidade)}-${String(numero).padStart(3, '0')}`;

  /* Imperfeições propositais, para provar que o layout aguenta o mundo real. */
  const objetoLonguissimo = i === 3;
  const semValor = i === 7;
  const sigiloso = i === 11;

  const valor = semValor ? null : inteiro(L.objeto.faixa[0], L.objeto.faixa[1]);
  const resumo = objetoLonguissimo
    ? `${L.objeto.resumo}, em atendimento às unidades da rede municipal, incluindo o fornecimento parcelado mediante ordem de fornecimento emitida pela secretaria demandante, com entrega em até 10 (dez) dias úteis contados do recebimento, conforme quantitativos estimados constantes do Termo de Referência e seus anexos`
    : L.objeto.resumo;

  const corpo = {
    status: 'publicado',
    demonstracao: true,
    numero_processo: `${1000 + i}/${ano}`,
    numero, ano, slug,
    modalidade: L.modalidade,
    forma: L.modalidade === 'pregao_presencial' ? 'presencial' : 'eletronica',
    justificativa_presencial: L.modalidade === 'pregao_presencial'
      ? 'Sessão presencial justificada pela necessidade de exame físico das amostras, nos termos do art. 17, §2º, da Lei 14.133/2021.' : null,
    criterio_julgamento: L.modalidade === 'leilao' ? 'maior_lance' : (L.objeto.chave === 'pavimentacao' ? 'menor_preco' : escolher(['menor_preco', 'menor_preco', 'menor_preco', 'maior_desconto'])),
    modo_disputa: ['inexigibilidade', 'credenciamento', 'adesao_ata'].includes(L.modalidade) ? 'nao_se_aplica' : escolher(['aberto', 'aberto', 'aberto_fechado']),
    registro_precos: L.objeto.srp,
    secretaria: idSecretaria[L.objeto.secretaria] ?? null,
    objeto_resumo: resumo,
    objeto: `<p>${L.objeto.detalhe}</p><p>As especificações completas, quantitativos e condições de fornecimento constam do Termo de Referência, anexo a este edital.</p>`,
    valor_estimado: valor,
    orcamento_sigiloso: sigiloso,
    data_publicacao: L.publicacao.toISOString(),
    data_abertura_propostas: new Date(L.sessao.getTime() - 86400000).toISOString(),
    data_sessao: L.sessao.toISOString(),
    prazo_impugnacao: new Date(L.sessao.getTime() - 3 * 86400000).toISOString(),
    prazo_esclarecimentos: new Date(L.sessao.getTime() - 3 * 86400000).toISOString(),
    situacao: L.situacao,
    motivo_situacao: L.situacao === 'suspensa'
      ? 'Suspensa por decisão da autoridade competente para análise de impugnação apresentada tempestivamente. Nova data será divulgada neste portal e no PNCP.'
      : L.situacao === 'revogada' ? 'Revogada por razões de interesse público superveniente, nos termos do art. 71 da Lei 14.133/2021.'
      : L.situacao === 'anulada' ? 'Anulada em razão de vício insanável identificado no instrumento convocatório.'
      : L.situacao === 'deserta' ? 'Encerrada sem a apresentação de propostas.'
      : L.situacao === 'fracassada' ? 'Todas as propostas apresentadas foram desclassificadas.' : null,
    pncp_id: `18675983000121-1-${String(numero).padStart(6, '0')}/${ano}`,
    pncp_url: `https://pncp.gov.br/app/editais/18675983000121/${ano}/${numero}`,
    sistema_sessao_url: L.modalidade.startsWith('pregao') || L.modalidade === 'dispensa_eletronica'
      ? 'https://www.gov.br/compras/pt-br' : null,
  };

  const criada = await api('/items/licitacoes', { method: 'POST', body: JSON.stringify(corpo) });
  criadas++;

  /* ---- anexos ---- */
  const rotuloCompleto = `${rotuloModalidade} nº ${String(numero).padStart(3, '0')}/${ano}`;
  const camposPdf = [
    ['Processo administrativo', corpo.numero_processo],
    ['Modalidade', `${rotuloModalidade} — forma ${corpo.forma}`],
    ['Sessão pública', `${L.sessao.toLocaleDateString('pt-BR')} às ${L.sessao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} (horário de Brasília)`],
    ['Valor estimado', sigiloso ? 'Orçamento sigiloso' : (valor ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Não divulgado')],
  ];

  async function anexar({ titulo, tipo, quando, versao = 1, substitui = null, superado = false, ordem = 0, nomeArquivo }) {
    const pdf = gerarPdf({ titulo: rotuloCompleto, subtitulo: titulo, objeto: L.objeto.detalhe, campos: camposPdf });
    const forma = new FormData();
    forma.append('folder', pasta.id);
    forma.append('title', `DEMO ${rotuloCompleto} — ${titulo}`);
    forma.append('file', new Blob([pdf], { type: 'application/pdf' }), nomeArquivo ?? `${slug}-${slugificar(titulo)}.pdf`);
    const arquivo = await api('/files', { method: 'POST', body: forma });
    const anexo = await api('/items/licitacao_anexos', { method: 'POST', body: JSON.stringify({
      status: 'publicado', demonstracao: true, licitacao: criada.id, titulo, tipo,
      arquivo: arquivo.id, data_publicacao: quando.toISOString(), versao, substitui, superado, ordem,
    }) });
    anexosCriados++;
    return anexo;
  }

  const editalOriginal = await anexar({ titulo: 'Edital', tipo: 'edital', quando: L.publicacao, ordem: 1 });
  await anexar({ titulo: 'Termo de referência', tipo: 'termo_de_referencia', quando: L.publicacao, ordem: 2 });
  if (aleatorio() > 0.35) await anexar({ titulo: 'Planilha orçamentária', tipo: 'planilha', quando: L.publicacao, ordem: 3, nomeArquivo: NOMES_FEIOS[2] });
  if (aleatorio() > 0.5) await anexar({ titulo: 'Minuta de contrato', tipo: 'minuta_de_contrato', quando: L.publicacao, ordem: 4 });

  /* A retificada: o edital antigo NÃO some, fica marcado como superado. */
  if (L.situacao === 'retificada') {
    const quandoRetifica = new Date(L.publicacao.getTime() + 5 * 86400000);
    await api(`/items/licitacao_anexos/${editalOriginal.id}`, { method: 'PATCH', body: JSON.stringify({ superado: true }) });
    await anexar({ titulo: 'Edital retificado', tipo: 'edital', quando: quandoRetifica, versao: 2, substitui: editalOriginal.id, ordem: 1 });
    await anexar({ titulo: 'Aviso de retificação', tipo: 'retificacao', quando: quandoRetifica, ordem: 5 });
    await api('/items/licitacao_eventos', { method: 'POST', body: JSON.stringify({
      status: 'publicado', demonstracao: true, licitacao: criada.id, data: quandoRetifica.toISOString(), tipo: 'retificacao',
      descricao: 'Edital retificado quanto ao prazo de entrega e à especificação do item 4. A data da sessão foi reaberta.' }) });
    eventosCriados++;
  }

  const encerrada = ['homologada', 'adjudicada', 'contratada', 'fracassada', 'deserta'].includes(L.situacao);
  if (encerrada) {
    await anexar({ titulo: 'Ata da sessão pública', tipo: 'ata_da_sessao', quando: L.sessao, ordem: 6, nomeArquivo: NOMES_FEIOS[3] });
    if (['homologada', 'adjudicada', 'contratada'].includes(L.situacao)) {
      await anexar({ titulo: 'Termo de homologação', tipo: 'homologacao', quando: new Date(L.sessao.getTime() + 6 * 86400000), ordem: 7 });
    }
  }

  /* ---- lotes e vencedores ---- */
  if (['homologada', 'adjudicada', 'contratada'].includes(L.situacao)) {
    const quantosLotes = aleatorio() > 0.6 ? inteiro(2, 4) : 1;
    for (let n = 1; n <= quantosLotes; n++) {
      const estimado = valor ? Math.round(valor / quantosLotes) : inteiro(50000, 300000);
      await api('/items/licitacao_lotes', { method: 'POST', body: JSON.stringify({
        status: 'publicado', demonstracao: true, licitacao: criada.id, numero: n,
        descricao: quantosLotes === 1 ? 'Lote único' : `Lote ${n} — ${L.objeto.resumo.split(' ').slice(-3).join(' ')}`,
        valor_estimado: estimado, situacao: 'homologado',
        vencedor_razao_social: FORNECEDORES[(i + n) % FORNECEDORES.length],
        vencedor_cnpj: cnpjFicticio(i + n),
        valor_homologado: Math.round(estimado * (0.72 + aleatorio() * 0.22)),
      }) });
      lotesCriados++;
    }
  }

  /* ---- linha do tempo ---- */
  const eventos = [{ data: L.publicacao, tipo: 'publicacao', descricao: 'Edital publicado no portal e no PNCP.' }];
  if (L.situacao === 'suspensa') eventos.push({ data: new Date(L.sessao.getTime() - 2 * 86400000), tipo: 'suspensao', descricao: corpo.motivo_situacao });
  if (encerrada || ['em_julgamento', 'em_sessao'].includes(L.situacao)) eventos.push({ data: L.sessao, tipo: 'sessao', descricao: 'Sessão pública realizada.' });
  if (['homologada', 'adjudicada', 'contratada'].includes(L.situacao)) {
    eventos.push({ data: new Date(L.sessao.getTime() + 4 * 86400000), tipo: 'resultado', descricao: 'Resultado do julgamento divulgado.' });
    eventos.push({ data: new Date(L.sessao.getTime() + 6 * 86400000), tipo: 'homologacao', descricao: 'Objeto homologado pela autoridade competente.' });
  }
  if (L.situacao === 'revogada') eventos.push({ data: new Date(L.sessao.getTime() + 2 * 86400000), tipo: 'revogacao', descricao: corpo.motivo_situacao });
  if (L.situacao === 'anulada') eventos.push({ data: new Date(L.sessao.getTime() + 2 * 86400000), tipo: 'anulacao', descricao: corpo.motivo_situacao });
  for (const e of eventos) {
    await api('/items/licitacao_eventos', { method: 'POST', body: JSON.stringify({
      status: 'publicado', demonstracao: true, licitacao: criada.id, data: e.data.toISOString(), tipo: e.tipo, descricao: e.descricao }) });
    eventosCriados++;
  }

  if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${licitacoes.length}…`);
}

/* Contagens que a validação do briefing vai conferir. */
const proximos30 = licitacoes.filter((l) => l.deslocamento > 0 && l.deslocamento <= 30).length;
const abertasAgora = licitacoes.filter((l) => l.situacao === 'aberta').length;

console.log(`
  ${criadas} licitações · ${anexosCriados} anexos (PDF de verdade) · ${lotesCriados} lotes · ${eventosCriados} eventos

  abertura nos próximos 30 dias : ${proximos30}   (alimenta a chamada da home)
  recebendo propostas agora      : ${abertasAgora}
  com orçamento sigiloso         : 1
  retificada com 2 versões       : 1

  Para desfazer:  node infra/directus/licitacoes/seed.mjs --reset
`);
