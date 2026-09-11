/**
 * Enums do domínio de obras públicas — fonte da verdade, compartilhada pelo
 * esquema do CMS, pelo seed, pelo painel e pelas páginas públicas.
 *
 * Os campos cobertos aqui (categoria, situação, fonte de recurso, tipo de
 * documento) seguem o que o TCE-MG e a Lei 14.133/2021 pedem que o portal de
 * transparência de obras públicas exponha: o que é, quem executa, com que
 * dinheiro, em que fase e desde quando. Ver `infra/directus/obras/aplicar-
 * esquema.mjs` para o restante dos campos (valores, datas, ART/RRT).
 */

export const CATEGORIAS = [
  { valor: 'pavimentacao', rotulo: 'Pavimentação' },
  { valor: 'construcao', rotulo: 'Construção' },
  { valor: 'reforma', rotulo: 'Reforma e ampliação' },
  { valor: 'drenagem', rotulo: 'Drenagem e contenção' },
  { valor: 'saneamento', rotulo: 'Saneamento básico' },
  { valor: 'iluminacao_publica', rotulo: 'Iluminação pública' },
  { valor: 'praca_area_lazer', rotulo: 'Praça e área de lazer' },
  { valor: 'edificacao_publica', rotulo: 'Edificação pública' },
  { valor: 'ponte_viaduto', rotulo: 'Ponte e viaduto' },
  { valor: 'outra', rotulo: 'Outra' },
];

/**
 * Situação da obra. `tom` decide a cor da etiqueta — 'alerta' é reservado a
 * PARALISADA, porque é o estado que os órgãos de controle mais fiscalizam
 * (obra paralisada com recurso público empenhado é achado clássico de
 * auditoria) e o que mais importa o cidadão saber de imediato.
 */
export const SITUACOES = [
  { valor: 'planejada', rotulo: 'Planejada', tom: 'neutro', emAndamento: false },
  { valor: 'em_licitacao', rotulo: 'Em licitação', tom: 'aviso', emAndamento: false },
  { valor: 'nao_iniciada', rotulo: 'Contratada — não iniciada', tom: 'aviso', emAndamento: false },
  { valor: 'em_execucao', rotulo: 'Em execução', tom: 'ok', emAndamento: true },
  { valor: 'paralisada', rotulo: 'Paralisada', tom: 'alerta', emAndamento: true },
  { valor: 'concluida', rotulo: 'Concluída', tom: 'neutro', emAndamento: false },
  { valor: 'cancelada', rotulo: 'Cancelada', tom: 'alerta', emAndamento: false },
];

/** Origem do dinheiro. Convênio estadual/federal exige número do convênio —
 *  é o dado que mais aparece em prestação de contas a órgão repassador. */
export const FONTES_RECURSO = [
  { valor: 'municipal', rotulo: 'Recursos próprios do município', exigeConvenio: false },
  { valor: 'estadual', rotulo: 'Convênio estadual', exigeConvenio: true },
  { valor: 'federal', rotulo: 'Convênio federal', exigeConvenio: true },
  { valor: 'financiamento', rotulo: 'Financiamento ou empréstimo', exigeConvenio: false },
  { valor: 'misto', rotulo: 'Recursos combinados', exigeConvenio: false },
];

export const TIPOS_ANEXO = [
  { valor: 'projeto_basico', rotulo: 'Projeto básico', ordem: 1 },
  { valor: 'projeto_executivo', rotulo: 'Projeto executivo', ordem: 2 },
  { valor: 'art_rrt', rotulo: 'ART/RRT do responsável técnico', ordem: 3 },
  { valor: 'edital_licitacao', rotulo: 'Edital da licitação', ordem: 4 },
  { valor: 'contrato', rotulo: 'Contrato', ordem: 5 },
  { valor: 'aditivo', rotulo: 'Termo aditivo', ordem: 6 },
  { valor: 'ordem_servico', rotulo: 'Ordem de serviço', ordem: 7 },
  { valor: 'relatorio_fiscalizacao', rotulo: 'Relatório de fiscalização', ordem: 8 },
  { valor: 'foto', rotulo: 'Foto do andamento', ordem: 9 },
  { valor: 'outro', rotulo: 'Outro documento', ordem: 10 },
];

export const rotuloDe = (lista, valor) => lista.find((i) => i.valor === valor)?.rotulo ?? valor;
