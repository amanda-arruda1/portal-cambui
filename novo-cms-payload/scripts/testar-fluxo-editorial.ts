/**
 * Prova do controle de acesso (admin / revisor / autor + módulos + fluxo de aprovação) e das regras de Licitações e Obras
 * contra o serviço no ar (127.0.0.1:3000/cms). Cria usuários e registros DESCARTÁVEIS (prefixo TESTE) e imprime ao final os
 * ids para remoção por SQL (nada é apagável pela API).
 * Uso: npx payload run scripts/testar-fluxo-editorial.ts   (PT=<chave avisos_portal> ET=<chave avisos_entrega> opcionais)
 */
import { getPayload } from 'payload'
import config from '../src/payload.config'

const BASE = 'http://127.0.0.1:3000/cms/api', O = 'http://127.0.0.1:3000'
const SENHA = 'Teste-' + Math.random().toString(36).slice(2) + 'Aa1!'
let falhas = 0
const ok = (c: boolean, m: string, x?: unknown) => { console.log(`${c ? 'OK  ' : 'FALHA'} ${m}`); if (!c) { falhas++; if (x !== undefined) console.log('     ', JSON.stringify(x).slice(0, 500)) } }
const payload = await getPayload({ config })

const contas: Record<string, { papel: string; modulos?: string[] }> = {
  admin: { papel: 'admin' },
  revisor: { papel: 'revisor', modulos: ['noticias', 'licitacoes', 'obras'] },
  autor: { papel: 'autor', modulos: ['noticias', 'licitacoes', 'obras'] },
  autorPaginas: { papel: 'autor', modulos: ['paginas'] },
  revisorPaginas: { papel: 'revisor', modulos: ['paginas'] },
}
const tk: Record<string, string> = {}
for (const [nome, c] of Object.entries(contas)) {
  const email = `teste-fluxo-${nome}@teste.invalid`
  await payload.create({ collection: 'users', overrideAccess: true, data: { email, password: SENHA, papel: c.papel as any, modulosPermitidos: c.modulos as any, nome: `TESTE ${nome}` } })
  const r = await fetch(`${BASE}/users/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: O }, body: JSON.stringify({ email, password: SENHA }) })
  tk[nome] = ((await r.json()) as any).token
}
const req = async (t: string | null, metodo: string, caminho: string, corpo?: unknown, extra: Record<string, string> = {}) => {
  const r = await fetch(`${BASE}${caminho}`, { method: metodo, headers: { 'content-type': 'application/json', origin: O, ...(t ? { authorization: `JWT ${t}` } : {}), ...extra }, body: corpo ? JSON.stringify(corpo) : undefined })
  return { s: r.status, j: (await r.json().catch(() => null)) as any }
}
const hoje = () => new Date().toISOString()
const dia = 86400000

// ───────── validação do cadastro de usuário
let erro = ''
await payload.create({ collection: 'users', overrideAccess: true, data: { email: 'teste-fluxo-semmodulo@teste.invalid', password: SENHA, papel: 'autor' } }).catch((e) => { erro = String(e?.message ?? e) })
ok(/pelo menos um módulo|inválido|invalid/i.test(erro), 'autor sem nenhum módulo é recusado no cadastro', erro)
let r = await req(tk.autor!, 'POST', '/users', { email: 'teste-fluxo-x@teste.invalid', password: SENHA, papel: 'admin' })
ok(r.s === 403, 'autor não cria usuário', r)

// ───────── notícias: o fluxo de aprovação
const noticia = { titulo: 'TESTE notícia', slug: 'teste-fluxo-1', resumo: 'x', dataPublicacao: hoje() }
r = await req(tk.autor!, 'POST', '/noticias', noticia)
const idN = r.j?.doc?.id
ok(r.s === 201 && r.j?.doc?.status === 'rascunho', 'autor cria notícia: nasce como rascunho', r)
r = await req(tk.autor!, 'POST', '/noticias', { ...noticia, slug: 'teste-fluxo-2', status: 'publicado' })
ok(r.s === 403 && /rascunho ou enviar para revisão/.test(JSON.stringify(r.j)), 'autor não cria já publicado', r)
r = await req(tk.autor!, 'PATCH', `/noticias/${idN}`, { status: 'em_revisao' })
ok(r.s === 200 && r.j?.doc?.status === 'em_revisao', 'autor envia para revisão (rascunho → em_revisao)', r)
r = await req(tk.autor!, 'PATCH', `/noticias/${idN}`, { status: 'publicado' })
ok(r.s === 403, 'autor NÃO publica', r)
r = await req(tk.autor!, 'PATCH', `/noticias/${idN}`, { status: 'arquivado' })
ok(r.s === 403, 'autor NÃO arquiva', r)
r = await req(tk.autor!, 'PATCH', `/noticias/${idN}`, { status: 'rascunho', titulo: 'TESTE notícia editada' })
ok(r.s === 200, 'autor volta para rascunho e edita', r)
r = await req(tk.autor!, 'PATCH', `/noticias/${idN}`, { status: 'em_revisao' })
r = await req(null, 'GET', `/noticias?where[id][equals]=${idN}`)
ok(r.j?.totalDocs === 0, 'em revisão não aparece para o público', r)
r = await req(tk.autorPaginas!, 'GET', `/noticias?where[id][equals]=${idN}`)
ok(r.j?.totalDocs === 0, 'usuário sem o módulo Notícias não vê o item em revisão', r)
r = await req(tk.autorPaginas!, 'POST', '/noticias', { ...noticia, slug: 'teste-fluxo-3' })
ok(r.s === 403, 'autor sem o módulo Notícias não cria notícia', r)
r = await req(tk.revisorPaginas!, 'PATCH', `/noticias/${idN}`, { status: 'publicado' })
ok(r.s === 403, 'revisor sem o módulo Notícias não publica notícia', r)
r = await req(tk.revisor!, 'PATCH', `/noticias/${idN}`, { status: 'publicado' })
ok(r.s === 200 && r.j?.doc?.status === 'publicado', 'revisor publica', r)
r = await req(null, 'GET', `/noticias?where[id][equals]=${idN}`)
ok(r.j?.totalDocs === 1, 'publicada aparece para o público', r)
r = await req(tk.autor!, 'PATCH', `/noticias/${idN}`, { titulo: 'autor mexendo no que está no ar' })
ok(r.s === 403 || r.s === 404, 'autor NÃO edita item já publicado (passaria por cima da revisão)', r)
r = await req(tk.revisor!, 'PATCH', `/noticias/${idN}`, { status: 'arquivado' })
ok(r.s === 200 && r.j?.doc?.status === 'arquivado', 'revisor arquiva', r)
r = await req(tk.autor!, 'PATCH', `/noticias/${idN}`, { status: 'rascunho' })
ok(r.s === 403 || r.s === 404, 'autor NÃO mexe em item arquivado', r)
r = await req(tk.revisor!, 'PATCH', `/noticias/${idN}`, { status: 'rascunho' })
ok(r.s === 200, 'revisor devolve o arquivado para rascunho', r)
r = await req(tk.admin!, 'PATCH', `/noticias/${idN}`, { status: 'publicado' })
ok(r.s === 200, 'admin publica', r)
r = await req(tk.admin!, 'DELETE', `/noticias/${idN}`)
ok([403, 404, 405].includes(r.s), 'nem o admin apaga (arquivar é o apagar)', r)

// ───────── auditoria e usuários
for (const n of ['revisor', 'autor']) { r = await req(tk[n]!, 'GET', '/audit-logs?limit=1'); ok(r.s === 403, `${n} não lê a auditoria`, r) }
r = await req(tk.admin!, 'GET', '/audit-logs?limit=1'); ok(r.s === 200, 'admin lê a auditoria', r)
r = await req(tk.autor!, 'GET', '/users'); ok(r.s === 200 && r.j?.totalDocs === 1, 'autor vê só o próprio cadastro', r.j?.totalDocs)
r = await req(tk.autor!, 'PATCH', `/users/${(await req(tk.autor!, 'GET', '/users')).j.docs[0].id}`, { papel: 'admin' })
ok(r.s === 403 || (r.s === 200 && r.j?.doc?.papel === 'autor'), 'autor não se promove', r)

// ───────── licitações
const lic = { numeroProcesso: 'TESTE-FLUXO-LIC/2026', numero: 9500, ano: 2026, modalidade: 'pregao_eletronico', forma: 'eletronica', criterioJulgamento: 'menor_preco', objetoResumo: 'TESTE licitação do fluxo', dataPublicacao: hoje(), dataSessao: new Date(Date.now() + 3 * dia).toISOString(), situacao: 'publicada' }
r = await req(tk.autor!, 'POST', '/licitacoes', lic)
const idL = r.j?.doc?.id
ok(r.s === 201 && r.j?.doc?.status === 'rascunho', 'autor (módulo Licitações) cria licitação em rascunho', r)
r = await req(tk.autor!, 'POST', '/licitacao-anexos', { licitacao: idL, titulo: 'TESTE edital', tipo: 'edital', urlExterna: 'https://exemplo.invalid/e.pdf', dataPublicacao: hoje() })
const idA = r.j?.doc?.id
ok(r.s === 201 && r.j?.doc?.status === 'publicado', 'autor anexa o edital (anexo segue o pai: nasce publicado)', r)
r = await req(null, 'GET', `/licitacao-anexos?where[id][equals]=${idA}`)
ok(r.j?.totalDocs === 0, 'anexo de licitação em rascunho NÃO vaza para o público', r)
r = await req(tk.autor!, 'PATCH', `/licitacoes/${idL}`, { status: 'publicado', justificativaPrazo: 'x' })
ok(r.s === 403, 'autor NÃO publica licitação', r)
r = await req(tk.autor!, 'PATCH', `/licitacoes/${idL}`, { status: 'em_revisao' })
ok(r.s === 200, 'autor envia a licitação para revisão', r)
r = await req(tk.revisor!, 'PATCH', `/licitacoes/${idL}`, { status: 'publicado' })
ok(r.s === 400 && /justificativa/i.test(JSON.stringify(r.j)), 'revisor: prazo menor que o art. 55 exige justificativa (regra de negócio segue valendo)', r)
r = await req(tk.revisor!, 'PATCH', `/licitacoes/${idL}`, { status: 'publicado', justificativaPrazo: 'Urgência comprovada' })
ok(r.s === 200 && r.j?.doc?.status === 'publicado', 'revisor publica a licitação', r)
r = await req(tk.revisor!, 'GET', `/licitacao-eventos?where[licitacao][equals]=${idL}&where[tipo][equals]=publicacao`)
ok(r.j?.totalDocs === 1, 'evento de publicação registrado', r)
r = await req(null, 'GET', `/licitacao-anexos?where[id][equals]=${idA}`)
ok(r.j?.totalDocs === 1, 'publicada a licitação, o anexo aparece para o público', r)
r = await req(tk.autor!, 'POST', '/licitacao-anexos', { licitacao: idL, titulo: 'TESTE ata', tipo: 'ata_da_sessao', urlExterna: 'https://exemplo.invalid/a.pdf', dataPublicacao: hoje() })
ok(r.s === 403, 'autor NÃO anexa em licitação já publicada', r)
r = await req(tk.revisor!, 'POST', '/licitacao-anexos', { licitacao: idL, titulo: 'TESTE ata', tipo: 'ata_da_sessao', urlExterna: 'https://exemplo.invalid/a.pdf', dataPublicacao: hoje() })
ok(r.s === 201, 'revisor anexa em licitação publicada', r)
r = await req(tk.autor!, 'PATCH', `/licitacao-anexos/${idA}`, { titulo: 'trocando o edital no ar' })
ok(r.s === 403, 'autor NÃO altera anexo de licitação publicada', r)
const idL2 = (await req(tk.autor!, 'POST', '/licitacoes', { ...lic, numeroProcesso: 'TESTE-FLUXO-LIC2/2026', numero: 9501 })).j?.doc?.id
r = await req(tk.autor!, 'PATCH', `/licitacao-anexos/${idA}`, { licitacao: idL2, titulo: 'movendo o edital para um rascunho' })
ok(r.s === 403, 'autor NÃO contorna a trava mandando o id de um pai em rascunho no corpo do PATCH', r)
r = await req(tk.revisor!, 'GET', `/licitacao-anexos/${idA}`)
ok(r.j?.licitacao === idL || r.j?.licitacao?.id === idL, 'o anexo continua ligado à licitação publicada', r.j?.licitacao)
r = await req(tk.autorPaginas!, 'GET', `/licitacoes?where[id][equals]=${idL}`)
ok(r.j?.totalDocs === 1, 'quem não tem o módulo ainda vê a licitação PUBLICADA', r)
r = await req(tk.revisor!, 'POST', '/licitacao-assinantes', { email: 'teste-fluxo@teste.invalid', token: 'd'.repeat(64) })
ok(r.s === 403, 'revisor não cria assinante', r)
for (const n of ['revisor', 'autor']) { r = await req(tk[n]!, 'GET', '/licitacao-assinantes'); ok(r.s === 403, `${n} não lê assinantes (e-mail de cidadão)`, r); r = await req(tk[n]!, 'GET', '/licitacao-envios'); ok(r.s === 403, `${n} não lê a fila de e-mails`, r) }

// PNCP: permissão do endpoint
r = await req(tk.autorPaginas!, 'POST', '/licitacoes/importar-pncp', { referencia: '18675975000185-1-000003/2026' })
ok(r.s === 403, 'importar do PNCP exige o módulo Licitações', r)
r = await req(tk.autor!, 'POST', '/licitacoes/importar-pncp', { referencia: 'lixo' })
ok(r.s === 400, 'autor com o módulo chega à validação do PNCP', r)

// ───────── obras
const obra = { numeroProcesso: 'TESTE-FLUXO-OBRA/2026', categoria: 'pavimentacao', fonteRecurso: 'municipal', objetoResumo: 'TESTE obra do fluxo', situacao: 'em_execucao', dataPublicacao: hoje() }
r = await req(tk.autor!, 'POST', '/obras', obra)
const idO = r.j?.doc?.id
ok(r.s === 201 && r.j?.doc?.status === 'rascunho', 'autor cria obra em rascunho', r)
r = await req(tk.autor!, 'PATCH', `/obras/${idO}`, { status: 'publicado' }); ok(r.s === 403, 'autor NÃO publica obra', r)
await req(tk.autor!, 'PATCH', `/obras/${idO}`, { status: 'em_revisao' })
r = await req(tk.revisor!, 'PATCH', `/obras/${idO}`, { status: 'publicado' }); ok(r.s === 200, 'revisor publica obra (alerta não bloqueia)', r)
r = await req(tk.autor!, 'POST', '/obra-medicoes', { obra: idO, numero: 1, dataReferencia: hoje(), percentualAcumulado: 10, valorMedido: 100 })
ok(r.s === 403, 'autor NÃO lança medição em obra publicada', r)
r = await req(tk.revisor!, 'POST', '/obra-medicoes', { obra: idO, numero: 1, dataReferencia: hoje(), percentualAcumulado: 10, valorMedido: 100 })
ok(r.s === 201 && r.j?.doc?.valorAcumulado === 100, 'revisor lança medição (acumulado calculado)', r)
r = await req(tk.revisor!, 'GET', `/obras/${idO}`); ok(r.j?.percentualExecucao === 10, 'medição atualiza a execução física', r.j?.percentualExecucao)

// ───────── arquivos
const fd = new FormData(); fd.append('file', new Blob(['%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n'], { type: 'application/pdf' }), 'TESTE-fluxo.pdf')
const up = await fetch(`${BASE}/media`, { method: 'POST', headers: { origin: O, authorization: `JWT ${tk.autor}` }, body: fd })
const idM = ((await up.json()) as any)?.doc?.id
ok(up.status === 201, 'autor envia arquivo', idM)
const up2 = await fetch(`${BASE}/media`, { method: 'POST', headers: { origin: O }, body: (() => { const f = new FormData(); f.append('file', new Blob(['%PDF-1.4\n%%EOF\n'], { type: 'application/pdf' }), 'TESTE-anon.pdf'); return f })() })
ok(up2.status === 403, 'visitante não envia arquivo', up2.status)

// ───────── contas de serviço (coleção própria, sem papel)
if (process.env.PT && process.env.ET) {
  const P = { authorization: `contas-servico API-Key ${process.env.PT}` }, E = { authorization: `contas-servico API-Key ${process.env.ET}` }
  r = await req(null, 'POST', '/licitacao-assinantes', { email: 'teste-fluxo-svc@teste.invalid', token: 'e'.repeat(64), confirmado: false }, P)
  const idS = r.j?.doc?.id
  ok(r.s === 201, 'conta avisos_portal cadastra assinante', r)
  r = await req(null, 'GET', `/licitacao-assinantes?where[token][equals]=${'e'.repeat(64)}&depth=0`, undefined, P); ok(r.s === 200 && r.j?.totalDocs === 1 && r.j.docs[0].token, 'avisos_portal acha o assinante pelo token', r)
  r = await req(null, 'GET', '/licitacao-envios', undefined, P); ok(r.s === 200, 'avisos_portal lê a fila (para enfileirar)', r.s)
  r = await req(null, 'PATCH', `/licitacao-assinantes/${idS}`, { confirmado: true }, E); ok(r.s === 403, 'avisos_entrega NÃO altera assinante', r)
  r = await req(null, 'POST', '/licitacoes', lic, E); ok(r.s === 403, 'conta de serviço NÃO cria licitação', r)
  r = await req(null, 'POST', '/noticias', noticia, P); ok(r.s === 403, 'conta de serviço NÃO cria notícia', r)
  r = await req(null, 'GET', '/noticias?where[status][equals]=rascunho', undefined, E); ok(r.s === 200 && r.j?.totalDocs === 0, 'conta de serviço não vê rascunho', r.j?.totalDocs)
  r = await req(null, 'GET', '/users', undefined, E); ok(r.s === 403 || r.j?.totalDocs === 0, 'conta de serviço não lista usuários (nem por colisão de id com uma pessoa)', r)
  r = await req(null, 'GET', '/users', undefined, P); ok(r.s === 403 || r.j?.totalDocs === 0, 'idem para a conta do portal', r)
  r = await req(null, 'DELETE', `/licitacao-assinantes/${idS}`, undefined, E); ok(r.s === 403, 'avisos_entrega NÃO apaga assinante', r)
  r = await req(null, 'DELETE', `/licitacao-assinantes/${idS}`, undefined, P); ok(r.s === 200, 'avisos_portal apaga assinante (descadastro)', r)
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS PASSARAM')
console.log(`DESCARTAVEIS licitacoes ${idL} obras ${idO} noticias ${idN}`)
process.exit(falhas ? 1 : 0)
