import type { CollectionConfig } from 'payload'
import { base, camposComuns } from './_base'
import { acessoLicitacoes } from '../acesso'
import { campoHtmlDe } from '../campos-html'
import { importarPncp } from '../pncp'
import { eventoDePublicacao, regrasLicitacao, slugPermanente, uuidPublico } from '../hooks-licitacoes'
import { criterios, modalidades, modosDisputa, situacoesLicitacao } from '../enums'

export const Licitacoes: CollectionConfig = {
  ...base('licitacoes', 'Licitação', 'Licitações', {
    access: acessoLicitacoes,
    endpoints: [importarPncp],
    hooks: { beforeValidate: [slugPermanente, uuidPublico], beforeChange: [regrasLicitacao], afterChange: [eventoDePublicacao] },
    admin: { group: 'Licitações', useAsTitle: 'objetoResumo', defaultColumns: ['numeroProcesso', 'modalidade', 'situacao', 'dataSessao', 'status'], listSearchableFields: ['numeroProcesso', 'objetoResumo'] },
  }),
  fields: [
    { name: 'importarPncp', type: 'ui', admin: { components: { Field: '/components/ImportarPncp#ImportarPncp' } } },
    { type: 'row', fields: [
      { name: 'numeroProcesso', label: 'Número do processo', type: 'text', required: true, unique: true, admin: { description: 'Processo administrativo. Ex.: 1014/2026' } },
      { name: 'numero', label: 'Número', type: 'number', required: true },
      { name: 'ano', label: 'Ano', type: 'number', required: true, index: true },
    ] },
    // `required` mantém a coluna NOT NULL; o `validate` aceita vazio porque o hook `slugPermanente` (beforeValidate) gera o valor no servidor
    // — sem isto o formulário do painel recusaria salvar uma licitação nova com o slug em branco.
    { name: 'slug', label: 'Slug (URL)', type: 'text', required: true, unique: true, validate: () => true as const, admin: { description: 'Gerado sozinho a partir da modalidade e do número; pode deixar em branco. URL permanente: /licitacoes/<ano>/<slug>. Nunca mudar depois de publicada.' } },
    { name: 'modalidade', label: 'Modalidade', type: 'select', required: true, index: true, options: modalidades },
    { name: 'forma', label: 'Forma', type: 'select', required: true, defaultValue: 'eletronica', options: [{ label: 'Eletrônica', value: 'eletronica' }, { label: 'Presencial', value: 'presencial' }] },
    { name: 'justificativaPresencial', label: 'Justificativa (forma presencial)', type: 'textarea', admin: { description: 'Obrigatória quando presencial — art. 17 §2º da Lei 14.133/2021.' } },
    { name: 'criterioJulgamento', label: 'Critério de julgamento', type: 'select', required: true, options: criterios },
    { name: 'modoDisputa', label: 'Modo de disputa', type: 'select', defaultValue: 'aberto', options: modosDisputa },
    { name: 'registroPrecos', label: 'Sistema de Registro de Preços', type: 'checkbox', defaultValue: false },
    { name: 'secretaria', label: 'Órgão demandante', type: 'relationship', relationTo: 'secretarias' },
    { name: 'objetoResumo', label: 'Objeto (resumo)', type: 'textarea', required: true },
    { name: 'objeto', label: 'Objeto (completo)', type: 'richText' },
    campoHtmlDe('objeto'),
    { name: 'valorEstimado', label: 'Valor estimado (R$)', type: 'number' },
    { name: 'orcamentoSigiloso', label: 'Orçamento sigiloso', type: 'checkbox', defaultValue: false, admin: { description: 'Oculta o valor no portal sem apagar o dado — art. 24 da Lei 14.133/2021.' } },
    { name: 'dataPublicacao', label: 'Data de publicação', type: 'date', required: true, index: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'dataAberturaPropostas', label: 'Abertura de propostas', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'dataSessao', label: 'Sessão pública', type: 'date', index: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'prazoImpugnacao', label: 'Prazo de impugnação', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'prazoEsclarecimentos', label: 'Prazo de esclarecimentos', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'situacao', label: 'Situação do processo', type: 'select', required: true, defaultValue: 'publicada', index: true, options: situacoesLicitacao, admin: { description: 'Estado do PROCESSO. Diferente de "Status", que é a visibilidade no portal.' } },
    { name: 'motivoSituacao', label: 'Motivo da situação', type: 'textarea' },
    { name: 'pncpId', label: 'ID no PNCP', type: 'text' },
    { name: 'pncpUrl', label: 'URL no PNCP', type: 'text' },
    { name: 'sistemaSessaoUrl', label: 'URL do sistema da sessão', type: 'text' },
    { name: 'demonstracao', label: 'Registro de demonstração', type: 'checkbox', defaultValue: false },
    { name: 'justificativaPrazo', label: 'Justificativa do prazo', type: 'textarea', virtual: true, admin: { description: 'Só ao publicar com prazo menor que o do art. 55 (ou sem data de sessão). Não é gravada: vira observação no evento de publicação.' } },
    ...camposComuns,
  ],
}
