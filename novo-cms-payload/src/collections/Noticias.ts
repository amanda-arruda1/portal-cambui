import type { CollectionConfig } from 'payload'
import { base, camposComuns } from './_base'

export const Noticias: CollectionConfig = {
  ...base('noticias', 'Notícia', 'Notícias', { admin: { useAsTitle: 'titulo', defaultColumns: ['titulo', 'dataPublicacao', 'destaque', 'status'] } }),
  fields: [
    { name: 'titulo', label: 'Título', type: 'text', required: true },
    { name: 'slug', label: 'Slug (URL)', type: 'text', required: true, unique: true },
    { name: 'resumo', label: 'Resumo', type: 'textarea', admin: { description: 'Chamada da listagem e meta description. Até ~200 caracteres.' } },
    { name: 'conteudo', label: 'Conteúdo', type: 'richText' },
    { name: 'imagem', label: 'Imagem', type: 'upload', relationTo: 'media' },
    { name: 'imagemDescricao', label: 'Texto alternativo da imagem', type: 'text', admin: { description: 'Vazio = imagem decorativa.' } },
    { name: 'arquivo', label: 'Documento anexo', type: 'upload', relationTo: 'media' },
    { name: 'dataPublicacao', label: 'Data de publicação', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'destaque', label: 'Destaque na home', type: 'checkbox', defaultValue: false },
    { name: 'secretaria', label: 'Secretaria', type: 'relationship', relationTo: 'secretarias' },
    ...camposComuns,
  ],
}
