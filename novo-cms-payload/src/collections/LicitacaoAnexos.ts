import type { CollectionConfig } from 'payload'
import { base, camposComuns } from './_base'
import { tiposAnexoLicitacao } from '../enums'

export const LicitacaoAnexos: CollectionConfig = {
  ...base('licitacao-anexos', 'Anexo de licitação', 'Anexos de licitações', { admin: { useAsTitle: 'titulo', defaultColumns: ['titulo', 'tipo', 'licitacao', 'dataPublicacao'], group: 'Licitações' } }),
  fields: [
    { name: 'licitacao', label: 'Licitação', type: 'relationship', relationTo: 'licitacoes', required: true, index: true },
    { name: 'titulo', label: 'Título', type: 'text', required: true },
    { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: tiposAnexoLicitacao },
    { name: 'arquivo', label: 'Arquivo', type: 'upload', relationTo: 'media' },
    { name: 'urlExterna', label: 'URL externa', type: 'text' },
    { name: 'dataPublicacao', label: 'Data de publicação', type: 'date', required: true },
    { name: 'versao', label: 'Versão', type: 'number', defaultValue: 1 },
    { name: 'substitui', label: 'Substitui', type: 'relationship', relationTo: 'licitacao-anexos', admin: { description: 'Documento que esta versão substitui.' } },
    { name: 'superado', label: 'Superado', type: 'checkbox', defaultValue: false, admin: { description: 'Continua visível como histórico. Nunca some.' } },
    { name: 'ordem', label: 'Ordem', type: 'number' },
    { name: 'demonstracao', label: 'Demonstração', type: 'checkbox', defaultValue: false },
    ...camposComuns,
  ],
}
