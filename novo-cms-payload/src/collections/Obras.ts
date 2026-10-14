import type { CollectionConfig } from 'payload'
import { base, camposComuns } from './_base'
import { categoriasObra, fontesRecurso, situacoesObra } from '../enums'

export const Obras: CollectionConfig = {
  ...base('obras', 'Obra pública', 'Obras públicas', { admin: { useAsTitle: 'objetoResumo', defaultColumns: ['objetoResumo', 'categoria', 'situacao', 'percentualExecucao', 'status'], listSearchableFields: ['numeroProcesso', 'objetoResumo'] } }),
  fields: [
    { name: 'numeroProcesso', label: 'Número do processo', type: 'text', required: true },
    { name: 'numeroContrato', label: 'Número do contrato', type: 'text' },
    { name: 'licitacao', label: 'Licitação de origem', type: 'relationship', relationTo: 'licitacoes' },
    { name: 'slug', label: 'Slug (URL)', type: 'text', required: true, unique: true },
    { name: 'categoria', label: 'Categoria', type: 'select', required: true, options: categoriasObra },
    { name: 'secretaria', label: 'Secretaria responsável', type: 'relationship', relationTo: 'secretarias' },
    { name: 'objetoResumo', label: 'Objeto (resumo)', type: 'textarea', required: true },
    { name: 'objeto', label: 'Objeto (completo)', type: 'richText' },
    { name: 'endereco', label: 'Endereço', type: 'text' },
    { name: 'empresaExecutora', label: 'Empresa executora', type: 'text' },
    { name: 'empresaCnpj', label: 'CNPJ da empresa', type: 'text' },
    { name: 'responsavelTecnico', label: 'Responsável técnico', type: 'text' },
    { name: 'artRrt', label: 'ART / RRT', type: 'text', admin: { description: 'Obra sem ART/RRT é irregularidade típica de auditoria.' } },
    { name: 'fonteRecurso', label: 'Fonte de recurso', type: 'select', required: true, options: fontesRecurso },
    { name: 'numeroConvenio', label: 'Número do convênio', type: 'text' },
    { name: 'valorContratado', label: 'Valor contratado (R$)', type: 'number' },
    { name: 'valorAditivado', label: 'Valor aditivado (R$)', type: 'number', defaultValue: 0 },
    { name: 'valorPago', label: 'Valor pago (R$)', type: 'number', defaultValue: 0 },
    { name: 'dataOrdemServico', label: 'Ordem de serviço', type: 'date' },
    { name: 'dataPrevistaTermino', label: 'Previsão de término', type: 'date' },
    { name: 'dataTerminoReal', label: 'Término real', type: 'date' },
    { name: 'situacao', label: 'Situação', type: 'select', required: true, defaultValue: 'planejada', index: true, options: situacoesObra },
    { name: 'motivoSituacao', label: 'Motivo da situação', type: 'textarea', admin: { description: 'Obrigatório quando paralisada ou cancelada.' } },
    { name: 'percentualExecucao', label: 'Execução física (%)', type: 'number', min: 0, max: 100, defaultValue: 0 },
    { name: 'observacoes', label: 'Observações', type: 'textarea' },
    { name: 'dataPublicacao', label: 'Data de publicação', type: 'date', required: true },
    { name: 'demonstracao', label: 'Demonstração', type: 'checkbox', defaultValue: false },
    ...camposComuns,
  ],
}
