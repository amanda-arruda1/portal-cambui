#!/usr/bin/env node
/**
 * Importa as licitações do site antigo (prefeituradecambui.mg.gov.br) para o
 * Directus novo. Feito em 2026-09-10, a pedido do usuário.
 *
 *   node importar-portal-antigo.mjs [--fonte=ecrie|legado|tudo] [--dry-run] [--confirmar] [--limite=N]
 *
 * Por padrão roda em --dry-run (nada é gravado, só imprime o que faria).
 * Passar --confirmar é obrigatório para gravar de verdade.
 *
 * DUAS FONTES, tratadas diferente:
 *  - "ecrie": a listagem atual /licitacoes — sistema à parte (ecrie.com.br),
 *    ~150 processos (2025–2026), com campos estruturados (situação, número,
 *    modalidade, datas, valor, anexos tipados, histórico). Fonte rica.
 *  - "legado": as 3 páginas antigas do WordPress (/editais-2021,
 *    /licitacoes-anteriores-a-2024, /licitacoes-2025) — tabelas soltas com
 *    título, data e PDFs, SEM situação/modalidade estruturada. Extração por
 *    heurística de texto; item que não bate com nenhuma modalidade conhecida
 *    é PULADO e listado no resumo final, não adivinhado.
 *
 * DECISÕES DO USUÁRIO (2026-09-10), não desfazer sem perguntar de novo:
 *  - Situação sem informação melhor (Concluído/Encerrado/Julgado no eCrie;
 *    QUALQUER coisa no legado, que não tem o campo) vira "homologada".
 *  - Registros entram já com status "publicado" (são registros históricos
 *    já públicos no site antigo — mesmo padrão do seed.mjs).
 *
 * IDEMPOTENTE: antes de criar, verifica se já existe uma licitação com o
 * mesmo `numero_processo`. Rodar de novo só completa o que faltou.
 */
import { readFileSync } from 'node:fs';
import { MODALIDADES, TIPOS_ANEXO } from './enums.mjs';

/* ---------- argumentos ---------- */
const argv = process.argv.slice(2);
const arg = (nome, padrao = null) => argv.find((a) => a.startsWith(`--${nome}=`))?.split('=')[1] ?? padrao;
const FONTE = arg('fonte', 'tudo');
const CONFIRMAR = argv.includes('--confirmar');
const DRY_RUN = !CONFIRMAR;
const LIMITE = arg('limite') ? Number(arg('limite')) : Infinity;

/* ---------- Directus ---------- */
function carregarEnv(caminho) {
  const env = {};
  try {
    for (const linha of readFileSync(caminho, 'utf-8').split('\n')) {
      const l = linha.trim();
      if (!l || l.startsWith('#')) continue;
      const i = l.indexOf('=');
      if (i === -1) continue;
      env[l.slice(0, i)] = l.slice(i + 1);
    }
  } catch {}
  return env;
}
const envArquivo = carregarEnv('/opt/portal-cambui/.env');
const BASE = (process.env.DIRECTUS_INTERNAL_URL || envArquivo.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const TOKEN = process.env.DIRECTUS_TOKEN || envArquivo.DIRECTUS_TOKEN_ESQUEMA;
if (!TOKEN) throw new Error('Defina DIRECTUS_TOKEN (ou DIRECTUS_TOKEN_ESQUEMA no .env).');

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, { ...opcoes,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(opcoes.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(opcoes.headers ?? {}) } });
  if (!r.ok) {
    const detalhe = opcoes.body instanceof FormData ? '(multipart)' : String(opcoes.body ?? '').slice(0, 500);
    throw new Error(`${opcoes.method ?? 'GET'} ${caminho} → ${r.status} ${(await r.text()).slice(0, 300)}\n  corpo: ${detalhe}`);
  }
  return r.status === 204 ? null : (await r.json()).data;
}

/* ---------- HTTP do site antigo (precisa de User-Agent de navegador) ---------- */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
async function buscarTexto(url, tentativas = 3) {
  for (let t = 1; t <= tentativas; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 500) return null; // página do site antigo com erro (existe, visto na prática)
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (t === tentativas) { console.warn(`  ! falhou ${url}: ${e.message}`); return null; }
      await new Promise((res) => setTimeout(res, 800 * t));
    }
  }
}
async function baixarBinario(url, tentativas = 3) {
  for (let t = 1; t <= tentativas; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (t === tentativas) { console.warn(`  ! falhou baixar ${url}: ${e.message}`); return null; }
      await new Promise((res) => setTimeout(res, 800 * t));
    }
  }
}

