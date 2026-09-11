#!/usr/bin/env node
/**
 * Popula o Diário Oficial com um acervo de demonstração navegável.
 *
 *   npm run seed              # cria o que faltar (idempotente)
 *   npm run seed -- --reset   # remove o acervo de demonstração antes
 *   npm run seed -- --ate=30  # só as 30 primeiras edições (para iterar rápido)
 *
 * TUDO aqui nasce com `demonstracao = true`, marca d'água no PDF e aviso
 * permanente na interface. O `--reset` só alcança linhas com essa marca, e
 * ainda precisa declarar a intenção ao banco — ver imutabilidade.sql.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

import { abrirApi } from '../aplicador.mjs';
import { abrirSessao } from '../../diario/cromo.mjs';
import { garantirCertificadoDemo } from '../../diario/certificado-demo.mjs';
import { fecharEdicao, prepararMaterias } from '../../diario/publicar.mjs';
import { verificarPdf } from '../../diario/assinatura.mjs';
import { CADERNOS_PADRAO, TIPOS_ATO, tipoDeAto } from './enums.mjs';
import { MODALIDADES } from '../licitacoes/enums.mjs';
import {
  criarSorteio, redigir, leiOrcamentaria, materiaCurta, nomePessoa,
  PESO_TIPOS, CADERNO_DO_TIPO,
} from './dados-demo.mjs';
import {
  publicacaoLegal, ehDiaUtil, comoDia, paraSlug, codigoVerificador,
  dataBr, textoDe,
} from '../../../apps/web/src/lib/diario/dominio.mjs';

const exec = promisify(execFile);
const arg = (n, padrao) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split('=')[1] : padrao;
};
const RESET = process.argv.includes('--reset');
const ATE = Number(arg('ate', '0')) || Infinity;
const URL_BASE = process.env.PUBLIC_SITE_URL || 'https://portal.cambui.mg.gov.br';
const HOJE = comoDia(new Date());

const dizer = (m) => console.log(m);
const passo = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

/* ──────────────────────────── Postgres direto ──────────────────────────── */

/** Só para o --reset. Remover linha imutável exige declarar a intenção ao
 *  banco, e isso a API do Directus não faz — de propósito. */
