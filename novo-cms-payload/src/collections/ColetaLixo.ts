import type { CollectionConfig } from 'payload'
import { base, camposComuns } from './_base'

export const ColetaLixo: CollectionConfig = {
  ...base('coleta-lixo', 'Coleta de lixo', 'Coleta de lixo', {
    admin: { useAsTitle: 'nome', defaultColumns: ['nome', 'dias', 'horario', 'status'] },
  }),
  fields: [
    { name: 'nome', label: 'Bairro ou região', type: 'text', required: true },
    { name: 'dias', label: 'Dias da coleta', type: 'text', required: true, admin: { description: 'Como aparecem na página. Ex.: "Segunda-feira, Quarta-feira, Sexta-feira".' } },
    { name: 'horario', label: 'Horário', type: 'text', required: true },
    ...camposComuns,
  ],
}
