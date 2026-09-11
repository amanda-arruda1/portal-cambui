/**
 * Acervo real do Patrimônio Cultural, migrado do site antigo em 2026-09-03.
 *
 * Título e período são o texto exatamente como aparecia no site antigo (não o
 * nome do arquivo, que diverge em alguns casos). `url` é de onde baixar;
 * `urlExterna`, quando presente, substitui o download — o documento continua
 * hospedado em outro sistema.
 *
 * NÃO inclui "Apresentação": a página antiga não tinha texto ali (conferido
 * por leitura direta, não é falha de captura) — falta alguém da Secretaria de
 * Cultura e Turismo escrever um texto real. Ver portal-cambui-pendencias na
 * memória do projeto.
 */

const ARQUIVOS = 'https://www.prefeituradecambui.mg.gov.br/patrimonio/arquivos_patrimonio';
const UPLOADS = 'https://www.prefeituradecambui.mg.gov.br/wp-content/uploads';

export const DOCUMENTOS = [
  // ---- Livros do Patrimônio ----
  { categoria: 'livro', titulo: 'Livro do Patrimônio', periodo: '2006–2007', url: `${ARQUIVOS}/livros_do_patrimonio/livro_do_patrimonio_2006_2007.pdf` },
  { categoria: 'livro', titulo: 'Livro do Patrimônio', periodo: '2007–2008', url: `${ARQUIVOS}/livros_do_patrimonio/livro_do_patrimonio_2007_2008.pdf` },
  { categoria: 'livro', titulo: 'Livro do Patrimônio', periodo: '2008–2009', url: `${ARQUIVOS}/livros_do_patrimonio/livro_do_patrimonio_2008_2009.pdf` },
  { categoria: 'livro', titulo: 'Livro do Patrimônio', periodo: '2009–2010', url: `${ARQUIVOS}/livros_do_patrimonio/livro_do_patrimonio_cambu%ed_2009_2010.pdf` },

  // ---- Dossiês de Tombamento ----
  { categoria: 'dossie', titulo: 'Dossiê de Tombamento – Praça Coronel Justiniano', periodo: '2012–2013', url: `${ARQUIVOS}/dossies_bens_tombados/Dossie_de_tombamento_praca_coronel_justiniano_2012_2013.pdf` },
  { categoria: 'dossie', titulo: 'Dossiê de Tombamento – Conjunto Paisagístico Matinha Municipal', periodo: '2012–2013', url: `${ARQUIVOS}/dossies_bens_tombados/Dossie_de_tombamento_%20do_conj_paisagistico_matinha_municipal_2012_2013.pdf` },
  { categoria: 'dossie', titulo: 'Dossiê de Tombamento – Edificação Rua João Moreira Salles, nº 37', periodo: '2012–2013', url: `${ARQUIVOS}/dossies_bens_tombados/Dossie_de_tombamento_%20da_edificacao_r_joao_moreira_37_2012_2013.pdf` },
  { categoria: 'dossie', titulo: 'Dossiê de Tombamento – Imagem de Nossa Senhora do Carmo', periodo: '2008', url: `${ARQUIVOS}/dossies_bens_tombados/dossie_tombamento_imagem_de_nossa_senhora_do_carmo_2008.pdf` },
  { categoria: 'dossie', titulo: 'Dossiê de Tombamento – Imagem de Nossa Senhora do Carmo', periodo: '2009', url: `${ARQUIVOS}/dossies_bens_tombados/dossie_tombamento_imagem_de_nossa_senhora_do_carmo_2009.pdf` },
  { categoria: 'dossie', titulo: 'Dossiê de Tombamento – Matinha Municipal', periodo: '2008', url: `${ARQUIVOS}/dossies_bens_tombados/dossie_tombamento_matinha_municipaL_2008.pdf` },
  { categoria: 'dossie', titulo: 'Dossiê de Tombamento – Matinha Municipal', periodo: '2009', url: `${ARQUIVOS}/dossies_bens_tombados/dossie_tombamento_matinha_municipaL_2009.pdf` },
  { categoria: 'dossie', titulo: 'Dossiê de Tombamento – Matinha Municipal', periodo: '2010', url: `${ARQUIVOS}/dossies_bens_tombados/dossie_tombamento_da_matinha_municipal_2010.pdf` },
  { categoria: 'dossie', titulo: 'Dossiê de Tombamento – Mercado Municipal', periodo: null, url: `${ARQUIVOS}/dossies_bens_tombados/dossie_tombamento_mercado_municipal.pdf` },

  // ---- Inventários ----
  { categoria: 'inventario', titulo: 'Divulgação Inventário', periodo: '2025', urlExterna: 'https://ecrie.com.br/sistema/conteudos/arquivo/a_254_0_1_03122025162551.pdf' },
  { categoria: 'inventario', titulo: 'Divulgação Inventário', periodo: '2024', url: `${UPLOADS}/2024/12/CBU-DIVULGACAO-2024.pdf` },
  { categoria: 'inventario', titulo: 'Divulgação Inventário', periodo: '2022', url: `${UPLOADS}/2022/12/CBU-EX-2024-DIVULGACAO.pdf` },
  { categoria: 'inventario', titulo: 'Divulgação Inventário', periodo: '2021', url: `${UPLOADS}/2021/12/CBU_AT-2023_DIVULGACAO.pdf` },
  { categoria: 'inventario', titulo: 'Divulgação Inventário', periodo: '2020', url: `${UPLOADS}/2020/12/Patrimonio_2020.pdf` },
  { categoria: 'inventario', titulo: 'Divulgação Inventário', periodo: '2019', url: `${UPLOADS}/2019/12/CBU_AT-20201_DIVULGACAO.pdf` },
  { categoria: 'inventario', titulo: 'Divulgação Inventário', periodo: '2018', url: `${UPLOADS}/2018/12/CBU_AT-2020_DIVULGACAO.pdf` },
  { categoria: 'inventario', titulo: 'Quadro II Inventário Patrimônio Atualização', periodo: '2012–2013', url: `${ARQUIVOS}/inventarios/quadroII_inventario_patrimonio_atualizacao_2012_2013.pdf` },
  { categoria: 'inventario', titulo: 'Inventário Proteção Acervo Cultural e Estruturas Arquitetônicas e Urbanísticas', periodo: '2008', url: `${ARQUIVOS}/inventarios/inventario_protecao_acervo_cultural_estruturas_arquitetonicas_e_urbanisticas_2008.pdf` },
  { categoria: 'inventario', titulo: 'Inventário Proteção Acervo Cultural', periodo: '2007', url: `${ARQUIVOS}/inventarios/inventario_protecao_acervo_cultural_2007.pdf` },

  // ---- Legislação Municipal ----
  { categoria: 'legislacao', titulo: 'Lei Ordinária – Normas de Proteção ao Patrimônio Cultural em Cambuí', periodo: null, url: `${ARQUIVOS}/leis/leiordinaria_2160_normas_protecaoaopatrimonio_%20cultural_em_cambui.pdf` },
  { categoria: 'legislacao', titulo: 'Lei Ordinária – Institui o Fundo do Patrimônio Cultural e Histórico em Cambuí', periodo: null, url: `${ARQUIVOS}/leis/leiordinaria_2161_institui_fundo-patrimonio_cultural_historico_em_cambui.pdf` },

  // ---- Outros Arquivos ----
  { categoria: 'outro', titulo: 'Decreto 139/2019 – Morro do Cruzeiro', periodo: '2019', url: `${UPLOADS}/2019/12/Decreto-139_2019-Morro-do-Cruzeiro.pdf` },
  { categoria: 'outro', titulo: 'Decreto 138/2019 – Clube Literário e Recreativo de Cambuí', periodo: '2019', url: `${UPLOADS}/2019/12/Decreto-138_2019-Clube-Literario-e-Recreativo-de-Cambui.pdf` },
  { categoria: 'outro', titulo: 'Decreto 134/2019 – Imagem de Nossa Senhora da Conceição', periodo: '2019', url: `${UPLOADS}/2019/12/Decreto-134-2018-Tombamento-da-imagem-nossa-senhora-da-conceicao.pdf` },
  { categoria: 'outro', titulo: 'Relatório de Investimentos Patrimônio', periodo: '2012–2013', url: `${ARQUIVOS}/outros_documentos_bens_tombados/relatorio_de_%20investimentos_patrimonio_2012_2013_cambui.pdf` },
  { categoria: 'outro', titulo: 'Quadro III Complemento Dossiê Matinha Municipal', periodo: '2012–2013', url: `${ARQUIVOS}/outros_documentos_bens_tombados/quadroIII_complemento_dossie_matinha_2012_2013.pdf` },
  { categoria: 'outro', titulo: 'Quadro III Complemento Dossiê Imóveis (Rua João Moreira Salles)', periodo: '2012–2013', url: `${ARQUIVOS}/outros_documentos_bens_tombados/quadroIII_complemento_dossie_imoveis_r_joao_moreira_2012_2013.pdf` },
  { categoria: 'outro', titulo: 'Planejamento Patrimônio Cultural Local', periodo: '2012–2013', url: `${ARQUIVOS}/outros_documentos_bens_tombados/planejamento_patrimonio_cultural_local_2012_2013_cambui.pdf` },
  { categoria: 'outro', titulo: 'Laudo de Conservação Patrimonial', periodo: '2012–2013', url: `${ARQUIVOS}/outros_documentos_bens_tombados/laudos_de_conservacao_patrimonio_2012_2013.pdf` },
  { categoria: 'outro', titulo: 'Educação Patrimonial – Projeto Educar', periodo: '2012–2013', url: `${ARQUIVOS}/outros_documentos_bens_tombados/educacao_patrimonial_projeto_educar_2012_2013.pdf` },
  { categoria: 'outro', titulo: 'Fichas do Acervo Cultural', periodo: '2009', url: `${ARQUIVOS}/outros_documentos_bens_tombados/fichas_do%20acervo_cultural_2009.pdf` },
  { categoria: 'outro', titulo: 'Laudo de Bens Tombados do Mercado Municipal', periodo: '2009', url: `${ARQUIVOS}/outros_documentos_bens_tombados/laudos_bens_tombados_mercado_municipal_2009.pdf` },
  { categoria: 'outro', titulo: 'Laudos do Inventário Patrimônio de Cambuí', periodo: '2010', url: `${ARQUIVOS}/outros_documentos_bens_tombados/laudos_inventario_patrimonio_cambui_exercicio_2010.pdf` },
];

/** Só "Contato Patrimônio" — real, texto do site antigo. "Apresentação" fica
 *  de fora de propósito: não havia texto lá para migrar. */
export const PAGINAS = [
  {
    slug: 'patrimonio-cultural-contato',
    titulo: 'Contato Patrimônio',
    conteudo:
      '<p><strong>Conselho do Patrimônio Histórico e Cultural de Cambuí</strong></p>' +
      '<p>Praça Coronel Justiniano, 164 – Centro – Cambuí/MG</p>' +
      '<p>E-mail: <a href="mailto:patrimonio@cambui.mg.gov.br">patrimonio@cambui.mg.gov.br</a></p>',
  },
];
