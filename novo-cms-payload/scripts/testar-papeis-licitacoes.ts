/**
 * Prova dos papéis e regras de Licitações contra o serviço no ar (127.0.0.1:3000/cms).
 * Cria usuários e registros DESCARTÁVEIS (prefixo TESTE) e os lista ao final para remoção por SQL.
 * Uso: npx payload run scripts/testar-papeis-licitacoes.ts
 */
import { getPayload } from 'payload'
import config from '../src/payload.config'

const BASE = 'http://127.0.0.1:3000/cms/api'
const SENHA = 'Teste-' + Math.random().toString(36).slice(2) + 'Aa1!'
let falhas = 0
const ok = (cond: boolean, msg: string, extra?: unknown) => { console.log(`${cond ? 'OK  ' : 'FALHA'} ${msg}`); if (!cond) { falhas++; if (extra) console.log('     ', JSON.stringify(extra).slice(0, 400)) } }

async function entrar(email: string) {
  const r = await fetch(`${BASE}/users/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3000' }, body: JSON.stringify({ email, password: SENHA }) })
  const j: any = await r.json()
  return j.token as string
}
async function req(token: string | null, metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(`${BASE}${caminho}`, { method: metodo, headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3000', ...(token ? { authorization: `JWT ${token}` } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined })
  let j: any = null; try { j = await r.json() } catch {}
  return { s: r.status, j }
}

const payload = await getPayload({ config })
const papeis = ['setor_licitacoes', 'leitor_licitacoes', 'editor'] as const
const tokens: Record<string, string> = {}
for (const papel of papeis) {
  const email = `teste-${papel}@teste.invalid`
  await payload.delete({ collection: 'users', where: { email: { equals: email } }, overrideAccess: true }).catch(() => {})
  await payload.create({ collection: 'users', overrideAccess: true, data: { email, password: SENHA, papel, nome: `TESTE ${papel}` } })
  tokens[papel] = await entrar(email)
}
const setor = tokens.setor_licitacoes, leitor = tokens.leitor_licitacoes, editor = tokens.editor

const agora = Date.now()
const iso = (dias: number) => new Date(agora + dias * 86400000).toISOString()
const base = { numeroProcesso: 'TESTE-9001/2026', numero: 9001, ano: 2026, modalidade: 'pregao_eletronico', forma: 'eletronica', criterioJulgamento: 'menor_preco', objetoResumo: 'TESTE de papéis', dataPublicacao: iso(0), dataSessao: iso(3), situacao: 'publicada', status: 'rascunho' }

let r = await req(setor, 'POST', '/licitacoes', { ...base, numeroProcesso: 'TESTE-9000/2026', forma: 'presencial' })
ok(r.s === 400 && /justificativa/i.test(JSON.stringify(r.j)), 'presencial sem justificativa é recusada', r)

r = await req(setor, 'POST', '/licitacoes', base)
ok(r.s === 201 && r.j?.doc?.slug === 'pregao-eletronico-009'.replace('009', '9001') || r.j?.doc?.slug === 'pregao-eletronico-9001', 'setor cria rascunho e o slug é gerado', r)
const id = r.j?.doc?.id

r = await req(setor, 'PATCH', `/licitacoes/${id}`, { status: 'publicado' })
ok(r.s === 400 && /edital/i.test(JSON.stringify(r.j)), 'publicar sem edital é recusado', r)

r = await req(setor, 'POST', '/licitacao-anexos', { licitacao: id, titulo: 'TESTE edital', tipo: 'edital', urlExterna: 'https://exemplo.invalid/edital.pdf', dataPublicacao: iso(0) })
ok(r.s === 201, 'setor anexa o edital', r)
const anexo1 = r.j?.doc?.id

r = await req(setor, 'PATCH', `/licitacoes/${id}`, { status: 'publicado' })
ok(r.s === 400 && /justificativa/i.test(JSON.stringify(r.j)), 'prazo menor que o art. 55 exige justificativa', r)

r = await req(setor, 'PATCH', `/licitacoes/${id}`, { status: 'publicado', justificativaPrazo: 'Urgência comprovada no processo' })
ok(r.s === 200 && r.j?.doc?.status === 'publicado', 'publica com justificativa', r)

r = await req(setor, 'GET', `/licitacao-eventos?where[licitacao][equals]=${id}&where[tipo][equals]=publicacao`)
ok(r.j?.totalDocs === 1 && /Urgência comprovada/.test(r.j.docs[0].descricao), 'evento de publicação com a justificativa', r)

r = await req(setor, 'PATCH', `/licitacoes/${id}`, { slug: 'outro-endereco', objetoResumo: 'TESTE editado' })
ok(r.s === 200 && r.j?.doc?.slug === 'pregao-eletronico-9001', 'slug não muda depois de publicada', r)

r = await req(setor, 'POST', '/licitacao-anexos', { licitacao: id, titulo: 'TESTE edital v2', tipo: 'edital', urlExterna: 'https://exemplo.invalid/edital2.pdf', dataPublicacao: iso(0), versao: 2, substitui: anexo1 })
ok(r.s === 201, 'retificação criada', r)
r = await req(setor, 'GET', `/licitacao-anexos/${anexo1}`)
ok(r.j?.superado === true, 'anexo substituído vira superado', r)
r = await req(setor, 'GET', `/licitacao-eventos?where[licitacao][equals]=${id}&where[tipo][equals]=retificacao`)
ok(r.j?.totalDocs === 1, 'evento de retificação registrado', r)

r = await req(setor, 'DELETE', `/licitacoes/${id}`)
ok(r.s === 403 || r.s === 404 || r.s === 405, 'ninguém apaga (setor)', r)

r = await req(leitor, 'GET', `/licitacoes/${id}`)
ok(r.s === 200, 'leitor lê', r)
r = await req(leitor, 'POST', '/licitacoes', { ...base, numeroProcesso: 'TESTE-9002/2026', numero: 9002 })
ok(r.s === 403, 'leitor não cria', r)
r = await req(leitor, 'PATCH', `/licitacoes/${id}`, { objetoResumo: 'x' })
ok(r.s === 403, 'leitor não altera', r)

r = await req(editor, 'POST', '/licitacoes', { ...base, numeroProcesso: 'TESTE-9003/2026', numero: 9003 })
ok(r.s === 403, 'editor (conteúdo geral) não cria licitação', r)
r = await req(editor, 'GET', '/licitacao-assinantes?limit=1')
ok(r.s === 403, 'editor não lê assinantes', r)
r = await req(null, 'GET', '/licitacao-assinantes?limit=1')
ok(r.s === 403, 'anônimo não lê assinantes', r)
r = await req(null, 'GET', `/licitacoes?where[id][equals]=${id}`)
ok(r.j?.totalDocs === 1, 'anônimo lê a publicada', r)

// rascunho invisível ao público
r = await req(setor, 'POST', '/licitacoes', { ...base, numeroProcesso: 'TESTE-9004/2026', numero: 9004 })
const idRasc = r.j?.doc?.id
r = await req(null, 'GET', `/licitacoes?where[id][equals]=${idRasc}`)
ok(r.j?.totalDocs === 0, 'rascunho não aparece para o anônimo', r)
r = await req(editor, 'GET', `/licitacoes?where[id][equals]=${idRasc}`)
ok(r.j?.totalDocs === 0, 'rascunho não aparece para o editor geral', r)

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
console.log(`DESCARTÁVEIS: licitacoes ${id},${idRasc}`)
process.exit(falhas ? 1 : 0)
