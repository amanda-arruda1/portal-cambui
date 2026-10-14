import type { CollectionConfig } from 'payload'
import { campoHtmlDe } from '../campos-html'
import { acessoSemExclusao, base, camposComuns, leituraPublicaPublicados } from './_base'
import { categoriasConselho } from '../enums'

export const ConselhosMunicipais: CollectionConfig = {
  ...base('conselhos-municipais', 'Conselho municipal', 'Conselhos municipais', {
    access: { ...acessoSemExclusao, read: leituraPublicaPublicados },
    admin: { useAsTitle: 'nome', defaultColumns: ['nome', 'categoria', 'ordem', 'status'] },
  }),
  fields: [
    { name: 'nome', label: 'Nome', type: 'text', required: true },
    { name: 'categoria', label: 'Categoria', type: 'select', required: true, options: categoriasConselho },
    { name: 'conteudo', label: 'Conteúdo', type: 'richText', admin: { description: 'Leis, portarias e atas do conselho — cada uma como um link de documento.' } },
    campoHtmlDe('conteudo'),
    { name: 'ordem', label: 'Ordem', type: 'number' },
    ...camposComuns,
  ],
}