/* ---------- entidades HTML ---------- */
const NAMEDAS = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ordm: 'º', ordf: 'ª', deg: '°', hellip: '…', ndash: '–', mdash: '—',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•',
  aacute: 'á', Aacute: 'Á', agrave: 'à', Agrave: 'À', acirc: 'â', Acirc: 'Â', atilde: 'ã', Atilde: 'Ã',
  ccedil: 'ç', Ccedil: 'Ç', eacute: 'é', Eacute: 'É', egrave: 'è', ecirc: 'ê', Ecirc: 'Ê',
  iacute: 'í', Iacute: 'Í', icirc: 'î', oacute: 'ó', Oacute: 'Ó', ocirc: 'ô', Ocirc: 'Ô', otilde: 'õ', Otilde: 'Õ',
  uacute: 'ú', Uacute: 'Ú', ucirc: 'û', uuml: 'ü',
};
function decodeEntidades(s) {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, nome) => NAMEDAS[nome] ?? m);
}
const semTag = (s) => decodeEntidades(String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const semAcento = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const slugificar = (t) => semAcento(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);

/* ---------- datas ---------- */
/** "22/01/2026 às 13:50" ou "22/01/2026" → Date (America/Sao_Paulo, sem lib de fuso: grava como horário local do servidor). */
function dataBR(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})(?:.*?(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, d, mo, a, h = '12', mi = '00'] = m;
  const dt = new Date(`${a}-${mo}-${d}T${h}:${mi}:00-03:00`);
  return isNaN(dt) ? null : dt;
}
function valorBR(s) {
  if (!s) return null;
  const limpo = s.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const n = parseFloat(limpo);
  return isNaN(n) ? null : n;
}

/* ---------- mapeamentos ---------- */
/* Modalidade: texto do site antigo → valor do enum novo. Alguns são
 * julgamento de continuidade documentado aqui, não adivinhação silenciosa:
 *  - "Registro de Preços" no site antigo é tratado como MODALIDADE (é regime,
 *    não modalidade) — mapeado para pregão eletrônico + registro_precos=true,
 *    que é como a esmagadora maioria desses processos realmente funciona.
 *  - "Convite" e "Tomada de Preço(s)" são modalidades da Lei 8.666 (revogada)
 *    sem equivalente exato na Lei 14.133 — mapeadas para "concorrência", a
 *    mais próxima em formalidade.
 *  - "Contratos" (categoria solta do site antigo, não é uma licitação em si)
 *    NÃO entra no mapa de propósito: fica de fora, pulado e reportado. */
const MODALIDADE_MAP = {
  'pregao eletronico': 'pregao_eletronico',
  'pregao presencial': 'pregao_presencial',
  'concorrencia eletronica': 'concorrencia',
  'concorrencia presencial': 'concorrencia',
  'concorrencia': 'concorrencia',
  'concurso': 'concurso',
  'leiloes': 'leilao',
  'leilao': 'leilao',
  'dialogo competitivo': 'dialogo_competitivo',
  'dispensa': 'dispensa',
  'dispensa eletronica': 'dispensa_eletronica',
  'edital de chamamento': 'chamamento_publico',
  'chamamento publico': 'chamamento_publico',
  'inexigibilidade': 'inexigibilidade',
  'credenciamento': 'credenciamento',
  'pre-qualificacao': 'pre_qualificacao',
  'pre qualificacao': 'pre_qualificacao',
  'adesao a ata de registro de precos': 'adesao_ata',
  'cotacao eletronica': 'cotacao_eletronica',
  'registro de precos': 'pregao_eletronico',
  'convite': 'concorrencia',
  'tomada de preco': 'concorrencia',
  'tomada de precos': 'concorrencia',
  /* "Pregão" sem qualificar eletrônico/presencial só aparece na página mais
   * antiga (editais-2021, Lei 8.666): a forma padrão da época era
   * presencial, o eletrônico costumava vir rotulado como tal. Chave curta —
   * só entra em jogo quando nenhuma das mais específicas acima bateu, por
   * causa da ordenação por tamanho em modalidadeDoTitulo(). */
  'pregao': 'pregao_presencial',
};
function normalizarModalidade(texto) {
  return semAcento(String(texto ?? '')).toLowerCase().replace(/[^a-z ]/g, '').trim();
}
function mapearModalidade(texto) {
  return MODALIDADE_MAP[normalizarModalidade(texto)] ?? null;
}
/** Heurística pra extrair a modalidade de um TÍTULO livre (páginas legado). */
function modalidadeDoTitulo(titulo) {
  const t = normalizarModalidade(titulo);
  const candidatos = Object.keys(MODALIDADE_MAP).sort((a, b) => b.length - a.length);
  for (const c of candidatos) if (t.includes(c)) return MODALIDADE_MAP[c];
  if (/chamamento|cadastramento|^chamada\b/.test(t)) return 'chamamento_publico';
  /* "T.P.Nº..." é abreviação de Tomada de Preços — só no início do título,
   * pra não pegar "T.P." solto dentro de um objeto qualquer. */
  if (/^t\.?p\.?\s*n/i.test(titulo.trim())) return 'concorrencia';
  /* "CREDEN Nº..." é abreviação de Credenciamento, mesma lógica do T.P. */
  if (/^creden\s*n/i.test(titulo.trim())) return 'credenciamento';
  return null;
}

