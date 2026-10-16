import type { GlobalConfig } from 'payload'
import { global } from './_base'

export const Navegacao: GlobalConfig = global({
  slug: 'navegacao',
  label: 'Rodapé (colunas de links)',
  fields: [
    {
      name: 'colunasRodape',
      label: 'Colunas de links do rodapé',
      type: 'array',
      fields: [
        { name: 'titulo', label: 'Título da coluna', type: 'text', required: true },
        {
          name: 'itens',
          label: 'Links',
          type: 'array',
          fields: [
            { name: 'rotulo', label: 'Rótulo', type: 'text', required: true },
            { name: 'destino', label: 'Destino', type: 'text', required: true },
          ],
        },
      ],
    },
  ],
})
