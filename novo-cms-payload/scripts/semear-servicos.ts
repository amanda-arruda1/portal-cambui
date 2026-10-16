/**
 * Carrega na coleção Serviços o catálogo de /servicos que estava FIXO no código (NECESSIDADES em apps/web/src/dados/cidade.ts):
 * um registro por atalho, no grupo (`necessidade`) e na ordem de hoje. Endereços que já são "Links externos" viram `@chave`.
 * Idempotente: pula o slug que já existe. Uso: npx payload run scripts/semear-servicos.ts
 */
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { LINKS_EXTERNOS } from '../../apps/web/src/dados/instituicional'
import { NECESSIDADES } from '../../apps/web/src/dados/cidade'

const payload = await getPayload({ config })
const slugar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const chavePorUrl = new Map(Object.entries(LINKS_EXTERNOS).map(([chave, l]) => [l.url, chave]))

let criados = 0
for (const n of NECESSIDADES) {
  for (const [i, t] of n.tarefas.entries()) {
    const slug = slugar(t.rotulo)
    const ja = await payload.find({ collection: 'servicos', where: { slug: { equals: slug } }, limit: 1, overrideAccess: true, depth: 0 })
    if (ja.docs[0]) continue
    const chave = chavePorUrl.get(t.destino)
    await payload.create({
      collection: 'servicos',
      overrideAccess: true,
      context: { semAuditoria: true },
      data: { nome: t.rotulo, slug, necessidade: n.chave as never, detalhe: t.detalhe, destino: chave ? `@${chave}` : t.destino, ordem: i + 1, status: 'publicado' },
    })
    criados++
  }
}
console.log(`+ ${criados} serviços criados`)
process.exit(0)
