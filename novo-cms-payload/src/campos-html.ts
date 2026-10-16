import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import type { HTMLConverters } from '@payloadcms/richtext-lexical/html'
import type { Field } from 'payload'

/* Bits de formato do texto no Lexical (valores fixos da biblioteca). */
const NEGRITO = 1, ITALICO = 2, TACHADO = 4, SUBLINHADO = 8, CODIGO = 16, SUBSCRITO = 32, SOBRESCRITO = 64

const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/**
 * Texto formatado. O conversor padrão escreve tachado e sublinhado como `<span style="text-decoration: …">`, e o
 * sanitizador do site REMOVE style e span de propósito (sem estilo vindo do CMS). Resultado: dispositivo de lei
 * revogado, que estava tachado, aparecia como se estivesse em vigor. Aqui saem as tags semânticas `<s>` e `<u>`,
 * que o sanitizador já aceita.
 */
const texto: HTMLConverters['text'] = ({ node }: { node: { text: string; format: number } }) => {
  let t = escapar(node.text)
  const f = node.format
  if (f & NEGRITO) t = `<strong>${t}</strong>`
  if (f & ITALICO) t = `<em>${t}</em>`
  if (f & TACHADO) t = `<s>${t}</s>`
  if (f & SUBLINHADO) t = `<u>${t}</u>`
  if (f & CODIGO) t = `<code>${t}</code>`
  if (f & SUBSCRITO) t = `<sub>${t}</sub>`
  if (f & SOBRESCRITO) t = `<sup>${t}</sup>`
  return t
}

/**
 * Campo virtual `<origem>Html`: a mesma informação do campo de texto rico, já em
 * HTML. O site (Astro) renderiza HTML e o Lexical guarda JSON; converter aqui, na
 * leitura, evita levar o editor para o frontend. Não é gravado no banco.
 */
export const campoHtmlDe = (origem: string): Field => ({
  name: `${origem}Html`,
  type: 'text',
  virtual: true,
  admin: { hidden: true, readOnly: true },
  hooks: {
    afterRead: [
      ({ siblingData }) => {
        const dados = siblingData?.[origem]
        return dados
          ? convertLexicalToHTML({
              data: dados,
              disableContainer: true,
              converters: ({ defaultConverters }) => ({ ...defaultConverters, text: texto }),
            })
          : null
      },
    ],
  },
})
