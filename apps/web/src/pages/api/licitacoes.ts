/**
 * Endpoint JSON público das licitações.
 *
 * Dado público em formato aberto. Aceita os MESMOS filtros da listagem, então
 * a URL que o cidadão vê na barra de endereço vira consulta de máquina só
 * trocando /licitacoes por /api/licitacoes. Serve ao TCE, à imprensa e a
 * agregadores — e é o que evita que alguém tenha de raspar o HTML.
 *
 * Sem chave, sem cadastro, com CORS aberto: é dado público.
 */
import type { APIRoute } from 'astro';
import { aplicarFiltros, lerFiltros, numero, rotuloModalidade, situacaoDe, todas } from '../../lib/licitacoes';

const TETO = 500;

export const GET: APIRoute = async ({ url, site }) => {
  const base = (site ?? new URL('https://www.prefeituradecambui.mg.gov.br')).origin;
  const { dados, indisponivel } = await todas();

  if (indisponivel) {
    return new Response(JSON.stringify({ erro: 'Serviço de conteúdo indisponível no momento.' }, null, 2),
      { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }

  const filtros = lerFiltros(url);
  const limite = Math.min(Number(url.searchParams.get('limite')) || TETO, TETO);
  const encontrados = aplicarFiltros(dados, filtros);

  const corpo = {
    _aviso: 'A divulgação oficial das contratações ocorre no PNCP e no veículo oficial do Município. Em caso de divergência, prevalece o edital publicado oficialmente.',
    _fonte: 'Prefeitura Municipal de Cambuí/MG',
    _atualizado_em: new Date().toISOString(),
    filtros_aplicados: Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)),
    total: encontrados.length,
    exibindo: Math.min(encontrados.length, limite),
    licitacoes: encontrados.slice(0, limite).map((l) => ({
      id: l.id,
      numero_processo: l.numero_processo,
      numero: l.numero,
      ano: l.ano,
      modalidade: { codigo: l.modalidade, nome: rotuloModalidade(l.modalidade) },
      forma: l.forma,
      criterio_julgamento: l.criterio_julgamento,
      modo_disputa: l.modo_disputa,
      registro_precos: l.registro_precos,
      orgao_demandante: l.secretaria?.nome ?? null,
      objeto: l.objeto_resumo,
      // Sigiloso NÃO devolve o valor. O dado existe no banco; o que a lei
      // permite divulgar é a informação de que ele é sigiloso.
      // número de verdade no JSON: quem consome espera 2145578, não "2145578.00".
      valor_estimado: l.orcamento_sigiloso ? null : numero(l.valor_estimado),
      orcamento_sigiloso: l.orcamento_sigiloso,
      situacao: { codigo: l.situacao, nome: situacaoDe(l.situacao).rotulo },
      motivo_situacao: l.motivo_situacao,
      data_publicacao: l.data_publicacao,
      data_abertura_propostas: l.data_abertura_propostas,
      data_sessao: l.data_sessao,
      prazo_impugnacao: l.prazo_impugnacao,
      pncp: { id: l.pncp_id, url: l.pncp_url },
      demonstracao: l.demonstracao,
      url: `${base}/licitacoes/${l.ano}/${l.slug}`,
      documentos_url: `${base}/licitacoes/${l.ano}/${l.slug}`,
    })),
  };

  return new Response(JSON.stringify(corpo, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=120',
    },
  });
};
