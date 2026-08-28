/**
 * Enums do domínio de licitações — a fonte da verdade, compartilhada pelo
 * esquema do CMS, pelo seed, pelo painel e pelas páginas públicas.
 *
 * MODALIDADE É DADO, NÃO PÁGINA. O filtro público por modalidade e as rotas
 * /licitacoes/modalidade/<slug> saem daqui; nenhuma seção é escrita à mão.
 * Acrescentar uma modalidade nova é acrescentar uma linha neste arquivo.
 *
 * Os códigos do PNCP ficam ao lado do nosso valor porque é por eles que a
 * importação assistida traduz a resposta da API.
 */

export const MODALIDADES = [
  { valor: 'pregao_eletronico',   rotulo: 'Pregão Eletrônico',        pncp: 6,  prazoMinimoDias: 8  },
  { valor: 'pregao_presencial',   rotulo: 'Pregão Presencial',        pncp: 7,  prazoMinimoDias: 8  },
  { valor: 'concorrencia',        rotulo: 'Concorrência',             pncp: 4,  prazoMinimoDias: 35 },
  { valor: 'concurso',            rotulo: 'Concurso',                 pncp: 3,  prazoMinimoDias: 35 },
  { valor: 'leilao',              rotulo: 'Leilão',                   pncp: 1,  prazoMinimoDias: 15 },
  { valor: 'dialogo_competitivo', rotulo: 'Diálogo Competitivo',      pncp: 2,  prazoMinimoDias: 25 },
  { valor: 'dispensa',            rotulo: 'Dispensa de Licitação',    pncp: 8,  prazoMinimoDias: 3  },
  { valor: 'dispensa_eletronica', rotulo: 'Dispensa Eletrônica',      pncp: 8,  prazoMinimoDias: 3  },
  { valor: 'inexigibilidade',     rotulo: 'Inexigibilidade',          pncp: 9,  prazoMinimoDias: 0  },
  { valor: 'chamamento_publico',  rotulo: 'Chamamento Público',       pncp: 10, prazoMinimoDias: 15 },
  { valor: 'credenciamento',      rotulo: 'Credenciamento',           pncp: 12, prazoMinimoDias: 15 },
  { valor: 'pre_qualificacao',    rotulo: 'Pré-qualificação',         pncp: 11, prazoMinimoDias: 15 },
  { valor: 'adesao_ata',          rotulo: 'Adesão a Ata de Registro de Preços', pncp: null, prazoMinimoDias: 0 },
  { valor: 'cotacao_eletronica',  rotulo: 'Cotação Eletrônica',       pncp: null, prazoMinimoDias: 3 },
];

export const CRITERIOS = [
  { valor: 'menor_preco',             rotulo: 'Menor preço' },
  { valor: 'maior_desconto',          rotulo: 'Maior desconto' },
  { valor: 'melhor_tecnica',          rotulo: 'Melhor técnica ou conteúdo artístico' },
  { valor: 'tecnica_e_preco',         rotulo: 'Técnica e preço' },
  { valor: 'maior_lance',             rotulo: 'Maior lance' },
  { valor: 'maior_retorno_economico', rotulo: 'Maior retorno econômico' },
];

export const MODOS_DISPUTA = [
  { valor: 'aberto',          rotulo: 'Aberto' },
  { valor: 'fechado',         rotulo: 'Fechado' },
  { valor: 'aberto_fechado',  rotulo: 'Aberto e fechado' },
  { valor: 'fechado_aberto',  rotulo: 'Fechado e aberto' },
  { valor: 'nao_se_aplica',   rotulo: 'Não se aplica' },
];

/**
 * Ciclo de vida. Separado do campo `status` do CMS de propósito: `status`
 * (rascunho/publicado/arquivado) governa a VISIBILIDADE e é o que a política
 * pública do Directus filtra em todas as coleções do portal; `situacao`
 * governa o ESTADO DO PROCESSO. Misturar os dois obrigaria a uma permissão
 * especial só para licitações — e permissão especial é onde vaza rascunho.
 */
