import type { CollectionConfig } from 'payload'
import { acessoEnvios } from '../acesso'

/**
 * Fila de e-mails de licitações (confirmação de cadastro e aviso de nova licitação). O portal escreve; o serviço
 * `portal-avisos` drena. Sem `status`/`idLegado`: não é conteúdo público, e a fila do Directus não é migrada (tinha 1 teste).
 */
export const LicitacaoEnvios: CollectionConfig = {
  slug: 'licitacao-envios',
  labels: { singular: 'Envio de aviso', plural: 'Envios de avisos de licitações' },
  access: acessoEnvios,
  timestamps: true,
  admin: { group: 'Licitações', useAsTitle: 'assunto', defaultColumns: ['tipo', 'estado', 'tentativas', 'criadoEm'] },
  fields: [
    { name: 'destinatario', label: 'Destinatário', type: 'email', required: true },
    { name: 'assunto', label: 'Assunto', type: 'text', required: true },
    { name: 'corpoTexto', label: 'Corpo (texto)', type: 'textarea', required: true },
    { name: 'corpoHtml', label: 'Corpo (HTML)', type: 'textarea', required: true },
    { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: [{ label: 'Confirmação', value: 'confirmacao' }, { label: 'Aviso', value: 'aviso' }] },
    { name: 'estado', label: 'Estado', type: 'select', required: true, defaultValue: 'pendente', index: true, options: ['pendente', 'enviado', 'falhou', 'desistiu'].map((v) => ({ label: v, value: v })) },
    { name: 'tentativas', label: 'Tentativas', type: 'number', defaultValue: 0 },
    { name: 'ultimoErro', label: 'Último erro', type: 'text' },
    { name: 'criadoEm', label: 'Criado em', type: 'date' },
    { name: 'enviadoEm', label: 'Enviado em', type: 'date' },
    { name: 'assinante', label: 'Assinante', type: 'relationship', relationTo: 'licitacao-assinantes' },
    { name: 'licitacao', label: 'Licitação', type: 'relationship', relationTo: 'licitacoes' },
  ],
}
