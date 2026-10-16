import type { Access, GlobalAfterChangeHook, GlobalConfig } from 'payload'
import { ehAdmin, ehServicoDados } from '../acesso'

/**
 * Globals = textos e links que o site tinha FIXOS no código (configurações, navegação, links externos, página inicial).
 * Leitura pública (o site precisa); só o administrador altera. Cada gravação vai para `audit-logs`, como nas coleções.
 * Se um Global estiver vazio ou o Payload fora do ar, o site usa os valores de reserva que continuam em `apps/web/src/dados/`.
 */
const soAdmin: Access = ({ req: { user } }) => ehAdmin(user)

const auditar =
  (slug: string): GlobalAfterChangeHook =>
  async ({ doc, previousDoc, req, context }) => {
    if (context?.semAuditoria) return doc
    // Conta de serviço (indicadores/tempo) grava a cada 30 min: auditar encheria o log sem dizer nada.
    if ((req.user as { collection?: string } | null)?.collection === 'contas-servico') return doc
    try {
      await req.payload.create({
        collection: 'audit-logs',
        overrideAccess: true,
        req,
        data: {
          operacao: 'update',
          colecao: `global:${slug}`,
          documentoId: slug,
          resumo: `Global ${slug}`,
          usuarioId: req.user ? String(req.user.id) : undefined,
          usuarioEmail: (req.user as { email?: string } | null)?.email,
          antes: previousDoc,
          depois: doc,
        },
      })
    } catch (erro) {
      req.payload.logger.error({ err: erro, msg: `Falha ao gravar auditoria do global ${slug}` })
    }
    return doc
  }

/** `servicoGrava`: Global alimentado por serviço externo (conta `dados_externos`), além do administrador. */
export const global = (g: GlobalConfig, servicoGrava = false): GlobalConfig => ({
  ...g,
  access: { read: () => true, update: servicoGrava ? ({ req: { user } }) => ehAdmin(user) || ehServicoDados(user) : soAdmin },
  admin: { ...g.admin, group: 'Configurações', hidden: ({ user }: { user?: unknown }) => !ehAdmin(user) },
  hooks: { ...g.hooks, afterChange: [...(g.hooks?.afterChange ?? []), auditar(g.slug)] },
})
