import type { CollectionAfterChangeHook, CollectionConfig } from 'payload'

// licitacao-assinantes/-envios: e-mail de cidadão; auditar guardaria cópia do endereço após o descadastro (LGPD).
// contas-servico: o documento carrega a chave de API; auditar a gravaria em claro no log.
const IGNORAR = new Set(['contas-servico', 'licitacao-assinantes', 'licitacao-envios', 'audit-logs', 'payload-preferences', 'payload-migrations', 'payload-locked-documents'])

/** Grava cada criação/alteração (arquivar = soft delete, registrado como 'delete') em `audit-logs`. */
const registrar: CollectionAfterChangeHook = async ({ collection, doc, previousDoc, operation, req, context }) => {
  if (IGNORAR.has(collection.slug) || context?.semAuditoria) return doc
  try {
    await req.payload.create({
      collection: 'audit-logs',
      overrideAccess: true,
      req,
      data: {
        operacao: operation === 'create' ? 'create' : doc?.status === 'arquivado' && previousDoc?.status !== 'arquivado' ? 'delete' : 'update',
        colecao: collection.slug,
        documentoId: String(doc.id),
        resumo: String(doc.titulo ?? doc.nome ?? doc.pergunta ?? doc.numeroProcesso ?? doc.email ?? doc.id).slice(0, 200),
        usuarioId: req.user ? String(req.user.id) : undefined,
        usuarioEmail: (req.user as { email?: string } | null)?.email,
        antes: operation === 'update' ? previousDoc : undefined,
        depois: doc,
      },
    })
  } catch (erro) {
    req.payload.logger.error({ err: erro, msg: `Falha ao gravar auditoria de ${collection.slug}/${doc?.id}` })
  }
  return doc
}

export const comAuditoria = (c: CollectionConfig): CollectionConfig =>
  IGNORAR.has(c.slug) ? c : { ...c, hooks: { ...c.hooks, afterChange: [...(c.hooks?.afterChange ?? []), registrar] } }
