/**
 * Organiza os Arquivos (media) em Pastas, a partir de ONDE cada arquivo é usado (fato registrado), com nome/alt só como reforço.
 * Na dúvida NÃO move: o arquivo vai para o relatório.
 *   npx payload run scripts/organizar-arquivos-em-pastas.ts            → simulação (não grava nada)
 *   APLICAR=1 npx payload run scripts/organizar-arquivos-em-pastas.ts  → cria pastas e preenche `pasta` (só em arquivo SEM pasta)
 * Relatório: /tmp/claude-0/organizar-arquivos-relatorio.json
 */
import fs from 'node:fs'
import { getPayload } from 'payload'
import config from '../src/payload.config'

const APLICAR = (process.argv.includes('--aplicar') || process.env.APLICAR === '1')
const payload = await getPayload({ config })
const ctx = { semAuditoria: true, semInspecaoUpload: true }
const todos = async (collection: string) => (await payload.find({ collection: collection as any, limit: 0, depth: 0, pagination: false, overrideAccess: true })).docs as any[]
const idDe = (v: any) => (v && typeof v === 'object' ? v.id : v)

type Alvo = string[] // caminho de pastas
const alvos = new Map<number, Map<string, string>>() // mediaId → (chave do caminho → motivo)
const propor = (media: unknown, caminho: Alvo, motivo: string) => {
  const id = idDe(media)
  if (id == null) return
  if (!alvos.has(id)) alvos.set(id, new Map())
  alvos.get(id)!.set(caminho.join(' › '), motivo)
}

/* 1) USO REGISTRADO */
const licitacoes = new Map((await todos('licitacoes')).map((l) => [l.id, l]))
const ano = (l: any) => (l?.dataPublicacao ? String(new Date(l.dataPublicacao).getUTCFullYear()) : null)
for (const a of await todos('licitacao-anexos')) {
  const y = ano(licitacoes.get(idDe(a.licitacao)))
  if (y) propor(a.arquivo, ['Licitações', y], 'anexo de licitação (ano da publicação)')
}
for (const e of await todos('licitacao-eventos')) {
  const y = ano(licitacoes.get(idDe(e.licitacao)))
  if (y && e.anexo) propor(e.anexo, ['Licitações', y], 'anexo de evento de licitação')
}
const obras = new Map((await todos('obras')).map((o) => [o.id, o]))
for (const a of await todos('obra-anexos')) {
  const o = obras.get(idDe(a.obra))
  const nome = o?.objetoResumo
  if (nome) propor(a.arquivo, ['Obras Públicas', String(nome).slice(0, 120)], 'anexo de obra')
}
for (const p of await todos('patrimonio-cultural')) propor(p.arquivo, ['Patrimônio Cultural'], 'documento de Patrimônio Cultural')
const noticias = await todos('noticias')
for (const n of noticias) propor(n.imagem, ['Imagens de Notícias'], 'imagem de notícia')
for (const s of await todos('selos')) propor(s.imagem, ['Selos e Certificações'], 'imagem de selo')

/* 2) SEM USO REGISTRADO: citação no texto dos Conselhos (forte) e alt (reforço) */
const media = await todos('media')
const conselhos = await todos('conselhos-municipais')
const textoDe = (d: any) => JSON.stringify(d)
const usados = new Set([...alvos.keys()])
// noticias.arquivo e documentos.arquivo contam como "uso" que ainda não sei classificar → entram em dúvida pelo bloco final
const usoSemPasta = new Set<number>()
for (const n of noticias) if (n.arquivo) usoSemPasta.add(idDe(n.arquivo))
for (const d of await todos('documentos')) if (d.arquivo) usoSemPasta.add(idDe(d.arquivo))

const duvidas: { arquivo: string; alt?: string; motivo: string }[] = []
const decididos: { id: number; arquivo: string; caminho: string; motivo: string }[] = []
const GENERICO = /^(download|baixar|aqui|arquivo|lista|clique aqui.*|acesso:.*|conta|resultado|errata|parecer.*|decis.o.*|ficha.*|relat.rio|https?:.*)?\s*$/i

