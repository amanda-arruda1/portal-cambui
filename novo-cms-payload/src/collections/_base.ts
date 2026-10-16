import type { CollectionConfig, Field } from 'payload'

/**
 * Acesso NÃO é definido aqui: `politica.ts` aplica a política de acesso (acesso.ts) a cada coleção. Regra que vale para todas:
 * ninguém apaga registro, nem admin — SOFT DELETE = status "Arquivado" (o registro some do portal e continua no banco).
 * Não usamos `trash: true` do Payload porque ele exige permissão de `delete` para mandar à lixeira (incompatível, testado).
 * Quem de fato precisar purgar um registro faz por migração/SQL, de propósito.
 */

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
    { label: 'Aguardando aprovação', value: 'em_revisao' },
    { label: 'Publicado', value: 'publicado' },
    { label: 'Arquivado', value: 'arquivado' },
  ],
  admin: { position: 'sidebar', description: 'Fluxo: rascunho → aguardando aprovação → publicado. Autor envia para aprovação; só revisor ou administrador publica ou arquiva. Só "Publicado" aparece para o cidadão.' },
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
    timestamps: true,
    ...extra,
  }) satisfies Partial<CollectionConfig>