async function psql(sql) {
  const env = Object.fromEntries((await readFile('/opt/portal-cambui/.env', 'utf8'))
    .split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  const { stdout } = await exec('docker', ['exec', '-e', `PGPASSWORD=${env.POSTGRES_PASSWORD}`, '-i', 'portal-postgres',
    'psql', '-tAX', '-U', env.POSTGRES_USER, '-d', env.POSTGRES_DB, '-c', sql]);
  return stdout.trim();
}

/* ──────────────────────────── envio de arquivo ─────────────────────────── */

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const TOKEN = process.env.DIRECTUS_TOKEN_ESQUEMA;

let pastaDiario = null;
async function garantirPasta(api) {
  if (pastaDiario) return pastaDiario;
  const achadas = await api('/folders?filter[name][_eq]=diario-oficial&limit=1');
  pastaDiario = achadas[0]?.id ?? (await api('/folders', { method: 'POST', body: JSON.stringify({ name: 'diario-oficial' }) })).id;
  return pastaDiario;
}

async function enviarPdf(api, buffer, nome, titulo) {
  const forma = new FormData();
  forma.append('folder', await garantirPasta(api));
  forma.append('title', titulo);
  forma.append('file', new Blob([buffer], { type: 'application/pdf' }), nome);
  const r = await fetch(`${BASE}/files`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: forma });
  if (!r.ok) throw new Error(`upload ${nome}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).data.id;
}

/* ──────────────────────────── calendário ───────────────────────────────── */

/**
 * Dias em que houve circulação nos últimos 24 meses.
 *
 * Não é "todo dia útil": município deste porte publica de 2 a 3 vezes por
 * semana. Um acervo com edição em todo dia útil pareceria diário de capital, e
 * a densidade errada esconde justamente os problemas de listagem esparsa.
 */
function calendario(s, meses = 24, porMes = 6) {
  const dias = [];
  const inicio = new Date(Date.UTC(HOJE.getUTCFullYear(), HOJE.getUTCMonth() - meses + 1, 1));
  for (let m = 0; m < meses; m++) {
    const mes = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + m, 1));
    const uteis = [];
    for (let d = 1; d <= 31; d++) {
      const dia = new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth(), d));
      if (dia.getUTCMonth() !== mes.getUTCMonth()) break;
      if (dia > HOJE) break;
      if (ehDiaUtil(dia)) uteis.push(dia);
    }
    if (!uteis.length) continue;
    const quantos = Math.min(uteis.length, porMes + s.inteiro(-1, 1));
    dias.push(...s.embaralhar(uteis).slice(0, quantos).sort((a, b) => a - b));
  }
  return dias.sort((a, b) => a - b);
}

/* ─────────────────────── acervo retroativo (função) ─────────────────────── */

/**
 * Importa as edições ANTERIORES ao sistema.
 *
 * Roda ANTES das edições próprias, e não depois, porque a numeração do veículo
 * é contínua: o acervo ocupa os primeiros números e o sistema segue de onde ele
 * parou. Gerar o acervo por último criaria um salto na sequência — que é
 * justamente o defeito que um auditor procura primeiro.
 *
 * Deliberadamente SEM matérias estruturadas: é assim que um acervo importado
 * realmente é — um PDF e o mínimo de metadado. Fingir estrutura nesses arquivos
 * seria mentir sobre a qualidade do dado.
 */
async function importarAcervo({ api, anoInicio, quantas = 5 }) {
  const jaImportadas = await api('/items/diario_edicoes?filter[importada_acervo][_eq]=true&limit=1&fields=id');
  if (jaImportadas.length) { dizer('  = acervo já importado'); return; }

  const { createHash } = await import('node:crypto');
  const sessao2 = await abrirSessao();
  try {
    for (let k = 1; k <= quantas; k++) {
      const dia = new Date(Date.UTC(anoInicio, 6, 8 + k * 4));
      const legal = publicacaoLegal(dia, 'primeiro_dia_util_seguinte');
      const criada = await api('/items/diario_edicoes', { method: 'POST', body: JSON.stringify({
        status: 'publicado', numero: k, ano: anoInicio, volume: 1,
        tipo: 'ordinaria', situacao: 'em_montagem',
        data_disponibilizacao: dia.toISOString(),
        data_publicacao_legal: legal.toISOString().slice(0, 10),
        codigo_verificador: codigoVerificador(`acervo-${k}-${anoInicio}`),
        importada_acervo: true,
        fonte_acervo: 'Arquivo digitalizado do acervo da Secretaria Municipal de Administração, importado na implantação do sistema. Texto reconhecido por OCR; a fidelidade do reconhecimento não é garantida — em caso de dúvida, prevalece o documento original.',
        demonstracao: true,
      }) });

      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Acervo — Edição ${criada.numero}</title>
        <style>@page{size:A4;margin:22mm}body{font-family:Georgia,serif;font-size:11pt;line-height:1.6;color:#222}
        h1{font-size:15pt;text-align:center}.marca{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}
        .marca span{font-size:24pt;color:rgba(168,48,60,.13);transform:rotate(-30deg);font-weight:700;text-align:center}
        .ocr{border:1pt solid #999;padding:4mm;font-size:8.5pt;color:#555;margin-bottom:6mm}</style></head><body>
        <div class="marca"><span>DOCUMENTO FICTÍCIO<br>AMBIENTE DE DEMONSTRAÇÃO</span></div>
        <div class="ocr">Edição anterior à implantação do Diário Oficial Eletrônico. Arquivo digitalizado do acervo, com texto reconhecido automaticamente (OCR). Não possui matérias estruturadas nem assinatura digital de origem.</div>
        <h1>MUNICÍPIO DE CAMBUÍ — ESTADO DE MINAS GERAIS<br>PUBLICAÇÃO OFICIAL Nº ${criada.numero}</h1>
        <p>${dataBr(legal)}</p><hr>
        <p><b>PORTARIA Nº ${100 + k}/${anoInicio}</b> — Designa servidores para comporem a comissão de implantação do Diário Oficial Eletrônico do Município.</p>
        <p><b>DECRETO Nº ${40 + k}/${anoInicio}</b> — Regulamenta a Lei Municipal nº 2.184, que institui o Diário Oficial Eletrônico do Município de Cambuí.</p>
        <p><b>EXTRATO DE CONTRATO</b> — Contratação de solução de publicação eletrônica de atos oficiais.</p>
        <p style="margin-top:12mm;font-size:9pt;color:#666">Documento importado do acervo. Texto reconhecido por OCR e portanto pesquisável, sem garantia de fidelidade tipográfica ao original.</p>
        </body></html>`;
      const pdf = await sessao2.renderString(html);
      const idArquivo = await enviarPdf(api, pdf, `acervo-cambui-${String(criada.numero).padStart(5, '0')}.pdf`, `Acervo — Edição ${criada.numero}`);
      await api(`/items/diario_edicoes/${criada.id}`, { method: 'PATCH', body: JSON.stringify({
        arquivo_pdf: idArquivo, total_paginas: 1,
        sha256: createHash('sha256').update(pdf).digest('hex'),
        situacao: 'publicada', publicada_em: dia.toISOString(),
      }) });
      dizer(`  + edição de acervo nº ${criada.numero} (${dataBr(legal)}) — sem estrutura, só PDF com OCR`);
    }
  } finally { await sessao2.fechar(); }
}