for (const m of media) {
  if (m.pasta) continue // já organizado: não mexe
  const id = m.id
  if (!usados.has(id)) {
    const alt = String(m.alt ?? '').replace(/&deg;/g, 'º').trim()
    const citadoEm = conselhos.filter((c) => textoDe(c).includes(m.filename))
    if (citadoEm.length === 1) propor(id, ['Conselhos Municipais', citadoEm[0].nome], 'citado no texto do conselho')
    else if (citadoEm.length > 1) { /* ambíguo → dúvida abaixo */ }
    else if (/^organograma/i.test(alt) || /^organograma/i.test(m.filename)) propor(id, ['Institucional'], 'organograma')
    else if (/^Ata de Reuni.o/i.test(alt) && !/conselho|cacs|fundeb/i.test(alt)) propor(id, ['Atas'], 'alt: ata')
    else if (/^Lei\s+N/i.test(alt) && !/conselho|fundo|pol.tica/i.test(alt)) propor(id, ['Leis'], 'alt: lei')
    else if (/^Decreto\s+n/i.test(alt)) propor(id, ['Decretos'], 'alt: decreto')
    else if (/^Portaria\s+N/i.test(alt) && !/conselho|cacs|fundeb/i.test(alt)) propor(id, ['Portarias'], 'alt: portaria')
  }
}

for (const m of media) {
  if (m.pasta) continue
  const c = alvos.get(m.id)
  if (c && c.size === 1) {
    const [caminho, motivo] = [...c.entries()][0]
    decididos.push({ id: m.id, arquivo: m.filename, caminho, motivo })
  } else if (c && c.size > 1) {
    duvidas.push({ arquivo: m.filename, alt: m.alt, motivo: `usado em contextos diferentes: ${[...c.keys()].join(' | ')}` })
  } else {
    const alt = String(m.alt ?? '').trim()
    const motivo = usoSemPasta.has(m.id) ? 'usado em notícia (anexo) ou documento, sem pasta definida'
      : conselhos.filter((x) => textoDe(x).includes(m.filename)).length > 1 ? 'citado em mais de um conselho'
      : GENERICO.test(alt) || alt === m.filename ? 'nome/alt genéricos e nenhum uso registrado'
      : 'sem uso registrado e o alt não indica a pasta com certeza'
    duvidas.push({ arquivo: m.filename, alt: m.alt, motivo })
  }
}

/* 3) RESUMO / GRAVAÇÃO */
const porPasta: Record<string, number> = {}
for (const d of decididos) porPasta[d.caminho] = (porPasta[d.caminho] ?? 0) + 1
const cache = new Map<string, number>()
const garantir = async (caminho: string): Promise<number> => {
  if (cache.has(caminho)) return cache.get(caminho)!
  const partes = caminho.split(' › ')
  const pai = partes.length > 1 ? await garantir(partes.slice(0, -1).join(' › ')) : null
  const nome = partes[partes.length - 1]
  const achou = await payload.find({
    collection: 'pastas', depth: 0, limit: 1, overrideAccess: true,
    where: { and: [{ nome: { equals: nome } }, pai ? { pastaPai: { equals: pai } } : { pastaPai: { exists: false } }] },
  })
  const id = achou.docs[0]?.id ?? (await payload.create({ collection: 'pastas', overrideAccess: true, context: ctx, data: { nome, ...(pai ? { pastaPai: pai } : {}) } })).id
  cache.set(caminho, id as number)
  return id as number
}

if (APLICAR) {
  let feitos = 0
  for (const d of decididos) {
    const pasta = await garantir(d.caminho)
    await payload.update({ collection: 'media', id: d.id, data: { pasta }, overrideAccess: true, context: ctx })
    if (++feitos % 250 === 0) console.log(`  ${feitos}/${decididos.length}`)
  }
}
fs.writeFileSync('/tmp/claude-0/organizar-arquivos-relatorio.json', JSON.stringify({ aplicado: APLICAR, porPasta, decididos, duvidas }, null, 1))
console.log(APLICAR ? 'GRAVADO' : 'SIMULAÇÃO (nada gravado)')
console.log('A mover:', decididos.length, '| em dúvida (ficam sem pasta):', duvidas.length)
console.table(Object.entries(porPasta).sort())
const grupos: Record<string, number> = {}
for (const d of duvidas) grupos[d.motivo.slice(0, 90)] = (grupos[d.motivo.slice(0, 90)] ?? 0) + 1
console.table(grupos)
process.exit(0)
