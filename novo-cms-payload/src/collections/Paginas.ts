import type { CollectionConfig } from 'payload'
import { campoHtmlDe } from '../campos-html'
import { acessoSemExclusao, base, camposComuns, leituraPublicaPublicados } from './_base'

export const Paginas: CollectionConfig = {
  ...base('paginas', 'Página', 'Páginas', {
    access: { ...acessoSemExclusao, read: leituraPublicaPublicados },
    admin: { useAsTitle: 'titulo', defaultColumns: ['titulo', 'slug', 'status'] },
  }),
  fields: [
    { name: 'titulo', label: 'Título', type: 'text', required: true },
    { name: 'slug', label: 'Slug (URL)', type: 'text', required: true, unique: true },
    { name: 'conteudo', label: 'Conteúdo', type: 'richText' },
    campoHtmlDe('conteudo'),
    { name: 'atualizadoEm', label: 'Atualizado em', type: 'date' },
    ...camposComuns,
  ],
}
