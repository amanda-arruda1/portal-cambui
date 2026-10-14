import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import type { Field } from 'payload'

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
        return dados ? convertLexicalToHTML({ data: dados, disableContainer: true }) : null
      },
    ],
  },
})
