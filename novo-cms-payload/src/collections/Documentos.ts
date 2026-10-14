import type { CollectionConfig } from 'payload'
import { base, camposComuns } from './_base'
import { tiposDocumento } from '../enums'

export const Documentos: CollectionConfig = {
  ...base('documentos', 'Documento ou edital', 'Documentos e editais', { admin: { useAsTitle: 'titulo', defaultColumns: ['titulo', 'tipo', 'numero', 'dataDocumento', 'status'] } }),
  fields: [
    { name: 'titulo', label: 'Título', type: 'text', required: true },
    { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: tiposDocumento },
    { name: 'numero', label: 'Número', type: 'text' },
    { name: 'dataDocumento', label: 'Data do documento', type: 'date', required: true },
    { name: 'descricao', label: 'Descrição', type: 'textarea' },
    { name: 'arquivo', label: 'Arquivo', type: 'upload', relationTo: 'media' },
    { name: 'urlExterna', label: 'URL externa', type: 'text', admin: { description: 'Quando o documento vive no sistema da Transparência.' } },
    { name: 'secretaria', label: 'Secretaria', type: 'relationship', relationTo: 'secretarias' },
    ...camposComuns,
  ],
}
