/**
 * Cria (ou gira a chave de) a conta de SERVIÇO `dados_externos`, usada por portal-indicadores e portal-tempo para gravar os
 * Globals `indicadores-economicos` e `previsao-tempo`. A chave vai para /opt/portal-cambui/.env (PAYLOAD_TOKEN_DADOS), sem imprimir.
 * Não mexe nas contas dos avisos. Uso: npx payload run scripts/criar-conta-dados-externos.ts
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import { getPayload } from 'payload'
import config from '../src/payload.config'

const payload = await getPayload({ config })
const ARQUIVO = '/opt/portal-cambui/.env'
const VARIAVEL = 'PAYLOAD_TOKEN_DADOS'
const apiKey = crypto.randomBytes(32).toString('hex')
const existente = await payload.find({ collection: 'contas-servico', where: { tipo: { equals: 'dados_externos' } }, overrideAccess: true, limit: 1 })
if (existente.docs[0]) {
  await payload.update({ collection: 'contas-servico', id: existente.docs[0].id, overrideAccess: true, data: { enableAPIKey: true, apiKey } })
} else {
  await payload.create({ collection: 'contas-servico', overrideAccess: true, data: { nome: 'Dados externos — indicadores e tempo', tipo: 'dados_externos', enableAPIKey: true, apiKey } })
}
const texto = fs.readFileSync(ARQUIVO, 'utf8')
const linha = `${VARIAVEL}=${apiKey}`
const re = new RegExp(`^${VARIAVEL}=.*$`, 'm')
const modo = fs.statSync(ARQUIVO).mode & 0o777
fs.writeFileSync(ARQUIVO, re.test(texto) ? texto.replace(re, linha) : texto.replace(/\n?$/, '\n') + linha + '\n', { mode: modo })
fs.chmodSync(ARQUIVO, modo)
console.log(`OK dados_externos → ${VARIAVEL} gravada em ${ARQUIVO}`)
process.exit(0)
