import type { GlobalConfig } from 'payload'
import { global } from './_base'

/** Ícone de tempo na faixa do brasão. Gravado pelo serviço `portal-tempo` (conta `dados_externos`) a cada 30 min, a partir da Open-Meteo. */
export const PrevisaoTempo: GlobalConfig = global(
  {
    slug: 'previsao-tempo',
    label: 'Previsão do tempo',
    admin: { description: 'Preenchida automaticamente (Open-Meteo). Não precisa editar.' },
    fields: [
      { name: 'temperatura', label: 'Temperatura (°C)', type: 'number' },
      { name: 'sensacaoTermica', label: 'Sensação térmica (°C)', type: 'number' },
      { name: 'codigoTempo', label: 'Código do tempo (WMO)', type: 'number' },
      { name: 'umidade', label: 'Umidade (%)', type: 'number' },
      { name: 'ventoKmh', label: 'Vento (km/h)', type: 'number' },
      { name: 'atualizadoEm', label: 'Atualizado em', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    ],
  },
  true,
)
