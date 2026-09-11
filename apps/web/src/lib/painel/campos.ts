/**
 * Definição dos formulários do painel: um campo por linha, em português.
 *
 * POR QUE NÃO É GERADO A PARTIR DE esquema.json: o esquema descreve o BANCO
 * (nome, tipo, obrigatoriedade); o formulário precisa de decisões de uso —
 * rótulo que a secretaria entende, ordem de preenchimento, texto de ajuda,
 * qual campo é derivado de qual, qual widget usar. Misturar as duas coisas
 * pioraria as duas.
 *
 * O preço disso é a possibilidade de divergir. Por isso existe
 * `scripts/verificar-campos.mjs`, que compara os dois arquivos e falha se um
 * campo aparecer só de um lado. Rodar depois de mexer em qualquer um deles.
 */

import type { ColecaoEditavel } from './cms.ts';

export type TipoCampo =
  | 'texto'
  | 'texto_longo'
  | 'rico'
  | 'slug'
  | 'numero'
  | 'booleano'
  | 'data'
  | 'datahora'
  | 'url'
  | 'email'
  | 'telefone'
  | 'selecao'
  | 'arquivo'
  | 'imagem'
  | 'secretaria';

export interface Campo {
  nome: string;
  rotulo: string;
  tipo: TipoCampo;
  obrigatorio?: boolean;
  ajuda?: string;
  /** Para 'selecao'. */
  opcoes?: Array<{ valor: string; rotulo: string }>;
  /** Para 'slug': campo de onde ele é sugerido. */
  derivadoDe?: string;
  /** Sugestão de tamanho; não é validação de banco, é orientação editorial. */
  maximo?: number;
  /** Ocupa a linha inteira do formulário. */
  largura?: 'inteira' | 'metade';
}

const SECRETARIA: Campo = {
  nome: 'secretaria',
  rotulo: 'Secretaria responsável',
  tipo: 'secretaria',
  ajuda: 'Define quem pode editar este item depois.',
  largura: 'metade',
};