/* Situação — ver decisão do usuário no cabeçalho: fechado sem mais detalhe
 * vira "homologada". */
const SITUACAO_MAP = {
  'aberto': 'aberta',
  'em analise': 'em_julgamento',
  'concluido': 'homologada',
  'encerrado': 'homologada',
  'julgado': 'homologada',
  'anulado': 'anulada',
  'deserto': 'deserta',
  'fracassado': 'fracassada',
  'revogado': 'revogada',
  'suspenso': 'suspensa',
};
function mapearSituacao(texto) {
  const chave = semAcento(String(texto ?? '')).toLowerCase().trim();
  return SITUACAO_MAP[chave] ?? 'homologada';
}

/* Tipo de anexo, a partir do rótulo (antes dos ":") + do título do arquivo. */
function mapearTipoAnexo(rotulo, titulo) {
  const r = semAcento(String(rotulo ?? '')).toLowerCase();
  const t = semAcento(String(titulo ?? '')).toLowerCase();
  if (r.includes('edital') || t.includes('edital')) return 'edital';
  if (r.includes('homolog')) return 'homologacao';
  if (r.includes('contrato')) return 'contrato';
  if (r.includes('errata') || t.includes('errata')) return 'errata';
  if (r.includes('retific') || t.includes('retific')) return 'retificacao';
  if (r.includes('impugn') && !t.includes('resposta')) return 'impugnacao';
  if (t.includes('resposta') && t.includes('impugn')) return 'resposta_a_impugnacao';
  if (r.includes('esclarec') || t.includes('esclarec')) return 'esclarecimento';
  if (r.includes('resultado') || t.includes('resultado') || t.includes('julgamento')) return 'resultado_do_julgamento';
  if (t.includes('registro de preco') && (r.includes('ata') || t.includes('ata'))) return 'ata_de_registro_de_precos';
  if (r.includes('ata') || t.includes('ata')) return 'ata_da_sessao';
  if (r.includes('termo de referencia') || t.includes('termo de referencia')) return 'termo_de_referencia';
  if (r.includes('planilha') || t.includes('planilha')) return 'planilha';
  if (r.includes('minuta') || t.includes('minuta')) return 'minuta_de_contrato';
  if (r.includes('anexo')) return 'anexo_do_edital';
  return 'anexo_do_edital';
}

/* ---------- secretarias ---------- */
const secretarias = await api('/items/secretarias?limit=-1&fields=id,nome,slug&filter[status][_eq]=publicado');
function casarSecretaria(setorTexto) {
  if (!setorTexto) return null;
  const alvo = semAcento(setorTexto).toLowerCase();
  for (const s of secretarias) {
    const nome = semAcento(s.nome).toLowerCase().replace(/^secretaria (municipal )?(de |da |do )?/, '');
    if (nome === alvo || nome.includes(alvo) || alvo.includes(nome)) return s.id;
  }
  return null;
}

/* ---------- pasta de upload ---------- */
const pasta = (await api('/folders?limit=-1&fields=id,name')).find((f) => f.name === 'publicos');
if (!pasta) throw new Error("Pasta 'publicos' não existe.");

/* ---------- deduplicação / gravação ---------- */
const jaImportados = new Set(
  (await api('/items/licitacoes?limit=-1&fields=numero_processo&filter[numero_processo][_nnull]=true')).map((l) => l.numero_processo)
);
/* Slug também precisa de checagem própria: no site legado o "número da
 * licitação" não é globalmente único (ver comentário mais abaixo), e depois
 * de desambiguar por modalidade ainda dá pra colidir no SLUG quando a mesma
 * tabela aparece duas vezes na página de origem (aconteceu na prática em
 * editais-2021 — o mesmo processo listado mais de uma vez). */
const jaSlugs = new Set((await api('/items/licitacoes?limit=-1&fields=slug')).map((l) => l.slug));

const resumo = { criadas: 0, anexos: 0, eventos: 0, puladas: [], erros: [] };

async function criarLicitacao(corpo) {
  if (jaImportados.has(corpo.numero_processo)) return { ja_existe: true };
  if (jaSlugs.has(corpo.slug)) return { ja_existe: true };
  if (DRY_RUN) { resumo.criadas++; jaImportados.add(corpo.numero_processo); jaSlugs.add(corpo.slug); return { id: '(dry-run)' }; }
  const criada = await api('/items/licitacoes', { method: 'POST', body: JSON.stringify(corpo) });
  jaImportados.add(corpo.numero_processo);
  jaSlugs.add(corpo.slug);
  resumo.criadas++;
  return criada;
}

