import type { CollectionConfig } from 'payload'
import { campoIdLegado } from './_base'
import { inspecionarUpload } from '../upload/inspecionar'

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Arquivo', plural: 'Arquivos' },
  admin: { group: 'Sistema' },
  access: {
    read: () => true,
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: () => false,
  },
  fields: [
    // Opcional: os arquivos migrados do Directus não têm texto alternativo.
    { name: 'alt', label: 'Texto alternativo', type: 'text' },
    campoIdLegado,
  ],
  hooks: { beforeOperation: [inspecionarUpload] },
  upload: true,
}
