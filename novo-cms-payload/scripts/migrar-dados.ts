/**
 * Migração Directus → Payload (ETL). SOMENTE LEITURA no Directus.
 *
 *   npx payload run scripts/migrar-dados.ts                # migra tudo (idempotente)
 *   npx payload run scripts/migrar-dados.ts -- --simular   # só lê e converte, não grava
 *   npx payload run scripts/migrar-dados.ts -- --somente=telefones-uteis,licitacoes
 *
 * Lê o Postgres antigo via `docker exec portal-postgres psql` (somente SELECT),
 * lê os arquivos de /opt/portal-cambui/data/directus/uploads e grava pela Local
 * API do Payload. Idempotente: cada registro leva `idLegado` (UUID do Directus);
 * o que já existe é pulado. Nada é apagado em lugar nenhum.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { getPayload, type Payload } from 'payload'
import { convertHTMLToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import config from '../src/payload.config'

const SIMULAR = process.argv.includes('--simular')
const SOMENTE = process.argv.find((a) => a.startsWith('--somente='))?.split('=')[1]?.split(',')
const UPLOADS = '/opt/portal-cambui/data/directus/uploads'
const RELATORIO = path.resolve(import.meta.dirname, 'relatorio-migracao.json')

/* ---------- leitura do Directus (somente SELECT) ---------- */
const PG_USER = execFileSync('docker', ['exec', 'portal-postgres', 'printenv', 'POSTGRES_USER']).toString().trim()
const PG_DB = execFileSync('docker', ['exec', 'portal-postgres', 'printenv', 'POSTGRES_DB']).toString().trim()

type Linha = Record<string, any>
function consultar(sql: string): Linha[] {
  const saida = execFileSync('docker', ['exec', 'portal-postgres', 'psql', '-U', PG_USER, '-d', PG_DB, '-At', '-v', 'ON_ERROR_STOP=1', '-c', `select row_to_json(t) from (${sql}) t`], { maxBuffer: 1 << 30 }).toString()
  return saida.split('\n').filter(Boolean).map((l) => JSON.parse(l))
}
const lerTabela = (t: string) => consultar(`select * from public.${t} order by date_created, id`)
const contar = (t: string) => Number(consultar(`select count(*)::int as n from public.${t}`)[0].n)

/* ---------- utilitários ---------- */
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
const IGNORAR = new Set(['id', 'status', 'user_created', 'date_created', 'user_updated', 'date_updated'])

const editorConfig = await editorConfigFactory.default({ config: await config })
const htmlParaLexical = (html: string) => convertHTMLToLexical({ editorConfig, html, JSDOM: JSDOM as any })

/**
 * Prepara o HTML do Directus para o editor do Payload:
 *  - `<a>` sem href útil (âncoras vazias) é desembrulhado, mantendo o texto —
 *    o validador de links do Lexical rejeita URL vazia;
 *  - `/assets/<uuid>` (arquivo do Directus) vira `/api/media/file/<nome>` do Payload,
 *    migrando o arquivo se ainda não estiver lá. Sem isso o link morreria quando o
 *    Directus fosse desligado.
 */
async function prepararHtml(html: string, contexto: string): Promise<string> {
  const dom = new JSDOM(`<body>${html}</body>`)
  const doc = dom.window.document
  for (const a of Array.from(doc.querySelectorAll('a'))) {
    const href = (a.getAttribute('href') ?? '').trim()
    const m = href.match(/^\/assets\/([0-9a-f]{8}-[0-9a-f-]{27})/i)
    if (m) {
      await midia(m[1], contexto)
      const nome = nomeFinal.get(m[1])
      if (nome) a.setAttribute('href', `/api/media/file/${encodeURIComponent(nome)}`)
      else if (!SIMULAR) erro('link', m[1], `link /assets/ sem arquivo migrado (${contexto}); mantido o original`)
    } else if (!href || href === '#') {
      a.replaceWith(...Array.from(a.childNodes))
    }
  }
  return doc.body.innerHTML
}

const relatorio: Record<string, any> = { iniciadoEm: new Date().toISOString(), simulacao: SIMULAR, colecoes: {}, arquivos: {}, erros: [] as any[] }
const erro = (colecao: string, id: string, motivo: string) => { relatorio.erros.push({ colecao, id, motivo }); console.error(`  ✗ ${colecao} ${id}: ${motivo}`) }

const payload: Payload = await getPayload({ config })

