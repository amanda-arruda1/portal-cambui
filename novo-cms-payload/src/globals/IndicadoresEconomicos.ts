import type { GlobalConfig } from 'payload'
import { global } from './_base'

/** Faixa do topo do site. Gravado pelo serviço `portal-indicadores` (conta `dados_externos`) a cada 30 min; o administrador só consulta. */
export const IndicadoresEconomicos: GlobalConfig = global(
  {
    slug: 'indicadores-economicos',
    label: 'Indicadores econômicos',
    admin: { description: 'Preenchido automaticamente (Banco Central e AwesomeAPI). Não precisa editar.' },
    fields: [
      {
        name: 'itens',
        label: 'Indicadores',
        type: 'array',
        fields: [
          { name: 'chave', label: 'Chave', type: 'select', required: true, options: ['ipca', 'selic', 'cdi', 'dolar'].map((v) => ({ label: v, value: v })) },
          { name: 'rotulo', label: 'Rótulo', type: 'text', required: true },
          { name: 'descricao', label: 'Descrição', type: 'text' },
          { name: 'valor', label: 'Valor', type: 'number' },
          { name: 'unidade', label: 'Unidade', type: 'select', required: true, options: [{ label: 'Percentual', value: 'percentual' }, { label: 'Moeda (R$)', value: 'moeda' }] },
          { name: 'variacao', label: 'Variação', type: 'number' },
          { name: 'referencia', label: 'Referência', type: 'text' },
          { name: 'fonte', label: 'Fonte', type: 'text' },
        ],
      },
      { name: 'atualizadoEm', label: 'Atualizado em', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    ],
  },
  true,
)
