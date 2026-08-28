/**
 * Verificação de PDF assinado (PAdES) — Node puro, sem subprocesso.
 *
 * POR QUE NÃO CHAMAR O OPENSSL AQUI
 * Esta função roda dentro do processo web, que é deliberadamente confinado pelo
 * systemd (SystemCallFilter, ProtectSystem=strict, sem capacidades). Chamar
 * binário externo no caminho de uma requisição desse processo é atrito
 * garantido e superfície nova. Tudo de que a verificação precisa — SHA-256,
 * RSA e leitura de certificado X.509 — o Node já traz em `node:crypto`.
 *
 * O que se responde, e são perguntas DIFERENTES:
 *   1. INTEGRIDADE  — o conteúdo confere com a assinatura?
 *   2. COBERTURA    — a assinatura cobre o arquivo inteiro, ou alguém anexou
 *                     conteúdo depois? (o ataque clássico contra PDF assinado)
 *   3. CONFIANÇA    — quem assinou está numa cadeia em que confiamos?
 * Um documento pode ser íntegro e assinado por qualquer um. Fundir as três
 * respostas num "válido" verde é como se produz o selo que não vale nada.
 *
 * A assinatura é gerada em outro lugar (infra/diario/assinatura.mjs, com
 * OpenSSL, num serviço que detém a chave). Ter duas implementações
 * independentes — uma que assina, outra que confere — é proposital: um erro na
 * mesma cabeça não passa despercebido nas duas.
 */
import { createHash, createVerify, X509Certificate } from 'node:crypto';

/* ────────────────────────── leitor de DER mínimo ───────────────────────── */

/** Lê uma estrutura ASN.1/DER: devolve {classe, construido, tag, conteudo, fim}. */
function ler(buf, pos) {
  const primeiro = buf[pos];
  const classe = primeiro >> 6;
  const construido = (primeiro & 0x20) !== 0;
  let tag = primeiro & 0x1f;
  let i = pos + 1;
  if (tag === 0x1f) { // tag longa
    tag = 0;
    do { tag = (tag << 7) | (buf[i] & 0x7f); } while (buf[i++] & 0x80);
  }
  let tamanho = buf[i++];
  if (tamanho & 0x80) {
    const octetos = tamanho & 0x7f;
    if (octetos === 0 || octetos > 4) throw new Error('DER com comprimento indefinido ou grande demais');
    tamanho = 0;
    for (let k = 0; k < octetos; k++) tamanho = (tamanho << 8) | buf[i++];
  }
  return {
    classe, construido, tag, inicio: pos, cabecalho: i - pos, fim: i + tamanho,
    conteudo: buf.subarray(i, i + tamanho),
    /* Os bytes COMPLETOS deste nó, cabeçalho incluído, fatiados do MESMO buffer
     * em que ele foi lido. Guardar só o deslocamento e fatiar de outro buffer
     * depois é erro silencioso: os offsets são relativos ao buffer de entrada,
     * e o resultado é uma assinatura que nunca confere. */
    bruto: buf.subarray(pos, i + tamanho),
  };
}

/** Itera os filhos de uma estrutura construída. */
function* filhos(buf) {
  let p = 0;
  while (p < buf.length) {
    const n = ler(buf, p);
    yield n;
    p = n.fim;
  }
}

const SEQUENCIA = 0x10, CONJUNTO = 0x11, OID = 0x06, OCTETOS = 0x04, INTEIRO = 0x02;

function oidTexto(conteudo) {
  const partes = [Math.floor(conteudo[0] / 40), conteudo[0] % 40];
  let v = 0;
  for (let i = 1; i < conteudo.length; i++) {
    v = (v << 7) | (conteudo[i] & 0x7f);
    if (!(conteudo[i] & 0x80)) { partes.push(v); v = 0; }
  }
  return partes.join('.');
}

const OIDS = {
  '1.2.840.113549.1.7.2': 'signedData',
  '1.2.840.113549.1.9.4': 'messageDigest',
  '1.2.840.113549.1.9.3': 'contentType',
  '1.2.840.113549.1.9.16.2.14': 'signatureTimeStampToken',
  '1.2.840.113549.1.9.16.2.47': 'signingCertificateV2',
  '2.16.840.1.101.3.4.2.1': 'sha256',
  '2.16.840.1.101.3.4.2.2': 'sha384',
  '2.16.840.1.101.3.4.2.3': 'sha512',
};

/* ───────────────────────── extração do PDF ─────────────────────────────── */