async function anexar(licitacaoId, { titulo, tipo, urlArquivo, quando, ordem = 0 }) {
  if (DRY_RUN) { resumo.anexos++; return; }
  const bin = await baixarBinario(urlArquivo);
  if (!bin) { resumo.erros.push(`anexo não baixado: ${urlArquivo}`); return; }
  const forma = new FormData();
  forma.append('folder', pasta.id);
  forma.append('title', titulo.slice(0, 255));
  const nome = decodeURIComponent(urlArquivo.split('/').pop() || `${slugificar(titulo)}.pdf`);
  forma.append('file', new Blob([bin], { type: 'application/pdf' }), nome);
  const arquivo = await api('/files', { method: 'POST', body: forma });
  await api('/items/licitacao_anexos', { method: 'POST', body: JSON.stringify({
    status: 'publicado', licitacao: licitacaoId, titulo: titulo.slice(0, 255), tipo,
    arquivo: arquivo.id, data_publicacao: (quando ?? new Date()).toISOString(), ordem,
  }) });
  resumo.anexos++;
}

async function registrarEvento(licitacaoId, { tipo, descricao, quando }) {
  if (DRY_RUN) { resumo.eventos++; return; }
  await api('/items/licitacao_eventos', { method: 'POST', body: JSON.stringify({
    status: 'publicado', licitacao: licitacaoId, data: (quando ?? new Date()).toISOString(), tipo, descricao,
  }) });
  resumo.eventos++;
}

/* ============================================================
 * FASE A — /licitacoes (eCrie), fonte rica
 * ============================================================ */
const ORIGEM = 'https://www.prefeituradecambui.mg.gov.br';

function extrairEntre(html, inicio, fim) {
  const i = html.indexOf(inicio);
  if (i === -1) return null;
  const j = fim ? html.indexOf(fim, i) : html.length;
  return html.slice(i, j === -1 ? html.length : j);
}
function campoRotulo(bloco, rotulo) {
  const re = new RegExp(`&bull;\\s*${rotulo}:\\s*</strong>\\s*<span[^>]*>([^<]*)</span>`, 'i');
  const m = bloco?.match(re);
  return m ? semTag(m[1]) : null;
}

async function coletarSlugsEcrie() {
  const primeira = await buscarTexto(`${ORIGEM}/licitacoes`);
  if (!primeira) throw new Error('Não consegui abrir /licitacoes.');
  const totalM = primeira.match(/Paginação: página \d+ de (\d+)/);
  const totalPaginas = totalM ? Number(totalM[1]) : 1;
  console.log(`==> /licitacoes: ${totalPaginas} páginas`);

  const slugs = new Set();
  const coletar = (html) => { for (const m of html.matchAll(/href="\/licitacoes\/([a-z0-9-]+)"/g)) slugs.add(m[1]); };
  coletar(primeira);
  for (let p = 2; p <= totalPaginas; p++) {
    const html = await buscarTexto(`${ORIGEM}/licitacoes?pagina=${p}`);
    if (html) coletar(html);
    process.stdout.write(`\r  listagem: página ${p}/${totalPaginas}`);
  }
  console.log(`\n  ${slugs.size} processos encontrados`);
  return [...slugs];
}

