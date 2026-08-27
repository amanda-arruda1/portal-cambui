#!/usr/bin/env node
/**
 * Bateria de testes da inspeção de upload.
 *
 *   cd /opt/portal-cambui/apps/web && node scripts/testar-upload.mjs
 *
 * Roda contra o clamd de VERDADE (socket unix local) — não há simulação. Se o
 * antivírus estiver fora do ar, os casos que dependem dele falham, e é assim
 * que tem de ser: a política é falhar fechado.
 *
 * Os arquivos de teste são construídos aqui, em memória. Nada é gravado em
 * disco: o EICAR em disco dispararia a varredura periódica e cairia na
 * quarentena no meio do teste.
 *
 * Node 22 executa .ts diretamente (remoção de tipos), então este script
 * importa exatamente o mesmo código que o portal usa em produção.
 */

import { inspecionar } from '../src/lib/upload/index.ts';
import { varrer, disponivel } from '../src/lib/upload/clamav.ts';
import { sanitizarNome } from '../src/lib/upload/politica.ts';
import { crc32 } from 'node:zlib';

const cru = (texto) => new TextEncoder().encode(texto);
const bytes = (...valores) => new Uint8Array(valores);

function juntar(...partes) {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let i = 0;
  for (const p of partes) { saida.set(p, i); i += p.length; }
  return saida;
}

/** Preenchimento até um tamanho, para testar os tetos sem alocar texto. */
const encher = (base, ate) => juntar(base, new Uint8Array(Math.max(0, ate - base.length)).fill(0x20));

// --- Construtor de ZIP mínimo (entradas sem compressão) -------------------
// Necessário porque .docx/.odt são ZIP e o detector procura entradas reais
// dentro do arquivo. Fixture falso testaria o teste, não o código.
function zip(entradas) {
  const locais = [];
  const central = [];
  let deslocamento = 0;

  for (const [nome, conteudo] of entradas) {
    const nomeBytes = cru(nome);
    const dados = typeof conteudo === 'string' ? cru(conteudo) : conteudo;
    const soma = crc32(Buffer.from(dados));

    const cab = new DataView(new ArrayBuffer(30));
    cab.setUint32(0, 0x04034b50, true);   // assinatura do cabeçalho local
    cab.setUint16(4, 20, true);           // versão necessária
    cab.setUint16(8, 0, true);            // método 0 = armazenado
    cab.setUint32(14, soma, true);
    cab.setUint32(18, dados.length, true);
    cab.setUint32(22, dados.length, true);
    cab.setUint16(26, nomeBytes.length, true);
    const local = juntar(new Uint8Array(cab.buffer), nomeBytes, dados);
    locais.push(local);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(10, 0, true);
    dir.setUint32(16, soma, true);
    dir.setUint32(20, dados.length, true);
    dir.setUint32(24, dados.length, true);
    dir.setUint16(28, nomeBytes.length, true);
    dir.setUint32(42, deslocamento, true);
    central.push(juntar(new Uint8Array(dir.buffer), nomeBytes));

    deslocamento += local.length;
  }

  const corpoCentral = juntar(...central);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, entradas.length, true);
  fim.setUint16(10, entradas.length, true);
  fim.setUint32(12, corpoCentral.length, true);
  fim.setUint32(16, deslocamento, true);

  return juntar(...locais, corpoCentral, new Uint8Array(fim.buffer));
}

// --- Arquivos de teste ----------------------------------------------------

