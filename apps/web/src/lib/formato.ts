/**
 * Formatação em pt-BR. Tudo no fuso America/Sao_Paulo: o servidor está nesse
 * fuso, mas o Node só respeita isso se dissermos explicitamente — sem o
 * timeZone, uma data ISO em UTC apareceria com o dia anterior à noite.
 */

const FUSO = 'America/Sao_Paulo';

export function data(valor: string | null | undefined): string {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: FUSO }).format(d);
}

export function dataCurta(valor: string | null | undefined): string {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: FUSO }).format(d);
}

/** Data com hora. Usada no painel de contribuição: quem revisa precisa saber
 *  se a alteração foi há cinco minutos ou na semana passada. */
export function dataHora(valor: string | null | undefined): string {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: FUSO }).format(d);
}

/** Valor do atributo datetime= de <time>: precisa ser ISO, não pt-BR. */
export function iso(valor: string | null | undefined): string {
  if (!valor) return '';
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Remove HTML para gerar resumo e meta description a partir do corpo. */
export function semHtml(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function recorte(texto: string | null | undefined, limite = 180): string {
  const limpo = semHtml(texto);
  if (limpo.length <= limite) return limpo;
  return limpo.slice(0, limite).replace(/\s+\S*$/, '') + '…';
}

/** Link tel: a partir de um telefone em texto livre — usa só o primeiro
 *  número, quando há mais de um separado por "/" ou "-". */
export function linkTelefone(telefone: string): string {
  const primeiro = telefone.split('/')[0];
  return `tel:+55${primeiro.replace(/\D/g, '')}`;
}

/** Link do WhatsApp (wa.me), só quando o telefone é celular de verdade —
 *  DDD (2 dígitos) + 9 dígitos locais começando em "9", o formato que o
 *  Brasil usa desde 2016. Fixo (8 dígitos locais) e número de emergência
 *  sem DDD (190, 192...) voltam null — não têm WhatsApp e o link quebraria
 *  ou abriria conversa com o número errado. Só o primeiro número, quando
 *  há mais de um. */
export function linkWhatsapp(telefone: string): string | null {
  const primeiro = telefone.split('/')[0].replace(/\D/g, '');
  if (primeiro.length !== 11 || primeiro[2] !== '9') return null;
  return `https://wa.me/55${primeiro}`;
}
