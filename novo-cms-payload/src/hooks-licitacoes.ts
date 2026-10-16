import { randomUUID } from 'node:crypto'
import { APIError } from 'payload'
import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionBeforeValidateHook } from 'payload'

/**
 * Regras de negócio das licitações — portadas de `apps/web/src/lib/painel/licitacoes.ts` (painel antigo).
 *
 * ERRO bloqueia o salvamento. ALERTA deixa seguir SOMENTE com `justificativaPrazo` preenchida (campo virtual, não vai
 * ao banco; vira observação no evento de publicação). Importação/sincronização passa `context.semRegrasLicitacao`.
 */

const DIA = 86400000

const MODALIDADES: Record<string, { rotulo: string; prazoMinimoDias: number }> = {
  pregao_eletronico: { rotulo: 'Pregão Eletrônico', prazoMinimoDias: 8 },
  pregao_presencial: { rotulo: 'Pregão Presencial', prazoMinimoDias: 8 },
  concorrencia: { rotulo: 'Concorrência', prazoMinimoDias: 35 },
  concurso: { rotulo: 'Concurso', prazoMinimoDias: 35 },
  leilao: { rotulo: 'Leilão', prazoMinimoDias: 15 },
  dialogo_competitivo: { rotulo: 'Diálogo Competitivo', prazoMinimoDias: 25 },
  dispensa: { rotulo: 'Dispensa de Licitação', prazoMinimoDias: 3 },
  dispensa_eletronica: { rotulo: 'Dispensa Eletrônica', prazoMinimoDias: 3 },
  inexigibilidade: { rotulo: 'Inexigibilidade', prazoMinimoDias: 0 },
  chamamento_publico: { rotulo: 'Chamamento Público', prazoMinimoDias: 15 },
  credenciamento: { rotulo: 'Credenciamento', prazoMinimoDias: 15 },
  pre_qualificacao: { rotulo: 'Pré-qualificação', prazoMinimoDias: 15 },
  adesao_ata: { rotulo: 'Adesão a Ata de Registro de Preços', prazoMinimoDias: 0 },
  cotacao_eletronica: { rotulo: 'Cotação Eletrônica', prazoMinimoDias: 3 },
}

type Dados = Record<string, any>
export interface Problema { campo: string; nivel: 'erro' | 'alerta'; texto: string }

