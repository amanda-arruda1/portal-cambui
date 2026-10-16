import type { CollectionConfig } from 'payload'
import { ehAdmin, soAdmin } from '../acesso'

/**
 * Contas de SERVIÇO (não são pessoas): o processo web (`avisos_portal`) e o serviço `portal-avisos` (`avisos_entrega`).
 * Sem senha e sem tela de login: só chave de API (`Authorization: contas-servico API-Key <chave>`), gerada/girada por
 * `scripts/criar-usuarios-servico-avisos.ts`. Ficam fora de `users` para os papéis de pessoa serem exatamente três
 * (admin, revisor, autor). Permissões em acesso.ts (acessoAssinantes/acessoEnvios).
 */
export const ContasServico: CollectionConfig = {
  slug: 'contas-servico',
  labels: { singular: 'Conta de serviço', plural: 'Contas de serviço' },
  admin: { useAsTitle: 'nome', group: 'Sistema', defaultColumns: ['nome', 'tipo'], hidden: ({ user }) => !ehAdmin(user) },
  auth: { disableLocalStrategy: true, useAPIKey: true },
  access: { read: soAdmin, create: soAdmin, update: soAdmin, delete: () => false },
  fields: [
    { name: 'nome', label: 'Nome', type: 'text', required: true },
    {
      name: 'tipo', label: 'Tipo', type: 'select', required: true, unique: true,
      options: [{ label: 'Avisos — portal (cadastro, confirmação, descadastro)', value: 'avisos_portal' }, { label: 'Avisos — entrega (fila e detecção de novas licitações)', value: 'avisos_entrega' }],
    },
  ],
}
