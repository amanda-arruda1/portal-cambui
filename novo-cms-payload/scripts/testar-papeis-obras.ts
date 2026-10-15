/**
 * Prova dos papéis e regras de Obras contra o serviço no ar (127.0.0.1:3000/cms). Cria usuários e registros DESCARTÁVEIS (prefixo TESTE).
 * Uso: npx payload run scripts/testar-papeis-obras.ts
 */
import { getPayload } from 'payload'
import config from '../src/payload.config'

const BASE = 'http://127.0.0.1:3000/cms/api'
const SENHA = 'Teste-' + Math.random().toString(36).slice(2) + 'Aa1!'
let falhas = 0
const ok = (c: boolean, m: string, x?: unknown) => { console.log(`${c ? 'OK  ' : 'FALHA'} ${m}`); if (!c) { falhas++; if (x) console.log('     ', JSON.stringify(x).slice(0, 400)) } }
const payload = await getPayload({ config })
const papeis = ['setor_obras', 'leitor_obras', 'setor_licitacoes', 'editor'] as const
const tk: Record<string, string> = {}
for (const papel of papeis) {
  const email = `teste-obra-${papel}@teste.invalid`
  await payload.create({ collection: 'users', overrideAccess: true, data: { email, password: SENHA, papel, nome: `TESTE ${papel}` } })
  const r = await fetch(`${BASE}/users/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3000' }, body: JSON.stringify({ email, password: SENHA }) })
  tk[papel] = ((await r.json()) as any).token
}
const req = async (t: string | null, metodo: string, caminho: string, corpo?: unknown) => {
  const r = await fetch(`${BASE}${caminho}`, { method: metodo, headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3000', ...(t ? { authorization: `JWT ${t}` } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined })
  return { s: r.status, j: (await r.json().catch(() => null)) as any }
}
const S = tk.setor_obras!
const base = { numeroProcesso: 'TESTE-OBRA-1/2026', categoria: 'pavimentacao', fonteRecurso: 'estadual', objetoResumo: 'TESTE Pavimentação da rua X', situacao: 'em_execucao', dataPublicacao: new Date().toISOString(), status: 'rascunho' }

let r = await req(S, 'POST', '/obras', base)
const id = r.j?.doc?.id
ok(r.s === 201 && /^[0-9a-f-]{36}$/.test(r.j?.doc?.idLegado ?? '') && /^teste-pavimentacao-da-rua-x-/.test(r.j?.doc?.slug ?? ''), 'setor_obras cria rascunho (sem validar), com UUID e slug automáticos', r)
const slugRascunho = r.j?.doc?.slug

r = await req(S, 'PATCH', `/obras/${id}`, { status: 'publicado' })
ok(r.s === 400 && /convênio/i.test(JSON.stringify(r.j)), 'publicar convênio estadual sem número é recusado', r)
r = await req(S, 'PATCH', `/obras/${id}`, { numeroConvenio: 'CV-123/2026', situacao: 'paralisada', status: 'publicado' })
ok(r.s === 400 && /paralisada/i.test(JSON.stringify(r.j)), 'publicar paralisada sem motivo é recusado', r)
r = await req(S, 'PATCH', `/obras/${id}`, { numeroConvenio: 'CV-123/2026', situacao: 'em_execucao', status: 'publicado', objetoResumo: 'TESTE Pavimentação definitiva da rua X' })
ok(r.s === 200 && r.j?.doc?.status === 'publicado', 'publica (alertas não bloqueiam)', r)
const slugPublicado = r.j?.doc?.slug
ok(slugPublicado !== slugRascunho && /-[0-9a-f]{8}$/.test(slugPublicado), 'slug refeito ao publicar o rascunho', { slugRascunho, slugPublicado })
r = await req(S, 'PATCH', `/obras/${id}`, { slug: 'outro', objetoResumo: 'TESTE editada' })
ok(r.s === 200 && r.j?.doc?.slug === slugPublicado, 'slug não muda depois de publicada', r)

r = await req(S, 'GET', `/obras/${id}`)
ok(/Não há ART\/RRT anexada/.test(r.j?.pendencias ?? ''), 'logado vê as pendências (sem ART/RRT)', r.j?.pendencias)
r = await req(null, 'GET', `/obras?where[id][equals]=${id}`)
ok(r.j?.totalDocs === 1 && r.j.docs[0].pendencias === undefined, 'anônimo lê a publicada, sem o campo pendências', r.j?.docs?.[0])

r = await req(S, 'POST', '/obra-medicoes', { obra: id, numero: 1, dataReferencia: new Date().toISOString(), percentualAcumulado: 30, valorMedido: 1000 })
ok(r.s === 201 && r.j?.doc?.valorAcumulado === 1000, 'medição 1: acumulado calculado', r)
r = await req(S, 'POST', '/obra-medicoes', { obra: id, numero: 2, dataReferencia: new Date().toISOString(), percentualAcumulado: 55, valorMedido: 500 })
ok(r.s === 201 && r.j?.doc?.valorAcumulado === 1500, 'medição 2: acumulado soma a anterior', r)
r = await req(S, 'GET', `/obras/${id}`)
ok(r.j?.percentualExecucao === 55 && r.j?.valorPago === 1500, 'medição atualiza execução física e valor pago da obra', { p: r.j?.percentualExecucao, v: r.j?.valorPago })

// anexo com arquivo enviado
const fd = new FormData(); fd.append('file', new Blob(['%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n'], { type: 'application/pdf' }), 'TESTE-art.pdf')
const up = await fetch(`${BASE}/media`, { method: 'POST', headers: { origin: 'http://127.0.0.1:3000', authorization: `JWT ${S}` }, body: fd })
const mid = ((await up.json()) as any)?.doc?.id
r = await req(S, 'POST', '/obra-anexos', { obra: id, titulo: 'TESTE ART', categoria: 'art_rrt', arquivo: mid, dataReferencia: new Date().toISOString() })
ok(up.status === 201 && r.s === 201, 'setor_obras envia e anexa a ART', r)
r = await req(S, 'GET', `/obras/${id}`)
ok(!/Não há ART\/RRT anexada/.test(r.j?.pendencias ?? ''), 'com ART anexada o alerta some', r.j?.pendencias)

r = await req(S, 'DELETE', `/obras/${id}`); ok([403, 404, 405].includes(r.s), 'ninguém apaga', r)
r = await req(tk.leitor_obras!, 'GET', `/obras/${id}`); ok(r.s === 200, 'leitor_obras lê', r)
r = await req(tk.leitor_obras!, 'POST', '/obras', { ...base, numeroProcesso: 'TESTE-OBRA-2/2026' }); ok(r.s === 403, 'leitor_obras não cria', r)
r = await req(tk.leitor_obras!, 'PATCH', `/obras/${id}`, { objetoResumo: 'x' }); ok(r.s === 403, 'leitor_obras não altera', r)
r = await req(tk.editor!, 'POST', '/obras', { ...base, numeroProcesso: 'TESTE-OBRA-3/2026' }); ok(r.s === 403, 'editor geral não cria obra', r)
r = await req(tk.setor_licitacoes!, 'POST', '/obras', { ...base, numeroProcesso: 'TESTE-OBRA-4/2026' }); ok(r.s === 403, 'setor de licitações não cria obra', r)
r = await req(S, 'POST', '/licitacoes', { numeroProcesso: 'TESTE-X', numero: 1, ano: 2026, modalidade: 'dispensa', criterioJulgamento: 'menor_preco', objetoResumo: 'x', dataPublicacao: new Date().toISOString() }); ok(r.s === 403, 'setor_obras não cria licitação', r)
r = await req(S, 'GET', '/licitacoes?limit=1'); ok(r.s === 200, 'setor_obras lê licitações (para vincular)', r)

r = await req(S, 'POST', '/noticias', { titulo: 'TESTE', slug: 'teste-x', resumo: 'x', status: 'rascunho' }); ok(r.s === 403, 'setor_obras não cria notícia (conteúdo geral)', r)
r = await req(S, 'GET', '/noticias?limit=1'); ok(r.s === 200 && r.j?.docs?.every((d: any) => d.status === 'publicado'), 'setor_obras só vê notícia publicada', r)
r = await req(S, 'GET', '/audit-logs?limit=1'); ok(r.s === 403, 'setor_obras não lê a auditoria', r)
r = await req(tk.leitor_obras!, 'GET', '/audit-logs?limit=1'); ok(r.s === 403, 'leitor_obras não lê a auditoria', r)
r = await req(tk.editor!, 'GET', '/noticias?limit=1'); ok(r.s === 200, 'editor geral segue lendo notícias', r)
r = await req(tk.editor!, 'GET', '/audit-logs?limit=1'); ok(r.s === 403, 'editor geral não lê a auditoria', r)
r = await req(S, 'GET', '/secretarias?limit=1'); ok(r.s === 200 && r.j?.totalDocs > 0, 'setor_obras lê secretarias (para escolher a responsável)', r)
const idR0 = 0
const idR = ((await req(S, 'POST', '/obras', { ...base, numeroProcesso: 'TESTE-OBRA-5/2026', objetoResumo: 'TESTE rascunho oculto' })) as any).j?.doc?.id
r = await req(null, 'GET', `/obras?where[id][equals]=${idR}`); ok(r.j?.totalDocs === 0, 'rascunho invisível ao anônimo', r)
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS PASSARAM')
console.log(`DESCARTAVEIS obras ${id},${idR} media ${mid}`)
process.exit(falhas ? 1 : 0)
