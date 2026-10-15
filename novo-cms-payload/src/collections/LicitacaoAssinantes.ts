import type { CollectionConfig } from 'payload'
import { base, campoIdLegado } from './_base'
import { acessoAssinantes } from '../acesso'

/** Base mínima (LGPD): só e-mail e preferências. Duplo opt-in. */
export const LicitacaoAssinantes: CollectionConfig = {
  ...base('licitacao-assinantes', 'Assinante de avisos', 'Assinantes de avisos de licitações', { access: acessoAssinantes, admin: { useAsTitle: 'email', defaultColumns: ['email', 'confirmado'], group: 'Licitações' } }),
  fields: [
    { name: 'email', label: 'E-mail', type: 'email', required: true, unique: true },
    { name: 'modalidades', label: 'Modalidades', type: 'textarea', admin: { description: 'Valores separados por vírgula. Vazio = todas.' } },
    { name: 'palavrasChave', label: 'Palavras-chave', type: 'textarea', admin: { description: 'Separadas por vírgula. Vazio = todas.' } },
    { name: 'confirmado', label: 'Confirmado', type: 'checkbox', defaultValue: false },
    { name: 'token', label: 'Token', type: 'text', admin: { readOnly: true } },
    { name: 'criadoEm', label: 'Criado em', type: 'date' },
    { name: 'confirmadoEm', label: 'Confirmado em', type: 'date' },
    campoIdLegado,
  ],
}
