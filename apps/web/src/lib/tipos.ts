/**
 * Formato dos dados vindos do Directus.
 *
 * Estes tipos são o contrato entre o CMS e o portal. Quem alterar o esquema em
 * infra/directus/esquema.json precisa alterar aqui também — não há geração
 * automática de propósito: o esquema muda raramente e a checagem manual evita
 * que um campo removido no CMS quebre a página só em produção.
 */

/** Fluxo editorial exigido pela prefeitura. O portal só lê 'publicado'. */
export type Situacao = 'rascunho' | 'em_revisao' | 'aprovado' | 'publicado' | 'arquivado';

export interface Noticia {
  id: string;
  status: Situacao;
  titulo: string;
  slug: string;
  resumo: string | null;
  conteudo: string | null;
  imagem: string | null;
  imagem_descricao: string | null;
  data_publicacao: string;
  secretaria: { nome: string; slug: string } | null;
  destaque: boolean;
}

export interface Secretaria {
  id: string;
  status: Situacao;
  nome: string;
  slug: string;
  sigla: string | null;
  /** Termos de busca adicionais (sinônimos, siglas informais) — usados só
   *  pelo assistente de contatos, nunca exibidos numa página. */
  palavras_chave: string | null;
  descricao: string | null;
  responsavel: string | null;
  cargo_responsavel: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  horario_atendimento: string | null;
  ordem: number | null;
}

export interface Servico {
  id: string;
  status: Situacao;
  nome: string;
  slug: string;
  descricao: string | null;
  categoria: string | null;
  publico_alvo: string | null;
  /** Serviço que vive em sistema de terceiro (tributos, NF-e). */
  url_externa: string | null;
  como_solicitar: string | null;
  secretaria: { nome: string; slug: string } | null;
}

export type TipoDocumento = 'edital' | 'licitacao' | 'diario_oficial' | 'lei' | 'decreto' | 'portaria' | 'outro';

export interface Documento {
  id: string;
  status: Situacao;
  titulo: string;
  tipo: TipoDocumento;
  numero: string | null;
  data_documento: string;
  descricao: string | null;
  arquivo: string | null;
  /** Documento hospedado em sistema externo (ex.: portal da transparência). */
  url_externa: string | null;
  secretaria: { nome: string; slug: string } | null;
}

export interface Pagina {
  id: string;
  status: Situacao;
  titulo: string;
  slug: string;
  conteudo: string | null;
  atualizado_em: string | null;
}

export interface LinkUtil {
  id: string;
  status: Situacao;
  nome: string;
  url: string;
  descricao: string | null;
  grupo: string | null;
  ordem: number | null;
}

export interface Selo {
  id: string;
  status: Situacao;
  nome: string;
  orgao_emissor: string;
  descricao: string | null;
  imagem: string | null;
  data_concessao: string | null;
  url_comprovacao: string | null;
  ordem: number | null;
}

export type CategoriaPatrimonio = 'livro' | 'dossie' | 'inventario' | 'legislacao' | 'outro';

export interface DocumentoPatrimonio {
  id: string;
  status: Situacao;
  titulo: string;
  categoria: CategoriaPatrimonio;
  /** Ano ou período como aparece na fonte — ex.: "2012–2013". Texto livre, não
   *  data: metade do acervo é biênio, não um dia específico. */
  periodo: string | null;
  descricao: string | null;
  arquivo: string | null;
  url_externa: string | null;
  secretaria: { nome: string; slug: string } | null;
  ordem: number | null;
}

export interface PerguntaFrequente {
  id: string;
  status: Situacao;
  pergunta: string;
  resposta: string;
  categoria: string | null;
  secretaria: { nome: string; slug: string } | null;
  ordem: number | null;
}

export type CategoriaTelefoneUtil =
  | 'emergencias' | 'escolas_creches' | 'unidades_saude' | 'assistencia_social' | 'departamentos' | 'diversos';

export interface TelefoneUtil {
  id: string;
  status: Situacao;
  nome: string;
  categoria: CategoriaTelefoneUtil;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  ordem: number | null;
}

export interface ColetaLixo {
  id: string;
  status: Situacao;
  /** Bairro ou região. */
  nome: string;
  /** Dias da semana, texto livre como aparece na fonte — ex.: "Segunda-feira, Quarta-feira, Sexta-feira". */
  dias: string;
  /** Ex.: "A partir das 06:00 horas - Diurno". */
  horario: string;
}
