/**
 * Cria (ou gira a chave de) as duas contas de SERVIÇO dos avisos e grava as chaves nos .env (sem imprimir).
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
  { papel: 'servico_avisos_portal', email: 'servico-avisos-portal@sistema.invalid', arquivo: '/opt/portal-cambui/.env.web', variavel: 'PAYLOAD_TOKEN_AVISOS' },
  { papel: 'servico_avisos_entrega', email: 'servico-avisos-entrega@sistema.invalid', arquivo: '/opt/portal-cambui/.env', variavel: 'PAYLOAD_TOKEN_ENTREGA' },
] as const

for (const c of contas) {
  const apiKey = crypto.randomBytes(32).toString('hex')
  const existente = await payload.find({ collection: 'users', where: { email: { equals: c.email } }, overrideAccess: true, limit: 1 })
  if (existente.docs[0]) {
    await payload.update({ collection: 'users', id: existente.docs[0].id, overrideAccess: true, data: { enableAPIKey: true, apiKey, papel: c.papel } })
  } else {
    await payload.create({ collection: 'users', overrideAccess: true, data: { email: c.email, password: crypto.randomBytes(24).toString('base64url') + 'aA1', papel: c.papel, nome: `Serviço ${c.papel}`, enableAPIKey: true, apiKey } })
  }
  const texto = fs.existsSync(c.arquivo) ? fs.readFileSync(c.arquivo, 'utf8') : ''
  const linha = `${c.variavel}=${apiKey}`
  const novo = new RegExp(`^${c.variavel}=.*$`, 'm').test(texto) ? texto.replace(new RegExp(`^${c.variavel}=.*$`, 'm'), linha) : texto.replace(/\n?$/, '\n') + linha + '\n'
  // Arquivo de credencial: preserva o modo que ele já tem (.env.web é 640 root:portal-web, .env é 600) e, se for NOVO, nasce 600.
  const modo = fs.existsSync(c.arquivo) ? fs.statSync(c.arquivo).mode & 0o777 : 0o600
  fs.writeFileSync(c.arquivo, novo, { mode: modo })
  fs.chmodSync(c.arquivo, modo)
  console.log(`OK ${c.papel} → ${c.variavel} gravada em ${c.arquivo}`)
}
process.exit(0)
