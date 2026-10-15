import type { Access, CollectionConfig, Field } from 'payload'

/**
 * Conteúdo geral (notícias, páginas, secretarias, telefones…) é de `administrador` e `editor`. Os papéis de Licitações e
 * Obras (setor/leitor) NÃO editam nem enxergam rascunho de conteúdo geral — como no Directus, onde esses papéis só têm
 * permissão nos próprios módulos. Antes qualquer usuário logado escrevia em tudo.
 */
const PAPEIS_CONTEUDO = ['administrador', 'editor']
export const ehDeConteudo = (user: unknown) => PAPEIS_CONTEUDO.includes((user as { papel?: string } | null | undefined)?.papel ?? '')
const autenticado: Access = ({ req: { user } }) => ehDeConteudo(user)

/**
 * Regras comuns a TODAS as coleções de conteúdo:
 *  - `delete: () => false` → ninguém apaga registro, nem administrador.
 *  - SOFT DELETE = status "Arquivado" (campo `status`): o registro some do portal
 *    e continua no banco, restaurável. Não usamos `trash: true` do Payload porque
 *    ele exige permissão de `delete` para mandar à lixeira — incompatível com
 *    `delete: () => false` (verificado em teste).
 * Quem de fato precisar purgar um registro faz por migração/SQL, de propósito.
 */
export const acessoSemExclusao: CollectionConfig['access'] = {
  read: autenticado,
  create: autenticado,
  update: autenticado,
  delete: () => false,
}

/** Leitura pública SÓ do que está publicado (a API que o site consome); rascunho e arquivado exigem login. */
export const leituraPublicaPublicados: Access = ({ req: { user } }) => (ehDeConteudo(user) ? true : { status: { equals: 'publicado' } })

/** Visibilidade no portal, igual ao campo `status` do Directus. */
export const campoStatus: Field = {
  name: 'status',
  label: 'Status',
  type: 'select',
  defaultValue: 'rascunho',
  required: true,
  index: true,
  options: [
    { label: 'Rascunho', value: 'rascunho' },
    { label: 'Publicado', value: 'publicado' },
    { label: 'Arquivado', value: 'arquivado' },
  ],
  admin: { position: 'sidebar', description: 'Só "Publicado" aparece para o cidadão.' },
}

/** Id do registro no Directus — chave de idempotência e de conferência da migração. */
export const campoIdLegado: Field = {
  name: 'idLegado',
  label: 'ID no CMS antigo',
  type: 'text',
  unique: true,
  index: true,
  admin: { position: 'sidebar', readOnly: true, description: 'UUID do Directus. Não editar.' },
}

/** Quem criou/alterou no Directus (UUIDs de usuário do CMS antigo) — preservado para não perder autoria. */
export const campoAutoriaLegado: Field = {
  name: 'autoriaLegado',
  label: 'Autoria no CMS antigo',
  type: 'json',
  admin: { position: 'sidebar', readOnly: true },
}

export const camposComuns: Field[] = [campoStatus, campoIdLegado, campoAutoriaLegado]

export const base = (slug: string, singular: string, plural: string, extra: Partial<CollectionConfig> = {}) =>
  ({
    slug,
    labels: { singular, plural },
      access: acessoSemExclusao,
    timestamps: true,
    ...extra,
  }) satisfies Partial<CollectionConfig>
