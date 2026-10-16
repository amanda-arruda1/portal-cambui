/**
 * Cria (ou gira a chave de) as duas contas de SERVIÇO dos avisos (coleção `contas-servico`) e grava as chaves nos .env (sem imprimir).
 *   portal  → /opt/portal-cambui/.env.web  (PAYLOAD_TOKEN_AVISOS)
 *   entrega → /opt/portal-cambui/.env      (PAYLOAD_TOKEN_ENTREGA)
 * Uso: npx payload run scripts/criar-usuarios-servico-avisos.ts
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import { getPayload } from 'payload'
import config from '../src/payload.config'

const payload = await getPayload({ config })
const contas = [
  { tipo: 'avisos_portal', nome: 'Avisos — portal', arquivo: '/opt/portal-cambui/.env.web', variavel: 'PAYLOAD_TOKEN_AVISOS' },
  { tipo: 'avisos_entrega', nome: 'Avisos — entrega', arquivo: '/opt/portal-cambui/.env', variavel: 'PAYLOAD_TOKEN_ENTREGA' },
] as const

for (const c of contas) {
  const apiKey = crypto.randomBytes(32).toString('hex')
  const existente = await payload.find({ collection: 'contas-servico', where: { tipo: { equals: c.tipo } }, overrideAccess: true, limit: 1 })
  if (existente.docs[0]) {
    await payload.update({ collection: 'contas-servico', id: existente.docs[0].id, overrideAccess: true, data: { enableAPIKey: true, apiKey, nome: c.nome } })
  } else {
    await payload.create({ collection: 'contas-servico', overrideAccess: true, data: { nome: c.nome, tipo: c.tipo, enableAPIKey: true, apiKey } })
  }
  const texto = fs.existsSync(c.arquivo) ? fs.readFileSync(c.arquivo, 'utf8') : ''
  const linha = `${c.variavel}=${apiKey}`
  const novo = new RegExp(`^${c.variavel}=.*$`, 'm').test(texto) ? texto.replace(new RegExp(`^${c.variavel}=.*$`, 'm'), linha) : texto.replace(/\n?$/, '\n') + linha + '\n'
  // Arquivo de credencial: preserva o modo que ele já tem (.env.web é 640 root:portal-web, .env é 600) e, se for NOVO, nasce 600.
  const modo = fs.existsSync(c.arquivo) ? fs.statSync(c.arquivo).mode & 0o777 : 0o600
  fs.writeFileSync(c.arquivo, novo, { mode: modo })
  fs.chmodSync(c.arquivo, modo)
  console.log(`OK ${c.tipo} → ${c.variavel} gravada em ${c.arquivo}`)
}
process.exit(0)
