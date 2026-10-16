import type { GlobalConfig } from 'payload'
import { global } from './_base'

export const PaginaInicial: GlobalConfig = global({
  slug: 'pagina-inicial',
  label: 'Página inicial',
  fields: [
    {
      name: 'heroi',
      label: 'Destaque do topo',
      type: 'group',
      fields: [
        { name: 'selo', label: 'Selo (linha pequena acima do título)', type: 'text' },
        { name: 'titulo', label: 'Título', type: 'textarea', admin: { description: 'Cada linha do campo vira uma linha no título.' } },
        { name: 'subtitulo', label: 'Subtítulo', type: 'textarea' },
      ],
    },
    {
      name: 'tarefas',
      label: 'O que você precisa hoje (atalhos)',
      type: 'array',
      fields: [
        { name: 'rotulo', label: 'Rótulo (verbo primeiro)', type: 'text', required: true },
        { name: 'detalhe', label: 'Detalhe', type: 'text', required: true },
        { name: 'destino', label: 'Destino', type: 'text', required: true },
        { name: 'externo', label: 'Abre sistema de terceiro', type: 'checkbox', defaultValue: false },
      ],
    },
    {
      name: 'cidade',
      label: 'Bloco "A cidade"',
      type: 'group',
      fields: [
        { name: 'chamada', label: 'Chamada', type: 'text' },
        { name: 'texto', label: 'Texto', type: 'textarea' },
        { name: 'portalTuristico', label: 'Link do portal turístico', type: 'text' },
      ],
    },
  ],
})
