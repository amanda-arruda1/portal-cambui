/**
 * O que é de Cambuí, e só de Cambuí.
 *
 * Este arquivo carrega a metade "específica" da tese do DESIGN.md: as tarefas
 * que o cidadão daqui realmente faz, os bairros que ele reconhece e os sistemas
 * onde essas tarefas acontecem de verdade. Tudo levantado na auditoria do
 * portal atual em 27/08/2026 — nada inventado.
 *
 * Se este arquivo fosse transplantado para outro município, quase nada
 * sobreviveria. É esse o teste.
 */

export interface Tarefa {
  /** Verbo primeiro, na língua do cidadão. Nunca o nome do sistema. */
  rotulo: string;
  /** O que a pessoa vai encontrar do outro lado — evita clique às cegas. */
  detalhe: string;
  destino: string;
  /** Sai do portal para um sistema de terceiro. */
  externo?: boolean;
}

/**
 * As seis tarefas do topo. Ordem definida pelo que um portal de município deste
 * porte recebe de procura, com o IPTU em primeiro por ser sazonal e volumoso.
 *
 * TODO(cliente): confirmar com o setor de tributos o link direto da emissão da
 * guia de IPTU. Hoje aponta para a raiz dos serviços de tributos do SGP Cloud,
 * que é onde o portal atual leva — um clique a mais do que o ideal.
 */
export const TAREFAS: Tarefa[] = [
  {
    rotulo: 'Pagar meu IPTU',
    detalhe: 'Emitir a guia e a segunda via, no sistema de tributos',
    destino: 'https://nfe.sgpcloud.net:9070/servicosweb',
    externo: true,
  },
  {
    rotulo: 'Ver o dia da coleta no meu bairro',
    detalhe: 'Calendário de lixo comum e de recicláveis',
    destino: '/servicos#coleta',
  },
  {
    rotulo: 'Marcar consulta na unidade de saúde',
    detalhe: 'Unidades, horários e o que levar',
    destino: '/servicos?necessidade=saude',
  },
  {
    rotulo: 'Abrir empresa, alvará ou habite-se',
    detalhe: 'Serviços digitais de licenciamento',
    destino: 'https://cambui.aprova.com.br/',
    externo: true,
  },
  {
    rotulo: 'Ver licitações e editais',
    detalhe: 'Contratações públicas do município',
    destino: '/documentos',
  },
  {
    rotulo: 'Falar com a Ouvidoria',
    detalhe: 'Reclamação, denúncia, sugestão e pedido de informação',
    destino: 'http://cambui.eouve.com.br/',
    externo: true,
  },
];

/**
 * Bairros e distritos, na grafia do próprio município — colhidos da página de
 * coleta de lixo do portal atual.
 *
 * TODO(cliente): a lista está incompleta (o portal atual pagina) e os dias são
 * PLACEHOLDER. Substituir pelo calendário real da Secretaria de Obras antes de
 * publicar. Enquanto `dias` estiver vazio, o componente diz que o calendário
 * está em atualização em vez de mostrar dia errado.
 */
export interface Bairro {
  nome: string;
  /** Vazio = ainda não confirmado; a interface diz isso em vez de inventar. */
  dias: string[];
}

export const BAIRROS: Bairro[] = [
  { nome: 'Centro', dias: [] },
  { nome: 'Água Branca', dias: [] },
  { nome: 'Água Comprida', dias: [] },
  { nome: 'Bela Vista', dias: [] },
  { nome: 'Braço das Antas', dias: [] },
  { nome: 'Cambuí Velho', dias: [] },
  { nome: 'Canguava', dias: [] },
  { nome: 'Cohab', dias: [] },
  { nome: 'Colinas do Itaim', dias: [] },
  { nome: 'Collen', dias: [] },
];

/**
 * Catálogo por NECESSIDADE, não por secretaria.
 *
 * É a inversão que o briefing pede: o cidadão não sabe (nem deveria precisar
 * saber) qual secretaria cuida do quê. Ele sabe o que precisa.
 */
export interface Necessidade {
  chave: string;
  titulo: string;
  /** Frase que reconhece a situação da pessoa, não o organograma. */
  chamada: string;
  tarefas: Tarefa[];
}