/* ─────────────────────────────── execução ──────────────────────────────── */

const api = await abrirApi({});

if (RESET) {
  passo('Removendo o acervo de demonstração');
  /* Ordem importa: filhos antes dos pais, senão a chave estrangeira reclama. */
  const alvos = await psql(`
    SET LOCAL diario.limpar_demonstracao = 'sim';
    DELETE FROM diario_certidoes WHERE materia IN (SELECT id FROM diario_materias WHERE demonstracao);
    DELETE FROM diario_devolucoes WHERE materia IN (SELECT id FROM diario_materias WHERE demonstracao);
    DELETE FROM diario_envios WHERE edicao IN (SELECT id FROM diario_edicoes WHERE demonstracao);
    DELETE FROM diario_auditoria WHERE edicao IN (SELECT id FROM diario_edicoes WHERE demonstracao)
                                    OR materia IN (SELECT id FROM diario_materias WHERE demonstracao);
    UPDATE diario_edicoes SET anulada_por_edicao = NULL WHERE demonstracao;
    UPDATE diario_materias SET retifica=NULL, republica=NULL, revoga=NULL WHERE demonstracao;
    DELETE FROM diario_materias WHERE demonstracao;
    DELETE FROM diario_edicoes WHERE demonstracao;
    SELECT 'limpo';`);
  dizer(`  ${alvos.includes('limpo') ? 'acervo removido' : alvos}`);

  const arquivos = await api('/files?filter[folder][name][_eq]=diario-oficial&fields=id&limit=-1').catch(() => []);
  if (arquivos.length) {
    await api('/files', { method: 'DELETE', body: JSON.stringify(arquivos.map((a) => a.id)) });
    dizer(`  ${arquivos.length} PDF(s) removidos do acervo de arquivos`);
  }
}

const s = criarSorteio(20260828);

/* ── 1. veículo oficial ─────────────────────────────────────────────────── */
passo('1/7 — Veículo oficial');
const anoInicio = HOJE.getUTCFullYear() - 2;
let veiculo = await api('/items/diario_veiculo').catch(() => null);
if (!veiculo?.nome_veiculo) {
  veiculo = await api('/items/diario_veiculo', { method: 'PATCH', body: JSON.stringify({
    nome_veiculo: 'Diário Oficial Eletrônico do Município de Cambuí',
    nome_curto: 'Diário Oficial Eletrônico de Cambuí/MG',
    ente: 'Município de Cambuí — Estado de Minas Gerais',
    /* TODO(cliente): CNPJ real da Prefeitura. O abaixo é fictício e válido só
       na forma — precisa ser trocado antes da virada. */
    cnpj: '18.712.055/0001-30',
    lei_numero: 'Lei Municipal nº 2.184',
    lei_data: `${anoInicio}-06-18`,
    lei_ementa: 'Institui o Diário Oficial Eletrônico do Município de Cambuí como veículo oficial de publicação dos atos da Administração Pública Municipal e dá outras providências.',
    lei_link: '',
    inicio_circulacao: `${anoInicio}-08-01`,
    veiculo_anterior: `Até 31 de julho de ${anoInicio}, os atos oficiais do Município eram publicados no Diário Oficial dos Municípios Mineiros (DOM/AMM-MG) e, nas hipóteses legais, no Diário Oficial do Estado de Minas Gerais (Imprensa Oficial de Minas Gerais). Atos anteriores a essa data devem ser consultados naqueles veículos.`,
    periodicidade: 'diaria_util',
    dias_circulacao: [1, 2, 3, 4, 5],
    horario_fechamento: '17:00',
    regra_prazo: 'primeiro_dia_util_seguinte',
    responsavel_publicacao: 'Secretaria Municipal de Administração e Finanças',
    expediente: [
      /* TODO(cliente): nomes reais das autoridades. Fictícios, marcados. */
      { cargo: 'Prefeita Municipal', nome: 'MARIA APARECIDA DE SOUZA (fictício)' },
      { cargo: 'Vice-Prefeito', nome: 'JOAQUIM ESTEVAM HORTA (fictício)' },
      { cargo: 'Secretário Municipal de Administração e Finanças', nome: 'ROGÉRIO FAGUNDES (fictício)' },
      { cargo: 'Procurador-Geral do Município', nome: 'HELENA JUNQUEIRA (fictício)' },
    ],
    endereco: 'Praça Coronel Justiniano, s/nº, Centro, Cambuí/MG, CEP 37600-000',
    telefone: '(35) 3431-0000',
    email_contato: 'diariooficial@cambui.mg.gov.br',
    ano_volume_inicial: 1,
    nota_legal: 'Este é o órgão oficial de publicidade dos atos do Município de Cambuí/MG. Não substitui o Portal Nacional de Contratações Públicas (PNCP) nem o Diário Oficial do Estado nas hipóteses em que a lei os exigir. Em caso de divergência, prevalece o arquivo assinado digitalmente.',
  }) });
  dizer('  configuração do veículo gravada');
} else {
  dizer('  = já configurado');
}
const volumeDe = (ano) => ano - anoInicio + 1;

