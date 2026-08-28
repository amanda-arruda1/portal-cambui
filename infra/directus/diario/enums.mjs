/**
 * Vocabulário do módulo de Diário Oficial.
 *
 * Fonte única: o esquema do Directus, o seed, o painel e a área pública leem
 * daqui. No módulo de licitações isto já provou o seu valor — rótulo divergente
 * entre o formulário e a listagem é o defeito que ninguém nota até um cidadão
 * filtrar por algo que não existe.
 */

/* ─────────────────────────────── veículo oficial ─────────────────────────── */

export const PERIODICIDADES = [
  { valor: 'diaria_util', rotulo: 'Diária, em dias úteis' },
  { valor: 'diaria', rotulo: 'Diária, todos os dias' },
  { valor: 'semanal', rotulo: 'Semanal' },
  { valor: 'quinzenal', rotulo: 'Quinzenal' },
  { valor: 'eventual', rotulo: 'Eventual' },
];

/**
 * Como se conta o prazo a partir da publicação.
 *
 * ISTO NÃO É DETALHE. É a diferença entre um recurso protocolado no prazo e um
 * recurso perdido. A lei municipal instituidora do diário é quem define, e
 * municípios diferentes definem diferente — por isso é configuração, e não
 * constante no código.
 */
export const REGRAS_PRAZO = [
  { valor: 'primeiro_dia_util_seguinte',
    rotulo: 'Publicação legal no primeiro dia útil seguinte à disponibilização',
    nota: 'Espelha o art. 4º, §3º da Lei 11.419/2006. É a regra mais comum em diários eletrônicos municipais.' },
  { valor: 'mesmo_dia',
    rotulo: 'Publicação legal no próprio dia da disponibilização',
    nota: 'Usada quando a lei municipal equipara disponibilização e publicação.' },
  { valor: 'dia_seguinte_corrido',
    rotulo: 'Publicação legal no dia seguinte, ainda que não útil',
    nota: 'Menos comum. Exige que a lei municipal diga isso expressamente.' },
];

/* ────────────────────────────────── edições ──────────────────────────────── */

export const TIPOS_EDICAO = [
  { valor: 'ordinaria', rotulo: 'Ordinária', nota: 'Circulação prevista na lei do veículo.' },
  { valor: 'extraordinaria', rotulo: 'Extraordinária', nota: 'Fora do calendário. Exige justificativa registrada.' },
  { valor: 'suplementar', rotulo: 'Suplementar', nota: 'Complementa uma edição do mesmo dia.' },
];

export const SITUACOES_EDICAO = [
  { valor: 'em_montagem', rotulo: 'Em montagem', publica: false, ordem: 1,
    nota: 'Pauta aberta. Matérias entram e saem, a ordem muda.' },
  { valor: 'fechada', rotulo: 'Fechada', publica: false, ordem: 2,
    nota: 'Conteúdo congelado e PDF gerado. Reabrir exige motivo registrado.' },
  { valor: 'aguardando_assinatura', rotulo: 'Aguardando assinatura', publica: false, ordem: 3,
    nota: 'PDF pronto, esperando a autoridade signatária.' },
  { valor: 'publicada', rotulo: 'Publicada', publica: true, ordem: 4,
    nota: 'No ar. A partir daqui NADA se altera — corrige-se por errata ou republicação.' },
];

/** Estado lateral, não substitui a situação: a edição anulada continua
 *  publicada e acessível, apenas marcada. Sumir com ela seria apagar o
 *  histórico do próprio ato de anulação. */
export const MOTIVOS_ANULACAO = [
  { valor: 'vicio_formal', rotulo: 'Vício formal na edição' },
  { valor: 'erro_material', rotulo: 'Erro material grave' },
  { valor: 'decisao_judicial', rotulo: 'Decisão judicial' },
  { valor: 'decisao_administrativa', rotulo: 'Decisão administrativa' },
];

/* ────────────────────────────────── matérias ─────────────────────────────── */

export const TIPOS_ATO = [
  { valor: 'lei', rotulo: 'Lei', grupo: 'normativo', artigo: 'a' },
  { valor: 'lei_complementar', rotulo: 'Lei Complementar', grupo: 'normativo', artigo: 'a' },
  { valor: 'decreto', rotulo: 'Decreto', grupo: 'normativo', artigo: 'o' },
  { valor: 'portaria', rotulo: 'Portaria', grupo: 'normativo', artigo: 'a' },
  { valor: 'resolucao', rotulo: 'Resolução', grupo: 'normativo', artigo: 'a' },
  { valor: 'instrucao_normativa', rotulo: 'Instrução Normativa', grupo: 'normativo', artigo: 'a' },
  { valor: 'edital', rotulo: 'Edital', grupo: 'licitacao', artigo: 'o' },
  { valor: 'aviso_de_licitacao', rotulo: 'Aviso de Licitação', grupo: 'licitacao', artigo: 'o' },
  { valor: 'resultado_de_julgamento', rotulo: 'Resultado de Julgamento', grupo: 'licitacao', artigo: 'o' },
  { valor: 'homologacao', rotulo: 'Homologação', grupo: 'licitacao', artigo: 'a' },
  { valor: 'extrato_de_contrato', rotulo: 'Extrato de Contrato', grupo: 'contrato', artigo: 'o' },
  { valor: 'extrato_de_ata_de_registro_de_precos', rotulo: 'Extrato de Ata de Registro de Preços', grupo: 'contrato', artigo: 'o' },
  { valor: 'termo_aditivo', rotulo: 'Termo Aditivo', grupo: 'contrato', artigo: 'o' },
  { valor: 'ato_de_pessoal', rotulo: 'Ato de Pessoal', grupo: 'pessoal', artigo: 'o' },
  { valor: 'convocacao', rotulo: 'Convocação', grupo: 'pessoal', artigo: 'a' },
  { valor: 'errata', rotulo: 'Errata', grupo: 'correcao', artigo: 'a' },
  { valor: 'republicacao', rotulo: 'Republicação', grupo: 'correcao', artigo: 'a' },
  { valor: 'outros', rotulo: 'Outros', grupo: 'outros', artigo: 'o' },
];

