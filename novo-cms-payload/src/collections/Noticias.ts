import type { CollectionConfig } from 'payload'
import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'
import { campoHtmlDe } from '../campos-html'
import { base, camposComuns } from './_base'

export const Noticias: CollectionConfig = {
  ...base('noticias', 'Notícia', 'Notícias', {
    admin: { useAsTitle: 'titulo', defaultColumns: ['titulo', 'dataPublicacao', 'destaque', 'status'], listSearchableFields: ['titulo', 'slug', 'resumo'] },
    defaultSort: '-dataPublicacao',
    hooks: {
      // `where` roda no banco e continua funcionando; só não devolve o texto de busca (duplicaria o corpo em cada resposta).
      afterRead: [({ doc }) => { delete doc.textoBusca; return doc }],
    },
  }),
  fields: [
    { name: 'titulo', label: 'Título', type: 'text', required: true },
    { name: 'slug', label: 'Slug (URL)', type: 'text', required: true, unique: true },
    { name: 'resumo', label: 'Resumo', type: 'textarea', admin: { description: 'Chamada da listagem e meta description. Até ~200 caracteres.' } },
    { name: 'conteudo', label: 'Conteúdo', type: 'richText' },
    campoHtmlDe('conteudo'),
    {
      // Texto puro do corpo, só para a busca do portal (o Directus buscava no HTML; aqui o corpo é JSON do
      // editor e não dá para `like`). Gerado a cada gravação a partir de `conteudo`; ninguém edita.
      name: 'textoBusca',
      label: 'Texto para busca',
      type: 'textarea',
      admin: { hidden: true, readOnly: true },
      hooks: {
        beforeChange: [
          ({ siblingData }) => (siblingData?.conteudo ? convertLexicalToPlaintext({ data: siblingData.conteudo }) : null),
        ],
      },
    },
    { name: 'imagem', label: 'Imagem', type: 'upload', relationTo: 'media' },
    { name: 'imagemDescricao', label: 'Texto alternativo da imagem', type: 'text', admin: { description: 'Vazio = imagem decorativa.' } },
    { name: 'arquivo', label: 'Documento anexo', type: 'upload', relationTo: 'media' },
    { name: 'dataPublicacao', label: 'Data de publicação', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'destaque', label: 'Destaque na home', type: 'checkbox', defaultValue: false },
    { name: 'secretaria', label: 'Secretaria', type: 'relationship', relationTo: 'secretarias' },
    ...camposComuns,
  ],
}
