/**
 * Arquivo de calendário da sessão pública (RFC 5545).
 *
 * Gerado no servidor, sem biblioteca: um VEVENT é meia dúzia de linhas, e o
 * formato não muda desde 1998. O alarme de 1 dia antes é o ponto — quem
 * adiciona ao calendário quer ser lembrado, não anotar.
 */
import type { APIRoute } from 'astro';
import { porSlug, rotuloModalidade } from '../../../../lib/licitacoes';

/** iCalendar exige UTC com Z e sem separadores. */
const paraIcs = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Linhas acima de 75 octetos precisam ser dobradas, senão clientes rígidos
 *  (Outlook, sobretudo) recusam o arquivo inteiro. */
function dobrar(linha: string): string {
  if (Buffer.byteLength(linha, 'utf8') <= 74) return linha;
  const partes: string[] = [];
  let atual = '';
  for (const c of linha) {
    if (Buffer.byteLength(atual + c, 'utf8') > 73) { partes.push(atual); atual = ' '; }
    atual += c;
  }
  partes.push(atual);
  return partes.join('\r\n');
}

const escapar = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export const GET: APIRoute = async ({ params, url }) => {
  const ano = Number(params.ano);
  const l = await porSlug(ano, params.slug ?? '');
  if (!l || !l.data_sessao) return new Response('Sessão sem data definida.', { status: 404 });

  const inicio = new Date(l.data_sessao);
  const fim = new Date(inicio.getTime() + 2 * 3600000); // 2h é a duração típica
  const numero = `${String(l.numero).padStart(3, '0')}/${l.ano}`;
  const titulo = `${rotuloModalidade(l.modalidade)} nº ${numero} — Prefeitura de Cambuí`;
  const pagina = new URL(`/licitacoes/${l.ano}/${l.slug}`, url.origin).href;

  const descricao = [
    l.objeto_resumo,
    '',
    `Processo administrativo: ${l.numero_processo}`,
    l.sistema_sessao_url ? `Sessão em: ${l.sistema_sessao_url}` : '',
    `Detalhes: ${pagina}`,
    '',
    'A divulgação oficial ocorre no PNCP e no veículo oficial do Município.',
  ].filter(Boolean).join('\n');

  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Prefeitura Municipal de Cambui//Portal de Licitacoes//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // Dobrado como qualquer outra: o UID passa de 75 octetos com um UUID
    // dentro, e cliente rígido recusa o arquivo INTEIRO por causa de uma linha.
    dobrar(`UID:licitacao-${l.id}@prefeituradecambui.mg.gov.br`),
    `DTSTAMP:${paraIcs(new Date())}`,
    `DTSTART:${paraIcs(inicio)}`,
    `DTEND:${paraIcs(fim)}`,
    dobrar(`SUMMARY:${escapar(titulo)}`),
    dobrar(`DESCRIPTION:${escapar(descricao)}`),
    dobrar(`URL:${pagina}`),
    dobrar(`LOCATION:${escapar(l.sistema_sessao_url ?? 'Prefeitura Municipal de Cambuí — Praça Coronel Justiniano, 164, Centro')}`),
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    dobrar(`DESCRIPTION:${escapar(`Amanhã: ${titulo}`)}`),
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return new Response(linhas.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="licitacao-${l.slug}.ics"`,
      'Cache-Control': 'public, max-age=300',
    },
  });
};
