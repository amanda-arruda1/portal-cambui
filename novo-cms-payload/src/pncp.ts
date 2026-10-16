import type { Endpoint } from 'payload'
import { podeCriarEm } from './acesso'

/**
 * Importação assistida do PNCP (portada de `apps/web/src/lib/painel/licitacoes.ts`, painel antigo).
 *
 * O servidor cola a URL ou o número de controle; devolvemos os campos pré-preenchidos para ELE REVISAR. Nada é gravado
 * aqui — a confirmação é dele, sempre. O Payload não alcança a internet: a busca passa pelo serviço `portal-pncp`
 * (127.0.0.1:3100, infra/scripts/pncp-servico.mjs). PNCP fora do ar não impede nada: o painel segue com preenchimento manual.
 */
const SERVICO = (process.env.PNCP_SERVICO_URL || 'http://127.0.0.1:3100').replace(/\/+$/, '')
/** Só importamos contratação DESTE órgão: colar edital de outro município num portal oficial seria publicar o que não é nosso. */
const CNPJ_ORGAO = (process.env.PNCP_CNPJ_ORGAO || '18675975000185').replace(/\D/g, '')

const MODALIDADE: Record<number, string> = {
  1: 'leilao', 2: 'dialogo_competitivo', 3: 'concurso', 4: 'concorrencia', 5: 'concorrencia',
  6: 'pregao_eletronico', 7: 'pregao_presencial', 8: 'dispensa', 9: 'inexigibilidade',
  10: 'chamamento_publico', 11: 'pre_qualificacao', 12: 'credenciamento', 13: 'leilao',
}
const MODO: Record<number, string> = { 1: 'aberto', 2: 'fechado', 3: 'aberto_fechado', 4: 'fechado_aberto', 5: 'nao_se_aplica' }

/** Aceita a URL completa ou o numeroControlePNCP (CNPJ-1-SEQ/ANO). */
export function interpretarReferencia(bruto: string): { cnpj: string; ano: string; sequencial: string } | null {
  const texto = bruto.trim()
  const porUrl = texto.match(/pncp\.gov\.br\/app\/editais\/(\d{14})\/(\d{4})\/(\d+)/i)
  if (porUrl) return { cnpj: porUrl[1]!, ano: porUrl[2]!, sequencial: porUrl[3]! }
  const porId = texto.match(/^(\d{14})-\d+-(\d+)\/(\d{4})$/)
  if (porId) return { cnpj: porId[1]!, ano: porId[3]!, sequencial: String(Number(porId[2])) }
  return null
}

/** O PNCP informa horário de Brasília SEM fuso ("2026-01-20T17:00:00"); sem o deslocamento, o painel o leria como UTC. */
const comFuso = (s: unknown): string | null => {
  if (typeof s !== 'string' || !s) return null
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}-03:00`
}

export function mapear(c: Record<string, any>, ref: { cnpj: string; ano: string; sequencial: string }) {
  // numeroCompra vem como "93/2025": o número do edital e o ANO DO EDITAL (que pode diferir do ano de registro no PNCP).
  const m = String(c.numeroCompra ?? '').match(/^\s*(\d+)\s*\/\s*(\d{4})\s*$/)
  const numero = m ? Number(m[1]) : Number(c.numeroCompra) || undefined
  const ano = m ? Number(m[2]) : Number(c.anoCompra) || undefined
  const abertura = comFuso(c.dataAberturaProposta)
  const dados: Record<string, unknown> = {
    numeroProcesso: c.processo || undefined,
    numero, ano,
    modalidade: MODALIDADE[c.modalidadeId],
    forma: c.modalidadeId === 7 ? 'presencial' : 'eletronica',
    justificativaPresencial: c.justificativaPresencial || undefined,
    modoDisputa: MODO[c.modoDisputaId] ?? 'aberto',
    registroPrecos: Boolean(c.srp),
    objetoResumo: String(c.objetoCompra ?? '').replace(/\s+/g, ' ').trim() || undefined,
    valorEstimado: typeof c.valorTotalEstimado === 'number' ? c.valorTotalEstimado : undefined,
    dataPublicacao: comFuso(c.dataPublicacaoPncp) ?? undefined,
    dataAberturaPropostas: abertura ?? undefined,
    dataSessao: abertura ?? undefined,
    pncpId: c.numeroControlePNCP || undefined,
    pncpUrl: `https://pncp.gov.br/app/editais/${ref.cnpj}/${ref.ano}/${ref.sequencial}`,
    sistemaSessaoUrl: c.linkSistemaOrigem || undefined,
  }
  // O PNCP não informa o critério de julgamento nesta consulta: fica para o servidor escolher.
  const sigilo = String(c.orcamentoSigilosoDescricao ?? '')
  if (/^compra com sigilo/i.test(sigilo)) dados.orcamentoSigiloso = true
  return Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== undefined && v !== null))
}