/* ── 2. cadernos ────────────────────────────────────────────────────────── */
passo('2/7 — Cadernos');
const cadernosExistentes = await api('/items/diario_cadernos?limit=-1');
for (const c of CADERNOS_PADRAO) {
  if (cadernosExistentes.some((x) => x.slug === c.slug)) { dizer(`  = ${c.nome}`); continue; }
  await api('/items/diario_cadernos', { method: 'POST', body: JSON.stringify({
    status: 'publicado', slug: c.slug, nome: c.nome, ordem: c.ordem, descricao: c.descricao,
    dados_pessoais: Boolean(c.dadosPessoais),
    /* Caderno de pessoal fica fora do índice de buscadores: publicidade legal
       é base para publicar, não para transformar o nome de um servidor em
       primeiro resultado de busca pelo resto da vida. */
    indexavel: !c.dadosPessoais,
  }) });
  dizer(`  + ${c.nome}${c.dadosPessoais ? '  (fora do índice de buscadores)' : ''}`);
}
const cadernos = (await api('/items/diario_cadernos?limit=-1&sort=ordem')).map((c) => c);
const cadernoPorSlug = Object.fromEntries(cadernos.map((c) => [c.slug, c]));

/* ── 3. secretarias e licitações existentes ─────────────────────────────── */
passo('3/7 — Vínculos com o que já existe no portal');
const secretarias = await api('/items/secretarias?limit=-1&fields=id,nome,slug');
dizer(`  ${secretarias.length} secretarias`);
const licitacoes = await api('/items/licitacoes?limit=-1&fields=id,numero,ano,numero_processo,objeto_resumo,modalidade,valor_estimado,slug&sort=-ano,-numero')
  .catch(() => []);
dizer(`  ${licitacoes.length} licitações disponíveis para vincular`);

/* ── 4. acervo retroativo, ANTES de numerar as edições próprias ─────────── */
passo('4/7 — Acervo retroativo (edições anteriores ao sistema)');
await importarAcervo({ api, anoInicio });

/* ── 5. calendário e numeração ──────────────────────────────────────────── */
passo('5/7 — Calendário de circulação');
const dias = calendario(s);
dizer(`  ${dias.length} dias de circulação em 24 meses (${dataBr(dias[0])} a ${dataBr(dias.at(-1))})`);

const jaPublicadas = await api('/items/diario_edicoes?limit=-1&fields=numero,data_publicacao_legal&sort=-numero');
let proximoNumero = (jaPublicadas[0]?.numero ?? 0) + 1;
const diasJaFeitos = new Set(jaPublicadas.map((e) => String(e.data_publicacao_legal)));

const prefeita = { nome: 'MARIA APARECIDA DE SOUZA', cargo: 'Prefeita Municipal' };
const certs = await garantirCertificadoDemo({ silencioso: true });

/* Contadores de numeração de ato por tipo e ano, para os números não se
 * repetirem nem saltarem dentro do mesmo ano. */
const contador = new Map();
const proximoAto = (tipo, ano) => {
  const chave = `${tipo}:${ano}`;
  const n = (contador.get(chave) ?? 0) + 1;
  contador.set(chave, n);
  return n;
};

/* ── plano das edições, com os casos de borda encaixados ────────────────── */
const plano = dias.map((dia, i) => ({
  dia, indice: i,
  tipo: 'ordinaria',
  quantidade: s.inteiro(8, 15),
  especial: null,
}));

