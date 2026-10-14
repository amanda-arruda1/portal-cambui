import type { CollectionConfig } from 'payload'
import { base, camposComuns } from './_base'

export const Servicos: CollectionConfig = {
  ...base('servicos', 'Serviço', 'Serviços', { admin: { useAsTitle: 'nome', defaultColumns: ['nome', 'categoria', 'status'] } }),
  fields: [
    { name: 'nome', label: 'Nome', type: 'text', required: true },
    { name: 'slug', label: 'Slug (URL)', type: 'text', required: true, unique: true },
    { name: 'descricao', label: 'Descrição', type: 'textarea' },
    { name: 'categoria', label: 'Categoria', type: 'text', admin: { description: 'Agrupa a listagem. Ex.: Tributos, Saúde, Educação.' } },
    { name: 'publicoAlvo', label: 'Público-alvo', type: 'text' },
    { name: 'comoSolicitar', label: 'Como solicitar', type: 'richText' },
    { name: 'urlExterna', label: 'URL externa', type: 'text', admin: { description: 'Serviço que vive em sistema de terceiro.' } },
    { name: 'secretaria', label: 'Secretaria', type: 'relationship', relationTo: 'secretarias' },
    ...camposComuns,
  ],
}
