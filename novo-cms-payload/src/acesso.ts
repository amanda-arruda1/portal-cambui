import type { Access } from 'payload'

/**
 * Papéis do painel (campo `papel` em `users`).
 *
 * Licitações e Obras NÃO seguem o fluxo editorial de notícias nem o escopo por secretaria: edital tem prazo legal e um
 * responsável só. Replica as permissões do Directus (`infra/directus/licitacoes/aplicar-permissoes.mjs`):
 *  - setor_licitacoes: cria, lê e altera licitações e filhos (nunca apaga — ninguém apaga);
 *  - leitor_licitacoes: só lê.
 * `editor` (conteúdo geral) NÃO enxerga licitações, como no Directus.
 */
export const papelDe = (user: unknown): string | undefined => (user as { papel?: string } | null | undefined)?.papel

export const ehAdmin = (user: unknown) => papelDe(user) === 'administrador'

const PODE_ESCREVER_LICITACOES = ['administrador', 'setor_licitacoes']
const PODE_LER_LICITACOES = [...PODE_ESCREVER_LICITACOES, 'leitor_licitacoes']

export const podeEscreverLicitacoes = (user: unknown) => PODE_ESCREVER_LICITACOES.includes(papelDe(user) ?? '')
export const podeLerLicitacoes = (user: unknown) => PODE_LER_LICITACOES.includes(papelDe(user) ?? '')

/** Leitura pública SÓ do publicado; usuário logado lê tudo se o papel permitir, senão só o publicado. */
export const leituraLicitacoes: Access = ({ req: { user } }) => (podeLerLicitacoes(user) ? true : { status: { equals: 'publicado' } })

export const escritaLicitacoes: Access = ({ req: { user } }) => podeEscreverLicitacoes(user)

/** Coleções filhas e dados pessoais: leitura só de quem pode ver licitações no painel (a leitura pública é filtrada). */
export const acessoLicitacoes = {
  read: leituraLicitacoes,
  create: escritaLicitacoes,
  update: escritaLicitacoes,
  delete: () => false,
} as const

/** Assinantes de avisos: e-mail de cidadão. Nunca público. */
export const acessoAssinantes = {
  read: ({ req: { user } }: Parameters<Access>[0]) => podeLerLicitacoes(user),
  create: escritaLicitacoes,
  update: escritaLicitacoes,
  delete: () => false,
} as const
