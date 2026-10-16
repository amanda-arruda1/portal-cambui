import type { GlobalConfig } from 'payload'
import { global } from './_base'

/**
 * Menu principal do cabeçalho, em árvore de DOIS níveis: botão do menu → itens do dropdown.
 * Guardado como JSON: `[{ rotulo, destino?, filhos?: [{ rotulo, destino }] }]`. O painel usa um editor próprio
 * (components/MenuArvore.tsx), porque o campo de lista nativo do Payload não arrasta item de um menu para dentro de outro.
 * Se o Global estiver vazio ou o CMS fora do ar, o site usa o menu de reserva de apps/web/src/dados/instituicional.ts.
 */
const DESTINO_VALIDO = /^(\/(?!\/)[^\s]*|https?:\/\/[^\s]+|@[A-Za-z][A-Za-z0-9]*)$/

const validar = (valor: unknown): true | string => {
  if (valor == null) return true
  if (!Array.isArray(valor)) return 'Formato inválido do menu.'
  if (valor.length > 20) return 'No máximo 20 botões no menu principal.'
  for (const [i, item] of valor.entries()) {
    if (!item || typeof item !== 'object') return `Botão ${i + 1}: formato inválido.`
    const { rotulo, destino, filhos } = item as Record<string, unknown>
    if (typeof rotulo !== 'string' || !rotulo.trim()) return `Botão ${i + 1}: falta o nome.`
    if (rotulo.length > 60) return `"${rotulo.slice(0, 20)}…": o nome passa de 60 caracteres.`
    if (filhos !== undefined && !Array.isArray(filhos)) return `"${rotulo}": formato inválido dos itens do dropdown.`
    const temFilhos = Array.isArray(filhos) && filhos.length > 0
    const temDestino = typeof destino === 'string' && destino.trim() !== ''
    if (!temFilhos && !temDestino) return `"${rotulo}": informe o destino (ou arraste outros botões para dentro dele, para virar um dropdown).`
    if (temDestino && !DESTINO_VALIDO.test((destino as string).trim())) return `"${rotulo}": destino inválido. Use /caminho, https://… ou @link-externo.`
    if (temFilhos) {
      if ((filhos as unknown[]).length > 12) return `"${rotulo}": no máximo 12 itens no dropdown.`
      for (const f of filhos as unknown[]) {
        if (!f || typeof f !== 'object') return `"${rotulo}": item do dropdown com formato inválido.`
        const { rotulo: fr, destino: fd, filhos: neto } = f as Record<string, unknown>
        if (typeof fr !== 'string' || !fr.trim()) return `"${rotulo}": há um item do dropdown sem nome.`
        if (fr.length > 60) return `"${fr.slice(0, 20)}…": o nome passa de 60 caracteres.`
        if (Array.isArray(neto) && neto.length > 0) return `"${fr}": o menu tem só dois níveis; um item de dropdown não pode ter outro dropdown.`
        if (typeof fd !== 'string' || !DESTINO_VALIDO.test(fd.trim())) return `"${fr}": informe um destino válido (/caminho, https://… ou @link-externo).`
      }
    }
  }
  return true
}

export const MenuPrincipal: GlobalConfig = global({
  slug: 'menu-principal',
  label: 'Menu Principal',
  admin: { description: 'Botões do cabeçalho do site. Arraste um botão para dentro de outro para criar um dropdown.' },
  fields: [
    {
      name: 'itens',
      label: 'Botões do menu',
      type: 'json',
      validate: validar,
      admin: { components: { Field: '/components/MenuArvore#MenuArvore' } },
    },
  ],
})