function parsearDetalheEcrie(html, slug) {
  const tituloM = html.match(/<h1 class="list-title">\s*([\s\S]*?)\s*<\/h1>/);
  const titulo = tituloM ? semTag(tituloM[1]) : slug;

  const setorM = html.match(/Setor:\s*<span class="list-item__tag">([^<]+)<\/span>/);
  const setor = setorM ? semTag(setorM[1]) : null;

  const blocoDetalhes = extrairEntre(html, 'id="detalhes"', 'id="arquivos"');
  const blocoArquivos = extrairEntre(html, 'id="arquivos"', 'id="historico"');
  const blocoHistorico = extrairEntre(html, 'id="historico"', 'id="recurso"');

  const situacaoTexto = campoRotulo(blocoDetalhes, 'Situação');
  const numeroLicitacao = campoRotulo(blocoDetalhes, 'Número da licitação');
  const numeroProcesso = campoRotulo(blocoDetalhes, 'Número do processo licitatório');
  const modalidadeTexto = campoRotulo(blocoDetalhes, 'Modalidade');
  const publicadoEm = campoRotulo(blocoDetalhes, 'Publicado em');
  const realizacaoEm = campoRotulo(blocoDetalhes, 'Realização em');
  const objeto = campoRotulo(blocoDetalhes, 'Objeto');
  const valorM = blocoDetalhes?.match(/Valor estimado:\s*<\/strong><span class="list-item__tag">([^<]+)<\/span>/);
  const valorTexto = valorM ? semTag(valorM[1]) : null;

  const anexos = [];
  if (blocoArquivos) {
    for (const item of blocoArquivos.split('<li class="list-item__area removerEspacamento">').slice(1)) {
      const dataM = item.match(/Publicado em:\s*<\/strong>\s*([^<]+?)\s*<\/p>/);
      const linkM = item.match(/href="([^"]+)"[^>]*title="([^"]+)"[^>]*>[\s\S]*?<b>\s*([^<]+?):\s*<\/b>\s*([^<]+?)\s*<\/span>/);
      if (linkM) {
        anexos.push({
          publicadoEm: dataM ? semTag(dataM[1]) : null,
          url: linkM[1],
          rotulo: semTag(linkM[3]),
          titulo: semTag(linkM[4]),
        });
      }
    }
  }

  const historicoSituacoes = [];
  if (blocoHistorico) {
    for (const m of decodeEntidades(blocoHistorico).matchAll(/<span>Nova situação:\s*([^<.]+)\.?<\/span>\s*<small><strong>([\s\S]*?)<\/strong><\/small>/gi)) {
      historicoSituacoes.push({ situacao: semTag(m[1]), quando: semTag(m[2]) });
    }
  }

  if (!numeroLicitacao || !publicadoEm) return null; // sem os campos mínimos, não dá pra importar com segurança

  const [numero, ano] = numeroLicitacao.split('/').map((v) => parseInt(v, 10));
  return {
    titulo, setor, situacaoTexto, numeroLicitacao, numeroProcesso, modalidadeTexto,
    publicadoEm, realizacaoEm, objeto, valorTexto, anexos, historicoSituacoes, numero, ano,
  };
}

async function importarEcrie() {
  console.log(`\n=== Fase eCrie (/licitacoes) — ${DRY_RUN ? 'DRY RUN' : 'GRAVANDO'} ===`);
  const slugs = (await coletarSlugsEcrie()).slice(0, LIMITE);
  let i = 0;
  for (const slug of slugs) {
    i++;
    process.stdout.write(`\r  [${i}/${slugs.length}] ${slug}`.padEnd(90));
    const html = await buscarTexto(`${ORIGEM}/licitacoes/${slug}`);
    if (!html) { resumo.puladas.push(`${slug}: página não abriu (erro no site antigo)`); continue; }
    const d = parsearDetalheEcrie(html, slug);
    if (!d) { resumo.puladas.push(`${slug}: sem número da licitação ou data de publicação`); continue; }

    const modalidade = mapearModalidade(d.modalidadeTexto);
    if (!modalidade) { resumo.puladas.push(`${slug}: modalidade não reconhecida ("${d.modalidadeTexto}")`); continue; }

    /* O "Número do processo licitatório" do site antigo às vezes colide
     * entre processos DIFERENTES sem relação nenhuma (bug do site de
     * origem, visto na prática — um chamamento e um pregão de anos/meses
     * diferentes com o mesmo número). Desambigua por modalidade antes de
     * desistir, mesma lógica da fase legado. */
    let numeroProcesso = d.numeroProcesso || d.numeroLicitacao || `LEGADO-${slug}`;
    if (jaImportados.has(numeroProcesso)) numeroProcesso = `${numeroProcesso}-${modalidade}`;
    if (jaImportados.has(numeroProcesso)) { resumo.puladas.push(`${slug}: processo ${numeroProcesso} colide mesmo desambiguado por modalidade`); continue; }

    const modalidadeMeta = MODALIDADES.find((m) => m.valor === modalidade);
    const dataPublicacao = dataBR(d.publicadoEm) ?? new Date();
    const dataSessao = dataBR(d.realizacaoEm);
    const situacao = mapearSituacao(d.situacaoTexto);
    const registroPrecos = /registro de pre[çc]os/i.test(d.objeto ?? '');

    const corpo = {
      status: 'publicado',
      numero_processo: numeroProcesso,
      numero: d.numero || 0,
      ano: d.ano || dataPublicacao.getFullYear(),
      slug: `${slug}-legado`,
      modalidade,
      forma: /presencial/i.test(d.modalidadeTexto) ? 'presencial' : 'eletronica',
      criterio_julgamento: modalidade === 'leilao' ? 'maior_lance' : 'menor_preco',
      registro_precos: registroPrecos,
      secretaria: casarSecretaria(d.setor),
      objeto_resumo: d.objeto || d.titulo,
      objeto: d.objeto ? `<p>${d.objeto}</p>` : null,
      valor_estimado: valorBR(d.valorTexto),
      data_publicacao: dataPublicacao.toISOString(),
      data_sessao: dataSessao ? dataSessao.toISOString() : null,
      situacao,
      pncp_url: null,
      fonte_legado_url: undefined, // sem campo no schema — não enviar
    };
    delete corpo.fonte_legado_url;

    let criada;
    try {
      criada = await criarLicitacao(corpo);
    } catch (e) { resumo.erros.push(`${slug}: ${e.message.split('\n')[0]}`); continue; }
    if (criada?.ja_existe) continue;

    for (const [idx, a] of d.anexos.entries()) {
      const tipo = mapearTipoAnexo(a.rotulo, a.titulo);
      try {
        await anexar(criada.id, { titulo: a.titulo, tipo, urlArquivo: a.url, quando: dataBR(a.publicadoEm), ordem: idx + 1 });
      } catch (e) { resumo.erros.push(`${slug} anexo "${a.titulo}": ${e.message.split('\n')[0]}`); }
    }

    if (dataPublicacao) await registrarEvento(criada.id, { tipo: 'publicacao', descricao: 'Edital publicado (importado do portal antigo).', quando: dataPublicacao }).catch(() => {});
    const ultimaSituacao = d.historicoSituacoes.at(0);
    if (situacao !== 'aberta' && situacao !== 'em_julgamento') {
      const tipoEvento = { homologada: 'homologacao', anulada: 'anulacao', revogada: 'revogacao', suspensa: 'suspensao' }[situacao] ?? 'resultado';
      const quando = ultimaSituacao ? dataBR(ultimaSituacao.quando) : dataSessao;
      await registrarEvento(criada.id, { tipo: tipoEvento, descricao: `Situação final: ${d.situacaoTexto ?? situacao} (importado do portal antigo).`, quando: quando ?? dataPublicacao }).catch(() => {});
    }
  }
  console.log('');
}

