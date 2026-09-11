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

export interface NumeroTelefone {
  /** Só o número, sem a nota entre parênteses — ex.: "(35) 99733-6816". */
  numero: string;
  /** Anotação da fonte, quando houver — ex.: "Interno", "Somente ligação". */
  nota: string | null;
}

/** Separa um campo de telefone em texto livre nos números individuais —
 *  alguns registros têm mais de um, separados por "/" ou por " - " (com
 *  espaço dos dois lados: o hífen DENTRO de um número, tipo "99733-6816",
 *  não tem espaço ao redor, então não é confundido com separador). Cada
 *  número mantém sua própria nota entre parênteses, quando houver — usada
 *  pra decidir o link (ver linkWhatsapp) e pra mostrar ao lado do número.
 *  Sem isso, dois números apareciam colados como se fossem um só, e só o
 *  primeiro funcionava de verdade. */
export function numerosTelefone(telefone: string): NumeroTelefone[] {
  return telefone
    .split(/\s*\/\s*|\s+-\s+/)
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map((parte) => {
      const m = parte.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      return m ? { numero: m[1].trim(), nota: m[2].trim() } : { numero: parte, nota: null };
    });
}

/** Link tel: a partir de UM número (já separado por numerosTelefone). */
export function linkTelefone(numero: string): string {
  return `tel:+55${numero.replace(/\D/g, '')}`;
}

/** Link do WhatsApp (wa.me) pra UM número, só quando é celular de verdade —
 *  DDD (2 dígitos) + 9 dígitos locais começando em "9", o formato que o
 *  Brasil usa desde 2016. Fixo (8 dígitos locais) e número de emergência
 *  sem DDD (190, 192...) voltam null — não têm WhatsApp e o link quebraria
 *  ou abriria conversa com o número errado. `nota` vindo de
 *  numerosTelefone() também derruba o link quando a própria fonte avisa que
 *  o número é "Somente ligação" — mesmo celular de verdade, sem WhatsApp
 *  não tem o que abrir. */
export function linkWhatsapp(numero: string, nota?: string | null): string | null {
  if (nota && /somente\s+liga[cç][aã]o/i.test(nota)) return null;
  const digitos = numero.replace(/\D/g, '');
  if (digitos.length !== 11 || digitos[2] !== '9') return null;
  return `https://wa.me/55${digitos}`;
}

/** Link de busca do Google Maps a partir de um endereço em texto livre. Volta
 *  null pra "Não informado" e afins — texto que não é endereço nenhum, então
 *  não tem o que localizar. O município não costuma aparecer no texto (é
 *  "R. Tal, 32 – Centro", não "…, Cambuí/MG"), então é acrescentado aqui: sem
 *  isso a busca ficaria ambígua com ruas de mesmo nome em outra cidade. */
export function linkMapa(endereco: string | null | undefined): string | null {
  if (!endereco) return null;
  const texto = endereco.trim();
  if (!texto || /^n[aã]o informado$/i.test(texto)) return null;
  const consulta = /cambu[ií]/i.test(texto) ? texto : `${texto}, Cambuí - MG`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`;
}
