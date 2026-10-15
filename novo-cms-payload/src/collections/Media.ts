import type { CollectionConfig } from 'payload'
import { campoIdLegado } from './_base'
import { inspecionarUpload } from '../upload/inspecionar'
import { ehAdmin, ehAutor, ehRevisor } from '../acesso'

/** Enviar arquivo: admin, revisor ou autor (precisam anexar documentos e fotos nos módulos). Serviços e visitantes, não. */
const podeEnviar = ({ req: { user } }: { req: { user?: unknown } }) => ehAdmin(user) || ehRevisor(user) || ehAutor(user)

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Arquivo', plural: 'Arquivos' },
  // Sem item no menu: a navegação é por "Pastas de Arquivos" (a lista plana tinha 2.500+ itens misturados).
  admin: { hidden: true, group: 'Sistema', defaultColumns: ['filename', 'alt', 'pasta', 'mimeType', 'createdAt'] },
  access: {
    read: () => true,
    create: podeEnviar,
    update: podeEnviar,
    delete: () => false,
  },
  fields: [
    // Opcional: os arquivos migrados do Directus não têm texto alternativo.
    { name: 'alt', label: 'Texto alternativo', type: 'text' },
    { name: 'pasta', label: 'Pasta', type: 'relationship', relationTo: 'pastas', hasMany: false, admin: { position: 'sidebar' } },
    campoIdLegado,
  ],
  hooks: { beforeOperation: [inspecionarUpload] },
  upload: true,
}