/* ============================================================
 * FASE B — páginas legado do WordPress (2021 / <2024 / 2025)
 * ============================================================ */
const PAGINAS_LEGADO = [
  { url: `${ORIGEM}/editais-2021`, anoPadrao: 2021 },
  { url: `${ORIGEM}/licitacoes-anteriores-a-2024`, anoPadrao: 2023 },
  { url: `${ORIGEM}/licitacoes-2025`, anoPadrao: 2024 },
];

function parsearTabelasLegado(html) {
  const registros = [];
  const tabelas = html.split('<table align="center">').slice(1);
  for (const bloco of tabelas) {
    const tituloM = bloco.match(/<td width="500">\s*<p><strong>([\s\S]*?)<\/strong>/);
    if (!tituloM) continue;
    const titulo = semTag(tituloM[1]);

    const parags = [...bloco.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => semTag(m[1])).filter(Boolean);
    const dataP = parags.find((p) => /\d{2}\/\d{2}\/\d{4}/.test(p) && p !== titulo);
    const descricao = parags.find((p) => p !== titulo && p !== dataP && !/^\[/.test(p)) ?? null;

    const anexos = [];
    for (const m of bloco.matchAll(/<a href="([^"]+\.pdf)"[^>]*>[\s\S]*?(?:<p class="wp-caption-text">([^<]*)<\/p>)?/gi)) {
      anexos.push({ url: m[1], legenda: m[2] ? semTag(m[2]) : titulo });
    }
    // fallback: link de PDF sem wp-caption-text no mesmo bloco de imagem (captura simples de todos os .pdf do bloco)
    if (anexos.length === 0) {
      for (const m of bloco.matchAll(/href="([^"]+\.pdf)"/gi)) anexos.push({ url: m[1], legenda: titulo });
    }

    registros.push({ titulo, dataTexto: dataP, descricao, anexos });
  }
  return registros;
}

/** editais-2021 usa um layout mais antigo ainda: uma <table> de 5 colunas por
 * item (edital+link / data / objeto / resultado / contratos), sem a classe
 * "list-header" das outras duas páginas legado.
 *
 * ARMADILHA DESCOBERTA (2026-09-11): a primeira versão desta função exigia a
 * ordem exata `<a href=...><strong>` na célula do título. Boa parte das
 * linhas do site usa a ordem INVERTIDA, `<strong><a href=...>` — a regex
 * simplesmente não casava nessas linhas, e o motor de regex seguia
 * procurando o próximo `<table><tbody><tr><td><a href="` válido, podendo
 * "pular" o fechamento da tabela errada e juntar pedaços de DUAS linhas
 * diferentes num só registro (visto na prática: título com texto de duas
 * licitações coladas). Corrigido isolando cada `<table>...</table>` primeiro
 * (sem exigir ordem de tag dentro da célula) e só then dividindo em <td>s —
 * não é mais possível vazar conteúdo de uma linha para outra. */
