import { APIError } from 'payload'
import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionBeforeValidateHook, FieldHook } from 'payload'

/**
 * Regras de negócio das obras públicas — portadas de `apps/web/src/lib/painel/obras.ts` (painel antigo, removido).
 * Público: o setor de obras, sob fiscalização de órgãos de controle. ERRO bloqueia ao PUBLICAR (e em obra já publicada);
 * ALERTA nunca bloqueia, aparece no campo "Pendências" da barra lateral. Sincronização/importação passa `context.semRegrasObra`.
 */
type Dados = Record<string, any>
export interface Problema { campo: string; nivel: 'erro' | 'alerta'; texto: string }

const FONTES: Record<string, string> = {
  municipal: 'Recursos próprios do município', estadual: 'Convênio estadual', federal: 'Convênio federal',
  financiamento: 'Financiamento ou empréstimo', misto: 'Recursos combinados',
}

/** Endereço permanente: resumo do objeto sem acento + sufixo (primeiros 8 caracteres do UUID público). */
export function gerarSlug(objetoResumo: string, sufixo: string): string {
  const base = objetoResumo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70)
  return `${base}-${sufixo}`
}

export function validar(d: Dados, opcoes: { temArtRrt: boolean }): Problema[] {
  const p: Problema[] = []
  const vazio = (v: unknown) => !String(v ?? '').trim()
  if (vazio(d.numeroProcesso)) p.push({ campo: 'numeroProcesso', nivel: 'erro', texto: 'Informe o número do processo administrativo.' })
  if (vazio(d.objetoResumo)) p.push({ campo: 'objetoResumo', nivel: 'erro', texto: 'Descreva o objeto em uma linha — é o que aparece na listagem pública.' })
  if (!d.categoria) p.push({ campo: 'categoria', nivel: 'erro', texto: 'Escolha a categoria da obra.' })
  if (!d.fonteRecurso) p.push({ campo: 'fonteRecurso', nivel: 'erro', texto: 'Informe a fonte do recurso.' })
  if ((d.fonteRecurso === 'estadual' || d.fonteRecurso === 'federal') && vazio(d.numeroConvenio)) {
    p.push({ campo: 'numeroConvenio', nivel: 'erro', texto: `${FONTES[d.fonteRecurso]} exige o número do convênio — é o primeiro dado pedido em prestação de contas ao órgão repassador.` })
  }
  if (d.situacao === 'paralisada' && vazio(d.motivoSituacao)) p.push({ campo: 'motivoSituacao', nivel: 'erro', texto: 'Obra paralisada exige motivo registrado — é o que órgãos de controle mais cobram nesse estado.' })
  if (d.situacao === 'cancelada' && vazio(d.motivoSituacao)) p.push({ campo: 'motivoSituacao', nivel: 'erro', texto: 'Registre o motivo do cancelamento.' })

  if (['em_execucao', 'paralisada', 'concluida'].includes(d.situacao)) {
    if (vazio(d.responsavelTecnico)) p.push({ campo: 'responsavelTecnico', nivel: 'alerta', texto: 'Sem responsável técnico registrado. Obra em execução sem ART/RRT é a irregularidade mais comum em auditoria de obras — preencha assim que possível.' })
    if (!opcoes.temArtRrt) p.push({ campo: 'anexos', nivel: 'alerta', texto: 'Não há ART/RRT anexada. Anexe assim que possível — é o primeiro documento que um órgão fiscalizador pede.' })
    if (vazio(d.empresaExecutora)) p.push({ campo: 'empresaExecutora', nivel: 'alerta', texto: 'Informe a empresa executora.' })
  }
  return p
}

const chave = (x: Problema) => `${x.campo}|${x.texto}`
const idDe = (v: any) => (v && typeof v === 'object' ? v.id : v)

async function temArt(req: any, obraId: unknown): Promise<boolean> {
  if (!obraId) return false
  const { totalDocs } = await req.payload.count({ collection: 'obra-anexos', req, overrideAccess: true, where: { and: [{ obra: { equals: obraId } }, { categoria: { equals: 'art_rrt' } }] } })
  return totalDocs > 0
}

/** Slug na criação (do resumo + sufixo); refeito ao publicar um rascunho; depois de publicada, nunca muda. */
export const slugDaObra: CollectionBeforeValidateHook = ({ data, originalDoc, operation, req }) => {
  if (!data || req.context?.semRegrasObra) return data
  const resumo = data.objetoResumo ?? originalDoc?.objetoResumo ?? 'obra'
  const sufixo = String(data.idLegado ?? originalDoc?.idLegado ?? Math.random().toString(36).slice(2)).slice(0, 8)
  if (operation === 'create') {
    if (!data.slug) data.slug = gerarSlug(resumo, sufixo)
    return data
  }
  const jaPublicada = originalDoc?.status === 'publicado' || originalDoc?.status === 'arquivado'
  if (jaPublicada) data.slug = originalDoc.slug
  else if (data.status === 'publicado') data.slug = gerarSlug(resumo, sufixo)
  return data
}

export const regrasObra: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (req.context?.semRegrasObra) return data
  const final: Dados = { ...(originalDoc ?? {}), ...data }
  if (final.status !== 'publicado') return data // rascunho salva livre, como no painel antigo
  const publicando = originalDoc?.status !== 'publicado'
  // Obra já publicada com pendência antiga não trava uma correção sem relação com ela: só barram erros NOVOS.
  const antes = operation === 'update' && !publicando ? new Set(validar(originalDoc ?? {}, { temArtRrt: true }).map(chave)) : new Set<string>()
  const erros = validar(final, { temArtRrt: true }).filter((x) => x.nivel === 'erro' && !antes.has(chave(x)))
  if (erros.length) throw new APIError(`A publicação foi bloqueada. ${erros.map((e) => e.texto).join(' ')}`, 400, undefined, true)
  return data
}

/** Campo "Pendências" (só para quem está logado): os alertas que o painel antigo mostrava ao publicar. */
export const pendenciasDaObra: FieldHook = async ({ siblingData, data, req }) => {
  if (!req.user) return undefined // leitura pública não calcula (nem recebe) as pendências
  const d: Dados = { ...(data ?? {}), ...(siblingData ?? {}) }
  if (!d.situacao) return undefined
  const alertas = validar(d, { temArtRrt: await temArt(req, d.id) }).filter((x) => x.nivel === 'alerta')
  return alertas.length ? alertas.map((a) => `• ${a.texto}`).join('\n') : 'Nenhuma pendência.'
}

/** Medição: acumulado calculado se vier em branco (soma das anteriores + a atual). */
export const acumuladoDaMedicao: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || req.context?.semRegrasObra || data.valorAcumulado != null || data.valorMedido == null) return data
  const anteriores = await req.payload.find({ collection: 'obra-medicoes', req, overrideAccess: true, depth: 0, limit: 0, pagination: false, where: { obra: { equals: idDe(data.obra) } } })
  const soma = anteriores.docs.reduce((s: number, m: any) => s + (Number(m.valorMedido) || 0), 0)
  return { ...data, valorAcumulado: soma + Number(data.valorMedido) }
}

/** Nova medição com percentual informado atualiza a execução física e o valor pago da obra (como o painel antigo fazia). */
export const medicaoAtualizaObra: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create' || req.context?.semRegrasObra || doc.percentualAcumulado == null) return doc
  await req.payload.update({
    collection: 'obras', id: idDe(doc.obra), req, overrideAccess: true, context: { semRegrasObra: true },
    data: { percentualExecucao: doc.percentualAcumulado, valorPago: doc.valorAcumulado ?? undefined },
  })
  return doc
}
