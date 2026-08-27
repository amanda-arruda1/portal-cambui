/**
 * Identificação do formato REAL do arquivo, pelo conteúdo.
 *
 * O nome e o Content-Type vêm do navegador, ou seja, de quem envia — não são
 * prova de nada. Um `.pdf` pode ser um script; um `.png` pode ser um HTML que
 * o navegador do cidadão renderiza a partir do domínio oficial do município.
 * Aqui o arquivo é julgado só pelos primeiros bytes.
 *
 * Implementação própria, sem file-type/mmmagic: precisamos de pouquíssimos
 * formatos (os da política) e de mensagens em português; uma dependência
 * nativa a mais no processo que recebe upload da internet não se paga.
 */

/** Assinaturas de formatos que ACEITAMOS. */
const ASSINATURAS: Array<{ formato: string; bytes: number[]; deslocamento?: number }> = [
  { formato: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { formato: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { formato: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
  // ZIP: base do .docx, .xlsx, .odt e .ods. Qual deles é, decide-se depois.
  { formato: 'zip', bytes: [0x50, 0x4b, 0x03, 0x04] },
];

/**
 * Assinaturas de formatos PERIGOSOS. Não estão na política, mas são
 * reconhecidos de propósito: recusar dizendo "é um executável" é muito melhor
 * para quem está na secretaria do que "formato não reconhecido".
 */
const PERIGOSOS: Array<{ rotulo: string; bytes: number[] }> = [
  { rotulo: 'executável do Windows', bytes: [0x4d, 0x5a] }, // MZ
  { rotulo: 'executável do Linux', bytes: [0x7f, 0x45, 0x4c, 0x46] }, // ELF
  { rotulo: 'classe Java', bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { rotulo: 'script com shebang', bytes: [0x23, 0x21] }, // #!
  { rotulo: 'PostScript', bytes: [0x25, 0x21] }, // %!
  { rotulo: 'documento OLE legado (formato de macro)', bytes: [0xd0, 0xcf, 0x11, 0xe0] },
  { rotulo: 'arquivo RAR', bytes: [0x52, 0x61, 0x72, 0x21] },
  { rotulo: 'arquivo 7-Zip', bytes: [0x37, 0x7a, 0xbc, 0xaf] },
];

function comeca(dados: Uint8Array, bytes: number[], deslocamento = 0): boolean {
  if (dados.length < deslocamento + bytes.length) return false;
  return bytes.every((b, i) => dados[deslocamento + i] === b);
}

/** Texto do início do arquivo, para as checagens que precisam ler conteúdo. */
function trecho(dados: Uint8Array, quantos: number): string {
  return new TextDecoder('latin1').decode(dados.subarray(0, Math.min(quantos, dados.length)));
}

/**
 * Dentro de um ZIP, o nome de cada entrada fica em texto puro no cabeçalho
 * local, mesmo quando o conteúdo está comprimido. Dá para saber que ZIP é este
 * procurando as entradas que cada formato obrigatoriamente tem.
 */
function formatoDoZip(dados: Uint8Array): string | null {
  // O ODF grava "mimetype" como PRIMEIRA entrada e sem compressão — é o que a
  // própria especificação exige, justamente para permitir esta identificação.
  const cabeca = trecho(dados, 200);
  if (cabeca.includes('mimetype')) {
    if (cabeca.includes('opendocument.text')) return 'odt';
    if (cabeca.includes('opendocument.spreadsheet')) return 'ods';
    if (cabeca.includes('opendocument.presentation')) return 'odp'; // reconhecido, não aceito
  }

  // OOXML não tem entrada declarando o tipo; identifica-se pela peça central.
  // 64 KiB cobre o diretório inicial de qualquer .docx/.xlsx real.
  const inicio = trecho(dados, 64 * 1024);
  if (inicio.includes('word/document.xml')) return 'docx';
  if (inicio.includes('xl/workbook.xml')) return 'xlsx';
  if (inicio.includes('ppt/presentation.xml')) return 'pptx'; // reconhecido, não aceito

  return null;
}

/**
 * CSV e TXT não têm assinatura. A validação possível é negativa: precisa ser
 * texto de verdade, não binário disfarçado nem marcação que o navegador
 * renderizaria.
 */
function pareceTexto(dados: Uint8Array): boolean {
  // BOM UTF-8 é aceitável (Excel brasileiro gera assim).
  const inicio = comeca(dados, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  const amostra = dados.subarray(inicio, Math.min(inicio + 8192, dados.length));

  // Byte nulo é o sinal mais confiável de binário.
  if (amostra.includes(0x00)) return false;

  // Precisa ser UTF-8 válido: o portal serve tudo em UTF-8 e um CSV em
  // Latin-1 chegaria com acento quebrado na tabela do cidadão.
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(amostra);
  } catch {
    return false;
  }

  const texto = new TextDecoder('utf-8').decode(amostra);
  // Marcação: seria servido como texto, mas basta um proxy ou um cliente
  // desatento tratar como HTML para virar XSS no domínio oficial.
  if (/<\s*(script|iframe|svg|html|\?php)\b/i.test(texto)) return false;

  return true;
}

export interface Deteccao {
  /** Formato reconhecido pelo conteúdo, ou null. */
  formato: string | null;
  /** Preenchido quando o conteúdo é reconhecidamente perigoso. */
  perigo: string | null;
}

export function detectarFormato(dados: Uint8Array, extensao: string): Deteccao {
  for (const p of PERIGOSOS) {
    if (comeca(dados, p.bytes)) return { formato: null, perigo: p.rotulo };
  }

  // Marcação no primeiro trecho, seja qual for a extensão: é a forma clássica
  // de subir um "logo.png" que na verdade é uma página com script.
  const cabeca = trecho(dados, 1024).trimStart();
  if (/^<\s*(!doctype|html|script|svg|\?xml[^>]*>\s*<\s*svg)/i.test(cabeca)) {
    return { formato: null, perigo: 'marcação HTML/SVG' };
  }

  for (const a of ASSINATURAS) {
    if (!comeca(dados, a.bytes, a.deslocamento)) continue;
    if (a.formato !== 'zip') return { formato: a.formato, perigo: null };

    const dentro = formatoDoZip(dados);
    if (!dentro) return { formato: null, perigo: 'arquivo compactado de conteúdo indeterminado' };
    return { formato: dentro, perigo: null };
  }

  // WebP é RIFF com o rótulo no oitavo byte — não cabe na tabela simples.
  if (comeca(dados, [0x52, 0x49, 0x46, 0x46]) && comeca(dados, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { formato: 'webp', perigo: null };
  }

  // Só chega aqui o que não tem assinatura. Texto é a única possibilidade
  // legítima, e só se a extensão declarada for de texto — senão um binário
  // qualquer que comece com bytes imprimíveis passaria como CSV.
  if (extensao === '.csv' && pareceTexto(dados)) return { formato: 'csv', perigo: null };

  return { formato: null, perigo: null };
}

/**
 * Sinais de risco DENTRO de um PDF.
 *
 * Melhor esforço, e é importante dizer por quê: um PDF pode comprimir seus
 * objetos, e aí estas palavras não aparecem em texto puro. Isto não substitui
 * o ClamAV — é uma peneira barata para o caso comum, em que o gerador de PDF
 * deixa os dicionários legíveis.
 */
export function riscoNoPdf(dados: Uint8Array): string | null {
  const texto = trecho(dados, Math.min(dados.length, 2 * 1024 * 1024));

  if (/\/JavaScript\b/.test(texto) || /\/JS\s*[(<\/]/.test(texto)) {
    return 'contém JavaScript embutido';
  }
  if (/\/Launch\b/.test(texto)) {
    return 'contém ação de execução de programa (/Launch)';
  }
  if (/\/EmbeddedFile\b/.test(texto)) {
    return 'contém arquivo anexado internamente';
  }
  // /OpenAction sozinho NÃO é motivo de recusa: quase todo PDF usa para
  // definir o zoom inicial da primeira página.
  return null;
}

/**
 * Fórmula no início de um campo de CSV: a planilha de quem baixar executa.
 * É a "CSV injection" — vale para Excel, LibreOffice e Google Sheets.
 */
export function riscoNoCsv(dados: Uint8Array): string | null {
  const texto = new TextDecoder('utf-8').decode(dados.subarray(0, Math.min(dados.length, 256 * 1024)));
  const linhas = texto.split(/\r?\n/).slice(0, 500);

  for (const [i, linha] of linhas.entries()) {
    for (const campo of linha.split(/[,;\t]/)) {
      const valor = campo.trim().replace(/^"/, '');
      // '-' e '+' ficam de fora: número negativo é dado legítimo e frequente.
      if (/^[=@]/.test(valor) || /^\+[A-Za-z(]/.test(valor)) {
        return `a linha ${i + 1} tem campo iniciado por fórmula ("${valor.slice(0, 20)}")`;
      }
    }
  }
  return null;
}