/* Casos de borda: posições escolhidas para caírem espalhadas no acervo. */
const pos = (fracao) => Math.min(plano.length - 1, Math.max(0, Math.round(plano.length * fracao)));
if (plano.length > 20) {
  plano[pos(0.18)].especial = 'extraordinaria';
  plano[pos(0.46)].especial = 'extraordinaria';
  plano[pos(0.72)].especial = 'extraordinaria_sabado';
  plano[pos(0.55)].especial = 'suplementar';
  plano[pos(0.33)].especial = 'anulada';
  plano[pos(0.35)].especial = 'anula_a_anterior';
  plano[pos(0.62)].especial = 'errata';
  plano[pos(0.66)].especial = 'republicacao';
  plano[pos(0.88)].especial = 'orcamentaria';
  plano[pos(0.90)].especial = 'curta';
  plano[pos(0.95)].especial = 'gigante';
}

/* ── 5. as edições ──────────────────────────────────────────────────────── */
passo('6/7 — Edições, matérias e PDFs assinados');
const sessao = await abrirSessao();
const criadas = [];
let materiaAnterior = null;   // para errata e republicação
let edicaoAnulada = null;
const t0 = Date.now();

try {
  for (const [i, item] of plano.entries()) {
    if (i >= ATE) break;
    const iso = item.dia.toISOString().slice(0, 10);
    if (diasJaFeitos.has(iso)) continue;

    const numero = proximoNumero++;
    const ano = item.dia.getUTCFullYear();
    const gigante = item.especial === 'gigante';
    const tipoEdicao = item.especial === 'suplementar' ? 'suplementar'
      : item.especial?.startsWith('extraordinaria') ? 'extraordinaria' : 'ordinaria';

    /* Extraordinária de sábado: circula fora do calendário previsto na lei,
       e por isso EXIGE justificativa — que é o que a validação do painel cobra. */
    let dia = item.dia;
    if (item.especial === 'extraordinaria_sabado') {
      dia = new Date(item.dia.getTime() + 86400000 * ((6 - item.dia.getUTCDay() + 7) % 7 || 7));
    }
    const disponibilizacao = new Date(dia.getTime() + 3600000 * 17 + 60000 * s.inteiro(0, 55));
    const legal = publicacaoLegal(dia, 'primeiro_dia_util_seguinte');

    const edicao = {
      status: 'publicado',
      numero, ano, volume: volumeDe(ano),
      tipo: tipoEdicao,
      situacao: 'em_montagem',
      data_disponibilizacao: disponibilizacao.toISOString(),
      data_publicacao_legal: legal.toISOString().slice(0, 10),
      justificativa_extraordinaria: tipoEdicao === 'extraordinaria'
        ? s.de([
          'Publicação urgente de decreto de situação de emergência, cuja eficácia não admite espera pela edição ordinária seguinte.',
          'Republicação de aviso de licitação com prazo em curso, para não prejudicar o prazo dos interessados.',
          'Cumprimento de decisão judicial com prazo determinado.',
        ]) : null,
      codigo_verificador: codigoVerificador(`cambui-${numero}-${ano}-${iso}`),
      demonstracao: true,
      observacao: null,
    };

    const criada = await api('/items/diario_edicoes', { method: 'POST', body: JSON.stringify(edicao) });

    /* ── matérias ── */
    /* A edição gigante existe para descobrir se o sumário, a paginação e a
       página HTML aguentam. Com 46 matérias dava 30 páginas — não testava nada
       que as outras já não testassem.
       Medido de verdade, e não estimado: 150 matérias renderam 67 páginas, ou
       0,447 página por matéria. Para passar de 80 páginas com folga, 200. */
    const quantas = gigante ? 200 : item.especial === 'suplementar' ? 3 : item.quantidade;
    const registros = [];
    for (let k = 0; k < quantas; k++) {
      const tipo = s.pesado(PESO_TIPOS);
      const cadernoSlug = CADERNO_DO_TIPO[tipo] ?? 'executivo';
      const secretaria = s.de(secretarias);
      const numeroAto = proximoAto(tipo, ano);

      /* Um a cada oito atos normativos vai para o caderno do Legislativo, para
         provar a estrutura multi-caderno com órgão que não é secretaria. */
      const doLegislativo = cadernoSlug === 'executivo' && s.talvez(0.12);
      const caderno = doLegislativo ? cadernoPorSlug['legislativo'] : cadernoPorSlug[cadernoSlug];

      /* A licitação guarda a modalidade como valor de enum ("pregao_eletronico");
         a matéria precisa do rótulo ("Pregão Eletrônico"). Sem traduzir, a
         ementa saía começando com "null nº 12/2026" — e é a ementa que vai para
         o sumário, a listagem e a busca. */
      const licitacao = tipo === 'aviso_de_licitacao' && licitacoes.length && s.talvez(0.5)
        ? s.de(licitacoes) : null;
      const rotuloModalidade = licitacao
        ? (MODALIDADES.find((m) => m.valor === licitacao.modalidade)?.rotulo ?? 'Licitação')
        : null;

      const redigido = redigir({
        tipo, s, data: dia, numero: numeroAto, ano,
        secretaria, prefeita,
        licitacao: licitacao ? { ...licitacao, modalidadeRotulo: rotuloModalidade } : null,
      });

      registros.push({
        status: 'publicado',
        edicao: criada.id,
        caderno: caderno.id,
        secretaria: doLegislativo ? null : secretaria.id,
        orgao_texto: doLegislativo ? 'Câmara Municipal de Cambuí' : null,
        ordem: k + 1,
        tipo_ato: tipo,
        numero_ato: String(numeroAto),
        ano_ato: ano,
        ementa: redigido.ementa,
        corpo: redigido.corpo,
        slug: `${paraSlug(`${tipoDeAto(tipo).rotulo}-${numeroAto}-${ano}-${textoDe(redigido.ementa).slice(0, 40)}`)}-${numero}-${k + 1}`,
        situacao: 'pautada',
        processo_administrativo: ['aviso_de_licitacao', 'edital', 'homologacao', 'resultado_de_julgamento', 'extrato_de_contrato'].includes(tipo)
          ? `${s.inteiro(1000, 1499)}/${ano}` : null,
        licitacao: licitacao?.id ?? null,
        demonstracao: true,
        _assinaturaNome: redigido.assinaturaNome,
        _assinaturaCargo: redigido.assinaturaCargo,
      });
    }

    /* ── casos de borda dentro da edição ── */
    if (item.especial === 'orcamentaria') {
      const n = proximoAto('lei', ano);
      const lo = leiOrcamentaria({ s, data: dia, numero: n, ano, prefeita });
      registros.unshift({
        status: 'publicado', edicao: criada.id, caderno: cadernoPorSlug['executivo'].id,
        secretaria: secretarias.find((x) => /administra/i.test(x.nome))?.id ?? secretarias[0].id,
        ordem: 0, tipo_ato: 'lei', numero_ato: String(n), ano_ato: ano,
        ementa: lo.ementa, corpo: lo.corpo,
        slug: `lei-${n}-${ano}-orcamento-anual-${numero}`,
        situacao: 'pautada', demonstracao: true,
        _assinaturaNome: lo.assinaturaNome, _assinaturaCargo: lo.assinaturaCargo,
      });
    }
    if (item.especial === 'curta') {
      const mc = materiaCurta({ data: dia, prefeita });
      registros.push({
        status: 'publicado', edicao: criada.id, caderno: cadernoPorSlug['executivo'].id,
        secretaria: secretarias[0].id, ordem: registros.length + 1,
        tipo_ato: 'outros', numero_ato: null, ano_ato: ano,
        ementa: mc.ementa, corpo: mc.corpo,
        slug: `sem-efeito-${numero}`, situacao: 'pautada', demonstracao: true,
        _assinaturaNome: mc.assinaturaNome, _assinaturaCargo: mc.assinaturaCargo,
      });
    }
    if ((item.especial === 'errata' || item.especial === 'republicacao') && materiaAnterior) {
      const errata = item.especial === 'errata';
      const n = proximoAto(errata ? 'errata' : 'republicacao', ano);
      registros.unshift({
        status: 'publicado', edicao: criada.id, caderno: cadernoPorSlug['executivo'].id,
        secretaria: secretarias[0].id, ordem: 0,
        tipo_ato: errata ? 'errata' : 'republicacao', numero_ato: String(n), ano_ato: ano,
        ementa: errata
          ? `Errata à ${materiaAnterior.titulo}, publicada na Edição nº ${materiaAnterior.numeroEdicao}.`
          : `Republicação, por incorreção, da ${materiaAnterior.titulo}, publicada na Edição nº ${materiaAnterior.numeroEdicao}.`,
        corpo: errata
          ? `<p>Na publicação da <strong>${materiaAnterior.titulo}</strong>, veiculada na Edição nº ${materiaAnterior.numeroEdicao} deste Diário Oficial, de ${dataBr(materiaAnterior.dataLegal)},</p>
             <p><strong>ONDE SE LÊ:</strong> “o prazo de 30 (trinta) dias”;</p>
             <p><strong>LEIA-SE:</strong> “o prazo de 60 (sessenta) dias”.</p>
             <p>Ficam ratificados os demais termos do ato retificado.</p>`
          : `<p>Por haver saído com incorreção, republica-se integralmente a <strong>${materiaAnterior.titulo}</strong>, veiculada na Edição nº ${materiaAnterior.numeroEdicao} deste Diário Oficial, de ${dataBr(materiaAnterior.dataLegal)}, com o seguinte teor:</p>
             ${materiaAnterior.corpo}`,
        slug: `${errata ? 'errata' : 'republicacao'}-${n}-${ano}-${numero}`,
        situacao: 'pautada', demonstracao: true,
        motivo_republicacao: errata ? null : 'Incorreção material no texto originalmente publicado.',
        _remissaoAlvo: materiaAnterior.id,
        _remissaoTipo: errata ? 'retifica' : 'republica',
        _assinaturaNome: prefeita.nome, _assinaturaCargo: prefeita.cargo,
      });
    }

    const inseridas = await api('/items/diario_materias', { method: 'POST',
      body: JSON.stringify(registros.map(({ _assinaturaNome, _assinaturaCargo, _remissaoAlvo, _remissaoTipo, ...r }) => r)) });

    /* Remissão: gravada num só sentido; o inverso é consulta. */
    for (const [k, r] of registros.entries()) {
      if (r._remissaoAlvo) {
        await api(`/items/diario_materias/${inseridas[k].id}`, { method: 'PATCH',
          body: JSON.stringify({ [r._remissaoTipo]: r._remissaoAlvo }) });
      }
    }

    /* ── PDF ── */
    const paraDocumento = prepararMaterias({
      edicao: criada,
      materias: inseridas.map((m, k) => ({
        ...m,
        remissaoHtml: registros[k]._remissaoAlvo
          ? `<strong>${registros[k]._remissaoTipo === 'retifica' ? 'Errata' : 'Republicação'}:</strong> esta matéria ${registros[k]._remissaoTipo === 'retifica' ? 'retifica' : 'republica'} a ${materiaAnterior.titulo}, publicada na Edição nº ${materiaAnterior.numeroEdicao}.`
          : null,
        assinaturaNome: registros[k]._assinaturaNome,
        assinaturaCargo: registros[k]._assinaturaCargo,
      })),
      cadernos,
      rotuloTipo: (t) => tipoDeAto(t).rotulo,
      nomeOrgao: (m) => m.orgao_texto || secretarias.find((x) => x.id === m.secretaria)?.nome || 'Prefeitura Municipal de Cambuí',
    });

    const resultado = await fecharEdicao({
      veiculo, edicao: criada, cadernos, materias: paraDocumento, urlBase: URL_BASE,
      certificado: certs.signCert, chave: certs.signChave, cadeia: certs.raizCert,
      signatario: `${prefeita.nome} — ${prefeita.cargo} (CERTIFICADO DE DEMONSTRAÇÃO)`,
      sessao,
    });

    const idArquivo = await enviarPdf(api, resultado.pdf,
      `diario-cambui-edicao-${String(numero).padStart(5, '0')}.pdf`,
      `Edição nº ${numero} — ${dataBr(legal)}`);

    /* ── páginas nas matérias, e publicação ──
       Em lote: uma requisição por matéria fazia o seed levar 3× mais tempo,
       e são ~1.700 matérias. */
    /* CASAR POR ID, NUNCA POR POSIÇÃO.
       `resultado.materias` vem na ordem do DOCUMENTO (caderno, depois ordem);
       `inseridas` está na ordem de INSERÇÃO. Indexar uma pela outra atribui a
       página de uma matéria a outra — e a página errada vai direto para a
       referência de citação, que é a razão de ser deste módulo. Custou um
       teste para descobrir; ver infra/diario/testar-paginacao.mjs. */
    await api('/items/diario_materias', { method: 'PATCH', body: JSON.stringify(
      resultado.materias.map((m) => ({
        id: m.id,
        pagina_inicial: m.pagina_inicial, pagina_final: m.pagina_final, situacao: 'publicada',
      })),
    ) });

    const anulada = item.especial === 'anulada';
    await api(`/items/diario_edicoes/${criada.id}`, { method: 'PATCH', body: JSON.stringify({
      arquivo_pdf: idArquivo,
      sha256: resultado.sha256,
      total_paginas: resultado.totalPaginas,
      assinatura_signatario: `${prefeita.nome} — ${prefeita.cargo}`,
      assinatura_emissor: 'AC DEMONSTRAÇÃO — NÃO É ICP-BRASIL',
      assinatura_em: disponibilizacao.toISOString(),
      assinatura_algoritmo: 'SHA-256 com RSA (PAdES-B-B)',
      assinatura_carimbo: false,
      fechada_em: disponibilizacao.toISOString(),
      publicada_em: disponibilizacao.toISOString(),
      situacao: 'publicada',
    }) });

    if (anulada) {
      await api(`/items/diario_edicoes/${criada.id}`, { method: 'PATCH', body: JSON.stringify({
        anulada: true, anulada_motivo: 'vicio_formal',
        anulada_justificativa: 'Edição anulada por vício formal na assinatura: o certificado utilizado estava vencido no momento do fechamento. Os atos nela veiculados foram republicados na edição seguinte. Esta edição permanece acessível porque o ato de anulação também é público.',
        anulada_em: new Date(dia.getTime() + 86400000 * 2).toISOString(),
      }) });
      edicaoAnulada = criada.id;
    }
    if (item.especial === 'anula_a_anterior' && edicaoAnulada) {
      await psql(`UPDATE diario_edicoes SET anulada_por_edicao='${criada.id}' WHERE id='${edicaoAnulada}'`);
      edicaoAnulada = null;
    }

    /* Auditoria: a trilha que um auditor percorre. */
    await api('/items/diario_auditoria', { method: 'POST', body: JSON.stringify([
      { acao: 'edicao_criada', quando: new Date(dia.getTime() + 3600000 * 9).toISOString(), quem_nome: nomePessoa(s), quem_papel: 'Editor do Diário', edicao: criada.id, detalhe: `Edição nº ${numero} aberta para montagem.` },
      { acao: 'edicao_fechada', quando: new Date(disponibilizacao.getTime() - 600000).toISOString(), quem_nome: 'ROGÉRIO FAGUNDES', quem_papel: 'Editor do Diário', edicao: criada.id, detalhe: `Conteúdo congelado com ${resultado.materias.length} matérias e ${resultado.totalPaginas} páginas.` },
      { acao: 'edicao_assinada', quando: disponibilizacao.toISOString(), quem_nome: prefeita.nome, quem_papel: 'Autoridade signatária', edicao: criada.id, detalhe: `Assinatura PAdES aplicada. SHA-256 ${resultado.sha256.slice(0, 16)}…` },
      { acao: 'edicao_publicada', quando: disponibilizacao.toISOString(), quem_nome: 'ROGÉRIO FAGUNDES', quem_papel: 'Editor do Diário', edicao: criada.id, detalhe: `Disponibilizada em ${dataBr(dia)}; publicação legal em ${dataBr(legal)}.` },
    ]) });

    /* Guarda uma matéria "boa" para virar alvo de errata/republicação depois. */
    const candidata = resultado.materias.find((m) => ['portaria', 'decreto'].includes(m.tipo_ato));
    if (candidata) {
      materiaAnterior = {
        id: candidata.id,
        titulo: `${tipoDeAto(candidata.tipo_ato).rotulo} nº ${candidata.numero_ato}/${candidata.ano_ato}`,
        numeroEdicao: numero, dataLegal: legal, corpo: candidata.corpo,
      };
    }

    criadas.push({ numero, paginas: resultado.totalPaginas, materias: resultado.materias.length });
    const passou = (Date.now() - t0) / 1000;
    process.stdout.write(`\r  ${criadas.length}/${Math.min(plano.length, ATE)} edições — nº ${numero}, ${resultado.totalPaginas} pág, ${resultado.materias.length} matérias — ${passou.toFixed(0)}s   `);
  }
} finally {
  await sessao.fechar();
}
console.log('');

