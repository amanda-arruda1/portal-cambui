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
