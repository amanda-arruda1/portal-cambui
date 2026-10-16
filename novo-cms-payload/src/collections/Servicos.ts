import type { CollectionConfig } from 'payload'
import { campoHtmlDe } from '../campos-html'
import { base, camposComuns } from './_base'

export const Servicos: CollectionConfig = {
  ...base('servicos', 'Serviço', 'Serviços', { admin: { useAsTitle: 'nome', defaultColumns: ['nome', 'necessidade', 'ordem', 'status'] } }),
  fields: [
    { name: 'nome', label: 'Nome', type: 'text', required: true },
    { name: 'slug', label: 'Slug (URL)', type: 'text', required: true, unique: true },
    { name: 'descricao', label: 'Descrição', type: 'textarea' },
    { name: 'categoria', label: 'Categoria', type: 'text', admin: { description: 'Agrupa a listagem. Ex.: Tributos, Saúde, Educação.' } },
    { name: 'publicoAlvo', label: 'Público-alvo', type: 'text' },
    { name: 'comoSolicitar', label: 'Como solicitar', type: 'richText' },
    campoHtmlDe('comoSolicitar'),
    {
      name: 'necessidade',
      label: 'Grupo em /servicos',
      type: 'select',
      options: [
        { label: 'Minha casa e meu bairro', value: 'casa' },
        { label: 'Saúde', value: 'saude' },
        { label: 'Educação', value: 'educacao' },
        { label: 'Trabalho e empresa', value: 'trabalho' },
        { label: 'Documentos e protocolos', value: 'documentos' },
        { label: 'Transparência e acesso à informação', value: 'transparencia' },
      ],
      admin: { description: 'Em qual bloco da página Serviços o atalho aparece. Em branco = só na lista "Todos os serviços cadastrados".' },
    },
    { name: 'detalhe', label: 'Detalhe do atalho', type: 'text', admin: { description: 'Uma linha dizendo o que a pessoa encontra do outro lado.' } },
    { name: 'destino', label: 'Destino do atalho', type: 'text', admin: { description: 'Caminho interno (/documentos), endereço completo ou @link (ex.: @ouvidoria, de Links externos). Em branco usa a URL externa.' } },
    { name: 'ordem', label: 'Ordem', type: 'number', admin: { description: 'Menor aparece primeiro dentro do grupo.' } },
    { name: 'urlExterna', label: 'URL externa', type: 'text', admin: { description: 'Serviço que vive em sistema de terceiro.' } },
    { name: 'secretaria', label: 'Secretaria', type: 'relationship', relationTo: 'secretarias' },
    ...camposComuns,
  ],
}