export const CAMPOS: Record<ColecaoEditavel, Campo[]> = {
  noticias: [
    { nome: 'titulo', rotulo: 'Título', tipo: 'texto', obrigatorio: true, maximo: 120, largura: 'inteira' },
    {
      nome: 'slug',
      rotulo: 'Endereço da página',
      tipo: 'slug',
      obrigatorio: true,
      derivadoDe: 'titulo',
      ajuda: 'Aparece na URL: /noticias/<endereço>. Sugerido a partir do título; mude só se precisar.',
      largura: 'inteira',
    },
    {
      nome: 'resumo',
      rotulo: 'Resumo',
      tipo: 'texto_longo',
      maximo: 200,
      ajuda: 'Uma ou duas frases. É o que aparece na listagem e no resultado de busca do Google.',
      largura: 'inteira',
    },
    { nome: 'conteudo', rotulo: 'Texto da notícia', tipo: 'rico', largura: 'inteira' },
    { nome: 'imagem', rotulo: 'Imagem', tipo: 'imagem', largura: 'inteira' },
    {
      nome: 'imagem_descricao',
      rotulo: 'Descrição da imagem',
      tipo: 'texto',
      maximo: 150,
      ajuda: 'Descreva a cena para quem não enxerga a imagem. Deixe vazio só se ela for puramente decorativa.',
      largura: 'inteira',
    },
    { nome: 'data_publicacao', rotulo: 'Data da notícia', tipo: 'datahora', obrigatorio: true, largura: 'metade' },
    SECRETARIA,
    { nome: 'destaque', rotulo: 'Destacar na página inicial', tipo: 'booleano', largura: 'inteira' },
  ],

  documentos: [
    { nome: 'titulo', rotulo: 'Título', tipo: 'texto', obrigatorio: true, maximo: 160, largura: 'inteira' },
    {
      nome: 'tipo',
      rotulo: 'Tipo de documento',
      tipo: 'selecao',
      obrigatorio: true,
      largura: 'metade',
      opcoes: [
        { valor: 'edital', rotulo: 'Edital' },
        { valor: 'licitacao', rotulo: 'Licitação' },
        { valor: 'diario_oficial', rotulo: 'Diário oficial' },
        { valor: 'lei', rotulo: 'Lei' },
        { valor: 'decreto', rotulo: 'Decreto' },
        { valor: 'portaria', rotulo: 'Portaria' },
        { valor: 'outro', rotulo: 'Outro' },
      ],
    },
    { nome: 'numero', rotulo: 'Número', tipo: 'texto', ajuda: 'Ex.: 04/2026', largura: 'metade' },
    { nome: 'data_documento', rotulo: 'Data do documento', tipo: 'data', obrigatorio: true, largura: 'metade' },
    SECRETARIA,
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto_longo', largura: 'inteira' },
    { nome: 'arquivo', rotulo: 'Arquivo', tipo: 'arquivo', largura: 'inteira' },
    {
      nome: 'url_externa',
      rotulo: 'Endereço externo',
      tipo: 'url',
      ajuda: 'Preencha SÓ quando o documento vive no sistema da Transparência e não será anexado aqui.',
      largura: 'inteira',
    },
  ],

  servicos: [
    { nome: 'nome', rotulo: 'Nome do serviço', tipo: 'texto', obrigatorio: true, maximo: 120, largura: 'inteira' },
    {
      nome: 'slug',
      rotulo: 'Endereço da página',
      tipo: 'slug',
      obrigatorio: true,
      derivadoDe: 'nome',
      ajuda: 'Aparece na URL do serviço.',
      largura: 'inteira',
    },
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto_longo', largura: 'inteira' },
    {
      nome: 'categoria',
      rotulo: 'Categoria',
      tipo: 'texto',
      ajuda: 'Agrupa a listagem. Ex.: Tributos, Saúde, Educação.',
      largura: 'metade',
    },
    {
      nome: 'publico_alvo',
      rotulo: 'Para quem é',
      tipo: 'texto',
      ajuda: 'Ex.: Munícipes, Empresas, Servidores.',
      largura: 'metade',
    },
    { nome: 'como_solicitar', rotulo: 'Como solicitar', tipo: 'rico', largura: 'inteira' },
    {
      nome: 'url_externa',
      rotulo: 'Endereço do sistema',
      tipo: 'url',
      ajuda: 'Quando o serviço é prestado em sistema de terceiro (emissão de nota, tributos).',
      largura: 'inteira',
    },
    SECRETARIA,
  ],

  secretarias: [
    { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, largura: 'inteira' },
    { nome: 'slug', rotulo: 'Endereço da página', tipo: 'slug', obrigatorio: true, derivadoDe: 'nome', largura: 'inteira' },
    { nome: 'sigla', rotulo: 'Sigla', tipo: 'texto', maximo: 20, largura: 'metade' },
    {
      nome: 'palavras_chave',
      rotulo: 'Palavras-chave para busca',
      tipo: 'texto',
      ajuda: 'Termos que o cidadão pode digitar e que o nome oficial não cobre. Ex.: "RH, recursos humanos, pessoal". Usado só pelo assistente de contatos do site — não aparece em nenhuma página.',
      largura: 'inteira',
    },
    { nome: 'ordem', rotulo: 'Ordem na listagem', tipo: 'numero', ajuda: 'Menor aparece primeiro. Vazio vai para o fim.', largura: 'metade' },
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'rico', largura: 'inteira' },
    { nome: 'responsavel', rotulo: 'Responsável', tipo: 'texto', largura: 'metade' },
    { nome: 'cargo_responsavel', rotulo: 'Cargo do responsável', tipo: 'texto', largura: 'metade' },
    { nome: 'endereco', rotulo: 'Endereço', tipo: 'texto', largura: 'inteira' },
    { nome: 'telefone', rotulo: 'Telefone', tipo: 'telefone', largura: 'metade' },
    { nome: 'email', rotulo: 'E-mail', tipo: 'email', largura: 'metade' },
    { nome: 'horario_atendimento', rotulo: 'Horário de atendimento', tipo: 'texto', ajuda: 'Ex.: Segunda a sexta, das 8h às 17h.', largura: 'inteira' },
  ],

  paginas: [
    { nome: 'titulo', rotulo: 'Título', tipo: 'texto', obrigatorio: true, largura: 'inteira' },
    { nome: 'slug', rotulo: 'Endereço da página', tipo: 'slug', obrigatorio: true, derivadoDe: 'titulo', largura: 'inteira' },
    { nome: 'conteudo', rotulo: 'Conteúdo', tipo: 'rico', largura: 'inteira' },
    {
      nome: 'atualizado_em',
      rotulo: 'Atualizada em',
      tipo: 'datahora',
      ajuda: 'Data mostrada ao cidadão como "última atualização". Preencha quando o texto mudar de fato.',
      largura: 'metade',
    },
  ],

  links_uteis: [
    { nome: 'nome', rotulo: 'Nome do link', tipo: 'texto', obrigatorio: true, largura: 'inteira' },
    { nome: 'url', rotulo: 'Endereço', tipo: 'url', obrigatorio: true, largura: 'inteira' },
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto_longo', largura: 'inteira' },
    { nome: 'grupo', rotulo: 'Grupo', tipo: 'texto', ajuda: 'Agrupa os links na página. Ex.: Transparência, Serviços online.', largura: 'metade' },
    { nome: 'ordem', rotulo: 'Ordem', tipo: 'numero', largura: 'metade' },
  ],
  selos: [
    { nome: 'nome', rotulo: 'Nome do selo', tipo: 'texto', obrigatorio: true, maximo: 80, largura: 'inteira', ajuda: 'Ex.: Selo Transparência Pública, Selo Educação.' },
    { nome: 'orgao_emissor', rotulo: 'Órgão emissor', tipo: 'texto', obrigatorio: true, largura: 'metade', ajuda: 'Quem concedeu o selo. Ex.: Tribunal de Contas do Estado de Minas Gerais.' },
    { nome: 'data_concessao', rotulo: 'Data da concessão', tipo: 'data', largura: 'metade' },
    { nome: 'imagem', rotulo: 'Imagem do selo', tipo: 'imagem', obrigatorio: true, largura: 'inteira', ajuda: 'A logo/emblema do selo, em fundo transparente se possível.' },
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto_longo', largura: 'inteira', ajuda: 'O que o selo reconhece, em uma ou duas frases.' },
    { nome: 'url_comprovacao', rotulo: 'Link de comprovação', tipo: 'url', largura: 'inteira', ajuda: 'Página oficial do órgão emissor ou PDF do certificado, se houver.' },
    { nome: 'ordem', rotulo: 'Ordem', tipo: 'numero', largura: 'metade' },
  ],

  perguntas_frequentes: [
    { nome: 'pergunta', rotulo: 'Pergunta', tipo: 'texto', obrigatorio: true, maximo: 200, largura: 'inteira', ajuda: 'Escreva como o cidadão perguntaria. Ex.: "Como tirar segunda via do IPTU?".' },
    { nome: 'resposta', rotulo: 'Resposta', tipo: 'rico', obrigatorio: true, largura: 'inteira' },
    {
      nome: 'categoria',
      rotulo: 'Categoria',
      tipo: 'texto',
      ajuda: 'Agrupa a listagem na página de perguntas frequentes. Ex.: Tributos, Saúde, Documentos.',
      largura: 'metade',
    },
    SECRETARIA,
    { nome: 'ordem', rotulo: 'Ordem dentro da categoria', tipo: 'numero', ajuda: 'Menor aparece primeiro. Vazio vai para o fim.', largura: 'metade' },
  ],

  patrimonio_documentos: [
    { nome: 'titulo', rotulo: 'Título', tipo: 'texto', obrigatorio: true, maximo: 160, largura: 'inteira', ajuda: 'Ex.: "Dossiê de Tombamento – Praça Coronel Justiniano".' },
    {
      nome: 'categoria',
      rotulo: 'Categoria',
      tipo: 'selecao',
      obrigatorio: true,
      largura: 'metade',
      opcoes: [
        { valor: 'livro', rotulo: 'Livro do Patrimônio' },
        { valor: 'dossie', rotulo: 'Dossiê de Tombamento' },
        { valor: 'inventario', rotulo: 'Inventário' },
        { valor: 'legislacao', rotulo: 'Legislação' },
        { valor: 'outro', rotulo: 'Outros arquivos' },
      ],
    },
    { nome: 'periodo', rotulo: 'Ano ou período', tipo: 'texto', maximo: 20, largura: 'metade', ajuda: 'Como aparece no documento. Ex.: "2012–2013" ou "2025" — não precisa ser uma data exata.' },
    SECRETARIA,
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto_longo', largura: 'inteira' },
    { nome: 'arquivo', rotulo: 'Arquivo', tipo: 'arquivo', largura: 'inteira' },
    {
      nome: 'url_externa',
      rotulo: 'Endereço externo',
      tipo: 'url',
      ajuda: 'Preencha SÓ quando o documento vive em outro sistema e não será anexado aqui.',
      largura: 'inteira',
    },
    { nome: 'ordem', rotulo: 'Ordem dentro da categoria', tipo: 'numero', ajuda: 'Menor aparece primeiro. Vazio vai para o fim.', largura: 'metade' },
  ],
};

/** Campos que guardam HTML e precisam passar pelo sanitizador na gravação. */
export function camposRicos(colecao: ColecaoEditavel): string[] {
  return CAMPOS[colecao].filter((c) => c.tipo === 'rico').map((c) => c.nome);
}

/** Campo que dá nome ao item nas listagens e no título da tela. */
export function campoRotulo(colecao: ColecaoEditavel): string {
  const nomes = CAMPOS[colecao].map((c) => c.nome);
  return ['titulo', 'nome', 'pergunta'].find((c) => nomes.includes(c)) ?? 'nome';
}

/**
 * Endereço de página a partir de um texto: minúsculas, sem acento, sem
 * pontuação, palavras ligadas por hífen. Feito aqui e não só no navegador
 * porque quem envia o formulário com JavaScript desligado também precisa de um
 * slug válido.
 */
export function gerarSlug(texto: string): string {
  return texto
    .normalize('NFD')
    // Intervalo escapado de propósito: os sinais combinantes são invisíveis
    // no editor, e um copiar-e-colar descuidado apagaria a regra sem aviso.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
