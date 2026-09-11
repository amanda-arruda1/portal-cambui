/**
 * Busca tolerante e resolução de resposta do assistente de contatos.
 *
 * Mesmo algoritmo de `lib/licitacoes.ts` (sem acento, sinônimo, distância de
 * edição ≤1 para palavra de 5+ letras) — não reinventado, portado. A
 * diferença é que este arquivo NÃO importa nada de servidor (`directus.ts`,
 * `process.env`): roda no navegador, filtrando a lista que o componente já
 * trouxe pronta do CMS na renderização da página.
 *
 * `responderContato()` é o ponto de entrada do lado "cérebro" do assistente
 * — devolve um `RespostaAssistente` tipado, não HTML nem texto pronto. Quem
 * desenha o balão de chat (`scripts/assistente-contatos.ts`) só lê o `tipo`
 * e monta a mensagem; não sabe nada sobre o algoritmo de busca em si. Essa
 * fronteira existe de propósito, para o dia em que o assistente precisar
 * responder outro tipo de pergunta sem virar um componente reescrito do zero.
 */

export interface RegistroContato {
  id: string;
  titulo: string;
  subtitulo: string | null;
  telefone: string | null;
  email: string | null;
  horario: string | null;
  /** Link para a página da secretaria, quando existe. */
  destino: string | null;
  palavrasChave: string | null;
}

export const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Sinônimo do cidadão → termo que aparece no nome oficial da secretaria.
 *
 * Só entram aqui equivalências genéricas e bem estabelecidas (RH é sempre
 * Administração, em qualquer prefeitura do Brasil). O que for específico da
 * estrutura REAL de Cambuí — por exemplo, qual secretaria cuida de compras —
 * não está aqui porque não é conhecido; o campo "Palavras-chave para busca"
 * de cada secretaria no painel é o lugar certo para isso, e não exige
 * mexer em código.
 */
export const SINONIMOS: Record<string, string[]> = {
  rh: ['administracao'],
  pessoal: ['administracao'],
  financas: ['administracao'],
  fazenda: ['administracao'],
  tributos: ['administracao'],
  iptu: ['administracao'],
  hospital: ['saude'],
  posto: ['saude'],
  vacina: ['saude'],
  clinica: ['saude'],
  escola: ['educacao'],
  creche: ['educacao'],
  matricula: ['educacao'],
  cras: ['assistencia'],
  bolsa: ['assistencia'],
  vulnerabilidade: ['assistencia'],
  transito: ['obras'],
  buraco: ['obras'],
  iluminacao: ['obras'],
  pavimentacao: ['obras'],
  meioambiente: ['ambiente'],
  agricultor: ['agricultura'],
  esportes: ['esporte'],
  evento: ['cultura'],
  prefeitura: ['geral', 'sede', 'gabinete'],
  gabinete: ['geral'],
};

/**
 * Palavras que a pergunta em linguagem natural carrega mas que nunca vão
 * aparecer no nome de uma secretaria — "telefone", "departamento", "qual".
 * Sem descartá-las, a exigência de casar TODA palavra digitada reprovava
 * "Qual o telefone do Departamento de Obras?" inteira por causa de
 * "telefone" e "departamento" sozinhos, mesmo com "obras" batendo em cheio.
 * Medido com os exemplos do próprio pedido antes de existir esta lista:
 * 6 das 9 perguntas de teste voltavam vazias.
 */
const DESCARTAVEIS = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos',
  'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'com', 'sem', 'sobre', 'e', 'ou',
  'que', 'qual', 'quais', 'quem', 'como', 'onde', 'quando', 'sao',
  'telefone', 'telefones', 'fone', 'ramal', 'whatsapp', 'zap',
  'contato', 'contatos', 'email', 'emails', 'numero', 'numeros', 'endereco', 'horario',
  'falar', 'ligar', 'ligo', 'quero', 'gostaria', 'preciso', 'saber',
  'ache', 'achar', 'encontrar', 'encontro', 'buscar', 'busca', 'procurar', 'procuro', 'pesquisar',
  'departamento', 'departamentos', 'secretaria', 'secretarias', 'setor', 'setores', 'area', 'orgao',
  // Achadas testando o assistente com o dado real de telefones úteis
  // (2026-09-11): "onde FICA a secretaria de educação" reprovava a pergunta
  // inteira porque "fica" não bate em nada — mesmo raciocínio de "telefone"/
  // "departamento" acima.
  'fica', 'ficam', 'fico', 'localiza', 'localizado', 'localizada', 'situado', 'situada',
]);