/** Situações da matéria. As anteriores a `publicada` são o que o briefing
 *  chama de "solicitação de publicação": ver a decisão registrada no
 *  ARQUITETURA.md sobre por que não são duas entidades. */
export const SITUACOES_MATERIA = [
  { valor: 'rascunho', rotulo: 'Rascunho', ordem: 1, doRedator: true,
    nota: 'Só quem escreveu enxerga.' },
  { valor: 'enviada', rotulo: 'Enviada para revisão', ordem: 2, doRedator: true,
    nota: 'Na fila do editor do diário.' },
  { valor: 'em_revisao', rotulo: 'Em revisão', ordem: 3, doEditor: true },
  { valor: 'devolvida', rotulo: 'Devolvida à secretaria', ordem: 4, doEditor: true,
    nota: 'Volta para a secretaria com motivo obrigatório.' },
  { valor: 'aprovada', rotulo: 'Aprovada', ordem: 5, doEditor: true,
    nota: 'Pronta para entrar numa pauta.' },
  { valor: 'pautada', rotulo: 'Pautada', ordem: 6, doEditor: true,
    nota: 'Já alocada numa edição em montagem.' },
  { valor: 'publicada', rotulo: 'Publicada', ordem: 7, publica: true,
    nota: 'Imutável.' },
];

/* ────────────────────────────────── cadernos ─────────────────────────────── */

/** Semente dos cadernos. Vira registro no banco: o município pode criar
 *  outros sem tocar em código. */
export const CADERNOS_PADRAO = [
  { slug: 'executivo', nome: 'Executivo', ordem: 1,
    descricao: 'Atos do Poder Executivo: leis, decretos, portarias e demais atos normativos.' },
  { slug: 'licitacoes-e-contratos', nome: 'Licitações e Contratos', ordem: 2,
    descricao: 'Avisos, editais, resultados de julgamento, homologações e extratos contratuais.' },
  { slug: 'atos-de-pessoal', nome: 'Atos de Pessoal', ordem: 3,
    descricao: 'Nomeações, exonerações, licenças, aposentadorias e convocações.',
    dadosPessoais: true },
  { slug: 'legislativo', nome: 'Legislativo', ordem: 4,
    descricao: 'Atos da Câmara Municipal de Cambuí.' },
];

/* ───────────────────────────────── auditoria ─────────────────────────────── */

export const ACOES_AUDITORIA = [
  { valor: 'materia_criada', rotulo: 'Matéria criada' },
  { valor: 'materia_editada', rotulo: 'Matéria editada' },
  { valor: 'materia_enviada', rotulo: 'Matéria enviada para revisão' },
  { valor: 'materia_devolvida', rotulo: 'Matéria devolvida' },
  { valor: 'materia_aprovada', rotulo: 'Matéria aprovada' },
  { valor: 'materia_pautada', rotulo: 'Matéria incluída em pauta' },
  { valor: 'materia_despautada', rotulo: 'Matéria retirada da pauta' },
  { valor: 'edicao_criada', rotulo: 'Edição criada' },
  { valor: 'edicao_reordenada', rotulo: 'Pauta reordenada' },
  { valor: 'edicao_fechada', rotulo: 'Edição fechada' },
  { valor: 'edicao_reaberta', rotulo: 'Edição reaberta' },
  { valor: 'edicao_assinada', rotulo: 'Edição assinada' },
  { valor: 'edicao_publicada', rotulo: 'Edição publicada' },
  { valor: 'edicao_anulada', rotulo: 'Edição anulada' },
  { valor: 'tentativa_bloqueada', rotulo: 'Tentativa de alteração bloqueada' },
  { valor: 'certidao_emitida', rotulo: 'Certidão de publicação emitida' },
];

/* ────────────────────────────────── auxiliares ───────────────────────────── */

export const rotuloDe = (lista, valor) => lista.find((i) => i.valor === valor)?.rotulo ?? valor;
export const tipoDeAto = (valor) => TIPOS_ATO.find((t) => t.valor === valor) ?? TIPOS_ATO.at(-1);
export const situacaoEdicao = (valor) => SITUACOES_EDICAO.find((s) => s.valor === valor) ?? SITUACOES_EDICAO[0];
export const situacaoMateria = (valor) => SITUACOES_MATERIA.find((s) => s.valor === valor) ?? SITUACOES_MATERIA[0];
