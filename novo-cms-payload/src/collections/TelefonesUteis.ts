import type { CollectionConfig } from 'payload'
import { base, camposComuns } from './_base'
import { categoriasTelefone } from '../enums'

export const TelefonesUteis: CollectionConfig = {
  ...base('telefones-uteis', 'Telefone útil', 'Telefones úteis', {
    admin: { useAsTitle: 'nome', defaultColumns: ['nome', 'categoria', 'telefone', 'status'] },
  }),
  fields: [
    { name: 'nome', label: 'Nome', type: 'text', required: true },
    { name: 'categoria', label: 'Categoria', type: 'select', required: true, options: categoriasTelefone },
    { name: 'endereco', label: 'Endereço', type: 'text' },
    { name: 'telefone', label: 'Telefone', type: 'text' },
    { name: 'email', label: 'E-mail', type: 'text' },
    { name: 'ordem', label: 'Ordem', type: 'number' },
    ...camposComuns,
  ],
}
