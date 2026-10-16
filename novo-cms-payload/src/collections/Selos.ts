import type { CollectionConfig } from 'payload'
import { base, camposComuns } from './_base'

export const Selos: CollectionConfig = {
  ...base('selos', 'Selo ou certificação', 'Selos e certificações', { admin: { useAsTitle: 'nome', defaultColumns: ['nome', 'orgaoEmissor', 'dataConcessao', 'status'] } }),
  fields: [
    { name: 'nome', label: 'Nome', type: 'text', required: true },
    { name: 'orgaoEmissor', label: 'Órgão emissor', type: 'text', required: true },
    { name: 'descricao', label: 'Descrição', type: 'textarea' },
    { name: 'imagem', label: 'Imagem', type: 'upload', relationTo: 'media', required: true },
    { name: 'dataConcessao', label: 'Data de concessão', type: 'date' },
    { name: 'urlComprovacao', label: 'URL de comprovação', type: 'text' },
    { name: 'ordem', label: 'Ordem', type: 'number' },
    ...camposComuns,
  ],
}