/** idLegado → id novo, por coleção (carregado do banco novo, o que torna a execução retomável). */
const mapas = new Map<string, Map<string, number | string>>()
async function carregarMapa(slug: string) {
  const m = new Map<string, number | string>()
  let pagina = 1
  for (;;) {
    const r = await payload.find({ collection: slug as any, limit: 500, page: pagina, depth: 0, select: { idLegado: true } as any, pagination: true })
    for (const d of r.docs as any[]) if (d.idLegado) m.set(d.idLegado, d.id)
    if (!r.hasNextPage) break
    pagina++
  }
  mapas.set(slug, m)
  return m
}

/* ---------- arquivos ---------- */
const nomeFinal = new Map<string, string>() // uuid do Directus → filename no Payload
const arquivosDirectus = new Map<string, Linha>(consultar('select * from public.directus_files').map((f) => [f.id, f]))
async function midia(idArquivo: string | null, contexto: string): Promise<number | string | undefined> {
  if (!idArquivo) return undefined
  const mapa = mapas.get('media') ?? (await carregarMapa('media'))
  if (mapa.has(idArquivo)) {
    if (!nomeFinal.has(idArquivo) && mapa.get(idArquivo) !== 'simulado') nomeFinal.set(idArquivo, ((await payload.findByID({ collection: 'media', id: mapa.get(idArquivo)!, depth: 0, select: { filename: true } as any })) as any).filename)
    return mapa.get(idArquivo)
  }
  const f = arquivosDirectus.get(idArquivo)
  if (!f) { erro('media', idArquivo, `referenciado por ${contexto} mas não existe em directus_files`); return undefined }
  const caminho = path.join(UPLOADS, f.filename_disk)
  if (!fs.existsSync(caminho)) { erro('media', idArquivo, `arquivo ausente no disco: ${f.filename_disk} (${contexto})`); return undefined }
  if (SIMULAR) { mapa.set(idArquivo, 'simulado'); relatorio.arquivos.simulados = (relatorio.arquivos.simulados ?? 0) + 1; return undefined }
  try {
    const dados = fs.readFileSync(caminho)
    const doc: any = await payload.create({
      collection: 'media', depth: 0, context: { semAuditoria: true, semInspecaoUpload: true },
      data: { alt: f.title ?? undefined, idLegado: idArquivo, createdAt: f.uploaded_on ?? undefined } as any,
      file: { data: dados, mimetype: f.type ?? 'application/octet-stream', name: f.filename_download ?? f.filename_disk, size: dados.length },
    })
    // O Payload (sharp) pode RECODIFICAR imagens ao gravar (ocorreu com .webp). Arquivo oficial não
    // pode mudar: se os bytes gravados diferirem do original, restaura o original por cima.
    const gravado = path.resolve(import.meta.dirname, '../media', doc.filename)
    if (fs.existsSync(gravado) && Buffer.compare(fs.readFileSync(gravado), dados) !== 0) {
      fs.writeFileSync(gravado, dados)
      await payload.db.drizzle.execute(`update media set filesize = ${dados.length} where id = ${doc.id}` as any)
      relatorio.arquivos.restauradosAoOriginal = (relatorio.arquivos.restauradosAoOriginal ?? 0) + 1
    }
    mapa.set(idArquivo, doc.id)
    nomeFinal.set(idArquivo, doc.filename)
    relatorio.arquivos.migrados = (relatorio.arquivos.migrados ?? 0) + 1
    return doc.id
  } catch (e: any) { erro('media', idArquivo, `${f.filename_download}: ${e.message}`); return undefined }
}

/* ---------- migração genérica de uma coleção ---------- */
interface Spec {
  tabela: string
  slug: string
  html?: string[]                       // colunas HTML → Lexical
  rel?: Record<string, string>          // coluna → slug da coleção apontada
  arq?: string[]                        // colunas que apontam para directus_files
  depois?: string[]                     // relações auto-referentes, gravadas num 2º passe
}

