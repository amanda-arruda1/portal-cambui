import type { CollectionConfig } from 'payload'
import { base, camposComuns } from './_base'

export const PerguntasFrequentes: CollectionConfig = {
  ...base('perguntas-frequentes', 'Pergunta frequente', 'Perguntas frequentes', { admin: { useAsTitle: 'pergunta', defaultColumns: ['pergunta', 'categoria', 'ordem', 'status'] } }),
  fields: [
    { name: 'pergunta', label: 'Pergunta', type: 'text', required: true },
    { name: 'resposta', label: 'Resposta', type: 'richText', required: true },
    { name: 'categoria', label: 'Categoria', type: 'text' },
    { name: 'secretaria', label: 'Secretaria responsável', type: 'relationship', relationTo: 'secretarias' },
    { name: 'ordem', label: 'Ordem', type: 'number' },
    ...camposComuns,
  ],
}