/* ── 7. conferência ─────────────────────────────────────────────────────── */
passo('7/7 — Conferência do que foi gerado');
const total = await api('/items/diario_edicoes?aggregate[count]=id');
const totalMat = await api('/items/diario_materias?aggregate[count]=id');
dizer(`  edições: ${total[0].count.id}   matérias: ${totalMat[0].count.id}`);

const amostra = await api('/items/diario_edicoes?limit=1&sort=-numero&filter[importada_acervo][_eq]=false&fields=id,numero,sha256,arquivo_pdf,total_paginas');
if (amostra[0]?.arquivo_pdf) {
  const r = await fetch(`${BASE}/assets/${amostra[0].arquivo_pdf}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const bytes = Buffer.from(await r.arrayBuffer());
  const v = await verificarPdf(bytes, { ancoraConfianca: certs.raizCert });
  dizer(`  amostra: edição nº ${amostra[0].numero}, ${amostra[0].total_paginas} páginas`);
  dizer(`    assinatura íntegra: ${v.integro}  |  cobre o arquivo inteiro: ${v.cobreTudo}  |  cadeia confiável: ${v.confiavel}`);
  dizer(`    hash do arquivo bate com o gravado: ${v.sha256 === amostra[0].sha256}`);
  dizer(`    signatário: ${v.signatario}`);
}
console.log(`\n\x1b[1mSeed concluído em ${((Date.now() - t0) / 1000).toFixed(0)}s.\x1b[0m\n`);
