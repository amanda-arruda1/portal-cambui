import { APIError } from 'payload'
import type { CollectionBeforeOperationHook } from 'payload'
import { detectarFormato, riscoNoCsv, riscoNoPdf } from './assinatura'
import { TAMANHO_MINIMO, TIPOS_ACEITOS, extensaoDe, sanitizarNome, tipoPorExtensao, tipoPorFormato } from './politica'

/**
 * Política de upload do portal aplicada ao painel do Payload — a mesma do Directus (apps/web/src/lib/upload/index.ts):
 * lista de permissão por extensão, formato real pelo CONTEÚDO (não pelo nome nem pelo Content-Type), teto por tipo,
 * coerência nome×conteúdo×MIME, riscos dentro de PDF/CSV e nome seguro. O antivírus não roda aqui (o Payload é confinado
 * e não alcança o clamd): o arquivo é varrido pelo timer `portal-antivirus`, que também cobre `media/`.
 */
const listaAmigavel = () => TIPOS_ACEITOS.map((t) => t.extensoes.join('/')).join(', ')
const recusar = (motivo: string): never => { throw new APIError(motivo, 400, undefined, true) }

export function inspecionarArquivo(dados: Uint8Array, nomeBruto: string, mimeDeclarado?: string): { nome: string } {
  const nome = sanitizarNome(nomeBruto)
  const extensao = extensaoDe(nome)

  if (dados.length < TAMANHO_MINIMO) recusar('O arquivo chegou vazio. Verifique se o envio foi concluído e tente de novo.')
  if (!extensao) recusar(`O arquivo precisa ter extensão. Aceitamos: ${listaAmigavel()}.`)
  const tipo = tipoPorExtensao(extensao)
  if (!tipo) return recusar(`Arquivos "${extensao}" não são aceitos. Aceitamos: ${listaAmigavel()}.`)
  if (dados.length > tipo.tamanhoMaximo) {
    recusar(`O limite para ${tipo.rotulo} é ${Math.round(tipo.tamanhoMaximo / (1024 * 1024))} MB e este arquivo tem ${(dados.length / (1024 * 1024)).toFixed(1)} MB.`)
  }

  const { formato, perigo } = detectarFormato(dados, extensao)
  if (perigo) recusar(`O conteúdo deste arquivo é ${perigo}, não ${tipo.rotulo}. Envio recusado.`)
  if (!formato) recusar(`Não foi possível reconhecer o conteúdo como ${tipo.rotulo}. O arquivo pode estar corrompido ou ter sido renomeado.`)
  if (formato !== tipo.formato) {
    const real = tipoPorFormato(formato!)
    recusar(`A extensão diz ${tipo.rotulo}, mas o conteúdo é ${real ? real.rotulo : `um arquivo do tipo "${formato}"`}. Renomeie o arquivo com a extensão correta e envie de novo.`)
  }
  if (mimeDeclarado) {
    const limpo = mimeDeclarado.split(';')[0]!.trim().toLowerCase()
    if (limpo && limpo !== 'application/octet-stream' && !tipo.mimes.includes(limpo)) {
      recusar(`O tipo declarado pelo navegador ("${limpo}") não corresponde a ${tipo.rotulo}.`)
    }
  }
  if (formato === 'pdf') {
    const risco = riscoNoPdf(dados)
    if (risco) recusar(`Este PDF ${risco}. Gere o documento novamente a partir do texto original (Salvar como PDF) e envie a nova versão.`)
  }
  if (formato === 'csv') {
    const risco = riscoNoCsv(dados)
    if (risco) recusar(`Planilhas abrem fórmulas automaticamente: ${risco}. Remova o sinal de igual do início do campo e envie de novo.`)
  }
  return { nome }
}

/** Roda em toda criação/troca de arquivo de `media`. Migração (arquivos já aprovados no Directus) passa `context.semInspecaoUpload`. */
export const inspecionarUpload: CollectionBeforeOperationHook = ({ operation, req, context }) => {
  if ((operation !== 'create' && operation !== 'update') || !req.file || context?.semInspecaoUpload) return
  const { nome } = inspecionarArquivo(req.file.data, req.file.name, req.file.mimetype)
  req.file.name = nome
}