function parsearTabelasEditais2021(html) {
  const registros = [];
  for (const linhaM of html.matchAll(/<table>\s*<tbody>\s*<tr>([\s\S]*?)<\/tr>\s*<\/tbody>\s*<\/table>/g)) {
    const celulas = [...linhaM[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
    if (celulas.length < 5) continue; // não é a linha de item esperada
    const [celTitulo, celData, celObjeto, celResultado, celContratos] = celulas;

    const linkPrincipalM = celTitulo.match(/href="([^"]+)"/);
    if (!linkPrincipalM) continue; // sem link, não dá pra tratar como anexo

    const titulo = semTag(celTitulo).replace(/_/g, ' ');
    const dataTexto = semTag(celData);
    const descricao = semTag(celObjeto.split('(<a')[0]); // corta o "(Leia mais)" embutido

    const anexos = [{ url: linkPrincipalM[1], legenda: titulo }];
    for (const bloco of [celObjeto, celResultado, celContratos]) {
      for (const am of bloco.matchAll(/href="([^"]+\.pdf)"/gi)) {
        if (!anexos.some((a) => a.url === am[1])) anexos.push({ url: am[1], legenda: titulo });
      }
    }
    registros.push({ titulo, dataTexto, descricao, anexos });
  }
  return registros;
}

