import type { Access, FieldAccess } from 'payload'
import { TERMOS_VERSAO } from './termos-de-uso'

/**
 * Controle de acesso do painel — CMS institucional com fluxo de aprovação.
 *
 * Três papéis (campo `papel` em `users`):
 *  - admin:   acesso total (exceto apagar: ver abaixo).
 *  - revisor: cria, lê e altera nos MÓDULOS que o admin liberou (`modulosPermitidos`) e leva o item a QUALQUER status,
 *             inclusive `publicado` e `arquivado`.
 *  - autor:   cria, lê e altera nos módulos liberados, mas só transita entre `rascunho` e `em_revisao`. Não publica nem
 *             arquiva, e não mexe em item que já foi publicado/arquivado (senão editaria o ar sem passar por revisão).
 * Fluxo: autor rascunha → envia para revisão (`em_revisao`) → revisor ou admin publica.
 *
 * NINGUÉM apaga registro, nem admin: apagar = status `arquivado` (soft delete). Registro de licitação, obra, edital e a trilha
 * de auditoria são documento público/oficial; purgar é decisão deliberada, por migração/SQL.
 *
 * Contas de SERVIÇO (avisos por e-mail) não são pessoas e não têm papel: ficam na coleção própria `contas-servico`
 * (sem senha, só chave de API), e só enxergam o que os avisos precisam.
 */
export type Papel = 'admin' | 'revisor' | 'autor'

type Usuario = { papel?: string; modulosPermitidos?: string[]; collection?: string; tipo?: string; versaoTermosAceita?: string | null } | null | undefined
const u = (user: unknown) => user as Usuario

/**
 * Pessoa do painel que ainda não aceitou a VERSÃO ATUAL do termo de uso (ver termos-de-uso.ts). Enquanto isso ela não tem papel
 * nenhum: como TODA regra de acesso parte de `papelDe`, o aceite vale na API inteira, não só na tela. Única coisa que ela
 * consegue fazer é aceitar (endpoint em Users.ts, que só exige estar logada) e sair. Conta de serviço não é pessoa: não se aplica.
 */
export const termosPendentes = (user: unknown): boolean => u(user)?.collection === 'users' && u(user)?.versaoTermosAceita !== TERMOS_VERSAO

export const papelDe = (user: unknown): string | undefined => (termosPendentes(user) ? undefined : u(user)?.papel)
export const ehAdmin = (user: unknown) => u(user)?.collection !== 'contas-servico' && papelDe(user) === 'admin'
export const ehRevisor = (user: unknown) => papelDe(user) === 'revisor'
export const ehAutor = (user: unknown) => papelDe(user) === 'autor'

/** Módulos que o admin pode liberar (valor = slug da coleção principal; o rótulo vem em português). */
export const MODULOS = [
  { value: 'secretarias', label: 'Secretarias' },
  { value: 'noticias', label: 'Notícias' },
  { value: 'servicos', label: 'Serviços' },
  { value: 'documentos', label: 'Documentos e editais' },
  { value: 'paginas', label: 'Páginas' },
  { value: 'selos', label: 'Selos e certificações' },
  { value: 'perguntas-frequentes', label: 'Perguntas frequentes' },
  { value: 'patrimonio-cultural', label: 'Patrimônio Cultural' },
  { value: 'telefones-uteis', label: 'Telefones úteis' },
  { value: 'coleta-lixo', label: 'Coleta de lixo' },
  { value: 'conselhos-municipais', label: 'Conselhos municipais' },
  { value: 'licitacoes', label: 'Licitações (inclui anexos, lotes e eventos)' },
  { value: 'obras', label: 'Obras públicas (inclui anexos e medições)' },
] as const

/** Tem este módulo liberado? Admin tem todos. */
export const temModulo = (user: unknown, modulo: string): boolean => {
  if (!u(user) || u(user)?.collection === 'contas-servico') return false
  if (ehAdmin(user)) return true
  return (ehRevisor(user) || ehAutor(user)) && (u(user)?.modulosPermitidos ?? []).includes(modulo)
}

/** Pode criar no módulo (admin, ou revisor/autor com o módulo liberado). Usado também pelo endpoint de importação do PNCP. */
export const podeCriarEm = (modulo: string) => (user: unknown) => temModulo(user, modulo)

/** Status em que o AUTOR pode trabalhar. Fora disso, só revisor/admin. */
export const STATUS_DO_AUTOR = ['rascunho', 'em_revisao'] as const

/* ───────────── coleção de conteúdo (notícias, páginas, secretarias, licitações, obras…) ───────────── */

