import type { CollectionConfig } from 'payload'
import { campoHtmlDe } from '../campos-html'
import { base, camposComuns } from './_base'

export const Secretarias: CollectionConfig = {
  ...base('secretarias', 'Secretaria', 'Secretarias', {
    admin: { useAsTitle: 'nome', defaultColumns: ['nome', 'responsavel', 'ordem', 'status'] },
  }),
  fields: [
    { name: 'nome', label: 'Nome', type: 'text', required: true },
    { name: 'slug', label: 'Slug (URL)', type: 'text', required: true, unique: true, admin: { description: 'Usado na URL: /secretarias/<slug>' } },
    { name: 'sigla', label: 'Sigla', type: 'text' },
    { name: 'palavrasChave', label: 'Palavras-chave para busca', type: 'text' },
    { name: 'descricao', label: 'Descrição', type: 'richText' },
    campoHtmlDe('descricao'),
    { name: 'responsavel', label: 'Responsável', type: 'text' },
    { name: 'cargoResponsavel', label: 'Cargo do responsável', type: 'text' },
    { name: 'biografiaResponsavel', label: 'Biografia do responsável', type: 'richText' },
    campoHtmlDe('biografiaResponsavel'),
    { name: 'endereco', label: 'Endereço', type: 'text' },
    { name: 'telefone', label: 'Telefone', type: 'text' },
    { name: 'email', label: 'E-mail', type: 'text' },
    { name: 'horarioAtendimento', label: 'Horário de atendimento', type: 'text' },
    { name: 'ordem', label: 'Ordem de exibição', type: 'number' },
    ...camposComuns,
  ],
}