/** Endereço permanente `<modalidade-sem-acento>-<número com 3 dígitos>`. */
export function gerarSlug(modalidade: string, numero: number): string {
  const rotulo = MODALIDADES[modalidade]?.rotulo ?? modalidade
  const base = rotulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${base}-${String(numero).padStart(3, '0')}`
}

export function validar(d: Dados, opcoes: { publicando: boolean; temEdital: boolean }): Problema[] {
  const p: Problema[] = []
  const publicacao = d.dataPublicacao ? new Date(d.dataPublicacao) : null
  const sessao = d.dataSessao ? new Date(d.dataSessao) : null

  if (!String(d.numeroProcesso ?? '').trim()) p.push({ campo: 'numeroProcesso', nivel: 'erro', texto: 'Informe o número do processo administrativo.' })
  if (!String(d.objetoResumo ?? '').trim()) p.push({ campo: 'objetoResumo', nivel: 'erro', texto: 'Descreva o objeto em uma linha — é o que o fornecedor lê na listagem e o que a busca encontra.' })
  if (!d.modalidade) p.push({ campo: 'modalidade', nivel: 'erro', texto: 'Escolha a modalidade.' })
  if (!d.criterioJulgamento) p.push({ campo: 'criterioJulgamento', nivel: 'erro', texto: 'Escolha o critério de julgamento.' })
  if (!publicacao) p.push({ campo: 'dataPublicacao', nivel: 'erro', texto: 'Informe a data de publicação do edital.' })

  if (d.forma === 'presencial' && !String(d.justificativaPresencial ?? '').trim()) {
    p.push({ campo: 'justificativaPresencial', nivel: 'erro', texto: 'A forma presencial exige justificativa registrada (art. 17, §2º, da Lei 14.133/2021). Sem ela, a licitação fica vulnerável a impugnação.' })
  }

  if (publicacao && sessao && sessao.getTime() < publicacao.getTime()) {
    p.push({ campo: 'dataSessao', nivel: 'erro', texto: 'A sessão está marcada para ANTES da publicação do edital. Confira as duas datas.' })
  }

  if (opcoes.publicando) {
    if (!sessao) {
      p.push({ campo: 'dataSessao', nivel: 'alerta', texto: 'Sem data de sessão, o portal não mostra contagem regressiva nem gera o convite de calendário.' })
    } else if (sessao.getTime() < Date.now()) {
      p.push({ campo: 'dataSessao', nivel: 'erro', texto: 'A sessão está marcada para uma data que já passou. Publicar assim informa prazo vencido ao fornecedor.' })
    }
    if (!opcoes.temEdital) {
      p.push({ campo: 'anexos', nivel: 'erro', texto: 'Não há edital anexado. Publicar aviso de licitação sem o edital é o erro que mais gera impugnação.' })
    }
    const meta = MODALIDADES[d.modalidade]
    if (meta && publicacao && sessao) {
      const dias = Math.floor((sessao.getTime() - publicacao.getTime()) / DIA)
      if (dias < meta.prazoMinimoDias) {
        p.push({ campo: 'dataSessao', nivel: 'alerta', texto: `São ${dias} dia(s) entre a publicação e a sessão. Para ${meta.rotulo}, o art. 55 da Lei 14.133/2021 indica ao menos ${meta.prazoMinimoDias}. Se houver razão para o prazo menor, registre a justificativa antes de publicar.` })
      }
    }
  }
  return p
}

const chave = (x: Problema) => `${x.campo}|${x.texto}`

/**
 * Identificador público e permanente. `/api/licitacoes` devolve `id` e o convite de agenda usa `UID:licitacao-<id>@…`;
 * trocar o id duplicaria o evento na agenda de quem assina. As 697 migradas já trazem o UUID do Directus em `idLegado`;
 * as novas ganham um UUID aqui, e o site expõe sempre `idLegado` — o id numérico do Payload nunca vira contrato público.
 */
export const uuidPublico: CollectionBeforeValidateHook = ({ data, operation }) => {
  if (data && operation === 'create' && !data.idLegado) data.idLegado = randomUUID()
  return data
}

/** Slug: gerado na criação; refeito ao PUBLICAR um rascunho (comportamento do painel antigo); depois de publicada, nunca muda. */
export const slugPermanente: CollectionBeforeValidateHook = ({ data, originalDoc, operation, req }) => {
  if (!data || req.context?.semRegrasLicitacao) return data
  const modalidade = data.modalidade ?? originalDoc?.modalidade
  const numero = data.numero ?? originalDoc?.numero
  if (operation === 'create') {
    if (!data.slug && modalidade && numero != null) data.slug = gerarSlug(modalidade, Number(numero))
    return data
  }
  const jaPublicada = originalDoc?.status === 'publicado' || originalDoc?.status === 'arquivado'
  if (jaPublicada) {
    data.slug = originalDoc.slug
  } else if (data.status === 'publicado' && modalidade && numero != null) {
    data.slug = gerarSlug(modalidade, Number(numero))
  }
  return data
}

export const regrasLicitacao: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (req.context?.semRegrasLicitacao) return data
  const final: Dados = { ...(originalDoc ?? {}), ...data }
  const publicando = final.status === 'publicado' && originalDoc?.status !== 'publicado'

  let temEdital = true
  if (publicando) {
    if (operation === 'create' || !originalDoc?.id) temEdital = false
    else {
      const { totalDocs } = await req.payload.count({
        collection: 'licitacao-anexos', req, overrideAccess: true,
        where: { and: [{ licitacao: { equals: originalDoc.id } }, { tipo: { equals: 'edital' } }, { superado: { not_equals: true } }] },
      })
      temEdital = totalDocs > 0
    }
  }

  const agora = validar(final, { publicando, temEdital })
  // Registro antigo com pendência já existente não trava uma correção sem relação com ela: só barram erros NOVOS.
  const antes = operation === 'update' && originalDoc && !publicando ? new Set(validar(originalDoc, { publicando: false, temEdital: true }).map(chave)) : new Set<string>()
  const erros = agora.filter((x) => x.nivel === 'erro' && !antes.has(chave(x)))
  if (erros.length) throw new APIError(erros.map((e) => e.texto).join(' '), 400, undefined, true)

  const alertas = agora.filter((x) => x.nivel === 'alerta')
  const justificativa = String(final.justificativaPrazo ?? '').trim()
  if (publicando && alertas.length && !justificativa) {
    throw new APIError(`Há um alerta que exige justificativa registrada antes de publicar. ${alertas.map((a) => a.texto).join(' ')} Preencha "Justificativa do prazo".`, 400, undefined, true)
  }
  if (publicando) req.context.justificativaPrazo = justificativa || undefined
  return data
}

/** Ao publicar: evento `publicacao`, que é o que o histórico público e o RSS mostram. */
export const eventoDePublicacao: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (req.context?.semRegrasLicitacao) return doc
  const publicou = doc.status === 'publicado' && (operation === 'create' || previousDoc?.status !== 'publicado')
  if (!publicou) return doc
  const justificativa = req.context?.justificativaPrazo as string | undefined
  await req.payload.create({
    collection: 'licitacao-eventos', req, overrideAccess: true, context: { semAuditoria: false },
    data: {
      licitacao: doc.id, tipo: 'publicacao', data: new Date().toISOString(), status: 'publicado',
      descricao: justificativa ? `Edital publicado no portal. Justificativa registrada para o prazo reduzido: ${justificativa}` : 'Edital publicado no portal e no PNCP.',
    },
  })
  return doc
}

/** Anexo que substitui outro: o anterior vira `superado` (continua visível como histórico) e a retificação é registrada. */
export const substituicaoDeAnexo: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create' || !doc.substitui || req.context?.semRegrasLicitacao) return doc
  const idAnterior = typeof doc.substitui === 'object' ? doc.substitui.id : doc.substitui
  await req.payload.update({ collection: 'licitacao-anexos', id: idAnterior, req, overrideAccess: true, data: { superado: true } })
  const licitacao = typeof doc.licitacao === 'object' ? doc.licitacao.id : doc.licitacao
  await req.payload.create({
    collection: 'licitacao-eventos', req, overrideAccess: true,
    data: {
      licitacao, tipo: 'retificacao', data: new Date().toISOString(), status: 'publicado',
      descricao: `Documento substituído: "${doc.titulo}" passou a valer como versão ${doc.versao ?? 1}. A versão anterior permanece publicada como histórico.`,
    },
  })
  return doc
}