export const acessoConteudo = (modulo: string) => ({
  // Visitante e quem não tem o módulo: só o `publicado`. Quem tem o módulo lê tudo (rascunho e em revisão incluídos).
  read: (({ req: { user } }) => (temModulo(user, modulo) ? true : { status: { equals: 'publicado' } })) as Access,
  create: (({ req: { user } }) => temModulo(user, modulo)) as Access,
  update: (({ req: { user } }) => {
    if (!temModulo(user, modulo)) return false
    if (ehAutor(user)) return { status: { in: [...STATUS_DO_AUTOR] } } // autor não mexe no que já foi ao ar ou foi arquivado
    return true
  }) as Access,
  delete: () => false,
})

/* ───────────── coleção FILHA (anexos, lotes, eventos, medições): segue o estado do item pai ───────────── */

export const acessoFilho = (modulo: string, campoPai: string, colecaoPai: string, colecaoFilho: string) => {
  // Autor só mexe em filho cujo pai ainda não foi ao ar (senão trocaria o edital/ART publicado sem revisão).
  const paiEditavel = async (req: any, paiId: unknown): Promise<boolean> => {
    const id = paiId && typeof paiId === 'object' ? (paiId as { id?: unknown }).id : paiId
    if (id == null) return false
    const pai: any = await req.payload.findByID({ collection: colecaoPai as any, id: id as any, depth: 0, overrideAccess: true }).catch(() => null)
    return !!pai && (STATUS_DO_AUTOR as readonly string[]).includes(pai.status)
  }
  // UPDATE: vale o pai ATUAL do registro (lido do banco) e, se o corpo trocar o pai, também o NOVO. Confiar só no corpo deixava o
  // autor mudar um anexo de licitação publicada mandando, junto, o id de um pai em rascunho.
  const autorPodeAlterar = async (req: any, id: unknown, data: any): Promise<boolean> => {
    if (id == null) return false
    const filho: any = await req.payload.findByID({ collection: colecaoFilho as any, id: id as any, depth: 0, overrideAccess: true }).catch(() => null)
    if (!filho || !(await paiEditavel(req, filho[campoPai]))) return false
    return data?.[campoPai] == null || (await paiEditavel(req, data[campoPai]))
  }
  return {
    // Público vê o filho só se o PAI estiver publicado (antes o anexo de um rascunho vazava por consulta direta) e não arquivado.
    read: (({ req: { user } }) => (temModulo(user, modulo) ? true : { and: [{ status: { not_equals: 'arquivado' } }, { [`${campoPai}.status`]: { equals: 'publicado' } }] })) as Access,
    create: (async ({ req, data }) => {
      if (!temModulo(req.user, modulo)) return false
      return ehAutor(req.user) ? paiEditavel(req, data?.[campoPai]) : true
    }) as Access,
    update: (async ({ req, id, data }) => {
      if (!temModulo(req.user, modulo)) return false
      return ehAutor(req.user) ? autorPodeAlterar(req, id, data) : true
    }) as Access,
    delete: () => false,
  }
}

/* ───────────── avisos por e-mail: contas de serviço (coleção `contas-servico`) ───────────── */

const ehServico = (user: unknown, tipo?: string) => u(user)?.collection === 'contas-servico' && (!tipo || u(user)?.tipo === tipo)
// Só as duas contas dos avisos: a conta `dados_externos` (indicadores/tempo) NÃO pode ler assinantes nem a fila.
const ehPortal = (user: unknown) => ehServico(user, 'avisos_portal')
const ehEntrega = (user: unknown) => ehServico(user, 'avisos_entrega')
export const ehServicoAvisos = (user: unknown) => ehPortal(user) || ehEntrega(user)
export const ehServicoDados = (user: unknown) => ehServico(user, 'dados_externos')

/** Campos que são CREDENCIAL (token de confirmar/sair; corpo do e-mail, que embute esses links): só as contas de serviço leem. */
export const soServicoAvisos: FieldAccess = ({ req: { user } }) => ehServicoAvisos(user)

/**
 * Assinantes e fila: e-mail de cidadão (LGPD). Só admin e as contas de serviço — nem o revisor nem o autor de Licitações veem.
 * Descadastro APAGA o registro (marcar inativo guardaria o e-mail de quem pediu para sair): único `delete` real do sistema.
 */
export const acessoAssinantes = {
  read: (({ req: { user } }) => ehAdmin(user) || ehServicoAvisos(user)) as Access,
  create: (({ req: { user } }) => ehAdmin(user) || ehPortal(user)) as Access,
  update: (({ req: { user } }) => ehAdmin(user) || ehPortal(user)) as Access,
  delete: (({ req: { user } }) => ehPortal(user)) as Access,
}

export const acessoEnvios = {
  read: (({ req: { user } }) => ehAdmin(user) || ehServicoAvisos(user)) as Access,
  create: (({ req: { user } }) => ehServicoAvisos(user)) as Access,
  update: (({ req: { user } }) => ehEntrega(user)) as Access,
  delete: () => false,
}

/** Só admin: contas de serviço (chaves), auditoria. */
export const soAdmin: Access = ({ req: { user } }) => ehAdmin(user)