/**
 * Acha TODAS as assinaturas do PDF. Um PDF pode ter mais de uma (assinaturas
 * sucessivas por atualização incremental) — ignorar as outras deixaria passar
 * um documento em que só a primeira cobre o conteúdo verdadeiro.
 */
export function acharAssinaturas(pdf) {
  const texto = pdf.toString('latin1');
  const achados = [];
  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  for (let m; (m = re.exec(texto)); ) {
    const [a, b, c, d] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    /* O /Contents fica no buraco entre b e c. */
    const abre = texto.indexOf('<', b - 1);
    const hex = texto.slice(b + 1, c - 1).replace(/[^0-9a-fA-F]/g, '');
    if (!hex) continue;
    /* O dicionário de assinatura tem 32 KiB reservados no meio dele (o buraco
     * do /Contents). Os metadados /M, /Name e /Reason vêm DEPOIS desse buraco,
     * então uma janela em torno da /ByteRange não os alcança — é preciso olhar
     * também logo após o fechamento do /Contents. */
    const janela = texto.slice(Math.max(0, m.index - 400), m.index + 400) + '\n' + texto.slice(c, c + 900);
    achados.push({
      faixa: [a, b, c, d],
      cms: Buffer.from(hex.replace(/(00)+$/, ''), 'hex'),
      assinados: Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)]),
      subFilter: /\/SubFilter\s*\/([A-Za-z0-9.]+)/.exec(janela)?.[1] ?? null,
      motivo: /\/Reason\s*\(([^)]*)\)/.exec(janela)?.[1] ?? null,
      nome: /\/Name\s*\(([^)]*)\)/.exec(janela)?.[1] ?? null,
      /* A data traz o fuso: D:20260828100014-03'00'. Ignorá-lo e tratar como
       * UTC desloca a data em até 14 horas — o bastante para dizer que um
       * certificado não valia no instante em que valia. */
      quando: /\/M\s*\(D:(\d{14})([Z+-]\d{2}'?\d{2}'?)?/.exec(janela)?.slice(1, 3) ?? null,
    });
  }
  return achados;
}

/* ────────────────────────── leitura da CMS ─────────────────────────────── */

function decodificarCms(der) {
  const raiz = ler(der, 0);                        // ContentInfo ::= SEQUENCE
  const contentInfo = [...filhos(raiz.conteudo)];
  const tipo = oidTexto(contentInfo[0].conteudo);
  if (OIDS[tipo] !== 'signedData') throw new Error(`CMS não é signedData (${tipo})`);

  /* SignedData ::= SEQUENCE {
   *   version, digestAlgorithms SET, encapContentInfo SEQUENCE,
   *   certificates [0] IMPLICIT OPTIONAL, crls [1] IMPLICIT OPTIONAL,
   *   signerInfos SET }
   * Lido por POSIÇÃO, não adivinhando pelo tipo: dois campos vizinhos são
   * ambos SEQUENCE, e o palpite erra em silêncio. */
  const envelope = ler(contentInfo[1].conteudo, 0); // [0] EXPLICIT SignedData
  const sd = [...filhos(envelope.conteudo)];

  let i = 0;
  i++;                                              // version
  i++;                                              // digestAlgorithms
  i++;                                              // encapContentInfo

  const certificados = [];
  if (sd[i] && sd[i].classe === 2 && sd[i].tag === 0) {
    for (const c of filhos(sd[i].conteudo)) certificados.push(Buffer.from(c.bruto));
    i++;
  }
  if (sd[i] && sd[i].classe === 2 && sd[i].tag === 1) i++;   // crls

  const signerInfos = sd[i];
  if (!signerInfos) throw new Error('CMS sem signerInfos');

  const primeiro = [...filhos(signerInfos.conteudo)][0];
  if (!primeiro) throw new Error('CMS sem SignerInfo');
  const si = [...filhos(primeiro.conteudo)];

  /* SignerInfo ::= SEQUENCE {
   *   version, sid, digestAlgorithm,
   *   signedAttrs [0] IMPLICIT OPTIONAL,
   *   signatureAlgorithm, signature OCTET STRING,
   *   unsignedAttrs [1] IMPLICIT OPTIONAL } */
  let k = 0;
  k++;                                              // version
  k++;                                              // sid
  const digestAlgNo = si[k++];
  const digestAlg = OIDS[oidTexto([...filhos(digestAlgNo.conteudo)][0].conteudo)] ?? 'sha256';

  let signedAttrs = null;
  if (si[k] && si[k].classe === 2 && si[k].tag === 0) signedAttrs = si[k++];

  const sigAlgNo = si[k++];
  const sigAlg = oidTexto([...filhos(sigAlgNo.conteudo)][0].conteudo);
  const assinatura = Buffer.from(si[k++].conteudo);

  let unsignedAttrs = null;
  if (si[k] && si[k].classe === 2 && si[k].tag === 1) unsignedAttrs = si[k];

  const atributos = new Map();
  if (signedAttrs) {
    for (const attr of filhos(signedAttrs.conteudo)) {
      const p = [...filhos(attr.conteudo)];
      atributos.set(oidTexto(p[0].conteudo), p[1]);
    }
  }

  /* PEGADINHA CLÁSSICA DO CMS: para verificar, os signedAttrs são
   * reserializados como SET (tag 0x31), e não com o [0] IMPLICIT (0xA0) que
   * aparece no arquivo. Assinar/conferir os bytes como estão no PDF dá sempre
   * inválido — e a mensagem de erro não diz por quê. */
  let paraVerificar = null;
  if (signedAttrs) {
    const copia = Buffer.from(signedAttrs.bruto);
    copia[0] = 0x31;
    paraVerificar = copia;
  }

  let carimbo = false;
  if (unsignedAttrs) {
    for (const attr of filhos(unsignedAttrs.conteudo)) {
      if (OIDS[oidTexto([...filhos(attr.conteudo)][0].conteudo)] === 'signatureTimeStampToken') carimbo = true;
    }
  }

  return { certificados, atributos, paraVerificar, assinatura, digestAlg, sigAlg, carimbo };
}

