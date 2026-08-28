/**
 * API pública em JSON — Lei de Acesso à Informação, art. 8º, §3º, incisos II e III:
 * formato aberto, legível por máquina, sem exigir cadastro.
 *
 * Aceita os MESMOS parâmetros da tela, para que qualquer busca no portal vire
 * uma chamada de API só trocando o caminho.
 */
import type { APIRoute } from 'astro';
import { acervo, lerFiltros, aplicarFiltros, citacaoDe, remissoesDe } from '../../lib/diario/indice';
import { rotuloTipoAto } from '../../lib/diario/vocabulario';

export const GET: APIRoute = async ({ url, site }) => {
  const a = await acervo();
  const f = lerFiltros(url);
  const base = (site?.origin ?? url.origin).replace(/\/+$/, '');

  const limite = Math.min(500, Math.max(1, Number(url.searchParams.get('limite')) || 100));
  const pagina = Math.max(1, Number(f.pagina) || 1);
  const todas = aplicarFiltros(a.materias, f, { ultimaEdicao: a.edicoes[0]?.numero ?? null });
  const fatia = todas.slice((pagina - 1) * limite, pagina * limite);
  const detalhado = url.searchParams.get('corpo') === 'sim';

  const corpo = {
    veiculo: a.veiculo ? {
      nome: a.veiculo.nome_veiculo, ente: a.veiculo.ente, cnpj: a.veiculo.cnpj,
      lei_instituidora: a.veiculo.lei_numero, inicio_circulacao: a.veiculo.inicio_circulacao,
      regra_contagem_prazo: a.veiculo.regra_prazo,
    } : null,
    consulta: { ...f, limite, pagina },
    total: todas.length,
    paginas: Math.max(1, Math.ceil(todas.length / limite)),
    /* Aviso dentro do próprio JSON: quem consome por API não vê o rodapé da
     * página, e precisa saber que o documento com fé pública é o PDF. */
    aviso: 'Os dados desta API são informativos. O documento com fé pública é o PDF assinado de cada edição, cujo endereço vem em cada item. Este veículo não substitui o PNCP nem o Diário Oficial do Estado onde a lei os exigir.',
    materias: fatia.map(({ materia: m }) => {
      const r = remissoesDe(a, m);
      return {
        id: m.id,
        tipo_ato: m.tipo_ato,
        tipo_ato_rotulo: rotuloTipoAto(m.tipo_ato),
        numero_ato: m.numero_ato, ano_ato: m.ano_ato,
        ementa: m.ementa,
        ...(detalhado ? { corpo_html: m.corpo, corpo_texto: m.texto } : {}),
        orgao: m.orgao,
        caderno: m.cadernoObj ? { slug: m.cadernoObj.slug, nome: m.cadernoObj.nome } : null,
        processo_administrativo: m.processo_administrativo,
        paginas: { inicial: m.pagina_inicial, final: m.pagina_final },
        edicao: m.edicaoObj ? {
          numero: m.edicaoObj.numero, ano: m.edicaoObj.ano, volume: m.edicaoObj.volume,
          tipo: m.edicaoObj.tipo,
          data_disponibilizacao: m.edicaoObj.data_disponibilizacao,
          data_publicacao_legal: m.edicaoObj.data_publicacao_legal,
          anulada: m.edicaoObj.anulada,
          codigo_verificador: m.edicaoObj.codigo_verificador,
          sha256_pdf: m.edicaoObj.sha256,
          url_pdf: m.edicaoObj.arquivo_pdf ? `${base}/assets/${m.edicaoObj.arquivo_pdf}` : null,
        } : null,
        remissoes: {
          retifica: r.retifica?.id ?? null,
          republica: r.republica?.id ?? null,
          revoga: r.revoga?.id ?? null,
          retificada_por: r.retificadaPor.map((x) => x.id),
          republicada_por: r.republicadaPor.map((x) => x.id),
          revogada_por: r.revogadaPor.map((x) => x.id),
        },
        referencia_citacao: citacaoDe(a, m),
        url: `${base}/diario-oficial/materia/${m.edicaoObj?.ano ?? m.ano_ato}/${m.slug}`,
        demonstracao: m.demonstracao,
      };
    }),
  };

  return new Response(JSON.stringify(corpo, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      /* Dado público e aberto: liberar CORS é o que permite alguém construir
         uma visualização sem precisar de um servidor no meio. */
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
