import type { CollectionConfig } from 'payload'
import { acessoSemExclusao } from './_base'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Usuário', plural: 'Usuários' },
  admin: { useAsTitle: 'email', group: 'Sistema' },
  auth: true,
  access: acessoSemExclusao,
  fields: [{ name: 'nome', label: 'Nome', type: 'text' }],
}