async function migrar(s: Spec) {
  if (SOMENTE && !SOMENTE.includes(s.slug)) return
  console.log(`\n▶ ${s.tabela} → ${s.slug}`)
  const linhas = lerTabela(s.tabela)
  const mapa = mapas.get(s.slug) ?? (await carregarMapa(s.slug))
  const r: Record<string, number> = { origem: linhas.length, criados: 0, jaExistiam: 0, falhas: 0 }
  const adiados: { idLegado: string; campos: Record<string, string> }[] = []

  for (const l of linhas) {
    if (mapa.has(l.id)) {
      r.jaExistiam++
      // já migrado numa rodada anterior: se o HTML tinha links /assets/, refaz a conversão com os links reescritos
      const reescrever = (s.html ?? []).filter((c) => /\/assets\//.test(String(l[c] ?? '')))
      if (reescrever.length && !SIMULAR) {
        const dados: Record<string, any> = {}
        for (const c of reescrever) dados[camel(c)] = htmlParaLexical(await prepararHtml(String(l[c]), `${s.slug}/${l.id}`))
        await payload.update({ collection: s.slug as any, id: mapa.get(l.id)!, data: dados, depth: 0, context: { semAuditoria: true }, overrideAccess: true })
        r.links = (r.links ?? 0) + 1
      }
      continue
    }
    const data: Record<string, any> = {
      status: l.status ?? 'rascunho', idLegado: l.id,
      autoriaLegado: { userCreated: l.user_created, userUpdated: l.user_updated },
      createdAt: l.date_created, updatedAt: l.date_updated,
    }
    const adiar: Record<string, string> = {}
    let ok = true
    for (const [col, val] of Object.entries(l)) {
      if (IGNORAR.has(col) || val === null || val === undefined) continue
      const campo = camel(col)
      if (s.html?.includes(col)) {
        if (String(val).trim()) { try { data[campo] = htmlParaLexical(await prepararHtml(String(val), `${s.slug}/${l.id}`)) } catch (e: any) { erro(s.slug, l.id, `HTML de "${col}" não converteu: ${e.message}`); ok = false } }
      } else if (s.arq?.includes(col)) {
        const idm = await midia(val, `${s.slug}/${l.id}`)
        if (idm !== undefined && idm !== 'simulado') data[campo] = idm
      } else if (s.depois?.includes(col)) {
        adiar[campo] = val
      } else if (s.rel?.[col]) {
        const alvo = (mapas.get(s.rel[col]) ?? (await carregarMapa(s.rel[col]))).get(val)
        if (alvo === undefined && !SIMULAR) { erro(s.slug, l.id, `relação "${col}" → ${s.rel[col]}/${val} não encontrada`); ok = false } else if (alvo !== undefined) data[campo] = alvo
      } else {
        data[campo] = val
      }
    }
    if (!ok) { r.falhas++; continue }
    if (SIMULAR) { r.criados++; continue }
    try {
      const doc: any = await payload.create({ collection: s.slug as any, data: data as any, depth: 0, context: { semAuditoria: true } })
      mapa.set(l.id, doc.id)
      if (Object.keys(adiar).length) adiados.push({ idLegado: l.id, campos: adiar })
      r.criados++
    } catch (e: any) {
      r.falhas++
      erro(s.slug, l.id, (e.data?.errors ? JSON.stringify(e.data.errors) : e.message).slice(0, 400))
    }
  }
  // 2º passe: relações auto-referentes (ex.: licitacao_anexos.substitui)
  for (const a of adiados) {
    const dados: Record<string, any> = {}
    for (const [campo, uuid] of Object.entries(a.campos)) { const alvo = mapa.get(uuid); if (alvo !== undefined) dados[campo] = alvo; else erro(s.slug, a.idLegado, `auto-relação ${campo} → ${uuid} não encontrada`) }
    if (Object.keys(dados).length) await payload.update({ collection: s.slug as any, id: mapa.get(a.idLegado)!, data: dados, depth: 0, context: { semAuditoria: true }, overrideAccess: true })
  }
  relatorio.colecoes[s.slug] = r
  console.log(`  origem ${r.origem} | criados ${r.criados} | já existiam ${r.jaExistiam} | falhas ${r.falhas}${r.links ? ` | links reescritos em ${r.links}` : ''}`)
}

/* ---------- arquivos referenciados por UUID escrito no CÓDIGO do site ----------
 * Nenhuma coleção aponta para eles, então a migração por coleção não os traz. Rodar só este passo:
 *   npx payload run scripts/migrar-dados.ts -- --somente=avulsos
 * (use --somente: uma rodada completa reconverte o texto rico de notícias/conselhos e muda o updatedAt deles.) */
const ARQUIVOS_AVULSOS: Array<{ id: string; onde: string }> = [
  { id: 'c18ace16-28e1-466c-b501-2dca3eb8e0cf', onde: 'apps/web/src/pages/estrutura-administrativa.astro (ID_IMAGEM_ORGANOGRAMA)' },
];
if (!SOMENTE || SOMENTE.includes('avulsos')) {
  console.log('\n▶ arquivos avulsos (UUID fixo no código do site)');
  for (const a of ARQUIVOS_AVULSOS) {
    const antes = (mapas.get('media') ?? (await carregarMapa('media'))).has(a.id);
    await midia(a.id, a.onde);
    console.log(`  ${a.id}: ${antes ? 'já estava no Payload' : SIMULAR ? 'seria migrado' : 'migrado'}`);
  }
}

/* ---------- ordem das coleções (dependências primeiro) ---------- */
const ESPECIFICACOES: Spec[] = [
  { tabela: 'secretarias', slug: 'secretarias', html: ['descricao', 'biografia_responsavel'] },
  { tabela: 'noticias', slug: 'noticias', html: ['conteudo'], arq: ['imagem', 'arquivo'], rel: { secretaria: 'secretarias' } },
  { tabela: 'servicos', slug: 'servicos', html: ['como_solicitar'], rel: { secretaria: 'secretarias' } },
  { tabela: 'documentos', slug: 'documentos', arq: ['arquivo'], rel: { secretaria: 'secretarias' } },
  { tabela: 'paginas', slug: 'paginas', html: ['conteudo'] },
  { tabela: 'links_uteis', slug: 'links-uteis' },
  { tabela: 'selos', slug: 'selos', arq: ['imagem'] },
  { tabela: 'perguntas_frequentes', slug: 'perguntas-frequentes', html: ['resposta'], rel: { secretaria: 'secretarias' } },
  { tabela: 'patrimonio_documentos', slug: 'patrimonio-cultural', arq: ['arquivo'], rel: { secretaria: 'secretarias' } },
  { tabela: 'telefones_uteis', slug: 'telefones-uteis' },
  { tabela: 'coleta_lixo', slug: 'coleta-lixo' },
  { tabela: 'conselhos_municipais', slug: 'conselhos-municipais', html: ['conteudo'] },
  { tabela: 'licitacoes', slug: 'licitacoes', html: ['objeto'], rel: { secretaria: 'secretarias' } },
  { tabela: 'licitacao_anexos', slug: 'licitacao-anexos', arq: ['arquivo'], rel: { licitacao: 'licitacoes' }, depois: ['substitui'] },
  { tabela: 'licitacao_lotes', slug: 'licitacao-lotes', rel: { licitacao: 'licitacoes' } },
  { tabela: 'licitacao_eventos', slug: 'licitacao-eventos', rel: { licitacao: 'licitacoes', anexo: 'licitacao-anexos' } },
  { tabela: 'licitacao_assinantes', slug: 'licitacao-assinantes' },
  { tabela: 'obras', slug: 'obras', html: ['objeto'], rel: { secretaria: 'secretarias', licitacao: 'licitacoes' } },
  { tabela: 'obra_anexos', slug: 'obra-anexos', arq: ['arquivo'], rel: { obra: 'obras' } },
  { tabela: 'obra_medicoes', slug: 'obra-medicoes', arq: ['boletim'], rel: { obra: 'obras' } },
]
// `substitui` aponta para licitacao_anexos (a própria coleção): entra no 2º passe.
for (const s of ESPECIFICACOES) {
  // relações cujo alvo é a própria coleção vão em `depois`, nunca em `rel`
  await migrar(s)
}

/* ---------- conferência: contagem origem × destino ---------- */
if (!SIMULAR) {
  console.log('\n▶ Conferência de contagens')
  relatorio.conferencia = {}
  for (const s of ESPECIFICACOES) {
    if (SOMENTE && !SOMENTE.includes(s.slug)) continue
    const antes = contar(s.tabela)
    const depois = (await payload.count({ collection: s.slug as any, overrideAccess: true })).totalDocs
    relatorio.conferencia[s.slug] = { directus: antes, payload: depois, confere: antes === depois }
    console.log(`  ${antes === depois ? '✓' : '✗'} ${s.slug.padEnd(24)} directus ${String(antes).padStart(5)} | payload ${String(depois).padStart(5)}`)
  }
}
relatorio.terminadoEm = new Date().toISOString()
fs.writeFileSync(RELATORIO, JSON.stringify(relatorio, null, 2))
console.log(`\nRelatório: ${RELATORIO} | erros: ${relatorio.erros.length}`)
process.exit(relatorio.erros.length ? 2 : 0)
