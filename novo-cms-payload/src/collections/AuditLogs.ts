import type { CollectionConfig } from 'payload'
import { ehAdmin } from '../acesso'

/**
 * Trilha de auditoria IMUTÁVEL. Só os hooks do servidor gravam (Local API com
 * overrideAccess); pela API/painel ninguém cria, altera ou apaga registro.
 */
export const AuditLogs: CollectionConfig = {
  slug: 'audit-logs',
  labels: { singular: 'Registro de auditoria', plural: 'Auditoria' },
  admin: { useAsTitle: 'resumo', defaultColumns: ['createdAt', 'operacao', 'colecao', 'documentoId', 'usuarioEmail'], group: 'Sistema' },
  access: {
    // Só administrador: guarda o antes/depois de TODOS os módulos (rascunhos, valores, contas).
    read: ({ req: { user } }) => ehAdmin(user),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  timestamps: true,
  fields: [
    { name: 'operacao', label: 'Operação', type: 'select', required: true, options: [{ label: 'Criação', value: 'create' }, { label: 'Alteração', value: 'update' }, { label: 'Exclusão', value: 'delete' }] },
    { name: 'colecao', label: 'Coleção', type: 'text', required: true, index: true },
    { name: 'documentoId', label: 'ID do documento', type: 'text', required: true, index: true },
    { name: 'resumo', label: 'Resumo', type: 'text' },
    { name: 'usuarioId', label: 'ID do usuário', type: 'text' },
    { name: 'usuarioEmail', label: 'E-mail do usuário', type: 'text' },
    { name: 'antes', label: 'Antes', type: 'json' },
    { name: 'depois', label: 'Depois', type: 'json' },
  ],
}
