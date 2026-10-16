import { APIError } from 'payload'
import type { Access, CollectionAfterLoginHook, CollectionBeforeValidateHook, CollectionConfig, Endpoint } from 'payload'
import { MODULOS, ehAdmin, soAdmin, termosPendentes } from '../acesso'
import { TERMOS_VERSAO } from '../termos-de-uso'

/**
 * Usuários do painel (pessoas). Três papéis — ver acesso.ts:
 *  - admin: tudo; gerencia usuários;
 *  - revisor (chefe de setor): cria/edita nos módulos liberados e leva o item a qualquer status (publica, arquiva);
 *  - autor (redator): cria/edita nos módulos liberados, só entre rascunho e "aguardando aprovação".
 * `modulosPermitidos` lista os módulos (coleções) que revisor e autor acessam; admin ignora.
 *
 * Só `admin` cria usuários, vê a lista inteira e muda `papel`/`modulosPermitidos`; os demais veem e editam só o PRÓPRIO
 * cadastro (senão qualquer conta trocaria a senha do administrador). Ninguém apaga. Contas de serviço NÃO moram aqui
 * (ver ContasServico.ts).
 */
// `user.collection === 'users'`: conta de serviço (outra coleção) pode ter o MESMO id numérico de uma pessoa — sem esta checagem
// o filtro `id = <id da conta>` entregaria o cadastro (e as sessões) de outra pessoa.
const adminOuProprio: Access = ({ req: { user } }) => (ehAdmin(user) ? true : user && user.collection === 'users' && !termosPendentes(user) ? { id: { equals: user.id } } : false)
/** Ler o PRÓPRIO cadastro é permitido mesmo sem aceite: a tela do termo precisa saber quem está logado (/users/me). Alterar, não. */
const lerProprio: Access = ({ req: { user } }) => (user && user.collection === 'users' ? { id: { equals: user.id } } : false)

/** O primeiro usuário de um banco novo (tela "criar primeiro usuário") só pode ser administrador. */
const primeiroEhAdmin: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data
  const { totalDocs } = await req.payload.count({ collection: 'users', overrideAccess: true })
  return totalDocs === 0 ? { ...data, papel: 'admin' } : data
}