/** Converte a data do PDF (D:AAAAMMDDHHMMSS±HH'mm') em instante real. */
function instanteDe(digitos, fuso) {
  const base = `${digitos.slice(0, 4)}-${digitos.slice(4, 6)}-${digitos.slice(6, 8)}T` +
    `${digitos.slice(8, 10)}:${digitos.slice(10, 12)}:${digitos.slice(12, 14)}`;
  if (!fuso || fuso === 'Z') return new Date(`${base}Z`);
  const sinal = fuso[0];
  const hh = fuso.slice(1, 3), mm = fuso.replace(/'/g, '').slice(3, 5) || '00';
  return new Date(`${base}${sinal}${hh}:${mm}`);
}

/* ─────────────────────────── verificação ───────────────────────────────── */

/**
 * @param {Buffer} pdf
 * @param {object} [o]
 * @param {string[]} [o.ancoras]  certificados PEM em que confiamos
 * @returns {object} laudo
 */
export function verificarPdf(pdf, o = {}) {
  const laudo = {
    assinado: false, integro: false, cobreTudo: false, confiavel: false,
    padrao: null, signatario: null, emissor: null, numeroSerie: null,
    validoDe: null, validoAte: null, validoNaAssinatura: null,
    algoritmo: null, carimbo: false, motivo: null, quando: null,
    assinaturas: 0,
    sha256: createHash('sha256').update(pdf).digest('hex'),
    detalhe: '', problemas: [],
  };

  let achadas;
  try { achadas = acharAssinaturas(pdf); }
  catch { achadas = []; }

  if (!achadas.length) {
    laudo.detalhe = 'Este arquivo não contém assinatura digital.';
    return laudo;
  }

  laudo.assinado = true;
  laudo.assinaturas = achadas.length;

  /* A que interessa é a ÚLTIMA: numa cadeia de atualizações incrementais, é
   * ela que cobre o arquivo como ele está agora. */
  const sig = achadas[achadas.length - 1];
  const [a, b, c, d] = sig.faixa;
  laudo.padrao = sig.subFilter;
  laudo.motivo = sig.motivo;
  const instante = sig.quando ? instanteDe(sig.quando[0], sig.quando[1]) : null;
  laudo.quando = sig.quando
    ? `${sig.quando[0].slice(6, 8)}/${sig.quando[0].slice(4, 6)}/${sig.quando[0].slice(0, 4)} ${sig.quando[0].slice(8, 10)}:${sig.quando[0].slice(10, 12)}`
    : null;

  /* COBERTURA. Se a faixa assinada não vai do byte 0 ao fim do arquivo, alguém
   * acrescentou conteúdo depois de assinado. A assinatura continua "conferindo"
   * para a parte antiga — e é assim que se mostra um documento adulterado com
   * selo verde. */
  laudo.cobreTudo = a === 0 && c > b && c + d === pdf.length;
  if (!laudo.cobreTudo) {
    laudo.problemas.push(`A assinatura não cobre o arquivo inteiro: ${pdf.length - (c + d)} byte(s) fora da área assinada.`);
  }

  let cms;
  try { cms = decodificarCms(sig.cms); }
  catch (e) {
    laudo.detalhe = `A estrutura da assinatura não pôde ser lida: ${e.message}`;
    return laudo;
  }
  laudo.carimbo = cms.carimbo;

  /* INTEGRIDADE, em dois degraus.
   * 1) o resumo do conteúdo bate com o atributo messageDigest assinado?
   * 2) a assinatura RSA sobre os atributos confere com a chave do signatário? */
  const resumo = createHash(cms.digestAlg).update(sig.assinados).digest();
  const attrDigest = [...cms.atributos.entries()]
    .find(([oid]) => OIDS[oid] === 'messageDigest')?.[1];

  if (!attrDigest) {
    laudo.detalhe = 'Assinatura sem o atributo messageDigest — fora do padrão CAdES/PAdES.';
    return laudo;
  }
  const declarado = [...filhos(attrDigest.conteudo)][0].conteudo;
  if (!resumo.equals(Buffer.from(declarado))) {
    laudo.detalhe = 'DOCUMENTO ADULTERADO: o conteúdo do arquivo não corresponde ao que foi assinado.';
    laudo.problemas.push('O resumo criptográfico do conteúdo difere do resumo registrado na assinatura.');
    return laudo;
  }

  if (!cms.certificados.length) {
    laudo.detalhe = 'A assinatura não traz o certificado do signatário.';
    return laudo;
  }

  /* O certificado do SIGNATÁRIO é o que a chave pública verifica — não o
   * primeiro do pacote, que costuma ser a autoridade certificadora. Exibir a AC
   * como signatário seria erro grave numa página de autenticidade. */
  let signatario = null;
  for (const der of cms.certificados) {
    try {
      const cert = new X509Certificate(der);
      const ok = createVerify('sha256')
        .update(cms.paraVerificar)
        .verify(cert.publicKey, cms.assinatura);
      if (ok) { signatario = cert; break; }
    } catch { /* certificado ilegível: tenta o próximo */ }
  }

  if (!signatario) {
    laudo.detalhe = 'A assinatura não confere com nenhum dos certificados embutidos no documento.';
    return laudo;
  }

  laudo.integro = true;
  const nomeComum = (dn) => /(?:^|,\s*)CN=([^,]+)/.exec(dn ?? '')?.[1]?.trim() ?? dn ?? null;
  laudo.signatario = nomeComum(signatario.subject.replace(/\n/g, ', '));
  laudo.emissor = nomeComum(signatario.issuer.replace(/\n/g, ', '));
  laudo.numeroSerie = signatario.serialNumber;
  laudo.validoDe = signatario.validFrom;
  laudo.validoAte = signatario.validTo;
  laudo.algoritmo = `${cms.digestAlg.toUpperCase().replace('SHA', 'SHA-')} com ${signatario.publicKey.asymmetricKeyType?.toUpperCase() ?? 'RSA'}`;

  /* O certificado estava válido NA DATA DA ASSINATURA? É a pergunta certa —
   * certificado vencido hoje não invalida o que se assinou quando ele valia. */
  if (instante) {
    laudo.validoNaAssinatura = instante >= new Date(signatario.validFrom) && instante <= new Date(signatario.validTo);
    if (laudo.validoNaAssinatura === false) {
      laudo.problemas.push('O certificado não estava válido na data em que a assinatura foi aplicada.');
    }
  }

  /* CONFIANÇA: a cadeia sobe até uma âncora conhecida?
   * Separada da integridade de propósito — ver o cabeçalho deste arquivo. */
  if (o.ancoras?.length) {
    for (const pem of o.ancoras) {
      try {
        const ancora = new X509Certificate(pem);
        if (signatario.verify(ancora.publicKey) || signatario.fingerprint256 === ancora.fingerprint256) {
          laudo.confiavel = true; break;
        }
      } catch { /* âncora ilegível */ }
    }
    if (!laudo.confiavel) {
      laudo.problemas.push('O certificado do signatário não foi emitido por nenhuma das autoridades reconhecidas por este portal. Isso não significa que o documento seja falso — significa que este portal não consegue atestar a cadeia. Confira no validador oficial do Governo Federal.');
    }
  }

  laudo.detalhe = laudo.cobreTudo
    ? 'Documento íntegro: o conteúdo confere exatamente com o que foi assinado, e a assinatura cobre o arquivo inteiro.'
    : 'A assinatura confere com a parte que ela cobre, mas há conteúdo acrescentado DEPOIS da assinatura. Trate o documento como adulterado.';
  return laudo;
}
