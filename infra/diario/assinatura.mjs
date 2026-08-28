/**
 * Assinatura e verificação PAdES de PDF.
 *
 * O que é feito aqui, em uma frase: acrescenta ao PDF, por ATUALIZAÇÃO
 * INCREMENTAL, um dicionário de assinatura cujo /Contents guarda uma estrutura
 * CMS (PKCS#7) destacada que cobre todo o arquivo, menos o próprio /Contents.
 *
 * Por que atualização incremental e não regravar o arquivo: o PDF original não
 * pode ter um byte alterado. Quem verifica compara o conteúdo assinado com o
 * que está no arquivo; regravar mudaria deslocamentos e quebraria a prova. A
 * atualização incremental apenas ANEXA objetos novos e uma nova tabela xref
 * que aponta para a anterior — o documento original segue lá, intacto, e é
 * exatamente isso que dá para provar depois.
 *
 * Por que o OpenSSL faz a parte criptográfica: montar CMS/PKCS#7 em ASN.1 na
 * mão é território de erro silencioso — uma assinatura mal formada não
 * "quebra", ela passa aqui e é recusada pelo validador do ITI seis meses
 * depois, no meio de uma auditoria. O OpenSSL está em qualquer servidor,
 * é auditado, e `-cades` produz o atributo signingCertificate que o padrão
 * PAdES exige.
 *
 * LIMITE DECLARADO: isto entrega PAdES-B-B (básico). Carimbo do tempo
 * (PAdES-B-T) depende de uma ACT contratada; o gancho está em `carimbar()` e o
 * TODO está no ARQUITETURA.md. Sem carimbo, a data da assinatura vem do
 * relógio de quem assinou — que é aceito, mas prova menos.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);

/* 16 KiB de espaço reservado para a estrutura CMS. Medido: certificado do
 * signatário + cadeia + atributos assinados + assinatura RSA-2048 dá ~4 KiB;
 * com carimbo do tempo, ~8 KiB. O dobro disso é folga barata — o que não pode
 * acontecer é a assinatura não caber no buraco depois que os deslocamentos já
 * foram calculados. */
const ESPACO_ASSINATURA = 16384;

/* ---------------------------------------------------------------- leitura */

/** Índice { número do objeto → deslocamento } lido varrendo o arquivo.
 *  Vale porque o Chromium emite xref clássica, sem object stream. */
function mapearObjetos(pdf) {
  const mapa = new Map();
  const re = /(?<=^|[\r\n\s])(\d+)\s+(\d+)\s+obj\b/g;
  const texto = pdf.toString('latin1');
  for (let m; (m = re.exec(texto)); ) mapa.set(Number(m[1]), m.index + (m[0].length - m[0].trimStart().length));
  return mapa;
}

function ultimoTrailer(pdf) {
  const texto = pdf.toString('latin1');
  const i = texto.lastIndexOf('trailer');
  if (i < 0) throw new Error('PDF sem trailer clássico: este assinador não trata xref stream.');
  const fim = texto.indexOf('startxref', i);
  return { corpo: texto.slice(i + 7, fim), inicioXrefAnterior: Number(texto.slice(fim + 9).trim().split(/\s/)[0]) };
}

/** Corpo bruto de um objeto, de "N 0 obj" até "endobj". */
function corpoDoObjeto(pdf, mapa, numero) {
  const inicio = mapa.get(numero);
  if (inicio === undefined) throw new Error(`objeto ${numero} não encontrado`);
  const texto = pdf.toString('latin1');
  const abre = texto.indexOf('obj', inicio) + 3;
  const fecha = texto.indexOf('endobj', abre);
  return texto.slice(abre, fecha);
}

/* ------------------------------------------------------------- assinatura */

/**
 * Monta o PDF já com o dicionário de assinatura e o /Contents vazio,
 * devolvendo também onde o buraco começa e termina.
 */
