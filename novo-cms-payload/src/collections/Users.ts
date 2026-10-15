import { APIError } from 'payload'
import type { Access, CollectionBeforeValidateHook, CollectionConfig } from 'payload'

/**
 * Usuários do painel.
 *
 * SEM isto, qualquer conta de servidor criava outros usuários e trocava e-mail e senha de qualquer um,
 * inclusive do administrador — o painel seria a porta de entrada de uma tomada de conta. Por isso:
 *  - só `administrador` cria usuários, vê a lista inteira e muda `papel`;
 *  - os demais veem e editam só o PRÓPRIO cadastro;
 *  - ninguém apaga (arquivar fica por conta de quem administra, por SQL ou migração).
 * Os papéis do fluxo editorial (redator, revisor, publicador, escopo por secretaria) entram com Licitações.
 */
const ehAdmin = (user: unknown) => (user as { papel?: string } | null | undefined)?.papel === 'administrador'

const soAdmin: Access = ({ req: { user } }) => ehAdmin(user)
const adminOuProprio: Access = ({ req: { user } }) => (ehAdmin(user) ? true : user ? { id: { equals: user.id } } : false)

/** O primeiro usuário de um banco novo (tela "criar primeiro usuário") só pode ser administrador. */
const primeiroEhAdmin: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data
  const { totalDocs } = await req.payload.count({ collection: 'users', overrideAccess: true })
  return totalDocs === 0 ? { ...data, papel: 'administrador' } : data
}

const SENHA_MINIMA = 12
const senhaForte: CollectionBeforeValidateHook = ({ data }) => {
  if (data?.password !== undefined && String(data.password).length < SENHA_MINIMA) {
    throw new APIError(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`, 400, undefined, true)
  }
  return data
}

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Usuário', plural: 'Usuários' },
  admin: { useAsTitle: 'email', group: 'Sistema', defaultColumns: ['email', 'nome', 'papel'], hidden: ({ user }) => !ehAdmin(user) },
  auth: {
    useAPIKey: true, // credenciais dos serviços de avisos; contas de pessoas não ganham chave
    // 5 erros bloqueiam a conta por 15 minutos. O Payload já faz isso por padrão; fica explícito para não depender de padrão.
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    tokenExpiration: 8 * 60 * 60, // uma jornada de trabalho
    cookies: { secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' },
  },
  access: { read: adminOuProprio, create: soAdmin, update: adminOuProprio, delete: () => false },
  hooks: { beforeValidate: [primeiroEhAdmin, senhaForte] },
  fields: [
    { name: 'nome', label: 'Nome', type: 'text' },
    {
      name: 'papel',
      label: 'Papel',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      options: [
        { label: 'Administrador', value: 'administrador' },
        { label: 'Editor', value: 'editor' },
        { label: 'Setor de licitações', value: 'setor_licitacoes' },
        { label: 'Leitor de licitações', value: 'leitor_licitacoes' },
        { label: 'Setor de obras', value: 'setor_obras' },
        { label: 'Leitor de obras', value: 'leitor_obras' },
        { label: 'Serviço: avisos (portal)', value: 'servico_avisos_portal' },
        { label: 'Serviço: avisos (entrega)', value: 'servico_avisos_entrega' },
      ],
      // `!user`: só a tela "primeiro usuário" chega aqui sem login (a coleção recusa criação anônima quando já há usuários).
      access: { create: ({ req: { user } }) => !user || ehAdmin(user), update: ({ req: { user } }) => ehAdmin(user) },
      admin: { description: 'Administrador gerencia usuários. Editor edita conteúdo geral. Setor de licitações/obras cria e altera; Leitor só consulta.' },
    },
  ],
}
