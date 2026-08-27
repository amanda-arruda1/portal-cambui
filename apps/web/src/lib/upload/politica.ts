/**
 * Política de upload do portal — o que a prefeitura aceita receber.
 *
 * Esta é uma LISTA DE PERMISSÃO: o que não está aqui é recusado. O inverso
 * (lista de bloqueio) é indefensável — basta uma extensão nova para furar.
 *
 * O que ficou DE FORA e por quê:
 *   .svg  — é XML; aceita <script> e vira XSS armazenado servido do domínio
 *           oficial do município. Se precisar de vetor, converter para PNG.
 *   .zip/.rar/.7z — recipiente de conteúdo arbitrário. O ClamAV até olha
 *           dentro, mas o cidadão baixaria um pacote que ninguém revisou.
 *   .doc/.xls/.ppt (OLE legado) — formato de macro. O equivalente moderno
 *           (.docx/.xlsx) é ZIP e não carrega macro sem ser .docm/.xlsm.
 *   .docm/.xlsm/.pptm — macro explícita.
 *   .html/.htm/.js/.exe/.bat/.sh/.jar — executável ou script, sem exceção.
 *
 * Quem quiser mexer nesta lista precisa entender que cada entrada nova é uma
 * superfície de ataque no domínio .gov.br do município.
 */

export interface TipoAceito {
  /** Identificador do formato real, devolvido por assinatura.ts. */
  formato: string;
  /** Extensões que podem carregar este formato (minúsculas, com ponto). */
  extensoes: string[];
  /** MIME types que o navegador pode declarar para este formato. */
  mimes: string[];
  /** Teto em bytes. Por tipo, não global: um PDF de edital é legitimamente
   *  grande; um PNG de 25 MB é quase sempre foto sem tratamento. */
  tamanhoMaximo: number;
  rotulo: string;
}

const MiB = 1024 * 1024;

export const TIPOS_ACEITOS: TipoAceito[] = [
  {
    formato: 'pdf',
    extensoes: ['.pdf'],
    mimes: ['application/pdf'],
    tamanhoMaximo: 25 * MiB,
    rotulo: 'PDF',
  },
  {
    formato: 'png',
    extensoes: ['.png'],
    mimes: ['image/png'],
    tamanhoMaximo: 8 * MiB,
    rotulo: 'imagem PNG',
  },
  {
    formato: 'jpeg',
    extensoes: ['.jpg', '.jpeg'],
    mimes: ['image/jpeg'],
    tamanhoMaximo: 8 * MiB,
    rotulo: 'imagem JPEG',
  },
  {
    formato: 'webp',
    extensoes: ['.webp'],
    mimes: ['image/webp'],
    tamanhoMaximo: 8 * MiB,
    rotulo: 'imagem WebP',
  },
  {
    formato: 'docx',
    extensoes: ['.docx'],
    mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    tamanhoMaximo: 15 * MiB,
    rotulo: 'documento Word (.docx)',
  },
  {
    formato: 'xlsx',
    extensoes: ['.xlsx'],
    mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    tamanhoMaximo: 15 * MiB,
    rotulo: 'planilha Excel (.xlsx)',
  },
  {
    formato: 'odt',
    extensoes: ['.odt'],
    mimes: ['application/vnd.oasis.opendocument.text'],
    tamanhoMaximo: 15 * MiB,
    rotulo: 'documento OpenDocument (.odt)',
  },
  {
    formato: 'ods',
    extensoes: ['.ods'],
    mimes: ['application/vnd.oasis.opendocument.spreadsheet'],
    tamanhoMaximo: 15 * MiB,
    rotulo: 'planilha OpenDocument (.ods)',
  },
  {
    formato: 'csv',
    extensoes: ['.csv'],
    mimes: ['text/csv', 'application/csv', 'text/plain'],
    tamanhoMaximo: 15 * MiB,
    rotulo: 'dados abertos (.csv)',
  },
];

/** Maior teto da tabela — usado para recusar cedo, antes de ler o corpo todo,
 *  e para dimensionar o client_max_body_size do Nginx. */
export const TAMANHO_MAXIMO_ABSOLUTO = Math.max(...TIPOS_ACEITOS.map((t) => t.tamanhoMaximo));

/** Nenhum arquivo vazio: quase sempre é upload interrompido, e o ClamAV
 *  devolve OK para zero byte — passaria batido. */
export const TAMANHO_MINIMO = 1;

export function extensaoDe(nome: string): string {
  const ponto = nome.lastIndexOf('.');
  if (ponto <= 0 || ponto === nome.length - 1) return '';
  const extensao = nome.slice(ponto);
  // "arquivo.pdf/algo" não tem extensão .pdf/algo — é um caminho. Sem esta
  // guarda o separador entraria no nome final.
  if (/[\\/]/.test(extensao)) return '';
  return extensao.toLowerCase();
}

export function tipoPorExtensao(extensao: string): TipoAceito | null {
  return TIPOS_ACEITOS.find((t) => t.extensoes.includes(extensao)) ?? null;
}

export function tipoPorFormato(formato: string): TipoAceito | null {
  return TIPOS_ACEITOS.find((t) => t.formato === formato) ?? null;
}

/**
 * Nome de arquivo seguro para gravar e para servir.
 *
 * O Directus guarda o arquivo com UUID e mantém o nome original só como
 * rótulo, mas esse rótulo aparece no Content-Disposition do download — nome
 * com aspas, CR/LF ou barra vira injeção de cabeçalho. Aqui ele é reduzido ao
 * que é seguro em qualquer contexto.
 *
 * Também mata o truque da dupla extensão ("edital.pdf.exe" e o clássico
 * "edital.exe.pdf" com RTLO invertendo a leitura na tela): só a última
 * extensão sobrevive, e ela é conferida contra o conteúdo real.
 *
 * ORDEM IMPORTA: a extensão sai do nome INTEIRO antes de qualquer corte de
 * caminho. Fazendo o contrário, "arquivo\"; rm -rf /.pdf" era quebrado na
 * barra, sobrava ".pdf", o corte de ponto inicial comia o ponto e o resultado
 * era o nome "pdf" — o arquivo perdia a identidade inteira.
 */
export function sanitizarNome(nomeBruto: string): string {
  const extensao = extensaoDe(nomeBruto);
  const semExtensao = extensao ? nomeBruto.slice(0, -extensao.length) : nomeBruto;

  // Navegador atual manda só o nome; o caminho completo é herança do IE. Se
  // vier, o arquivo é o último trecho NÃO VAZIO — "pasta/arquivo/" não deve
  // resolver para string vazia.
  const trechos = semExtensao.split(/[\\/]/).filter((t) => t.trim() !== '');
  const base = trechos.length ? trechos[trechos.length - 1] : semExtensao;

  const limpo = base
    .normalize('NFC')
    // Marcas de direção de texto: invisíveis, servem só para disfarçar a
    // extensão real na listagem.
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    // Controle, aspas, separadores de caminho e o que quebra cabeçalho HTTP.
    .replace(/[\u0000-\u001f\u007f"\'`;:*?<>|\\/]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Ponto inicial esconderia o arquivo; ponto final confunde o Windows.
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .trim();

  const nome = (limpo || 'arquivo').slice(0, 120).trim();
  return nome + extensao;
}
