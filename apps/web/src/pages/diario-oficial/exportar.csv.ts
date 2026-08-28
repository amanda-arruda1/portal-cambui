/**
 * CSV do resultado da busca — com os MESMOS filtros da tela.
 *
 * Separador ponto-e-vírgula e BOM UTF-8: é o que o Excel em português abre sem
 * o usuário ter que passar pelo assistente de importação. Vírgula produziria um
 * arquivo tecnicamente correto que a servidora não consegue abrir, e nesse caso
 * o dado aberto não serviu para nada.
 */
import type { APIRoute } from 'astro';
import { acervo, lerFiltros, aplicarFiltros, citacaoDe } from '../../lib/diario/indice';
import { rotuloTipoAto, TIPOS_EDICAO } from '../../lib/diario/vocabulario';
import { dataBr } from '../../lib/diario/dominio.mjs';

const campo = (v: unknown) => {
  const t = v === null || v === undefined ? '' : String(v);
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export const GET: APIRoute = async ({ url, site }) => {
  const a = await acervo();
  const f = lerFiltros(url);
  const base = (site?.origin ?? url.origin).replace(/\/+$/, '');
  const linhas = aplicarFiltros(a.materias, f, { ultimaEdicao: a.edicoes[0]?.numero ?? null });

  const cabecalho = [
    'edicao_numero', 'edicao_tipo', 'data_disponibilizacao', 'data_publicacao_legal',
    'caderno', 'orgao', 'tipo_ato', 'numero_ato', 'ano_ato', 'ementa',
    'pagina_inicial', 'pagina_final', 'processo_administrativo',
    'edicao_anulada', 'referencia_citacao', 'url_materia', 'url_pdf_edicao', 'demonstracao',
  ];

  const corpo = linhas.map(({ materia: m }) => [
    m.edicaoObj?.numero, m.edicaoObj ? TIPOS_EDICAO[m.edicaoObj.tipo] : '',
    m.edicaoObj ? dataBr(m.edicaoObj.data_disponibilizacao) : '',
    m.edicaoObj ? dataBr(m.edicaoObj.data_publicacao_legal) : '',
    m.cadernoObj?.nome, m.orgao, rotuloTipoAto(m.tipo_ato), m.numero_ato, m.ano_ato,
    m.ementa.replace(/\s+/g, ' ').trim(),
    m.pagina_inicial, m.pagina_final, m.processo_administrativo,
    m.edicaoObj?.anulada ? 'sim' : 'nao',
    citacaoDe(a, m),
    `${base}/diario-oficial/materia/${m.edicaoObj?.ano ?? m.ano_ato}/${m.slug}`,
    m.edicaoObj?.arquivo_pdf ? `${base}/assets/${m.edicaoObj.arquivo_pdf}` : '',
    m.demonstracao ? 'sim' : 'nao',
  ].map(campo).join(';'));

  const csv = '﻿' + [cabecalho.join(';'), ...corpo].join('\r\n') + '\r\n';
  const hoje = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="diario-oficial-cambui-${hoje}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
};
