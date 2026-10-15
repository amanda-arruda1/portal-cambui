import type { CollectionConfig } from 'payload'
import { base, camposComuns } from './_base'
import { tiposAnexoObra } from '../enums'

export const ObraAnexos: CollectionConfig = {
  ...base('obra-anexos', 'Anexo de obra', 'Anexos de obras', { admin: { useAsTitle: 'titulo', defaultColumns: ['titulo', 'categoria', 'obra'], group: 'Obras' } }),
  fields: [
    { name: 'obra', label: 'Obra', type: 'relationship', relationTo: 'obras', required: true, index: true },
    { name: 'titulo', label: 'Título', type: 'text', required: true },
    { name: 'categoria', label: 'Categoria', type: 'select', required: true, options: tiposAnexoObra },
    { name: 'arquivo', label: 'Arquivo', type: 'upload', relationTo: 'media' },
    { name: 'dataReferencia', label: 'Data de referência', type: 'date', required: true },
    { name: 'descricao', label: 'Descrição', type: 'textarea' },
    { name: 'ordem', label: 'Ordem', type: 'number' },
    { name: 'demonstracao', label: 'Demonstração', type: 'checkbox', defaultValue: false },
    ...camposComuns,
  ],
}
