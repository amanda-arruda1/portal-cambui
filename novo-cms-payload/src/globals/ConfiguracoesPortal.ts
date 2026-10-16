import type { GlobalConfig } from 'payload'
import { global } from './_base'

export const ConfiguracoesPortal: GlobalConfig = global({
  slug: 'configuracoes-portal',
  label: 'Configurações do Portal',
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Identificação',
          fields: [
            { name: 'tituloSite', label: 'Título do site', type: 'text', required: true },
            { name: 'descricaoSite', label: 'Descrição do site (buscadores)', type: 'textarea', required: true },
            { name: 'nomeMunicipio', label: 'Nome do município', type: 'text', required: true },
            { name: 'uf', label: 'UF', type: 'text', required: true, maxLength: 2 },
            { name: 'nomeCompleto', label: 'Nome oficial do órgão', type: 'text', required: true },
            { name: 'gentilico', label: 'Gentílico', type: 'text' },
            { name: 'cnpj', label: 'CNPJ', type: 'text' },
          ],
        },
        {
          label: 'Atendimento',
          fields: [
            {
              name: 'endereco',
              label: 'Endereço da sede',
              type: 'group',
              fields: [
                { name: 'logradouro', label: 'Logradouro', type: 'text' },
                { name: 'numero', label: 'Número', type: 'text' },
                { name: 'bairro', label: 'Bairro', type: 'text' },
                { name: 'cidade', label: 'Cidade', type: 'text' },
                { name: 'uf', label: 'UF', type: 'text', maxLength: 2 },
                { name: 'cep', label: 'CEP', type: 'text' },
              ],
            },
            {
              name: 'telefones',
              label: 'Telefones',
              type: 'array',
              fields: [
                { name: 'rotulo', label: 'Rótulo', type: 'text', required: true },
                { name: 'numero', label: 'Número', type: 'text', required: true },
              ],
            },
            { name: 'emailContato', label: 'E-mail de contato ao cidadão', type: 'email', admin: { description: 'Em branco = não aparece no site.' } },
            { name: 'horarioAtendimento', label: 'Horário de atendimento', type: 'text', admin: { description: 'Em branco = não aparece no site.' } },
            {
              name: 'redesSociais',
              label: 'Redes sociais oficiais',
              type: 'array',
              fields: [
                { name: 'nome', label: 'Nome', type: 'text', required: true },
                { name: 'url', label: 'URL', type: 'text', required: true },
              ],
            },
          ],
        },
        {
          label: 'Autarquias',
          fields: [
            {
              name: 'autarquias',
              label: 'Autarquias com portal próprio',
              type: 'array',
              fields: [
                { name: 'nome', label: 'Nome', type: 'text', required: true },
                { name: 'sigla', label: 'Sigla', type: 'text', required: true },
                { name: 'url', label: 'Endereço do portal', type: 'text', required: true },
                { name: 'descricao', label: 'Descrição curta', type: 'text' },
              ],
            },
          ],
        },
      ],
    },
  ],
})
