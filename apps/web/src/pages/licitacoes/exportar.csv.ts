/**
 * Exportação da busca em CSV.
 *
 * Ponto e vírgula como separador e BOM UTF-8 no início: é o que faz o Excel em
 * português abrir o arquivo com as colunas certas e os acentos corretos, sem
 * o usuário passar pelo assistente de importação. Detalhe pequeno que decide
 * se o servidor consegue usar o arquivo ou desiste.
 */
import type { APIRoute } from 'astro';
import { aplicarFiltros, lerFiltros, numero, rotuloModalidade, situacaoDe, todas, CRITERIOS } from '../../lib/licitacoes';

const celula = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  const t = String(v);
  return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

const dataBr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';

export const GET: APIRoute = async ({ url, site }) => {
  const base = (site ?? new URL('https://www.prefeituradecambui.mg.gov.br')).origin;
  const { dados } = await todas();
  const itens = aplicarFiltros(dados, lerFiltros(url));

  const colunas = [
    'Processo', 'Numero', 'Ano', 'Modalidade', 'Forma', 'Criterio de julgamento',
    'Orgao demandante', 'Objeto', 'Valor estimado (R$)', 'Orcamento sigiloso',
    'Situacao', 'Publicacao', 'Abertura das propostas', 'Sessao publica',
    'ID PNCP', 'URL no PNCP', 'URL no portal', 'Dado de demonstracao',
  ];

  const linhas = itens.map((l) => [
    l.numero_processo, l.numero, l.ano, rotuloModalidade(l.modalidade), l.forma,
    CRITERIOS[l.criterio_julgamento] ?? l.criterio_julgamento,
    l.secretaria?.nome ?? '', l.objeto_resumo,
    l.orcamento_sigiloso ? '' : (numero(l.valor_estimado) ?? ''),
    l.orcamento_sigiloso ? 'sim' : 'nao',
    situacaoDe(l.situacao).rotulo,
    dataBr(l.data_publicacao), dataBr(l.data_abertura_propostas), dataBr(l.data_sessao),
    l.pncp_id ?? '', l.pncp_url ?? '',
    `${base}/licitacoes/${l.ano}/${l.slug}`,
    l.demonstracao ? 'sim' : 'nao',
  ].map(celula).join(';'));

  const nota = 'A divulgacao oficial ocorre no PNCP e no veiculo oficial do Municipio. Em caso de divergencia prevalece o edital oficial.';
  const csv = '﻿' + [`# ${nota}`, colunas.join(';'), ...linhas].join('\r\n') + '\r\n';

  const carimbo = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="licitacoes-cambui-${carimbo}.csv"`,
    },
  });
};