const SENHA_MINIMA = 12
const senhaForte: CollectionBeforeValidateHook = ({ data }) => {
  if (data?.password !== undefined && String(data.password).length < SENHA_MINIMA) {
    throw new APIError(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`, 400, undefined, true)
  }
  return data
}

/** Registra o IP do último login (privacidade/segurança: a pessoa vê de onde a conta foi usada). Direto no banco: não gera log de auditoria nem hooks. */
const registrarIp: CollectionAfterLoginHook = async ({ req, user }) => {
  const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() // X-Real-IP: o nginx sobrescreve; vale o IP já resolvido
  if (!ip) return user
  await req.payload.db.updateOne({ collection: 'users', id: user.id, data: { ultimoLoginIp: ip.slice(0, 64) }, req, returning: false }).catch(() => undefined)
  return user
}


/** O próprio usuário registra o aceite da versão ATUAL do termo (o campo é protegido contra PATCH comum). */
const aceitarTermos: Endpoint['handler'] = async (req) => {
  if (!req.user || req.user.collection !== 'users') return Response.json({ erro: 'Entre no painel primeiro.' }, { status: 401 })
  const corpo = (await req.json?.().catch(() => ({}))) as { versao?: string }
  if (corpo?.versao !== TERMOS_VERSAO) return Response.json({ erro: 'Versão do termo desatualizada. Recarregue a página.' }, { status: 409 })
  await req.payload.update({
    collection: 'users', id: req.user.id, overrideAccess: true, depth: 0, context: { semAuditoria: true },
    data: { dataAceiteTermos: new Date().toISOString(), versaoTermosAceita: TERMOS_VERSAO } as never,
  })
  return Response.json({ ok: true })
}

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Usuário', plural: 'Usuários' },
  admin: { useAsTitle: 'email', group: 'Sistema', defaultColumns: ['email', 'nome', 'papel'], hidden: ({ user }) => !ehAdmin(user) },
  auth: {
    // 5 erros bloqueiam a conta por 15 minutos. O Payload já faz isso por padrão; fica explícito para não depender de padrão.
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    tokenExpiration: 8 * 60 * 60, // uma jornada de trabalho
    cookies: { secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' },
  },
  access: { read: (a) => (termosPendentes(a.req.user) ? lerProprio(a) : adminOuProprio(a)), create: soAdmin, update: adminOuProprio, delete: () => false },
  hooks: { beforeValidate: [primeiroEhAdmin, senhaForte], afterLogin: [registrarIp] },
  endpoints: [{ path: '/aceitar-termos', method: 'post', handler: aceitarTermos }],
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Dados Pessoais',
          fields: [
            { name: 'nome', label: 'Nome', type: 'text' },
            { name: 'nomeExibicao', label: 'Nome de exibição', type: 'text', admin: { description: 'Como você quer ser chamado(a) no painel.' } },
            { name: 'matricula', label: 'Matrícula', type: 'text' },
            { name: 'fotoPerfil', label: 'Foto de perfil', type: 'upload', relationTo: 'fotos-perfil', admin: { description: 'PNG, JPG ou WebP. Visível só para quem tem conta no painel.' } },
          ],
        },
        {
          label: 'Acesso',
          description: 'Definido pelo administrador.',
          fields: [
        {
          name: 'papel',
          label: 'Papel',
          type: 'select',
          required: true,
          defaultValue: 'autor',
          options: [
            { label: 'Administrador', value: 'admin' },
            { label: 'Revisor (chefe de setor)', value: 'revisor' },
            { label: 'Autor (redator)', value: 'autor' },
          ],
          // `!user`: só a tela "primeiro usuário" chega aqui sem login (a coleção recusa criação anônima quando já há usuários).
          access: { create: ({ req: { user } }) => !user || ehAdmin(user), update: ({ req: { user } }) => ehAdmin(user) },
          admin: { description: 'Administrador: tudo. Revisor: publica e arquiva nos módulos liberados. Autor: escreve e envia para aprovação, não publica.' },
        },
        {
          name: 'modulosPermitidos',
          label: 'Módulos permitidos',
          type: 'select',
          hasMany: true,
          options: [...MODULOS],
          // Revisor e autor sem nenhum módulo não conseguiriam fazer nada: melhor recusar na criação do que descobrir depois.
          validate: (valor: unknown, { siblingData }: { siblingData: { papel?: string } }) =>
            siblingData?.papel !== 'admin' && (!Array.isArray(valor) || valor.length === 0) ? 'Revisor e autor precisam de pelo menos um módulo liberado.' : true,
          access: { create: ({ req: { user } }) => !user || ehAdmin(user), update: ({ req: { user } }) => ehAdmin(user) },
          admin: { condition: (_, siblingData) => siblingData?.papel !== 'admin', description: 'Quais coleções este usuário acessa. Licitações e Obras incluem seus anexos, lotes, eventos e medições. Administrador tem todos.' },
        },
          ],
        },
        {
          label: 'Privacidade e Segurança',
          description: 'Somente leitura para você. O registro é feito pelo sistema.',
          fields: [
            { name: 'dataAceiteTermos', label: 'Data de aceite dos termos', type: 'date', access: { create: () => false, update: () => false }, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' }, description: 'Registrada quando você aceita o termo de uso (tela exibida no primeiro acesso).' } },
            { name: 'versaoTermosAceita', label: 'Versão do termo aceita', type: 'text', access: { create: () => false, update: () => false }, admin: { readOnly: true } },
            { name: 'ultimoLoginIp', label: 'IP do último acesso', type: 'text', access: { create: () => false, update: () => false }, admin: { readOnly: true, description: 'Registrado automaticamente a cada login.' } },
          ],
        },
      ],
    },
  ],
}
