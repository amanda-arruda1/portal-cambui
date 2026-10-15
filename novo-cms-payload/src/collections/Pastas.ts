import type { CollectionConfig } from 'payload'
import { ehAdmin, ehAutor, ehRevisor } from '../acesso'

/** Pastas hierárquicas para organizar os Arquivos (media). Só organização interna: nada disso é público nem muda a URL do arquivo. */
const equipe = ({ req: { user } }: { req: { user?: unknown } }) => ehAdmin(user) || ehRevisor(user) || ehAutor(user)

export const Pastas: CollectionConfig = {
  slug: 'pastas',
  labels: { singular: 'Pasta', plural: 'Pastas' },
  admin: { group: 'Sistema', useAsTitle: 'nome', defaultColumns: ['nome', 'pastaPai'] },
  access: { read: equipe, create: equipe, update: equipe, delete: () => false },
  fields: [
    { name: 'nome', label: 'Nome', type: 'text', required: true },
    {
      name: 'pastaPai', label: 'Pasta pai', type: 'relationship', relationTo: 'pastas', hasMany: false,
      filterOptions: ({ id }) => (id ? { id: { not_equals: id } } : true), // uma pasta não pode ser pai de si mesma
      admin: { description: 'Deixe vazio para uma pasta de primeiro nível.' },
    },
  ],
}
