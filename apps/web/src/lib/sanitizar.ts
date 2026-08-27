/**
 * Limpeza do HTML de texto rico.
 *
 * O portal renderiza o corpo das notícias com `set:html` — ou seja, o que
 * estiver no CMS chega ao navegador do cidadão como marcação de verdade. A
 * partir do momento em que servidores das secretarias escrevem esse corpo,
 * isso é uma porta de XSS armazenado servida do domínio oficial do município.
 *
 * DOIS PONTOS DE LIMPEZA, de propósito:
 *   1. na GRAVAÇÃO (painel) — o texto é limpo antes de ir para o CMS e quem
 *      escreveu recebe aviso do que foi retirado;
 *   2. na EXIBIÇÃO (páginas públicas) — porque conteúdo também pode entrar
 *      pelo painel do Directus, que não passa pelo nosso formulário.
 * O segundo é o que garante; o primeiro é o que ensina.
 *
 * Usa sanitize-html em vez de expressão regular própria: sanitizar HTML com
 * regex é um erro clássico e indefensável num portal .gov.br. A biblioteca faz
 * o trabalho com um analisador de verdade.
 */

import sanitizeHtml from 'sanitize-html';

/**
 * Marcação que uma secretaria precisa para redigir um ato ou uma notícia.
 * Estruturas de documento, nada de apresentação.
 *
 * Fora da lista, com motivo:
 *   <img>      — a imagem da notícia tem campo próprio, com texto alternativo
 *                obrigatório para acessibilidade; solta no corpo ela vem sem
 *                alt e sem passar pela inspeção de upload;
 *   <h1>       — o H1 da página é o título; um segundo quebra a navegação por
 *                cabeçalhos de quem usa leitor de tela;
 *   <style>, <span style>, <font> — apresentação. Cor e tamanho vêm da folha de
 *                estilo do portal, senão cada secretaria inventa a sua;
 *   <iframe>, <video>, <embed> — conteúdo de terceiro embutido no domínio
 *                oficial.
 */
export const TAGS_PERMITIDAS = [
  'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's',
  'h2', 'h3', 'h4',
  'ul', 'ol', 'li',
  'blockquote', 'hr',
  'a',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption',
];

const CONFIGURACAO: sanitizeHtml.IOptions = {
  allowedTags: TAGS_PERMITIDAS,
  allowedAttributes: {
    // 'target' e 'rel' entram na lista porque o transformTags abaixo os
    // ESCREVE — sem constar aqui, seriam removidos logo depois de definidos.
    // Não é permissão para quem escreve: o transform descarta o que veio no
    // texto e decide sozinho.
    a: ['href', 'title', 'target', 'rel'],
    th: ['scope', 'colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  // 'javascript:' e 'data:' ficam de fora — são as duas formas clássicas de
  // executar script a partir de um link que parece inofensivo.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href'],
  // Link relativo continua valendo: /servicos, /documentos, âncora interna.
  allowProtocolRelative: false,
  // Conteúdo de tag removida é preservado como texto — apagar o texto junto
  // faria um parágrafo dentro de um <div> desaparecer sem aviso.
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (nomeTag, atributos) => {
      const { href, title } = atributos;
      const externo = /^https?:\/\//i.test(href ?? '');
      // target e rel do texto original são DESCARTADOS: um target="_blank"
      // colado de outro site, sem rel, entrega a nossa janela à página de
      // destino (window.opener). Quem decide é esta função, não quem escreve.
      return {
        tagName: nomeTag,
        attribs: {
          ...(href ? { href } : {}),
          ...(title ? { title } : {}),
          ...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
        },
      };
    },
  },
};

/**
 * Nomes de tag presentes no texto original. Serve SÓ para dizer a quem escreveu
 * o que foi retirado — a limpeza de verdade é a biblioteca que faz. Uma falha
 * desta varredura produz aviso incompleto, nunca conteúdo inseguro.
 */
function tagsPresentes(bruto: string): string[] {
  const encontradas = new Set<string>();
  for (const achado of bruto.matchAll(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/g)) {
    encontradas.add(achado[1].toLowerCase());
  }
  return [...encontradas];
}

export interface Limpeza {
  html: string;
  /** Tags que estavam no texto e não sobreviveram. */
  removidas: string[];
}

/** Limpa e relata. Use na gravação, para poder avisar quem escreveu. */
export function limparComRelato(bruto: string | null | undefined): Limpeza {
  if (!bruto) return { html: '', removidas: [] };

  const html = sanitizeHtml(bruto, CONFIGURACAO);
  const permitidas = new Set(TAGS_PERMITIDAS);
  const removidas = tagsPresentes(bruto).filter((t) => !permitidas.has(t));

  return { html, removidas };
}

/** Limpa e pronto. Use na exibição das páginas públicas. */
export function limpar(bruto: string | null | undefined): string {
  return bruto ? sanitizeHtml(bruto, CONFIGURACAO) : '';
}
