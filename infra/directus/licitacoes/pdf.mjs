/**
 * Gerador de PDF mínimo, escrito à mão.
 *
 * Por que não uma biblioteca: o seed precisa produzir ~150 arquivos de
 * demonstração com capa e marca d'água. PDFKit ou Puppeteer resolveriam, mas
 * custariam de 3 a 300 MB de dependência num repositório de prefeitura para
 * gerar uma página de texto. O formato PDF, para uma página com Helvetica, é
 * poucas dezenas de linhas — e sem dependência ninguém precisa manter versão.
 *
 * Limitações assumidas: uma fonte (Helvetica), uma página, sem imagem. É
 * exatamente o que um documento de demonstração precisa ser.
 */

const A4 = { largura: 595.28, altura: 841.89 };

/* PDF usa WinAnsiEncoding para as fontes base: acento português cabe, e o
 * texto vai como latin1. Parênteses e barra invertida são a sintaxe de string
 * do formato e precisam ser escapados. */
/* WinAnsiEncoding não é latin1: travessão, aspas curvas e reticências existem
 * nele, mas em bytes da faixa 0x80–0x9F que o latin1 não tem. Sem esta
 * tradução o travessão simplesmente SOME do documento — foi o que aconteceu na
 * primeira prova de impressão. */
const WINANSI = {
  '\u2014': '\x97', '\u2013': '\x96', '\u2018': '\x91', '\u2019': '\x92',
  '\u201c': '\x93', '\u201d': '\x94', '\u2026': '\x85', '\u2022': '\x95',
  '\u20ac': '\x80', '\u2122': '\x99',
};

function escapar(texto) {
  return texto
    .replace(/[\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u2022\u20ac\u2122]/g, (c) => WINANSI[c])
    .replace(/\\(?![x][0-9a-f]{2})/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/** Larguras aproximadas do Helvetica, para quebrar linha sem medir a fonte. */
function largura(texto, tamanho) {
  let l = 0;
  for (const c of texto) l += /[iljt.,;:'!|]/.test(c) ? 0.3 : /[mwMW]/.test(c) ? 0.87 : /[A-Z0-9]/.test(c) ? 0.68 : 0.52;
  return l * tamanho;
}

function quebrar(texto, tamanho, maxLargura) {
  const linhas = [];
  for (const paragrafo of texto.split('\n')) {
    let atual = '';
    for (const palavra of paragrafo.split(/\s+/)) {
      const teste = atual ? `${atual} ${palavra}` : palavra;
      if (largura(teste, tamanho) > maxLargura && atual) { linhas.push(atual); atual = palavra; }
      else atual = teste;
    }
    linhas.push(atual);
  }
  return linhas;
}

/**
 * @param {object} d
 * @param {string} d.titulo      ex.: "Pregão Eletrônico nº 032/2026"
 * @param {string} d.subtitulo   ex.: "Edital"
 * @param {string} d.objeto      texto corrido
 * @param {Array<[string,string]>} d.campos  pares rótulo/valor
 */
export function gerarPdf(d) {
  const margem = 56;
  const util = A4.largura - margem * 2;
  const conteudo = [];

  const texto = (t, x, y, tamanho, cinza = 0) =>
    conteudo.push(`BT /F1 ${tamanho} Tf ${cinza} g ${x} ${y} Td (${escapar(t)}) Tj ET`);

  let y = A4.altura - margem;

  // Faixa institucional
  conteudo.push(`0.047 0.329 0.188 rg ${margem} ${y - 6} ${util} 4 re f`);
  y -= 34;
  texto('PREFEITURA MUNICIPAL DE CAMBUÍ — MINAS GERAIS', margem, y, 10, 0.3);
  y -= 16;
  texto('Praça Coronel Justiniano, 164 — Centro — CEP 37600-000', margem, y, 9, 0.45);

  y -= 46;
  texto(d.subtitulo.toUpperCase(), margem, y, 11, 0.45);
  y -= 26;
  for (const linha of quebrar(d.titulo, 20, util)) { texto(linha, margem, y, 20); y -= 25; }

  y -= 14;
  conteudo.push(`0.66 0.19 0.24 RG 1.5 w ${margem} ${y} m ${margem + util} ${y} l S`);
  y -= 30;

  for (const [rotulo, valor] of d.campos ?? []) {
    texto(rotulo.toUpperCase(), margem, y, 8, 0.45);
    y -= 14;
    for (const linha of quebrar(String(valor), 11, util)) { texto(linha, margem, y, 11); y -= 15; }
    y -= 10;
  }

  y -= 6;
  texto('OBJETO', margem, y, 8, 0.45);
  y -= 16;
  for (const linha of quebrar(d.objeto, 11, util)) {
    if (y < 150) break;
    texto(linha, margem, y, 11);
    y -= 16;
  }

  // Rodapé: a nota legal que protege a Prefeitura
  texto('A divulgação oficial desta contratação ocorre no PNCP e no veículo oficial do Município.', margem, 110, 8, 0.45);
  texto('Em caso de divergência, prevalece o edital publicado oficialmente.', margem, 98, 8, 0.45);

  // Marca d'água diagonal — a exigência do briefing
  const marca = 'DOCUMENTO FICTÍCIO — AMBIENTE DE DEMONSTRAÇÃO';
  conteudo.push(
    `q 0.86 0.86 0.86 rg BT /F1 22 Tf 0.7071 0.7071 -0.7071 0.7071 ${margem + 10} 150 Tm (${escapar(marca)}) Tj ET Q`,
  );

  const fluxo = conteudo.join('\n');

  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.largura} ${A4.altura}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(fluxo, 'latin1')} >>\nstream\n${fluxo}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const posicoes = [];
  objetos.forEach((corpo, i) => {
    posicoes.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${corpo}\nendobj\n`;
  });
  const inicioXref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const p of posicoes) pdf += `${String(p).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}
