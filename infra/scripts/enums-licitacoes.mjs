/** Modalidades de licitação (valor → rótulo), usadas nos e-mails de aviso. Espelha `novo-cms-payload/src/enums`. */
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
