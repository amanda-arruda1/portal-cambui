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

/**
 * TODO(cliente): CNPJ da Prefeitura Municipal de Cambuí. É o único dado de
 * identificação institucional que a auditoria do portal atual não expôs.
 */
export const CNPJ: string | null = null;

/** Fornecido pela prefeitura no briefing de redesign. */
export const ENDERECO: Endereco | null = {
  logradouro: 'Praça Coronel Justiniano',
  numero: '164',
  bairro: 'Centro',
  cidade: 'Cambuí',
  uf: 'MG',
  cep: '37600-000',
};

export const TELEFONES: Array<{ rotulo: string; numero: string }> = [
  { rotulo: 'Prefeitura', numero: '(35) 3431-1666' },
];

/** TODO(cliente): e-mail institucional de contato ao cidadão. */
export const EMAIL_CONTATO: string | null = null;

/** TODO(cliente): confirmar o horário. Este é o praticado pela maioria das
 *  secretarias segundo o portal atual. */
export const HORARIO_ATENDIMENTO: string | null = 'Segunda a sexta, das 8h às 17h';

/** TODO(cliente): confirmar os perfis oficiais. O portal atual aponta para
 *  Instagram, Facebook e YouTube, mas sem URL canônica legível. */
export const REDES_SOCIAIS: Array<{ nome: string; url: string }> = [];

/**
 * Sistemas de terceiros já em uso pelo município, levantados na auditoria do
 * portal atual em 27/08/2026.
 *
 * DECISÃO DE PROJETO: o portal NÃO reconstrói a Transparência nem os serviços
 * de tributos — são obrigações legais atendidas por sistemas homologados
 * (SGP Cloud, e-Ouve, Aprova). Aqui só entram os links, em destaque e com
 * linguagem de cidadão.
 */
export const SISTEMAS_EXTERNOS: Array<{ nome: string; url: string; descricao: string }> = [
  {
    nome: 'Portal da Transparência',
    url: 'https://portal.sgpcloud.net:9121/transparencia/',
    descricao: 'Receitas, despesas, contratos, servidores e diárias.',
  },
  {
    nome: 'Diário Oficial do Município',
    url: 'https://www.diariomunicipal.com.br/amm-mg/',
    descricao: 'Publicações oficiais, na plataforma da AMM-MG.',
  },
  {
    nome: 'Legislação municipal',
    url: 'https://leismunicipais.com.br/prefeitura/mg/cambui',
    descricao: 'Leis, decretos e códigos do município.',
  },
  {
    nome: 'Contratações públicas (PNCP)',
    url: 'https://pncp.gov.br/app/editais?q=objeto&pagina=1&municipios=2359&status=todos',
    descricao: 'Editais e contratos no portal nacional.',
  },
  {
    nome: 'Fiscalizando com o TCE',
    url: 'https://fiscalizandocomtce.tce.mg.gov.br/#/public/dashboard',
    descricao: 'Painel do Tribunal de Contas de Minas Gerais.',
  },
];

/** Autarquias com portal próprio. */
export const AUTARQUIAS: Array<{ nome: string; sigla: string; url: string; descricao: string }> = [
  { nome: 'Serviço Autônomo de Água e Esgoto', sigla: 'SAAE', url: 'https://saaecambui.mg.gov.br/', descricao: 'Água, esgoto e segunda via de conta.' },
  { nome: 'Fundação de Amparo e Pesquisa', sigla: 'FAPEM', url: 'https://fapem.mg.gov.br/', descricao: 'Ensino superior no município.' },
];

/** Há dados de atendimento suficientes para montar o bloco de contato? */
export const TEM_CONTATO =
  ENDERECO !== null || TELEFONES.length > 0 || EMAIL_CONTATO !== null || HORARIO_ATENDIMENTO !== null;
