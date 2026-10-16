import type { GlobalConfig } from 'payload'
import { global } from './_base'

export const Navegacao: GlobalConfig = global({
  slug: 'navegacao',
  label: 'Navegação',
  fields: [
    {
      name: 'menuPrincipal',
      label: 'Menu principal (cabeçalho)',
      type: 'array',
      fields: [
        { name: 'rotulo', label: 'Rótulo', type: 'text', required: true },
        { name: 'destino', label: 'Destino', type: 'text', admin: { description: 'Caminho interno (/noticias) ou endereço completo. Sem destino = só agrupa os subitens.' } },
        {
          name: 'subitens',
          label: 'Subitens',
          type: 'array',
          fields: [
            { name: 'rotulo', label: 'Rótulo', type: 'text', required: true },
            { name: 'destino', label: 'Destino', type: 'text', required: true },
          ],
        },
      ],
    },
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
