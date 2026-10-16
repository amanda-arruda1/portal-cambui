import { APIError } from 'payload'
import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook, CollectionConfig, Field } from 'payload'
import { acessoConteudo, acessoFilho, ehAdmin, ehAutor, ehRevisor, STATUS_DO_AUTOR, temModulo } from './acesso'

/**
 * Aplica a política de acesso (acesso.ts) a cada coleção a partir de UMA tabela — as coleções não repetem `access` à mão.
 * Coleção nova de conteúdo: entra em TOPO (ou em FILHOS) e em MODULOS (acesso.ts); sem isso ela fica FECHADA (só leitura do
 * publicado), não aberta.
 */
const TOPO = new Set([
  'secretarias', 'noticias', 'servicos', 'documentos', 'paginas', 'selos', 'perguntas-frequentes',
  'patrimonio-cultural', 'telefones-uteis', 'coleta-lixo', 'conselhos-municipais', 'licitacoes', 'obras',
])
const FILHOS: Record<string, { modulo: string; campoPai: string; colecaoPai: string }> = {
  'licitacao-anexos': { modulo: 'licitacoes', campoPai: 'licitacao', colecaoPai: 'licitacoes' },
  'licitacao-lotes': { modulo: 'licitacoes', campoPai: 'licitacao', colecaoPai: 'licitacoes' },
  'licitacao-eventos': { modulo: 'licitacoes', campoPai: 'licitacao', colecaoPai: 'licitacoes' },
  'obra-anexos': { modulo: 'obras', campoPai: 'obra', colecaoPai: 'obras' },
  'obra-medicoes': { modulo: 'obras', campoPai: 'obra', colecaoPai: 'obras' },
}
const SO_ADMIN_NO_MENU = new Set(['licitacao-assinantes', 'licitacao-envios', 'audit-logs', 'contas-servico', 'users'])

/** Autor só salva `rascunho` ou `em_revisao`. Admin/revisor: livres. Sem usuário (Local API interna: migração, hooks): livre. */
const guardaDoAutor: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (!req.user || !ehAutor(req.user)) return data
  const final = data?.status ?? originalDoc?.status ?? 'rascunho'
  if (!(STATUS_DO_AUTOR as readonly string[]).includes(final)) {
    throw new APIError('Como autor, você pode salvar como rascunho ou enviar para revisão. Publicar e arquivar é com o revisor ou o administrador.', 403, undefined, true)
  }
  return data
}

/** Filho (anexo, lote, evento, medição) nasce `publicado`: quem decide o que vai ao ar é o PAI. Só admin/revisor mudam isso depois. */
const statusDoFilho: CollectionBeforeValidateHook = ({ data, operation, req }) => {
  if (!data) return data
  if (operation === 'create' && (!req.user || !(ehAdmin(req.user) || ehRevisor(req.user)) || !data.status)) data.status = 'publicado'
  return data
}

const campoStatusDoFilho = (f: Field): Field =>
  (f as { name?: string }).name === 'status'
    ? ({
        ...f,
        defaultValue: 'publicado',
        access: { create: ({ req: { user } }) => ehAdmin(user) || ehRevisor(user), update: ({ req: { user } }) => ehAdmin(user) || ehRevisor(user) },
        admin: { ...((f as { admin?: object }).admin ?? {}), description: 'Anexos, lotes, eventos e medições seguem o item principal: aparecem quando ele é publicado. "Arquivado" esconde só este registro.' },
      } as Field)
    : f

/** Grupo de cada coleção no menu lateral do painel (o admin vê 6 grupos; revisor/autor só os módulos liberados). */
const GRUPOS: Record<string, string> = {
  noticias: 'Conteúdo', paginas: 'Conteúdo', secretarias: 'Conteúdo', documentos: 'Conteúdo', 'patrimonio-cultural': 'Conteúdo', 'conselhos-municipais': 'Conteúdo',
  servicos: 'Serviços ao cidadão', 'perguntas-frequentes': 'Serviços ao cidadão', 'telefones-uteis': 'Serviços ao cidadão', 'coleta-lixo': 'Serviços ao cidadão',
  licitacoes: 'Transparência', obras: 'Transparência', selos: 'Transparência',
  pastas: 'Arquivos', media: 'Arquivos',
  users: 'Sistema', 'contas-servico': 'Sistema', 'audit-logs': 'Sistema', 'licitacao-assinantes': 'Sistema', 'licitacao-envios': 'Sistema', 'fotos-perfil': 'Sistema',
}

/**
 * Anexos, lotes, eventos e medições NÃO aparecem no menu: são editados dentro do item principal (campo `join` em Licitações e Obras,
 * com "Criar novo"). Continuam existindo na API e com as mesmas regras de acesso.
 */
const politica = (c: CollectionConfig): CollectionConfig => {
  const ocultar = (modulo: string) => ({ ...c.admin, hidden: ({ user }: { user?: unknown }) => !temModulo(user, modulo) })
  if (TOPO.has(c.slug)) {
    return { ...c, access: acessoConteudo(c.slug), admin: ocultar(c.slug), hooks: { ...c.hooks, beforeChange: [guardaDoAutor, ...(c.hooks?.beforeChange ?? [])] } }
  }
  const filho = FILHOS[c.slug]
  if (filho) {
    return {
      ...c,
      access: acessoFilho(filho.modulo, filho.campoPai, filho.colecaoPai, c.slug),
      admin: ocultar(filho.modulo),
      hooks: { ...c.hooks, beforeValidate: [statusDoFilho, ...(c.hooks?.beforeValidate ?? [])] },
      fields: c.fields.map(campoStatusDoFilho),
    }
  }
  if (SO_ADMIN_NO_MENU.has(c.slug) && c.slug !== 'users') return { ...c, admin: { ...c.admin, hidden: ({ user }: { user?: unknown }) => !ehAdmin(user) } }
  return c
}

export const comPolitica = (c: CollectionConfig): CollectionConfig => {
  const r = politica(c)
  const group = GRUPOS[c.slug]
  const admin = FILHOS[c.slug] ? { ...r.admin, group: group ?? r.admin?.group, hidden: true } : group ? { ...r.admin, group } : r.admin
  return { ...r, admin }
}