async function importarLegado() {
  /* mapa slugBase0 (título+número+ano, sem sufixo de data) -> Set de datas
   * (YYYY-MM-DD) já importadas com esse título. Reconstruído a partir dos
   * slugs já gravados no Directus (removendo os sufixos "-legado" e, se
   * houver, "-YYYY-MM-DD"), pra rodar de novo ser idempotente de verdade —
   * ver comentário grande mais abaixo, dentro do loop. */
  const legadoExistentes = await api('/items/licitacoes?limit=-1&fields=slug,data_publicacao&filter[slug][_ends_with]=-legado');
  const datasPorSlugBase = new Map();
  for (const l of legadoExistentes) {
    const semData = l.slug.replace(/-legado$/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
    const dataISO = (l.data_publicacao || '').slice(0, 10);
    if (!datasPorSlugBase.has(semData)) datasPorSlugBase.set(semData, new Set());
    datasPorSlugBase.get(semData).add(dataISO);
  }

  for (const pagina of PAGINAS_LEGADO) {
    console.log(`\n=== Fase legado: ${pagina.url} — ${DRY_RUN ? 'DRY RUN' : 'GRAVANDO'} ===`);
    const html = await buscarTexto(pagina.url);
    if (!html) { resumo.erros.push(`${pagina.url}: não abriu`); continue; }
    const registros = (pagina.url.includes('editais-2021') ? parsearTabelasEditais2021(html) : parsearTabelasLegado(html)).slice(0, LIMITE);
    console.log(`  ${registros.length} registros encontrados na página`);

    let i = 0;
    for (const r of registros) {
      i++;
      process.stdout.write(`\r  [${i}/${registros.length}] ${r.titulo.slice(0, 60)}`.padEnd(95));

      const modalidade = modalidadeDoTitulo(r.titulo);
      if (!modalidade) { resumo.puladas.push(`legado "${r.titulo}": modalidade não reconhecida`); continue; }

      const numM = r.titulo.match(/N[ºo°]\.?:?\s*_?(\d+)\s*\/\s*(\d{4})/i) || r.titulo.match(/(\d{2,4})\s*\/\s*(\d{4})/)
        || r.descricao?.match(/N[ºo°]\.?:?\s*_?(\d+)\s*\/\s*(\d{4})/i);
      const dataPub = dataBR(r.dataTexto?.split(/[–-]/)[0]) ?? new Date(`${pagina.anoPadrao}-06-01`);
      const numero = numM ? parseInt(numM[1], 10) : null;
      const ano = numM ? parseInt(numM[2], 10) : (dataPub.getFullYear() || pagina.anoPadrao);
      if (!numero) { resumo.puladas.push(`legado "${r.titulo}": sem número identificável`); continue; }

      /* "Número da licitação" no site legado NÃO é globalmente único — Pregão
       * nº 14/2021 e Tomada de Preços nº 14/2021 são processos DIFERENTES
       * com o mesmo número. numero_processo é único no schema, então em
       * colisão desambigua primeiro pela modalidade mapeada e, se ainda
       * assim colidir (ex.: "T.P." e "Concorrência" caem no mesmo valor de
       * enum `concorrencia`, mas são processos de verdade diferentes),
       * desambigua pelo slug do próprio registro — que já carrega o título
       * inteiro, então é sempre único. */
      /* IDENTIDADE do item = título+número+ano (slugBase0) + data de
       * publicação. Checar isso primeiro — ANTES de mexer em
       * numero_processo — é o que garante idempotência de verdade: uma
       * execução futura recalcula a MESMA identidade pro MESMO item e pula
       * sem criar de novo. A versão anterior desta lógica checava só se
       * cada NÍVEL de numero_processo estava livre, sem saber se quem já o
       * ocupava era ESTE MESMO item (rodada anterior) ou outro diferente —
       * isso fazia cada rerun empurrar o mesmo item pra um nível novo,
       * duplicando. `datasPorSlugBase` veio de `slug` já existentes no
       * Directus (ver carregamento logo acima do loop de páginas). */
      const slugBase0 = slugificar(`${r.titulo}-${numero}-${ano}`);
      const dataISO = dataPub.toISOString().slice(0, 10);
      const datasVistas = datasPorSlugBase.get(slugBase0) ?? new Set();
      if (datasVistas.has(dataISO)) continue; // mesmo título+número+ano+data: já importado
      /* Título idêntico pode aparecer mais de uma vez na página com datas
       * diferentes — processos DIFERENTES de verdade (visto na prática:
       * "PREGÃO PRESENCIAL Nº 014/2022", uma vez em 17/02 outra em
       * 02/03/2022). A primeira ocorrência (datasVistas vazio) fica com o
       * slug limpo; as seguintes levam a data no slug. */
      const slugFinal = datasVistas.size === 0 ? slugBase0 : `${slugBase0}-${dataISO}`;
      datasVistas.add(dataISO);
      datasPorSlugBase.set(slugBase0, datasVistas);

      /* numero_processo é único no schema; "número da licitação" do site
       * legado NÃO é (Pregão nº 14/2021 e Tomada de Preços nº 14/2021 são
       * processos DIFERENTES com o mesmo número). slugFinal já é único por
       * item de verdade, então o terceiro nível é a rede de segurança final. */
      const candidatos = [`${numero}/${ano}`, `${numero}/${ano}-${modalidade}`, `${numero}/${ano}-${slugFinal}`];
      const numeroProcesso = candidatos.find((c) => !jaImportados.has(c)) ?? `${numero}/${ano}-${slugFinal}-${Math.random().toString(36).slice(2, 8)}`;

      const corpo = {
        status: 'publicado',
        numero_processo: numeroProcesso,
        numero, ano,
        slug: `${slugFinal}-legado`,
        modalidade,
        forma: /presencial/i.test(r.titulo) ? 'presencial' : 'eletronica',
        criterio_julgamento: modalidade === 'leilao' ? 'maior_lance' : 'menor_preco',
        registro_precos: /registro de pre[çc]os/i.test(r.descricao ?? ''),
        secretaria: null, // páginas legado não têm campo "Setor"
        objeto_resumo: r.descricao || r.titulo,
        objeto: r.descricao ? `<p>${r.descricao}</p>` : null,
        valor_estimado: null,
        data_publicacao: dataPub.toISOString(),
        data_sessao: null,
        situacao: 'homologada', // decisão do usuário: sem campo de situação no legado, tudo fechado
      };

      let criada;
      try {
        criada = await criarLicitacao(corpo);
      } catch (e) { resumo.erros.push(`legado "${r.titulo}": ${e.message.split('\n')[0]}`); continue; }
      if (criada?.ja_existe) continue;

      for (const [idx, a] of r.anexos.entries()) {
        const tipo = mapearTipoAnexo(a.legenda, a.legenda);
        try {
          await anexar(criada.id, { titulo: a.legenda || r.titulo, tipo, urlArquivo: a.url, quando: dataPub, ordem: idx + 1 });
        } catch (e) { resumo.erros.push(`legado "${r.titulo}" anexo: ${e.message.split('\n')[0]}`); }
      }
      await registrarEvento(criada.id, { tipo: 'publicacao', descricao: 'Edital publicado (importado do portal antigo).', quando: dataPub }).catch(() => {});
    }
    console.log('');
  }
}

/* ============================================================
 * main
 * ============================================================ */
console.log(`Modo: ${DRY_RUN ? 'DRY RUN (nada será gravado — use --confirmar para valer)' : 'GRAVANDO NO DIRECTUS'}`);
console.log(`Fonte: ${FONTE}${LIMITE < Infinity ? `  (limite: ${LIMITE} itens por fonte)` : ''}`);

if (FONTE === 'ecrie' || FONTE === 'tudo') await importarEcrie();
if (FONTE === 'legado' || FONTE === 'tudo') await importarLegado();

console.log(`
==================== RESUMO ====================
  licitações criadas : ${resumo.criadas}
  anexos              : ${resumo.anexos}
  eventos             : ${resumo.eventos}

  puladas (${resumo.puladas.length}):
${resumo.puladas.map((p) => '    - ' + p).join('\n') || '    (nenhuma)'}

  erros (${resumo.erros.length}):
${resumo.erros.map((p) => '    - ' + p).join('\n') || '    (nenhum)'}
=================================================
${DRY_RUN ? '\nDRY RUN — rode com --confirmar para gravar de verdade.\n' : ''}`);
