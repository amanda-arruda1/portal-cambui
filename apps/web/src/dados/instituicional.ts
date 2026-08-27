/**
 * Dados institucionais do município.
 *
 * ATENÇÃO — REGRA DO PROJETO: nada de dado fictício. Os campos abaixo que
 * estão `null` são os que a prefeitura ainda não forneceu (CNPJ, endereço,
 * telefones, horário de atendimento, e-mails, redes sociais). Os componentes
 * verificam cada campo e simplesmente OMITEM o que for nulo — nenhum
 * "(11) 0000-0000" de exemplo vai ao ar.
 *
 * Quando a informação chegar, preencher aqui e o rodapé/contato passam a
 * exibi-la sozinhos. Este é o único lugar a editar.
 */

export interface Endereco {
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
}

export const MUNICIPIO = {
  nome: 'Cambuí',
  uf: 'MG',
  nomeCompleto: 'Prefeitura Municipal de Cambuí',
  gentilico: 'cambuiense',
} as const;

export const SITE = {
  titulo: 'Prefeitura de Cambuí',
  descricao:
    'Portal oficial da Prefeitura Municipal de Cambuí, Minas Gerais. Notícias, serviços ao cidadão, secretarias e documentos oficiais.',
  urlPublica: process.env.PUBLIC_SITE_URL || 'https://www.prefeituradecambui.mg.gov.br',
} as const;

/** PENDENTE: fornecido pela prefeitura. */
export const CNPJ: string | null = null;

/** PENDENTE: fornecido pela prefeitura. */
export const ENDERECO: Endereco | null = null;

/** PENDENTE: fornecido pela prefeitura. Lista vazia = seção não aparece. */
export const TELEFONES: Array<{ rotulo: string; numero: string }> = [];

/** PENDENTE: fornecido pela prefeitura. */
export const EMAIL_CONTATO: string | null = null;

/** PENDENTE: fornecido pela prefeitura. Ex.: "Segunda a sexta, das 8h às 17h". */
export const HORARIO_ATENDIMENTO: string | null = null;

/** PENDENTE: perfis oficiais confirmados pela prefeitura. */
export const REDES_SOCIAIS: Array<{ nome: string; url: string }> = [];

/**
 * Sistemas de terceiros (Transparência, Diário Oficial, e-SIC/Ouvidoria).
 * DECISÃO DE PROJETO: o portal NÃO reconstrói a Transparência — ela é
 * obrigação legal atendida por sistema contábil homologado. Aqui só entram os
 * links, em destaque. PENDENTE: URLs a confirmar com a prefeitura.
 */
export const SISTEMAS_EXTERNOS: Array<{ nome: string; url: string; descricao: string }> = [];

/** Há informação de contato suficiente para montar a seção? */
export const TEM_CONTATO =
  ENDERECO !== null || TELEFONES.length > 0 || EMAIL_CONTATO !== null || HORARIO_ATENDIMENTO !== null;