export const NECESSIDADES: Necessidade[] = [
  {
    chave: 'casa',
    titulo: 'Minha casa e meu bairro',
    chamada: 'Imposto, coleta, iluminação, buraco na rua, poda de árvore.',
    tarefas: [
      { rotulo: 'Pagar meu IPTU', detalhe: 'Guia e segunda via', destino: 'https://nfe.sgpcloud.net:9070/servicosweb', externo: true },
      { rotulo: 'Ver o dia da coleta no meu bairro', detalhe: 'Calendário por bairro', destino: '/servicos#coleta' },
      { rotulo: 'Pedir poda ou remoção de árvore', detalhe: 'Passa por vistoria antes da autorização', destino: '/servicos' },
      { rotulo: 'Comunicar buraco, lâmpada apagada ou entulho', detalhe: 'Pela Ouvidoria, com número de protocolo', destino: 'http://cambui.eouve.com.br/', externo: true },
      { rotulo: 'Segunda via da conta de água', detalhe: 'No SAAE, autarquia municipal', destino: 'https://saaecambui.mg.gov.br/', externo: true },
    ],
  },
  {
    chave: 'saude',
    titulo: 'Saúde',
    chamada: 'Consulta, vacina, remédio, unidade mais próxima.',
    tarefas: [
      { rotulo: 'Marcar consulta na unidade de saúde', detalhe: 'Na unidade de referência do seu bairro', destino: '/secretarias' },
      { rotulo: 'Ver horários de vacinação', detalhe: 'Calendário das unidades básicas', destino: '/noticias' },
    ],
  },
  {
    chave: 'educacao',
    titulo: 'Educação',
    chamada: 'Matrícula, transporte escolar, creche, calendário.',
    tarefas: [
      { rotulo: 'Matricular na rede municipal', detalhe: 'Na escola mais próxima da residência', destino: '/secretarias' },
      { rotulo: 'Consultar o calendário escolar', detalhe: 'Publicado por decreto', destino: '/documentos' },
    ],
  },
  {
    chave: 'trabalho',
    titulo: 'Trabalho e empresa',
    chamada: 'Abrir empresa, emitir nota, alvará, concursos.',
    tarefas: [
      { rotulo: 'Abrir empresa, alvará ou habite-se', detalhe: 'Serviços digitais de licenciamento', destino: 'https://cambui.aprova.com.br/', externo: true },
      { rotulo: 'Emitir nota fiscal de serviço', detalhe: 'Sistema de NFS-e do município', destino: 'https://nfe.sgpcloud.net:9070/issweb/paginas/login', externo: true },
      { rotulo: 'Ver concursos e processos seletivos', detalhe: 'Editais abertos e encerrados', destino: '/documentos' },
    ],
  },
  {
    chave: 'documentos',
    titulo: 'Documentos e protocolos',
    chamada: 'Acompanhar pedido, achar uma lei, ler o Diário Oficial.',
    tarefas: [
      { rotulo: 'Acompanhar meu protocolo', detalhe: 'Consulta pelo número do processo', destino: 'https://protocolo.sgpcloud.net:9056/sseweb/sseweb.dll', externo: true },
      { rotulo: 'Ler o Diário Oficial', detalhe: 'Plataforma da AMM-MG', destino: 'https://www.diariomunicipal.com.br/amm-mg/', externo: true },
      { rotulo: 'Procurar uma lei municipal', detalhe: 'Leis, decretos e códigos', destino: 'https://leismunicipais.com.br/prefeitura/mg/cambui', externo: true },
    ],
  },
  {
    chave: 'transparencia',
    titulo: 'Transparência e acesso à informação',
    chamada: 'Ver como o dinheiro é gasto e pedir informação à Prefeitura.',
    tarefas: [
      { rotulo: 'Ver receitas, despesas e contratos', detalhe: 'Portal da Transparência do município', destino: 'https://portal.sgpcloud.net:9121/transparencia/', externo: true },
      { rotulo: 'Pedir uma informação (e-SIC)', detalhe: 'Lei de Acesso à Informação, com prazo de resposta', destino: 'http://cambui.eouve.com.br/', externo: true },
      { rotulo: 'Ver licitações e contratações', detalhe: 'Portal Nacional de Contratações Públicas', destino: 'https://pncp.gov.br/app/editais?q=objeto&pagina=1&municipios=2359&status=todos', externo: true },
    ],
  },
];

/**
 * A cidade, para quem chega.
 *
 * TODO(cliente): fotos reais da serra, das malharias e do centro. Sem elas, a
 * seção usa apenas tipografia e o motivo do tricô — que é honesto, e melhor do
 * que foto de banco de imagens.
 */
export const A_CIDADE = {
  chamada: 'Malha, serra e inverno',
  texto:
    'Cambuí fica a mais de mil metros de altitude, na Serra da Mantiqueira, na divisa de Minas com São Paulo. É cidade de estrada — a BR-459 corta o município e a Fernão Dias passa ao lado —, de inverno de verdade e de malharia: o comércio de confecção traz visitantes de toda a região o ano inteiro.',
  portalTuristico: 'https://cambuitur.com.br/',
} as const;
