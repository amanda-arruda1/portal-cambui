import type { CollectionConfig } from 'payload'
import { base, camposComuns } from './_base'
import { tiposEvento } from '../enums'

export const LicitacaoEventos: CollectionConfig = {
  ...base('licitacao-eventos', 'Evento de licitação', 'Eventos de licitações', { admin: { useAsTitle: 'tipo', defaultColumns: ['data', 'tipo', 'licitacao'], group: 'Licitações' } }),
  fields: [
    { name: 'licitacao', label: 'Licitação', type: 'relationship', relationTo: 'licitacoes', required: true, index: true },
    { name: 'data', label: 'Data', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: tiposEvento },
    { name: 'descricao', label: 'Descrição', type: 'textarea' },
    { name: 'anexo', label: 'Anexo', type: 'relationship', relationTo: 'licitacao-anexos' },
    { name: 'demonstracao', label: 'Demonstração', type: 'checkbox', defaultValue: false },
    ...camposComuns,
  ],
}
