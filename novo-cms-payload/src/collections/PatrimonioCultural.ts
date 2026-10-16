import type { CollectionConfig } from 'payload'
import { base, camposComuns } from './_base'
import { categoriasPatrimonio } from '../enums'

export const PatrimonioCultural: CollectionConfig = {
  ...base('patrimonio-cultural', 'Documento de patrimônio cultural', 'Patrimônio Cultural', {
    admin: { useAsTitle: 'titulo', defaultColumns: ['titulo', 'categoria', 'periodo', 'status'] },
  }),
  fields: [
    { name: 'titulo', label: 'Título', type: 'text', required: true },
    { name: 'categoria', label: 'Categoria', type: 'select', required: true, options: categoriasPatrimonio },
    { name: 'periodo', label: 'Período', type: 'text', admin: { description: 'Ano ou período como aparece na fonte. Ex.: "2012–2013".' } },
    { name: 'descricao', label: 'Descrição', type: 'textarea' },
    { name: 'arquivo', label: 'Arquivo', type: 'upload', relationTo: 'media' },
    { name: 'urlExterna', label: 'URL externa', type: 'text' },
    { name: 'secretaria', label: 'Secretaria', type: 'relationship', relationTo: 'secretarias' },
    { name: 'ordem', label: 'Ordem', type: 'number' },
    ...camposComuns,
  ],
}
