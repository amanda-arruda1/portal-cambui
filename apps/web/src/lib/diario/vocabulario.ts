/**
 * Espelho tipado dos enums de infra/directus/diario/enums.mjs.
 *
 * Por que não importar o .mjs direto: o painel e a área pública precisam de
 * autocompletar e de erro em tempo de compilação nos rótulos. Para não virarem
 * duas verdades, `npm run check` roda apps/web/scripts/verificar-vocabulario.mjs,
 * que compara os dois e falha se divergirem.
 */
export const TIPOS_ATO = [
  { valor: 'lei', rotulo: 'Lei', grupo: 'normativo' },
  { valor: 'lei_complementar', rotulo: 'Lei Complementar', grupo: 'normativo' },
  { valor: 'decreto', rotulo: 'Decreto', grupo: 'normativo' },
  { valor: 'portaria', rotulo: 'Portaria', grupo: 'normativo' },
  { valor: 'resolucao', rotulo: 'Resolução', grupo: 'normativo' },
  { valor: 'instrucao_normativa', rotulo: 'Instrução Normativa', grupo: 'normativo' },
  { valor: 'edital', rotulo: 'Edital', grupo: 'licitacao' },
  { valor: 'aviso_de_licitacao', rotulo: 'Aviso de Licitação', grupo: 'licitacao' },
  { valor: 'resultado_de_julgamento', rotulo: 'Resultado de Julgamento', grupo: 'licitacao' },
  { valor: 'homologacao', rotulo: 'Homologação', grupo: 'licitacao' },
  { valor: 'extrato_de_contrato', rotulo: 'Extrato de Contrato', grupo: 'contrato' },
  { valor: 'extrato_de_ata_de_registro_de_precos', rotulo: 'Extrato de Ata de Registro de Preços', grupo: 'contrato' },
  { valor: 'termo_aditivo', rotulo: 'Termo Aditivo', grupo: 'contrato' },
  { valor: 'ato_de_pessoal', rotulo: 'Ato de Pessoal', grupo: 'pessoal' },
  { valor: 'convocacao', rotulo: 'Convocação', grupo: 'pessoal' },
  { valor: 'errata', rotulo: 'Errata', grupo: 'correcao' },
  { valor: 'republicacao', rotulo: 'Republicação', grupo: 'correcao' },
  { valor: 'outros', rotulo: 'Outros', grupo: 'outros' },
] as const;

export const rotuloTipoAto = (v: string): string =>
  TIPOS_ATO.find((t) => t.valor === v)?.rotulo ?? v;

export const TIPOS_EDICAO: Record<string, string> = {
  ordinaria: 'Ordinária', extraordinaria: 'Extraordinária', suplementar: 'Suplementar',
};

export const SITUACOES_EDICAO: Record<string, string> = {
  em_montagem: 'Em montagem', fechada: 'Fechada',
  aguardando_assinatura: 'Aguardando assinatura', publicada: 'Publicada',
};

export const SITUACOES_MATERIA: Record<string, string> = {
  rascunho: 'Rascunho', enviada: 'Enviada para revisão', em_revisao: 'Em revisão',
  devolvida: 'Devolvida à secretaria', aprovada: 'Aprovada', pautada: 'Pautada', publicada: 'Publicada',
};

export const MOTIVOS_ANULACAO: Record<string, string> = {
  vicio_formal: 'Vício formal na edição', erro_material: 'Erro material grave',
  decisao_judicial: 'Decisão judicial', decisao_administrativa: 'Decisão administrativa',
};

export const REGRAS_PRAZO: Record<string, string> = {
  primeiro_dia_util_seguinte: 'Publicação legal no primeiro dia útil seguinte à disponibilização',
  mesmo_dia: 'Publicação legal no próprio dia da disponibilização',
  dia_seguinte_corrido: 'Publicação legal no dia seguinte, ainda que não útil',
};

export const PERIODICIDADES: Record<string, string> = {
  diaria_util: 'Diária, em dias úteis', diaria: 'Diária, todos os dias',
  semanal: 'Semanal', quinzenal: 'Quinzenal', eventual: 'Eventual',
};
