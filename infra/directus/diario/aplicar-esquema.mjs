#!/usr/bin/env node
/**
 * Coleções do Órgão Oficial Eletrônico.
 *
 *   node infra/directus/diario/aplicar-esquema.mjs [--simular]
 *
 * DUAS DECISÕES DE MODELAGEM QUE VALE LER ANTES DE MEXER:
 *
 * 1. NÃO existe entidade "solicitação de publicação" separada da matéria.
 *    A solicitação É a matéria nos seus estados anteriores a `publicada`. Duas
 *    tabelas significariam duas cópias do mesmo texto, e no dia em que elas
 *    divergirem — e divergem — ninguém sabe qual foi o texto realmente
 *    aprovado. O histórico de devoluções, que é o que a solicitação tem de
 *    próprio, vive em `diario_devolucoes`.
 *
 * 2. Relação de errata/republicação/revogação guardada em UM SÓ SENTIDO.
 *    A matéria nova aponta para a antiga (`retifica`, `republica`, `revoga`).
 *    O sentido inverso ("retificada_por") é consulta, não campo. Guardar os
 *    dois lados criaria o estado impossível em que A retifica B mas B não é
 *    retificada por A — e num diário oficial esse estado é uma remissão falsa.
 */
import { opcoes, abrirApi, aplicarColecoes } from '../aplicador.mjs';
import {
  PERIODICIDADES, REGRAS_PRAZO, TIPOS_EDICAO, SITUACOES_EDICAO,
  MOTIVOS_ANULACAO, TIPOS_ATO, SITUACOES_MATERIA, ACOES_AUDITORIA,
} from './enums.mjs';

const SIMULAR = process.argv.includes('--simular');

