import type { Access, FieldAccess } from 'payload'

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
// setor_obras lê licitações só para poder vincular uma licitação de origem à obra (como no Directus).
const PODE_LER_LICITACOES = [...PODE_ESCREVER_LICITACOES, 'leitor_licitacoes', 'setor_obras']

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

/**
 * Avisos por e-mail: credenciais de SERVIÇO (chave de API), separadas e estreitas — como no Directus.
 *  - servico_avisos_portal: o processo web. Cadastra assinante e enfileira a confirmação; confirma e APAGA (LGPD) por token.
 *  - servico_avisos_entrega: o `portal-avisos`. Lê assinantes confirmados, enfileira avisos, drena e atualiza a fila.
 * Assinantes e fila contêm e-mail de cidadão: nunca públicos, e fora da auditoria (hooks-auditoria), que guardaria a cópia
 * do endereço depois do descadastro.
 */
const ehPortal = (user: unknown) => papelDe(user) === 'servico_avisos_portal'
const ehEntrega = (user: unknown) => papelDe(user) === 'servico_avisos_entrega'
const ehServicoAvisos = (user: unknown) => ehPortal(user) || ehEntrega(user)

/** Quem vê e-mail de assinante e fila: setor/leitor de LICITAÇÕES. `setor_obras` lê licitações só para vincular a origem — não vê cidadão. */
const PODE_LER_ASSINANTES = ['administrador', 'setor_licitacoes', 'leitor_licitacoes']
const podeLerAssinantes = (user: unknown) => PODE_LER_ASSINANTES.includes(papelDe(user) ?? '')

/** Campos que são CREDENCIAL (token de confirmar/sair; corpo do e-mail, que embute esses links): só as contas de serviço leem. */
export const soServicoAvisos: FieldAccess = ({ req: { user } }) => ehServicoAvisos(user)

export const acessoAssinantes = {
  read: ({ req: { user } }: Parameters<Access>[0]) => podeLerAssinantes(user) || ehServicoAvisos(user),
  create: ({ req: { user } }: Parameters<Access>[0]) => podeEscreverLicitacoes(user) || ehPortal(user),
  update: ({ req: { user } }: Parameters<Access>[0]) => podeEscreverLicitacoes(user) || ehPortal(user),
  // Descadastro APAGA o registro (marcar inativo guardaria o e-mail de quem pediu para sair). Único delete real do sistema.
  delete: ({ req: { user } }: Parameters<Access>[0]) => ehPortal(user),
} as const

export const acessoEnvios = {
  read: ({ req: { user } }: Parameters<Access>[0]) => podeLerAssinantes(user) || ehServicoAvisos(user),
  create: ({ req: { user } }: Parameters<Access>[0]) => ehServicoAvisos(user),
  update: ({ req: { user } }: Parameters<Access>[0]) => ehEntrega(user),
  delete: () => false,
} as const

/**
 * Obras públicas — mesmo modelo de Licitações (infra/directus/obras/aplicar-permissoes.mjs): o setor de obras cria, lê e altera
 * (nunca apaga); o leitor só lê; `editor` geral não enxerga. Leitura pública só do `publicado`.
 */
const PODE_ESCREVER_OBRAS = ['administrador', 'setor_obras']
const PODE_LER_OBRAS = [...PODE_ESCREVER_OBRAS, 'leitor_obras']
export const podeEscreverObras = (user: unknown) => PODE_ESCREVER_OBRAS.includes(papelDe(user) ?? '')
export const podeLerObras = (user: unknown) => PODE_LER_OBRAS.includes(papelDe(user) ?? '')

export const acessoObras = {
  read: (({ req: { user } }) => (podeLerObras(user) ? true : { status: { equals: 'publicado' } })) as Access,
  create: (({ req: { user } }) => podeEscreverObras(user)) as Access,
  update: (({ req: { user } }) => podeEscreverObras(user)) as Access,
  delete: () => false,
} as const