const json = (corpo: unknown, status = 200) => Response.json(corpo, { status })

export const importarPncp: Endpoint = {
  path: '/importar-pncp',
  method: 'post',
  handler: async (req) => {
    if (!podeCriarEm('licitacoes')(req.user)) return json({ erro: 'Você não tem o módulo de Licitações liberado. Peça ao administrador.' }, 403)

    const corpo = (await req.json?.().catch(() => ({}))) as { referencia?: string } | undefined
    const referencia = String(corpo?.referencia ?? '').trim()
    if (!referencia) return json({ erro: 'Informe a URL ou o número de controle do PNCP.' }, 400)

    const ref = interpretarReferencia(referencia)
    if (!ref) return json({ erro: 'Não reconheci essa referência. Cole a URL da contratação no PNCP (pncp.gov.br/app/editais/…) ou o número de controle no formato 00000000000000-1-000032/2026.' }, 400)
    if (ref.cnpj !== CNPJ_ORGAO) return json({ erro: 'Essa contratação é de outro órgão. O portal só publica as licitações da Prefeitura de Cambuí.' }, 400)

    let r: Response
    try {
      r = await fetch(`${SERVICO}/compra?cnpj=${ref.cnpj}&ano=${ref.ano}&seq=${ref.sequencial}`, { signal: AbortSignal.timeout(25_000) })
    } catch {
      r = new Response(null, { status: 503 })
    }
    if (r.status === 404) return json({ erro: 'O PNCP não encontrou essa contratação. Confira o número e o ano.' }, 404)
    if (!r.ok) {
      req.payload.logger.warn(`[pncp] importação falhou para "${referencia}" (HTTP ${r.status})`)
      return json({ erro: 'O PNCP não respondeu agora. Isso acontece com frequência e não impede nada: preencha os campos manualmente e siga. Você pode tentar a importação de novo depois.' }, 503)
    }

    const dados = mapear((await r.json()) as Record<string, any>, ref)
    const avisos: string[] = []
    const igual = await req.payload.find({
      collection: 'licitacoes', req, depth: 0, limit: 1,
      where: { or: [{ pncpId: { equals: String(dados.pncpId ?? '__') } }, ...(dados.numeroProcesso ? [{ numeroProcesso: { equals: String(dados.numeroProcesso) } }] : [])] },
    })
    if (igual.docs[0]) avisos.push(`Atenção: já existe uma licitação com esse processo ou esse número do PNCP (nº ${igual.docs[0].numero}/${igual.docs[0].ano}). Confira antes de salvar para não duplicar.`)
    if (!dados.modalidade) avisos.push('A modalidade do PNCP não tem correspondente no portal: escolha a modalidade manualmente.')
    avisos.push('Escolha o critério de julgamento: o PNCP não o informa nesta consulta.')

    req.payload.logger.info(`[pncp] ${(req.user as { email?: string } | null)?.email} importou ${referencia}`)
    return json({ dados, avisos })
  },
}
