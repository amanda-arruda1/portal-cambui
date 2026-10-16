/**
 * Objetos de obra fictícios para o seed — nenhuma obra real de Cambuí.
 * `secretaria` usa o slug já cadastrado por infra/scripts/12-usuarios-demo.sh
 * (mesmas secretarias do seed de licitações).
 */
export const OBRAS = [
  { categoria: 'pavimentacao', secretaria: 'obras-e-servicos-urbanos', resumo: 'Pavimentação asfáltica da Rua das Malvas, Bairro Água Branca', faixa: [420000, 780000] },
  { categoria: 'construcao', secretaria: 'educacao', resumo: 'Construção de creche municipal no Bairro Colinas do Itaim', faixa: [1800000, 3200000] },
  { categoria: 'reforma', secretaria: 'saude', resumo: 'Reforma e ampliação da Unidade Básica de Saúde do Centro', faixa: [380000, 620000] },
  { categoria: 'drenagem', secretaria: 'obras-e-servicos-urbanos', resumo: 'Obras de drenagem pluvial e contenção de encosta no Bairro Cohab', faixa: [950000, 1400000] },
  { categoria: 'saneamento', secretaria: 'obras-e-servicos-urbanos', resumo: 'Implantação de rede de esgotamento sanitário no Bairro Bela Vista', faixa: [1200000, 2100000] },
  { categoria: 'iluminacao_publica', secretaria: 'obras-e-servicos-urbanos', resumo: 'Modernização da iluminação pública com luminárias em LED — zona rural', faixa: [310000, 540000] },
  { categoria: 'praca_area_lazer', secretaria: 'cultura-esporte-e-turismo', resumo: 'Revitalização da Praça Coronel Justiniano', faixa: [260000, 480000] },
  { categoria: 'edificacao_publica', secretaria: 'assistencia-social', resumo: 'Construção do novo Centro de Referência de Assistência Social (CRAS)', faixa: [890000, 1500000] },
  { categoria: 'ponte_viaduto', secretaria: 'obras-e-servicos-urbanos', resumo: 'Recuperação estrutural da ponte sobre o Ribeirão do Cervo', faixa: [670000, 1050000] },
  { categoria: 'pavimentacao', secretaria: 'obras-e-servicos-urbanos', resumo: 'Recapeamento asfáltico de vias no Bairro Progresso', faixa: [520000, 890000] },
];

export const EMPRESAS = [
  'Construtora Serra Azul Ltda.',
  'Engenharia e Terraplenagem Cambuí Ltda.',
  'Pavimenta MG Construções Ltda.',
  'Infra Sul Engenharia e Obras Ltda.',
  'Construtora Vale do Itaim EPP',
];

export const RESPONSAVEIS_TECNICOS = [
  'Eng. Civil Marcos Ribeiro Souza — CREA-MG 123456',
  'Eng. Civil Ana Paula Lemos — CREA-MG 234567',
  'Arq. Fernando Augusto Nogueira — CAU A98765-4',
  'Eng. Civil Renata Costa Almeida — CREA-MG 345678',
];