export const COLECOES = [
  /* ───────────────────────────── veículo oficial ─────────────────────────── */
  {
    nome: 'diario_veiculo',
    comStatus: false,
    meta: { icon: 'account_balance', singleton: true,
      note: 'Qual é o órgão oficial deste município, e sob qual lei. É esta configuração que a página pública "Órgão Oficial" lê.' },
    campos: [
      { campo: 'nome_veiculo', tipo: 'string', obrigatorio: true,
        nota: 'Como o veículo se chama na citação. Ex.: "Diário Oficial Eletrônico do Município de Cambuí".' },
      { campo: 'nome_curto', tipo: 'string', nota: 'Para cabeçalho e rodapé do PDF, onde não cabe o nome inteiro.' },
      { campo: 'ente', tipo: 'string', obrigatorio: true, nota: 'Ex.: "Município de Cambuí — Estado de Minas Gerais".' },
      { campo: 'cnpj', tipo: 'string', nota: 'CNPJ do ente. Aparece no expediente.' },

      /* A lei instituidora não é enfeite: é ela que responde "por que este site
         vale como publicação oficial". Sem ela preenchida, a página do órgão
         oficial diz isso em voz alta, em vez de fingir que está tudo certo. */
      { campo: 'lei_numero', tipo: 'string', nota: 'Lei municipal que instituiu o veículo. Ex.: "Lei Municipal nº 2.184".' },
      { campo: 'lei_data', tipo: 'date' },
      { campo: 'lei_link', tipo: 'string', nota: 'URL do texto da lei.' },
      { campo: 'lei_ementa', tipo: 'text' },
      { campo: 'inicio_circulacao', tipo: 'date', nota: 'Primeiro dia de circulação eletrônica. Antes disso, o veículo oficial era outro.' },
      { campo: 'veiculo_anterior', tipo: 'text',
        nota: 'O que valia como órgão oficial antes. O cidadão que procura ato de 2015 precisa saber para onde ir.' },

      { campo: 'periodicidade', tipo: 'string', padrao: 'diaria_util', interface: 'select-dropdown', opcoes: opcoes(PERIODICIDADES) },
      { campo: 'dias_circulacao', tipo: 'json', nota: 'Dias da semana, 0=domingo. Padrão [1,2,3,4,5].' },
      { campo: 'horario_fechamento', tipo: 'string', padrao: '17:00',
        nota: 'Depois deste horário, matéria enviada entra na edição seguinte.' },
      { campo: 'regra_prazo', tipo: 'string', obrigatorio: true, padrao: 'primeiro_dia_util_seguinte',
        interface: 'select-dropdown', opcoes: opcoes(REGRAS_PRAZO),
        nota: 'DEFINIDA PELA LEI MUNICIPAL. É o que separa a data em que o PDF foi ao ar da data que conta prazo.' },

      { campo: 'responsavel_publicacao', tipo: 'string', nota: 'Cargo/setor responsável. Ex.: "Secretaria Municipal de Administração".' },
      { campo: 'expediente', tipo: 'json', nota: 'Autoridades exibidas na capa: [{cargo, nome}].' },
      { campo: 'endereco', tipo: 'text' },
      { campo: 'telefone', tipo: 'string' },
      { campo: 'email_contato', tipo: 'string' },
      { campo: 'ano_volume_inicial', tipo: 'integer', padrao: 1, nota: 'Volume no ano de início. Serve para calcular "Ano V".' },
      { campo: 'nota_legal', tipo: 'text',
        nota: 'Aviso permanente exibido no rodapé das páginas do diário: o que este veículo é e o que ele não substitui.' },
    ],
  },

  /* ──────────────────────────────── cadernos ─────────────────────────────── */
  {
    nome: 'diario_cadernos',
    meta: { icon: 'menu_book', note: 'Divisões da edição.', display_template: '{{nome}}', sort_field: 'ordem' },
    campos: [
      { campo: 'slug', tipo: 'string', obrigatorio: true, unico: true },
      { campo: 'nome', tipo: 'string', obrigatorio: true },
      { campo: 'ordem', tipo: 'integer', obrigatorio: true, padrao: 1 },
      { campo: 'descricao', tipo: 'text' },
      /* LGPD: cadernos com dados pessoais podem ser mantidos fora do índice de
         buscadores. Publicidade legal é base legal para publicar; não é base
         para facilitar que o nome de um servidor vire primeiro resultado de
         busca pelo nome dele pelo resto da vida. */
      { campo: 'dados_pessoais', tipo: 'boolean', padrao: false,
        nota: 'Marque quando o caderno publica nomes de pessoas físicas rotineiramente.' },
      { campo: 'indexavel', tipo: 'boolean', padrao: true,
        nota: 'Desmarque para pedir aos buscadores que não indexem as matérias deste caderno. Não afeta o acesso público.' },
    ],
  },

  /* ──────────────────────────────── edições ──────────────────────────────── */
  {
    nome: 'diario_edicoes',
    meta: { icon: 'newspaper', note: 'Edições do diário. Publicada, nunca se altera.',
      display_template: 'Edição {{numero}} — {{data_publicacao_legal}}', sort_field: 'numero' },
    campos: [
      /* Sequência contínua, sem lacuna e jamais reaproveitada. Um número que
         some é a primeira coisa que um auditor procura. */
      { campo: 'numero', tipo: 'integer', obrigatorio: true, unico: true,
        nota: 'Sequencial CONTÍNUO do veículo. Sem lacunas, jamais reaproveitado — nem quando a edição é anulada.' },
      { campo: 'ano', tipo: 'integer', obrigatorio: true },
      { campo: 'volume', tipo: 'integer', nota: 'Ano/volume do veículo. Ex.: 5 para "Ano V".' },
      { campo: 'tipo', tipo: 'string', obrigatorio: true, padrao: 'ordinaria', interface: 'select-dropdown', opcoes: opcoes(TIPOS_EDICAO) },
      { campo: 'situacao', tipo: 'string', obrigatorio: true, padrao: 'em_montagem', interface: 'select-dropdown', opcoes: opcoes(SITUACOES_EDICAO) },

      /* AS DUAS DATAS. Guardadas separadas, exibidas separadas, explicadas
         separadas. Confundi-las é como se perde prazo — e é o erro mais comum
         em portal de diário municipal. */
      { campo: 'data_disponibilizacao', tipo: 'timestamp', obrigatorio: true,
        nota: 'Quando o PDF assinado efetivamente foi ao ar no portal.' },
      { campo: 'data_publicacao_legal', tipo: 'date', obrigatorio: true,
        nota: 'Data que CONTA PRAZO, calculada pela regra do veículo. Pode ser diferente da disponibilização.' },

      { campo: 'justificativa_extraordinaria', tipo: 'text',
        nota: 'Obrigatória quando a edição circula fora do calendário previsto na lei.' },
      { campo: 'total_paginas', tipo: 'integer' },
      { campo: 'arquivo_pdf', tipo: 'arquivo', nota: 'PDF assinado. É ESTE o documento com fé pública.' },
      { campo: 'sha256', tipo: 'string', nota: 'Impressão digital do PDF publicado. É o que a página de autenticidade compara.' },
      { campo: 'codigo_verificador', tipo: 'string', unico: true,
        nota: 'Código curto impresso em todas as páginas e no QR Code.' },

      { campo: 'assinatura_signatario', tipo: 'string' },
      { campo: 'assinatura_documento', tipo: 'string', nota: 'CPF do signatário, JÁ MASCARADO. Nunca guardar completo.' },
      { campo: 'assinatura_emissor', tipo: 'string', nota: 'Autoridade certificadora.' },
      { campo: 'assinatura_em', tipo: 'timestamp' },
      { campo: 'assinatura_algoritmo', tipo: 'string' },
      { campo: 'assinatura_carimbo', tipo: 'boolean', padrao: false, nota: 'Se há carimbo do tempo de ACT credenciada.' },
      { campo: 'assinatura_valida_ate', tipo: 'timestamp' },

      /* Anulada NÃO é situação: é marca. A edição segue publicada e acessível,
         porque o ato de anular também é público. */
      { campo: 'anulada', tipo: 'boolean', padrao: false,
        nota: 'Edição circulada e depois anulada. Continua acessível, marcada. NUNCA é removida.' },
      { campo: 'anulada_motivo', tipo: 'string', interface: 'select-dropdown', opcoes: opcoes(MOTIVOS_ANULACAO) },
      { campo: 'anulada_justificativa', tipo: 'text' },
      { campo: 'anulada_em', tipo: 'timestamp' },
      { campo: 'anulada_por_edicao', tipo: 'relacao', para: 'diario_edicoes', nota: 'Edição em que o ato de anulação foi publicado.' },

      { campo: 'importada_acervo', tipo: 'boolean', padrao: false,
        nota: 'Edição anterior ao sistema, trazida do acervo: só PDF, sem matérias estruturadas.' },
      { campo: 'fonte_acervo', tipo: 'text', nota: 'De onde veio o PDF importado.' },

      { campo: 'fechada_em', tipo: 'timestamp' },
      { campo: 'publicada_em', tipo: 'timestamp' },
      { campo: 'reaberturas', tipo: 'integer', padrao: 0, nota: 'Quantas vezes foi reaberta depois de fechada. Auditoria olha isto.' },
      { campo: 'observacao', tipo: 'text' },
      { campo: 'demonstracao', tipo: 'boolean', padrao: false,
        nota: 'Registro de demonstração. O portal marca visualmente e o seed remove com --reset.' },
    ],
  },

  /* ──────────────────────────────── matérias ─────────────────────────────── */
  {
    nome: 'diario_materias',
    meta: { icon: 'article', note: 'A unidade que o cidadão procura. Cada matéria tem página e URL próprias.',
      display_template: '{{tipo_ato}} {{numero_ato}}/{{ano_ato}} — {{ementa}}', sort_field: 'ordem' },
    campos: [
      { campo: 'edicao', tipo: 'relacao', para: 'diario_edicoes', nota: 'Vazio enquanto a matéria não entra numa pauta.' },
      { campo: 'caderno', tipo: 'relacao', para: 'diario_cadernos', obrigatorio: true },
      { campo: 'secretaria', tipo: 'relacao', para: 'secretarias', nota: 'Órgão de origem.' },
      { campo: 'orgao_texto', tipo: 'string', nota: 'Para órgãos que não são secretaria do Executivo (Câmara, autarquias).' },
      { campo: 'ordem', tipo: 'integer', padrao: 1, nota: 'Posição na pauta do caderno.' },
      { campo: 'pagina_inicial', tipo: 'integer' },
      { campo: 'pagina_final', tipo: 'integer' },

      { campo: 'tipo_ato', tipo: 'string', obrigatorio: true, interface: 'select-dropdown', opcoes: opcoes(TIPOS_ATO) },
      { campo: 'numero_ato', tipo: 'string', nota: 'Número do ato. Texto, não inteiro: existe "12-A" e existe ato sem número.' },
      { campo: 'ano_ato', tipo: 'integer' },
      { campo: 'ementa', tipo: 'text', obrigatorio: true, interface: 'input-multiline',
        nota: 'Resumo oficial. É o que aparece no sumário, na listagem e na busca.' },
      /* TEXT com HTML restrito. A lição do objeto de licitação vale aqui em
         dobro: texto de lei orçamentária com tabela não cabe em varchar. */
      { campo: 'corpo', tipo: 'text', interface: 'input-rich-text-html',
        nota: 'Texto integral do ato, em HTML restrito. É o que vira a versão acessível E o PDF.' },

      { campo: 'slug', tipo: 'string', obrigatorio: true,
        nota: 'URL permanente: /diario-oficial/materia/<ano>/<slug>. Nunca muda depois de publicada.' },
      { campo: 'situacao', tipo: 'string', obrigatorio: true, padrao: 'rascunho', interface: 'select-dropdown', opcoes: opcoes(SITUACOES_MATERIA) },
      { campo: 'processo_administrativo', tipo: 'string', nota: 'Ex.: 1014/2026.' },
      { campo: 'licitacao', tipo: 'relacao', para: 'licitacoes',
        nota: 'Quando a matéria é aviso/resultado/homologação de uma licitação do módulo. É o vínculo que impede os dois módulos de divergirem.' },
      { campo: 'data_alvo', tipo: 'date',
        nota: 'Fila por data: a secretaria envia hoje pedindo publicação em tal dia.' },
      { campo: 'vigencia_inicio', tipo: 'date', nota: 'Quando o ato passa a produzir efeitos, se diferente da publicação.' },

      /* Remissões — um só sentido. Ver o cabeçalho deste arquivo. */
      { campo: 'retifica', tipo: 'relacao', para: 'diario_materias', nota: 'Esta matéria é uma ERRATA da matéria apontada.' },
      { campo: 'republica', tipo: 'relacao', para: 'diario_materias', nota: 'Esta matéria REPUBLICA a matéria apontada, por incorreção.' },
      { campo: 'revoga', tipo: 'relacao', para: 'diario_materias', nota: 'Esta matéria REVOGA o ato da matéria apontada.' },
      { campo: 'motivo_republicacao', tipo: 'text' },

      { campo: 'demonstracao', tipo: 'boolean', padrao: false },
    ],
  },

  /* ─────────────────────────────── devoluções ───────────────────────────── */
  {
    nome: 'diario_devolucoes',
    comStatus: false,
    meta: { icon: 'undo', note: 'Histórico de devoluções de matéria à secretaria. Nunca se apaga: é a memória do que foi cobrado e por quê.',
      display_template: '{{materia}} — {{motivo}}' },
    campos: [
      { campo: 'materia', tipo: 'relacao', para: 'diario_materias', obrigatorio: true },
      { campo: 'motivo', tipo: 'text', obrigatorio: true, nota: 'Obrigatório. Devolver sem dizer o porquê só gera reenvio igual.' },
      { campo: 'devolvida_em', tipo: 'timestamp', obrigatorio: true },
      { campo: 'devolvida_por_nome', tipo: 'string', nota: 'Nome de quem devolveu, congelado no momento — o usuário pode sair da prefeitura.' },
    ],
  },

  /* ─────────────────────────────── auditoria ────────────────────────────── */
  {
    nome: 'diario_auditoria',
    comStatus: false,
    meta: { icon: 'gavel', note: 'Log imutável. Só ganha linha, nunca perde.',
      display_template: '{{quando}} — {{acao}}', sort_field: '-quando' },
    campos: [
      { campo: 'acao', tipo: 'string', obrigatorio: true, interface: 'select-dropdown', opcoes: opcoes(ACOES_AUDITORIA) },
      { campo: 'quando', tipo: 'timestamp', obrigatorio: true },
      { campo: 'quem_nome', tipo: 'string', nota: 'Congelado no momento do ato.' },
      { campo: 'quem_papel', tipo: 'string' },
      { campo: 'edicao', tipo: 'relacao', para: 'diario_edicoes' },
      { campo: 'materia', tipo: 'relacao', para: 'diario_materias' },
      { campo: 'detalhe', tipo: 'text', nota: 'O que mudou, em texto legível por humano.' },
      /* LGPD: sem IP e sem user-agent. Para responder "quem alterou a ementa
         às 23h" basta identidade e horário; endereço de rede seria coleta além
         da finalidade, num sistema onde o usuário é servidor identificado. */
    ],
  },

  /* ───────────────────────── assinantes e fila de e-mail ─────────────────── */
  {
    nome: 'diario_assinantes',
    meta: { icon: 'mark_email_unread', note: 'Aviso de novas edições por e-mail. Base mínima.', display_template: '{{email}}' },
    campos: [
      { campo: 'email', tipo: 'string', obrigatorio: true, unico: true },
      { campo: 'cadernos', tipo: 'text', nota: 'Slugs separados por vírgula. Vazio = todos.' },
      { campo: 'secretarias', tipo: 'text', nota: 'Slugs separados por vírgula. Vazio = todas.' },
      { campo: 'palavras_chave', tipo: 'text', nota: 'Separadas por vírgula. Vazio = todas as matérias.' },
      { campo: 'confirmado', tipo: 'boolean', padrao: false, nota: 'Duplo opt-in.' },
      { campo: 'token', tipo: 'string', nota: 'Confirmação e descadastro em um clique.' },
      { campo: 'criado_em', tipo: 'timestamp' },
      { campo: 'confirmado_em', tipo: 'timestamp' },
    ],
  },
  {
    nome: 'diario_envios',
    comStatus: false,
    meta: { icon: 'outgoing_mail', note: 'Fila de e-mail. O portal enfileira; quem envia é o serviço portal-avisos.', display_template: '{{destinatario}} — {{estado}}' },
    campos: [
      { campo: 'destinatario', tipo: 'string', obrigatorio: true },
      { campo: 'assunto', tipo: 'string', obrigatorio: true },
      { campo: 'corpo_texto', tipo: 'text', obrigatorio: true },
      { campo: 'corpo_html', tipo: 'text' },
      { campo: 'tipo', tipo: 'string', nota: 'confirmacao | edicao' },
      { campo: 'estado', tipo: 'string', padrao: 'pendente', nota: 'pendente | enviado | falhou' },
      { campo: 'tentativas', tipo: 'integer', padrao: 0 },
      { campo: 'ultimo_erro', tipo: 'text' },
      { campo: 'criado_em', tipo: 'timestamp' },
      { campo: 'enviado_em', tipo: 'timestamp' },
      { campo: 'assinante', tipo: 'relacao', para: 'diario_assinantes' },
      { campo: 'edicao', tipo: 'relacao', para: 'diario_edicoes' },
    ],
  },

  /* ──────────────────────────────── certidões ───────────────────────────── */
  {
    nome: 'diario_certidoes',
    comStatus: false,
    meta: { icon: 'verified', note: 'Certidões de publicação emitidas. Cada emissão fica registrada, com o seu próprio código.',
      display_template: 'Certidão {{codigo}}' },
    campos: [
      { campo: 'codigo', tipo: 'string', obrigatorio: true, unico: true },
      { campo: 'materia', tipo: 'relacao', para: 'diario_materias', obrigatorio: true },
      { campo: 'emitida_em', tipo: 'timestamp', obrigatorio: true },
      { campo: 'sha256', tipo: 'string' },
      { campo: 'arquivo_pdf', tipo: 'arquivo' },
      { campo: 'solicitante', tipo: 'string', nota: 'Livre e opcional. Certidão de ato público não exige identificar quem pede — LAI, art. 10, §3º.' },
    ],
  },
];

if (SIMULAR) {
  console.log('\n=== SIMULAÇÃO — esquema do Diário Oficial ===\n');
  let total = 0;
  for (const c of COLECOES) {
    console.log(`${c.nome}  (${c.campos.length} campos próprios)`);
    for (const f of c.campos) {
      console.log(`   ${f.campo.padEnd(28)} ${f.tipo}${f.obrigatorio ? ' *' : ''}${f.para ? ' → ' + f.para : ''}${f.unico ? ' [único]' : ''}`);
      total++;
    }
    console.log('');
  }
  console.log(`${COLECOES.length} coleções, ${total} campos.\n`);
  process.exit(0);
}

const api = await abrirApi({});
await aplicarColecoes(api, COLECOES);
console.log('\nEsquema do Diário Oficial aplicado.\n');
