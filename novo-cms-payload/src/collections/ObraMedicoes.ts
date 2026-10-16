import type { CollectionConfig } from 'payload'
import { base, camposComuns } from './_base'
import { acumuladoDaMedicao, medicaoAtualizaObra } from '../hooks-obras'

export const ObraMedicoes: CollectionConfig = {
  ...base('obra-medicoes', 'Medição de obra', 'Medições de obras', { hooks: { beforeChange: [acumuladoDaMedicao], afterChange: [medicaoAtualizaObra] }, admin: { useAsTitle: 'numero', defaultColumns: ['numero', 'obra', 'dataReferencia', 'valorMedido'], group: 'Obras' } }),
  fields: [
    { name: 'obra', label: 'Obra', type: 'relationship', relationTo: 'obras', required: true, index: true },
    { name: 'numero', label: 'Número', type: 'number', required: true },
    { name: 'dataReferencia', label: 'Data de referência', type: 'date', required: true },
    { name: 'percentualAcumulado', label: 'Percentual acumulado (%)', type: 'number', min: 0, max: 100 },
    { name: 'valorMedido', label: 'Valor medido (R$)', type: 'number' },
    { name: 'valorAcumulado', label: 'Valor acumulado (R$)', type: 'number' },
    { name: 'boletim', label: 'Boletim de medição', type: 'upload', relationTo: 'media' },
    { name: 'observacoes', label: 'Observações', type: 'textarea' },
    { name: 'demonstracao', label: 'Demonstração', type: 'checkbox', defaultValue: false },
    ...camposComuns,
  ],
}
