import type { CollectionConfig } from 'payload'
import { base, camposComuns } from './_base'
import { acessoLicitacoes } from '../acesso'
import { situacoesLote } from '../enums'

export const LicitacaoLotes: CollectionConfig = {
  ...base('licitacao-lotes', 'Lote de licitação', 'Lotes de licitações', { access: acessoLicitacoes, admin: { useAsTitle: 'descricao', defaultColumns: ['numero', 'descricao', 'licitacao', 'situacao'], group: 'Licitações' } }),
  fields: [
    { name: 'licitacao', label: 'Licitação', type: 'relationship', relationTo: 'licitacoes', required: true, index: true },
    { name: 'numero', label: 'Número', type: 'number', required: true },
    { name: 'descricao', label: 'Descrição', type: 'text', required: true },
    { name: 'valorEstimado', label: 'Valor estimado (R$)', type: 'number' },
    { name: 'situacao', label: 'Situação', type: 'select', defaultValue: 'em_disputa', options: situacoesLote },
    { name: 'vencedorRazaoSocial', label: 'Vencedor (razão social)', type: 'text' },
    { name: 'vencedorCnpj', label: 'Vencedor (CNPJ)', type: 'text', admin: { description: 'CNPJ de pessoa jurídica é público. CPF de pessoa física NUNCA entra aqui sem máscara.' } },
    { name: 'valorHomologado', label: 'Valor homologado (R$)', type: 'number' },
    { name: 'demonstracao', label: 'Demonstração', type: 'checkbox', defaultValue: false },
    ...camposComuns,
  ],
}