export const SITUACOES = [
  { valor: 'publicada',     rotulo: 'Publicada',          tom: 'aviso',   aberta: false },
  { valor: 'aberta',        rotulo: 'Recebendo propostas', tom: 'ok',     aberta: true  },
  { valor: 'em_sessao',     rotulo: 'Em sessão pública',  tom: 'ok',      aberta: true  },
  { valor: 'em_julgamento', rotulo: 'Em julgamento',      tom: 'aviso',   aberta: false },
  { valor: 'homologada',    rotulo: 'Homologada',         tom: 'neutro',  aberta: false },
  { valor: 'adjudicada',    rotulo: 'Adjudicada',         tom: 'neutro',  aberta: false },
  { valor: 'contratada',    rotulo: 'Contratada',         tom: 'neutro',  aberta: false },
  { valor: 'suspensa',      rotulo: 'SUSPENSA',           tom: 'alerta',  aberta: false },
  { valor: 'retificada',    rotulo: 'Retificada',         tom: 'alerta',  aberta: true  },
  { valor: 'revogada',      rotulo: 'Revogada',           tom: 'alerta',  aberta: false },
  { valor: 'anulada',       rotulo: 'Anulada',            tom: 'alerta',  aberta: false },
  { valor: 'fracassada',    rotulo: 'Fracassada',         tom: 'neutro',  aberta: false },
  { valor: 'deserta',       rotulo: 'Deserta',            tom: 'neutro',  aberta: false },
];

export const TIPOS_ANEXO = [
  { valor: 'edital',                 rotulo: 'Edital',                    ordem: 1 },
  { valor: 'anexo_do_edital',        rotulo: 'Anexo do edital',           ordem: 2 },
  { valor: 'termo_de_referencia',    rotulo: 'Termo de referência',       ordem: 3 },
  { valor: 'planilha',               rotulo: 'Planilha',                  ordem: 4 },
  { valor: 'minuta_de_contrato',     rotulo: 'Minuta de contrato',        ordem: 5 },
  { valor: 'retificacao',            rotulo: 'Retificação',               ordem: 6 },
  { valor: 'errata',                 rotulo: 'Errata',                    ordem: 7 },
  { valor: 'impugnacao',             rotulo: 'Impugnação',                ordem: 8 },
  { valor: 'resposta_a_impugnacao',  rotulo: 'Resposta à impugnação',     ordem: 9 },
  { valor: 'esclarecimento',         rotulo: 'Esclarecimento',            ordem: 10 },
  { valor: 'ata_da_sessao',          rotulo: 'Ata da sessão',             ordem: 11 },
  { valor: 'resultado_do_julgamento', rotulo: 'Resultado do julgamento',  ordem: 12 },
  { valor: 'mapa_de_lances',         rotulo: 'Mapa de lances',            ordem: 13 },
  { valor: 'homologacao',            rotulo: 'Homologação',               ordem: 14 },
  { valor: 'contrato',               rotulo: 'Contrato',                  ordem: 15 },
  { valor: 'ata_de_registro_de_precos', rotulo: 'Ata de registro de preços', ordem: 16 },
];

export const TIPOS_EVENTO = [
  { valor: 'publicacao',   rotulo: 'Edital publicado' },
  { valor: 'retificacao',  rotulo: 'Retificação' },
  { valor: 'suspensao',    rotulo: 'Suspensão' },
  { valor: 'impugnacao',   rotulo: 'Impugnação recebida' },
  { valor: 'esclarecimento', rotulo: 'Esclarecimento' },
  { valor: 'sessao',       rotulo: 'Sessão pública' },
  { valor: 'resultado',    rotulo: 'Resultado do julgamento' },
  { valor: 'homologacao',  rotulo: 'Homologação' },
  { valor: 'adjudicacao',  rotulo: 'Adjudicação' },
  { valor: 'contratacao',  rotulo: 'Contratação' },
  { valor: 'revogacao',    rotulo: 'Revogação' },
  { valor: 'anulacao',     rotulo: 'Anulação' },
];

export const SITUACOES_LOTE = [
  { valor: 'em_disputa',  rotulo: 'Em disputa' },
  { valor: 'homologado',  rotulo: 'Homologado' },
  { valor: 'fracassado',  rotulo: 'Fracassado' },
  { valor: 'deserto',     rotulo: 'Deserto' },
  { valor: 'cancelado',   rotulo: 'Cancelado' },
];

/** Ajuda quem lê: converte o valor guardado no rótulo que vai à tela. */
export const rotuloDe = (lista, valor) => lista.find((i) => i.valor === valor)?.rotulo ?? valor;

/** Slug de URL a partir do valor do enum: pregao_eletronico → pregao-eletronico */
export const paraSlug = (valor) => valor.replace(/_/g, '-');
export const deSlug = (slug) => slug.replace(/-/g, '_');