const PDF_LIMPO = cru(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

const PDF_COM_JS = cru(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/OpenAction<</S/JavaScript/JS(app.alert(1))>>>>endobj\n%%EOF\n',
);

const PDF_COM_LAUNCH = cru('%PDF-1.4\n1 0 obj<</A<</S/Launch/F(cmd.exe)>>>>endobj\n%%EOF\n');

const PNG_LIMPO = juntar(
  bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
  bytes(0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0),
  cru('resto irrelevante para a assinatura'),
);

const JPEG_LIMPO = juntar(bytes(0xff, 0xd8, 0xff, 0xe0), cru('JFIF corpo qualquer'));
const WEBP_LIMPO = juntar(cru('RIFF'), bytes(0x1a, 0, 0, 0), cru('WEBPVP8 corpo qualquer'));

const DOCX = zip([
  ['[Content_Types].xml', '<?xml version="1.0"?><Types/>'],
  ['word/document.xml', '<?xml version="1.0"?><w:document/>'],
]);

const ODT = zip([
  ['mimetype', 'application/vnd.oasis.opendocument.text'],
  ['content.xml', '<?xml version="1.0"?><office:document-content/>'],
]);

const CSV_LIMPO = cru('secretaria;servidor;cargo\nEducação;Ana Souza;Diretora\nSaúde;João Álvaro;Médico\n');
const CSV_COM_FORMULA = cru('nome;valor\nAna;=cmd|\'/c calc\'!A1\n');
const CSV_LATIN1 = juntar(cru('nome;cargo\nJo'), bytes(0xe3), cru('o;Diretor\n'));

const EICAR = cru('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
const EXECUTAVEL = juntar(bytes(0x4d, 0x5a, 0x90, 0x00), cru('programa do Windows'));
const HTML = cru('<!DOCTYPE html><html><script>document.cookie</script></html>');
const SVG = cru('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
const OLE = juntar(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), cru('doc legado'));

// --- Casos ----------------------------------------------------------------
// espera: 'aceito' ou a etapa em que a recusa DEVE acontecer.

const CASOS = [
  ['PDF de edital, limpo',                 PDF_LIMPO,        'edital-04-2026.pdf',        'application/pdf', 'aceito'],
  ['PNG de notícia, limpo',                PNG_LIMPO,        'inauguracao.png',           'image/png',       'aceito'],
  ['JPEG de notícia, limpo',               JPEG_LIMPO,       'foto.jpg',                  'image/jpeg',      'aceito'],
  ['WebP de notícia, limpo',               WEBP_LIMPO,       'banner.webp',               'image/webp',      'aceito'],
  ['DOCX real (ZIP com word/document)',    DOCX,             'oficio.docx',               undefined,         'aceito'],
  ['ODT real (mimetype na 1a entrada)',    ODT,              'ata.odt',                   undefined,         'aceito'],
  ['CSV de dados abertos, UTF-8',          CSV_LIMPO,        'servidores.csv',            'text/csv',        'aceito'],

  ['EICAR nomeado como PDF',               EICAR,            'edital.pdf',                'application/pdf', 'assinatura'],
  ['executável .exe renomeado p/ .pdf',    EXECUTAVEL,       'edital.pdf',                'application/pdf', 'assinatura'],
  ['HTML com script disfarçado de PNG',    HTML,             'logo.png',                  'image/png',       'assinatura'],
  ['documento OLE legado (macro)',         OLE,              'planilha.xlsx',             undefined,         'assinatura'],
  ['PDF corrompido / conteúdo irreconhecível', cru('nada'),  'edital.pdf',                'application/pdf', 'assinatura'],

  ['SVG, formato fora da política',        SVG,              'brasao.svg',                'image/svg+xml',   'extensao'],
  ['arquivo sem extensão',                 PDF_LIMPO,        'edital',                    'application/pdf', 'extensao'],
  ['ZIP fora da política',                 DOCX,             'pacote.zip',                undefined,         'extensao'],
  ['arquivo vazio',                        new Uint8Array(0),'edital.pdf',                'application/pdf', 'tamanho'],
  ['PDF acima do teto de 25 MB',           encher(PDF_LIMPO, 26 * 1024 * 1024), 'grande.pdf', 'application/pdf', 'tamanho'],
  ['PNG acima do teto de 8 MB',            encher(PNG_LIMPO, 9 * 1024 * 1024),  'foto.png',   'image/png',      'tamanho'],

  ['DOCX real com extensão .xlsx',         DOCX,             'planilha.xlsx',             undefined,         'coerencia'],
  ['PNG real com extensão .jpg',           PNG_LIMPO,        'foto.jpg',                  'image/jpeg',      'coerencia'],
  ['PDF com MIME declarado de imagem',     PDF_LIMPO,        'edital.pdf',                'image/png',       'coerencia'],

  ['PDF com JavaScript embutido',          PDF_COM_JS,       'edital.pdf',                'application/pdf', 'risco'],
  ['PDF com ação /Launch',                 PDF_COM_LAUNCH,   'edital.pdf',                'application/pdf', 'risco'],
  ['CSV com fórmula no início do campo',   CSV_COM_FORMULA,  'servidores.csv',            'text/csv',        'risco'],
  ['CSV em Latin-1 (acento quebrado)',     CSV_LATIN1,       'servidores.csv',            'text/csv',        'assinatura'],
];

// --- Execução -------------------------------------------------------------

const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const vermelho = (t) => `\x1b[31m${t}\x1b[0m`;
const cinza = (t) => `\x1b[90m${t}\x1b[0m`;

console.log('\n=== Antivírus ===');
const av = await disponivel();
console.log(`  clamd: ${av.ok ? verde('disponível') : vermelho('INDISPONÍVEL')} (${av.detalhe})`);
if (!av.ok) {
  console.log(vermelho('\n  Sem clamd os casos "aceito" falham de propósito — a política é falhar fechado.\n'));
}

console.log('\n=== ClamAV direto, com o EICAR ===');
const vereditoEicar = await varrer(EICAR);
const eicarOk = vereditoEicar.estado === 'infectado';
console.log(`  ${eicarOk ? verde('PASSOU') : vermelho('FALHOU')}  EICAR reconhecido: ${JSON.stringify(vereditoEicar)}`);
const vereditoLimpo = await varrer(PDF_LIMPO);
const limpoOk = vereditoLimpo.estado === 'limpo';
console.log(`  ${limpoOk ? verde('PASSOU') : vermelho('FALHOU')}  PDF limpo passa: ${JSON.stringify(vereditoLimpo)}`);

console.log('\n=== Sanitização de nome ===');
const NOMES = [
  // Caminho completo do Windows (herança do IE): fica só o nome do arquivo.
  ['C:\\Users\\Ana\\edital-04-2026.pdf', 'edital-04-2026.pdf'],
  // Aqui "edital 04" é diretório e "2026.pdf" é o arquivo — não é perda de nome.
  ['C:\\Users\\Ana\\edital 04/2026.pdf', '2026.pdf'],
  // RTLO invertendo a leitura na tela para disfarçar o .exe.
  ['edital\u202Efdp.exe', 'editalfdp.exe'],
  ['  ...ata da sessão...  .odt', 'ata da sessão.odt'],
  // Aspas e ponto e vírgula sairiam no Content-Disposition do download.
  ['arquivo"; rm -rf /.pdf', 'arquivo rm -rf.pdf'],
  ['.oculto.pdf', 'oculto.pdf'],
  // Sem extensão reconhecível: o nome inteiro sobrevive, a inspeção recusa depois.
  ['relatório final', 'relatório final'],
];
let nomesOk = 0;
for (const [entrada, esperado] of NOMES) {
  const obtido = sanitizarNome(entrada);
  const ok = obtido === esperado;
  if (ok) nomesOk++;
  console.log(`  ${ok ? verde('PASSOU') : vermelho('FALHOU')}  ${JSON.stringify(entrada)} → ${JSON.stringify(obtido)}${ok ? '' : vermelho(`  (esperado ${JSON.stringify(esperado)})`)}`);
}

console.log('\n=== Inspeção completa ===');
let passaram = 0;
for (const [descricao, dados, nome, mime, esperado] of CASOS) {
  const r = await inspecionar(dados, nome, mime);
  const obtido = r.aceito ? 'aceito' : r.etapa;
  const ok = obtido === esperado;
  if (ok) passaram++;
  const detalhe = r.aceito ? `${r.formato}, ${r.tamanho} B, sha256 ${r.digestao.slice(0, 12)}…` : r.motivo;
  console.log(`  ${ok ? verde('PASSOU') : vermelho('FALHOU')}  ${descricao.padEnd(42)} ${cinza(`[${obtido}]`)}`);
  console.log(`          ${cinza(detalhe)}`);
  if (!ok) console.log(`          ${vermelho(`esperado: ${esperado}`)}`);
}

const totalOk = passaram === CASOS.length && eicarOk && limpoOk && nomesOk === NOMES.length;
console.log(
  `\n${totalOk ? verde('TUDO PASSOU') : vermelho('HOUVE FALHA')}: ` +
  `${passaram}/${CASOS.length} inspeções, ${nomesOk}/${NOMES.length} nomes, ` +
  `antivírus ${eicarOk && limpoOk ? 'ok' : 'com falha'}.\n`,
);
process.exit(totalOk ? 0 : 1);
