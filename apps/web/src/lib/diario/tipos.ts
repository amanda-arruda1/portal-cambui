/** Tipos do Órgão Oficial. Espelham o esquema em infra/directus/diario. */

export interface Veiculo {
  nome_veiculo: string;
  nome_curto: string | null;
  ente: string;
  cnpj: string | null;
  lei_numero: string | null;
  lei_data: string | null;
  lei_link: string | null;
  lei_ementa: string | null;
  inicio_circulacao: string | null;
  veiculo_anterior: string | null;
  periodicidade: string;
  dias_circulacao: number[] | null;
  horario_fechamento: string | null;
  regra_prazo: 'primeiro_dia_util_seguinte' | 'mesmo_dia' | 'dia_seguinte_corrido';
  responsavel_publicacao: string | null;
  expediente: Array<{ cargo: string; nome: string }> | null;
  endereco: string | null;
  telefone: string | null;
  email_contato: string | null;
  ano_volume_inicial: number | null;
  nota_legal: string | null;
}

export interface Caderno {
  id: string; slug: string; nome: string; ordem: number;
  descricao: string | null; dados_pessoais: boolean; indexavel: boolean;
}

export interface Edicao {
  id: string;
  numero: number; ano: number; volume: number | null;
  tipo: 'ordinaria' | 'extraordinaria' | 'suplementar';
  situacao: string;
  data_disponibilizacao: string;
  data_publicacao_legal: string;
  justificativa_extraordinaria: string | null;
  total_paginas: number | null;
  arquivo_pdf: string | null;
  sha256: string | null;
  codigo_verificador: string | null;
  assinatura_signatario: string | null;
  assinatura_documento: string | null;
  assinatura_emissor: string | null;
  assinatura_em: string | null;
  assinatura_algoritmo: string | null;
  assinatura_carimbo: boolean;
  anulada: boolean;
  anulada_motivo: string | null;
  anulada_justificativa: string | null;
  anulada_em: string | null;
  anulada_por_edicao: string | null;
  importada_acervo: boolean;
  fonte_acervo: string | null;
  demonstracao: boolean;
}

export interface Materia {
  id: string;
  edicao: string | null;
  caderno: string | null;
  secretaria: { nome: string; slug: string } | null;
  orgao_texto: string | null;
  ordem: number | null;
  pagina_inicial: number | null;
  pagina_final: number | null;
  tipo_ato: string;
  numero_ato: string | null;
  ano_ato: number | null;
  ementa: string;
  corpo: string | null;
  slug: string;
  situacao: string;
  processo_administrativo: string | null;
  licitacao: string | null;
  vigencia_inicio: string | null;
  retifica: string | null;
  republica: string | null;
  revoga: string | null;
  motivo_republicacao: string | null;
  demonstracao: boolean;
}

/** Matéria já cruzada com edição e caderno — é o que as páginas usam. */
export interface MateriaCompleta extends Materia {
  edicaoObj: Edicao | null;
  cadernoObj: Caderno | null;
  orgao: string;
  titulo: string;
  /** Texto puro do corpo, para busca e para o resumo. */
  texto: string;
}