function prepararIncremento(pdf, dados) {
  const mapa = mapearObjetos(pdf);
  const { corpo: trailer, inicioXrefAnterior } = ultimoTrailer(pdf);

  const raiz = Number(/\/Root\s+(\d+)\s+\d+\s+R/.exec(trailer)?.[1]);
  const tamanhoAnterior = Number(/\/Size\s+(\d+)/.exec(trailer)?.[1]);
  if (!raiz || !tamanhoAnterior) throw new Error('trailer sem /Root ou /Size');

  const catalogo = corpoDoObjeto(pdf, mapa, raiz);
  const paginas = Number(/\/Pages\s+(\d+)\s+\d+\s+R/.exec(catalogo)?.[1]);
  const primeiraPagina = Number(/\/Kids\s*\[\s*(\d+)\s+\d+\s+R/.exec(corpoDoObjeto(pdf, mapa, paginas))?.[1]);
  if (!primeiraPagina) throw new Error('não achei a primeira página');

  const nSig = tamanhoAnterior;
  const nCampo = tamanhoAnterior + 1;
  const novoTamanho = tamanhoAnterior + 2;

  const escapar = (s) => String(s ?? '').replace(/([()\\])/g, '\\$1');
  const dataPdf = (d) => {
    const p = (n, l = 2) => String(n).padStart(l, '0');
    const fuso = -d.getTimezoneOffset();
    return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}` +
      `${fuso >= 0 ? '+' : '-'}${p(Math.abs(Math.trunc(fuso / 60)))}'${p(Math.abs(fuso % 60))}'`;
  };

  /* A /ByteRange é escrita com largura fixa e só depois preenchida com os
   * números reais, na MESMA largura. Se o texto mudasse de tamanho, todos os
   * deslocamentos calculados antes dele ficariam errados — é o erro clássico
   * de quem implementa isso pela primeira vez. */
  const LARGURA = 10;
  const reserva = '0'.repeat(LARGURA);
  const marcaByteRange = `/ByteRange [${reserva} ${reserva} ${reserva} ${reserva}]`;

  const objSig =
    `${nSig} 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached\n` +
    `${marcaByteRange}\n/Contents <${'0'.repeat(ESPACO_ASSINATURA * 2)}>\n` +
    `/M (${dataPdf(dados.quando ?? new Date())})\n` +
    `/Name (${escapar(dados.signatario)})\n` +
    `/Reason (${escapar(dados.motivo ?? 'Publicação de edição do Diário Oficial Eletrônico')})\n` +
    `/Location (${escapar(dados.local ?? 'Cambuí/MG')})\n>>\nendobj\n`;

  /* Assinatura invisível: /Rect nulo e sem aparência. O selo visual do
   * documento é a página de verificação e o QR Code — quem confere de verdade
   * usa o validador, não um carimbo desenhado, que qualquer um imita. */
  const objCampo =
    `${nCampo} 0 obj\n<< /Type /Annot /Subtype /Widget /FT /Sig /Rect [0 0 0 0] /F 132\n` +
    `/T (Assinatura do Diario Oficial) /V ${nSig} 0 R /P ${primeiraPagina} 0 R >>\nendobj\n`;

  /* A página ganha /Annots e o catálogo ganha /AcroForm. Os dois objetos são
   * REESCRITOS na área nova; as versões antigas continuam no arquivo e a xref
   * nova é que decide qual vale. */
  const paginaAntiga = corpoDoObjeto(pdf, mapa, primeiraPagina);
  const paginaNova = /\/Annots\s*\[/.test(paginaAntiga)
    ? paginaAntiga.replace(/\/Annots\s*\[/, `/Annots [${nCampo} 0 R `)
    : paginaAntiga.replace(/<</, `<< /Annots [${nCampo} 0 R] `);

  const catalogoNovo = catalogo.replace(/<</,
    `<< /AcroForm << /Fields [${nCampo} 0 R] /SigFlags 3 /DA (/Helv 0 Tf 0 g) >> `);

  const partes = [
    `\n${objSig}`,
    `${objCampo}`,
    `${primeiraPagina} 0 obj${paginaNova}endobj\n`,
    `${raiz} 0 obj${catalogoNovo}endobj\n`,
  ];

  /* Deslocamentos de cada objeto novo, para a tabela xref. */
  let cursor = pdf.length;
  const desloc = new Map();
  const inicioSig = cursor + 1;                        // pula o \n inicial
  desloc.set(nSig, inicioSig);
  cursor += Buffer.byteLength(partes[0], 'latin1');
  desloc.set(nCampo, cursor);
  cursor += Buffer.byteLength(partes[1], 'latin1');
  desloc.set(primeiraPagina, cursor);
  cursor += Buffer.byteLength(partes[2], 'latin1');
  desloc.set(raiz, cursor);
  cursor += Buffer.byteLength(partes[3], 'latin1');

  /* xref clássica com três subseções (os objetos novos não são contíguos). */
  const entrada = (o) => `${String(o).padStart(10, '0')} 00000 n \n`;
  const ordenados = [...desloc.entries()].sort((a, b) => a[0] - b[0]);
  const secoes = [];
  for (const [numero, offset] of ordenados) {
    const ultima = secoes[secoes.length - 1];
    if (ultima && ultima.primeiro + ultima.itens.length === numero) ultima.itens.push(offset);
    else secoes.push({ primeiro: numero, itens: [offset] });
  }
  const xref = 'xref\n' + secoes.map((s) => `${s.primeiro} ${s.itens.length}\n${s.itens.map(entrada).join('')}`).join('');
  const inicioXref = cursor;
  const cauda = `${xref}trailer\n<< /Size ${novoTamanho} /Root ${raiz} 0 R /Prev ${inicioXrefAnterior} >>\nstartxref\n${inicioXref}\n%%EOF\n`;

  const saida = Buffer.concat([pdf, Buffer.from(partes.join('') + cauda, 'latin1')]);

  /* Localiza o buraco do /Contents e escreve a /ByteRange definitiva. */
  const abre = saida.indexOf('/Contents <', inicioSig) + '/Contents '.length;
  const fecha = saida.indexOf('>', abre) + 1;
  const faixa = [0, abre, fecha, saida.length - fecha];
  const textoFaixa = `/ByteRange [${faixa.map((n) => String(n).padStart(LARGURA, '0')).join(' ')}]`;
  const posFaixa = saida.indexOf(marcaByteRange, inicioSig);
  saida.write(textoFaixa, posFaixa, 'latin1');

  return { pdf: saida, abre, fecha };
}

/** Bytes efetivamente cobertos pela assinatura. */
function bytesAssinados(pdf, abre, fecha) {
  return Buffer.concat([pdf.subarray(0, abre), pdf.subarray(fecha)]);
}

/**
 * Assina um PDF.
 * @param {Buffer} pdfOriginal
 * @param {object} o
 * @param {string} o.certificado  caminho do PEM do signatário
 * @param {string} o.chave        caminho da chave privada PEM
 * @param {string} [o.cadeia]     caminho do PEM com a cadeia (intermediárias/raiz)
 * @param {string} o.signatario   nome que aparece no /Name
 */
export async function assinarPdf(pdfOriginal, o) {
  const { pdf, abre, fecha } = prepararIncremento(pdfOriginal, o);
  const pasta = await mkdtemp(join(tmpdir(), 'diario-sig-'));
  try {
    const conteudo = join(pasta, 'conteudo.bin');
    const saida = join(pasta, 'cms.der');
    await writeFile(conteudo, bytesAssinados(pdf, abre, fecha));

    await exec('openssl', [
      'cms', '-sign', '-binary', '-in', conteudo, '-outform', 'DER', '-out', saida,
      '-signer', o.certificado, '-inkey', o.chave,
      ...(o.cadeia ? ['-certfile', o.cadeia] : []),
      '-md', 'sha256',
      '-cades',      // atributo signingCertificateV2 — exigência do PAdES
      '-nosmimecap', // capacidades S/MIME não fazem sentido fora de e-mail
    ]);

    const cms = await readFile(saida);
    if (cms.length > ESPACO_ASSINATURA) {
      throw new Error(`assinatura de ${cms.length} bytes não cabe no espaço de ${ESPACO_ASSINATURA}. Aumente ESPACO_ASSINATURA.`);
    }

    /* Preenche o buraco: hex da CMS + zeros até o fim. O tamanho do buraco não
     * muda, então a /ByteRange calculada antes continua válida. */
    const hex = cms.toString('hex').padEnd(ESPACO_ASSINATURA * 2, '0');
    pdf.write(hex, abre + 1, 'latin1');
    return pdf;
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}

/* ------------------------------------------------------------ verificação */

/**
 * Verifica um PDF assinado.
 * @returns {Promise<{assinado:boolean, integro:boolean, cobreTudo:boolean,
 *                    signatario:string|null, emissor:string|null,
 *                    validoDe:string|null, validoAte:string|null,
 *                    algoritmo:string|null, carimbo:boolean,
 *                    sha256:string, motivo:string|null, quando:string|null,
 *                    confiavel:boolean, detalhe:string}>}
 */
export async function verificarPdf(pdf, { ancoraConfianca } = {}) {
  const base = {
    assinado: false, integro: false, cobreTudo: false, signatario: null, emissor: null,
    validoDe: null, validoAte: null, algoritmo: null, carimbo: false,
    sha256: createHash('sha256').update(pdf).digest('hex'),
    motivo: null, quando: null, confiavel: false, detalhe: '',
  };

  const texto = pdf.toString('latin1');
  const faixa = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(texto);
  if (!faixa) return { ...base, detalhe: 'O arquivo não contém assinatura digital.' };

  const [, a, b, c, d] = faixa.map(Number);
  base.assinado = true;

  /* A /ByteRange precisa cobrir o arquivo INTEIRO, menos o buraco da própria
   * assinatura. Se sobrar byte fora dela, alguém anexou conteúdo depois de
   * assinado — a assinatura continua "válida" para a parte antiga e o leitor
   * desavisado vê um documento adulterado com selo verde. É o ataque clássico
   * contra PDF assinado, e é aqui que ele morre. */
  base.cobreTudo = a === 0 && c > b && c + d === pdf.length;

  base.motivo = /\/Reason\s*\(([^)]*)\)/.exec(texto)?.[1] ?? null;
  base.quando = /\/M\s*\(D:(\d{14})/.exec(texto)?.[1] ?? null;

  const hex = texto.slice(b + 1, c - 1).replace(/[^0-9a-fA-F]/g, '');
  const cms = Buffer.from(hex.replace(/(00)+$/, ''), 'hex');
  const assinado = Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)]);

  const pasta = await mkdtemp(join(tmpdir(), 'diario-ver-'));
  try {
    const fCms = join(pasta, 'cms.der');
    const fConteudo = join(pasta, 'conteudo.bin');
    await writeFile(fCms, cms);
    await writeFile(fConteudo, assinado);

    /* Duas perguntas DIFERENTES, deliberadamente separadas:
     *   1. o conteúdo bate com a assinatura?  (integridade)
     *   2. o certificado vem de uma âncora em que confiamos? (confiança)
     * Um PDF pode ser íntegro e assinado por qualquer um. Misturar as duas
     * respostas é como se produz o "documento válido" que não vale nada. */
    try {
      await exec('openssl', ['cms', '-verify', '-binary', '-inform', 'DER', '-in', fCms,
        '-content', fConteudo, '-purpose', 'any', '-no_check_time', '-noverify', '-out', '/dev/null']);
      base.integro = true;
    } catch (e) {
      return { ...base, detalhe: `A assinatura NÃO confere com o conteúdo do arquivo: ${String(e.stderr || e.message).split('\n')[0]}` };
    }

    if (ancoraConfianca) {
      try {
        await exec('openssl', ['cms', '-verify', '-binary', '-inform', 'DER', '-in', fCms,
          '-content', fConteudo, '-CAfile', ancoraConfianca, '-purpose', 'any', '-out', '/dev/null']);
        base.confiavel = true;
      } catch { base.confiavel = false; }
    }

    /* Dados do certificado do SIGNATÁRIO.
     *
     * Não serve ler o primeiro certificado do pacote: a CMS carrega a cadeia
     * inteira, e o primeiro costuma ser a autoridade certificadora. Exibir a AC
     * no lugar de quem assinou é erro grave numa página de autenticidade — o
     * cidadão leria "assinado por AC Demonstração". Quem sabe separar os dois é
     * o próprio OpenSSL, com -signer na verificação. */
    try {
      const fSigner = join(pasta, 'signatario.pem');
      await exec('openssl', ['cms', '-verify', '-binary', '-inform', 'DER', '-in', fCms,
        '-content', fConteudo, '-purpose', 'any', '-no_check_time', '-noverify',
        '-signer', fSigner, '-out', '/dev/null']);
      const { stdout } = await exec('openssl', ['x509', '-in', fSigner, '-noout',
        '-subject', '-issuer', '-dates', '-nameopt', 'utf8,sep_comma_plus_space']);
      const linha = (rotulo) => new RegExp(`^${rotulo}=(.*)$`, 'm').exec(stdout)?.[1]?.trim() ?? null;
      const nomeComum = (dn) => (dn ? (/(?:^|,\s*)CN\s*=\s*([^,]+)/.exec(dn)?.[1]?.trim() ?? dn) : null);
      base.signatario = nomeComum(linha('subject'));
      base.emissor = nomeComum(linha('issuer'));
      base.validoDe = linha('notBefore');
      base.validoAte = linha('notAfter');

      /* TODO(produção): certificado ICP-Brasil traz o CPF do titular num
       * otherName do subjectAltName (OID 2.16.76.1.3.1). Ao trocar o
       * certificado de demonstração pelo real, extrair e EXIBIR MASCARADO. */
    } catch { /* metadado é acessório: a integridade já foi respondida */ }

    base.carimbo = cms.includes(Buffer.from('2a864886f70d010910020e', 'hex')); // id-aa-signatureTimeStampToken
    base.algoritmo = 'SHA-256 com RSA';
    base.detalhe = base.integro && base.cobreTudo
      ? 'Documento íntegro: o conteúdo confere com a assinatura e a assinatura cobre o arquivo inteiro.'
      : base.integro
        ? 'A assinatura confere, mas NÃO cobre o arquivo inteiro — há conteúdo acrescentado depois de assinado.'
        : 'Documento adulterado.';
    return base;
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}

/** TODO(cliente): carimbo do tempo exige contratar uma ACT credenciada
 *  (PAdES-B-T). O ponto de integração é aqui: pegar o digest da assinatura,
 *  pedir o token RFC 3161 e reinserir como atributo não assinado. */
export function carimbar() {
  throw new Error('Carimbo do tempo ainda não contratado — ver ARQUITETURA.md.');
}