/** Distância de Levenshtein com teto — só tolera erro de digitação em
 *  palavra de 5+ letras, para não casar "sim" com metade da lista. */
function proximo(a: string, b: string, teto = 1): boolean {
  if (Math.abs(a.length - b.length) > teto) return false;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    anterior = atual;
  }
  return anterior[b.length] <= teto;
}

function textoBuscavel(r: RegistroContato): string {
  return semAcento([r.titulo, r.subtitulo, r.palavrasChave].filter(Boolean).join(' '));
}

// Separador é qualquer coisa que não seja letra/número — não só espaço.
// "RH?" sem isso nunca batia com "rh": o "?" colado virava parte da palavra
// e nem o sinônimo nem a tolerância a erro alcançavam.
function palavrasSignificativas(termo: string): string[] {
  const limpo = semAcento(termo).trim();
  if (!limpo) return [];
  const todas = limpo.split(/[^a-z0-9]+/).filter((p) => p.length >= 2);
  return todas.filter((p) => !DESCARTAVEIS.has(p));
}

function bateComPalavra(alvo: string, p: string): boolean {
  const variantes = [p, ...(SINONIMOS[p] ?? [])];
  if (variantes.some((v) => alvo.includes(v))) return true;
  if (p.length < 5) return false;
  return alvo.split(/[^a-z0-9]+/).some((t) => t.length >= 5 && proximo(p, t));
}

export function buscarContatos(lista: RegistroContato[], termo: string): RegistroContato[] {
  const palavras = palavrasSignificativas(termo);
  // Pergunta era só preenchimento ("qual o telefone", sem nome nenhum) —
  // não há o que exigir, então devolve a lista toda em vez de "nada". Quem
  // decide se isso é uma resposta ÚTIL de verdade é responderContato() —
  // aqui embaixo, "sem palavra" e "achou tudo" são o mesmo resultado de
  // propósito: dado bruto, sem interpretar a intenção da pergunta.
  if (palavras.length === 0) return lista;
  return lista.filter((r) => palavras.every((p) => bateComPalavra(textoBuscavel(r), p)));
}

/**
 * Correspondências próximas, para o "você quis dizer?" — OU entre as
 * palavras (pontua, não exige todas), ordenado pela pontuação. Não é
 * buscarContatos() com o critério afrouxado: é outro modo de busca,
 * pensado para sugerir, não para achar com certeza.
 */
export function sugerirProximos(lista: RegistroContato[], termo: string, limite = 3): RegistroContato[] {
  const palavras = palavrasSignificativas(termo);
  if (palavras.length === 0) return [];

  const pontuados = lista
    .map((r) => {
      const alvo = textoBuscavel(r);
      const pontos = palavras.reduce((soma, p) => soma + (bateComPalavra(alvo, p) ? 1 : 0), 0);
      return { registro: r, pontos };
    })
    .filter((x) => x.pontos > 0);

  pontuados.sort((a, b) => b.pontos - a.pontos);
  return pontuados.slice(0, limite).map((x) => x.registro);
}

/**
 * Resolvedor de resposta do assistente — a peça pensada para crescer.
 *
 * Hoje só sabe responder "telefone de secretaria X" (`tipo: 'contato'`).
 * Quando o pedido for "o assistente também responde outras dúvidas do
 * portal", a ideia é ESTA função ganhar um primeiro passo que reconhece
 * outros tipos de pergunta e devolve outro `tipo` de resposta — o
 * componente e o script que desenham o chat não precisam saber nada sobre
 * secretaria, só sobre os `tipo`s de RespostaAssistente que existirem.
 */
export type RespostaAssistente =
  | { tipo: 'contato'; registros: RegistroContato[]; truncado: boolean }
  | { tipo: 'sugestoes'; sugestoes: RegistroContato[] }
  | { tipo: 'vazio' }
  | { tipo: 'nao-encontrado' };

const MAX_CONTATOS_NA_RESPOSTA = 4;

export function responderContato(lista: RegistroContato[], pergunta: string): RespostaAssistente {
  const palavras = palavrasSignificativas(pergunta);
  if (palavras.length === 0) return { tipo: 'vazio' };

  const encontrados = buscarContatos(lista, pergunta);
  if (encontrados.length > 0) {
    return {
      tipo: 'contato',
      registros: encontrados.slice(0, MAX_CONTATOS_NA_RESPOSTA),
      truncado: encontrados.length > MAX_CONTATOS_NA_RESPOSTA,
    };
  }

  const sugestoes = sugerirProximos(lista, pergunta, 3);
  if (sugestoes.length > 0) return { tipo: 'sugestoes', sugestoes };

  return { tipo: 'nao-encontrado' };
}
