import type { CollectionConfig } from 'payload'
import { ehAdmin, ehAutor, ehRevisor } from '../acesso'

/** Pastas hierárquicas para organizar os Arquivos (media). Só organização interna: nada disso é público nem muda a URL do arquivo. */
const equipe = ({ req: { user } }: { req: { user?: unknown } }) => ehAdmin(user) || ehRevisor(user) || ehAutor(user)

export const Pastas: CollectionConfig = {
  slug: 'pastas',
  labels: { singular: 'Pasta de Arquivo', plural: 'Pastas de Arquivos' },
  admin: { group: 'Sistema', useAsTitle: 'nome', defaultColumns: ['nome', 'pastaPai'] },
  access: { read: equipe, create: equipe, update: equipe, delete: () => false },
  fields: [
    { name: 'nome', label: 'Nome', type: 'text', required: true },
    {
      name: 'pastaPai', label: 'Pasta pai', type: 'relationship', relationTo: 'pastas', hasMany: false,
      filterOptions: ({ id }) => (id ? { id: { not_equals: id } } : true), // uma pasta não pode ser pai de si mesma
      admin: { description: 'Deixe vazio para uma pasta de primeiro nível.' },
    },
    // Gerenciador de arquivos: o que está DENTRO desta pasta. Virtual (não cria coluna). O botão "Criar novo" do campo abre o
    // envio de arquivo já com esta pasta preenchida; "Adicionar existente" não se aplica a join, por isso o upload é por aqui.
    {
      name: 'subpastas', label: 'Subpastas', type: 'join', collection: 'pastas', on: 'pastaPai',
      defaultLimit: 50, defaultSort: 'nome', admin: { defaultColumns: ['nome'], allowCreate: true },
    },
    {
      name: 'arquivos', label: 'Arquivos desta pasta', type: 'join', collection: 'media', on: 'pasta',
      defaultLimit: 50, defaultSort: 'filename', admin: { defaultColumns: ['filename', 'alt', 'mimeType', 'filesize', 'createdAt'], allowCreate: true },
    },
  ],
}
