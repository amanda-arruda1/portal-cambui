/** Preenche `textoBusca` das notícias já migradas (o hook só roda em gravações novas). Preserva updatedAt. */
import { getPayload } from 'payload'
import config from '../src/payload.config'

const payload = await getPayload({ config })
const r = await payload.find({ collection: 'noticias', limit: 0, pagination: false, depth: 0, overrideAccess: true })
let feitas = 0, vazias = 0
for (const n of r.docs as any[]) {
  if (!n.conteudo) { vazias++; continue }
  await payload.update({ collection: 'noticias', id: n.id, data: { conteudo: n.conteudo, updatedAt: n.updatedAt } as any, depth: 0, context: { semAuditoria: true }, overrideAccess: true })
  feitas++
}
const comTexto = (await payload.count({ collection: 'noticias', where: { textoBusca: { exists: true } }, overrideAccess: true })).totalDocs
console.log({ total: r.totalDocs, preenchidas: feitas, semConteudo: vazias, comTextoBusca: comTexto })
process.exit(0)
