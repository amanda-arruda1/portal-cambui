/** Validação independente da migração: compara Directus × Payload além das contagens. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../src/payload.config'

const q = (sql: string): any[] => execFileSync('docker', ['exec', 'portal-postgres', 'psql', '-U', 'portal_cambui', '-d', 'portal_cambui', '-At', '-c', `select row_to_json(t) from (${sql}) t`], { maxBuffer: 1 << 30 }).toString().split('\n').filter(Boolean).map((l) => JSON.parse(l))
const payload = await getPayload({ config })
const todos = async (collection: any) => (await payload.find({ collection, limit: 100000, depth: 0, pagination: false, overrideAccess: true })).docs as any[]
let falhas = 0
const ok = (nome: string, cond: boolean, det = '') => { if (!cond) falhas++; console.log(`${cond ? '✓' : '✗'} ${nome}${det ? ' — ' + det : ''}`) }

// 1) Licitações: soma financeira, campos-chave, datas preservadas
const lic = await todos('licitacoes')
const o = q('select count(*)::int n, sum(valor_estimado) s, count(objeto)::int com_objeto, min(date_created) mn, max(date_updated) mx from licitacoes')[0]
ok('licitações: soma de valor_estimado', Math.abs(lic.reduce((a, d) => a + (d.valorEstimado ?? 0), 0) - o.s) < 0.01, `${o.s}`)
ok('licitações: com objeto completo', lic.filter((d) => d.objeto).length === o.com_objeto, `${o.com_objeto}`)
const ant = q('select id, numero_processo, modalidade, situacao, data_sessao, date_created from licitacoes')
const porLegado = new Map(lic.map((d) => [d.idLegado, d]))
const difer = ant.filter((a) => { const n = porLegado.get(a.id); return !n || n.numeroProcesso !== a.numero_processo || n.modalidade !== a.modalidade || n.situacao !== a.situacao || (a.data_sessao ? new Date(n.dataSessao).getTime() !== new Date(a.data_sessao).getTime() : !!n.dataSessao) || new Date(n.createdAt).getTime() !== new Date(a.date_created).getTime() })
ok('licitações: processo/modalidade/situação/data_sessão/createdAt idênticos em todas', difer.length === 0, `${difer.length} divergentes de ${ant.length}`)

// 2) Anexos: arquivo presente, vínculo com licitação, substituições
const anx = await todos('licitacao-anexos')
const a2 = q('select count(arquivo)::int com_arq, count(substitui)::int subs, count(url_externa)::int urls, count(*) filter (where superado)::int sup from licitacao_anexos')[0]
ok('anexos: com arquivo', anx.filter((d) => d.arquivo).length === a2.com_arq, `${a2.com_arq}`)
ok('anexos: substitui', anx.filter((d) => d.substitui).length === a2.subs, `${a2.subs}`)
ok('anexos: url_externa', anx.filter((d) => d.urlExterna).length === a2.urls, `${a2.urls}`)
ok('anexos: superados', anx.filter((d) => d.superado).length === a2.sup, `${a2.sup}`)
ok('anexos: todos ligados a uma licitação', anx.every((d) => d.licitacao))
const evs = await todos('licitacao-eventos')
const e2 = q('select count(anexo)::int com_anexo from licitacao_eventos')[0]
ok('eventos: com anexo', evs.filter((d) => d.anexo).length === e2.com_anexo, `${e2.com_anexo}`)

// 3) Telefones úteis e demais coleções pequenas: comparação linha a linha
async function comparar(colecao: string, tabela: string, campos: [string, string][]) {
  const novos = await todos(colecao); const mapa = new Map(novos.map((d) => [d.idLegado, d]))
  const velhos = q(`select * from ${tabela}`)
  const dif = velhos.filter((v) => { const n = mapa.get(v.id); return !n || campos.some(([c, k]) => (n[k] ?? null) !== (v[c] ?? null)) })
  ok(`${colecao}: ${velhos.length} registros idênticos campo a campo (${campos.map((c) => c[0]).join(',')})`, dif.length === 0, `${dif.length} divergentes`)
}
await comparar('telefones-uteis', 'telefones_uteis', [['nome', 'nome'], ['categoria', 'categoria'], ['endereco', 'endereco'], ['telefone', 'telefone'], ['email', 'email'], ['ordem', 'ordem'], ['status', 'status']])
await comparar('coleta-lixo', 'coleta_lixo', [['nome', 'nome'], ['dias', 'dias'], ['horario', 'horario']])
await comparar('secretarias', 'secretarias', [['nome', 'nome'], ['slug', 'slug'], ['telefone', 'telefone'], ['email', 'email'], ['responsavel', 'responsavel'], ['ordem', 'ordem']])
await comparar('noticias', 'noticias', [['titulo', 'titulo'], ['slug', 'slug'], ['resumo', 'resumo'], ['destaque', 'destaque']])
await comparar('patrimonio-cultural', 'patrimonio_documentos', [['titulo', 'titulo'], ['categoria', 'categoria'], ['periodo', 'periodo'], ['url_externa', 'urlExterna']])
await comparar('obras', 'obras', [['numero_processo', 'numeroProcesso'], ['valor_contratado', 'valorContratado'], ['valor_pago', 'valorPago'], ['situacao', 'situacao'], ['percentual_execucao', 'percentualExecucao']])
await comparar('conselhos-municipais', 'conselhos_municipais', [['nome', 'nome'], ['categoria', 'categoria'], ['ordem', 'ordem']])

// 4) Arquivos: checksum de TODOS os arquivos migrados (origem no disco × arquivo gravado pelo Payload)
const media = await todos('media'); let ruins = 0, bytes = 0
const dir = path.resolve('media')
const orig = new Map(q('select id, filename_disk, filesize from directus_files').map((f) => [f.id, f]))
for (const m of media) {
  const f = orig.get(m.idLegado); const novo = path.join(dir, m.filename); bytes += m.filesize ?? 0
  const h = (p: string) => createHash('sha256').update(fs.readFileSync(p)).digest('hex')
  if (!f || !fs.existsSync(novo) || h(path.join('/opt/portal-cambui/data/directus/uploads', f.filename_disk)) !== h(novo)) { ruins++; console.log('  ✗ arquivo divergente:', m.filename) }
}
ok(`arquivos: ${media.length} com SHA-256 idêntico ao original`, ruins === 0, `${(bytes / 1e9).toFixed(2)} GB`)
const ref = (await todos('licitacao-anexos')).filter((d) => d.arquivo).length + (await todos('noticias')).filter((d) => d.imagem).length
ok('relações de arquivo apontam para media existente', anx.filter((d) => d.arquivo).every((d) => media.some((m) => m.id === d.arquivo)), `${ref} refs`)

console.log(falhas ? `\n${falhas} VERIFICAÇÃO(ÕES) FALHARAM` : '\nTODAS AS VERIFICAÇÕES PASSARAM')
process.exit(falhas ? 1 : 0)
