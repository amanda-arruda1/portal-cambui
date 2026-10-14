import type { CollectionConfig } from 'payload'
import { base, camposComuns } from './_base'

export const LinksUteis: CollectionConfig = {
  ...base('links-uteis', 'Link útil', 'Links úteis', { admin: { useAsTitle: 'nome', defaultColumns: ['nome', 'grupo', 'ordem', 'status'] } }),
  fields: [
    { name: 'nome', label: 'Nome', type: 'text', required: true },
    { name: 'url', label: 'URL', type: 'text', required: true },
    { name: 'descricao', label: 'Descrição', type: 'textarea' },
    { name: 'grupo', label: 'Grupo', type: 'text' },
    { name: 'ordem', label: 'Ordem', type: 'number' },
    ...camposComuns,
  ],
}
