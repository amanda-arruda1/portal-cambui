/**
 * Indicadores econômicos (IPCA, Selic, CDI, Dólar) para o card da home.
 *
 * O portal-web NUNCA fala com api.bcb.gov.br nem com a AwesomeAPI
 * diretamente — ele roda com IPAddressDeny=any (só loopback) e não alcança a
 * internet, de propósito. Quem busca os quatro indicadores e grava aqui é o
 * portal-indicadores.service, separado, a cada 30 minutos (ver
 * infra/scripts/atualizar-indicadores.mjs). Esta função só LÊ o singleton
 * `indicadores_economicos` do Directus — mesma regra de leitura pública de
 * qualquer outra coleção (lib/directus.ts): nunca lança, degrada em silêncio.
 *
 * A REVALIDAÇÃO, aqui, é a própria cadência do serviço externo: o portal
 * sempre mostra o valor mais recente que a última rodada do timer conseguiu
 * gravar — nunca mais velho que ~30 minutos, nunca uma chamada de rede a
 * mais por carregamento de página.
 */
import { unico } from './directus';

export type ChaveIndicador = 'ipca' | 'selic' | 'cdi' | 'dolar';

export interface Indicador {
  chave: ChaveIndicador;
  rotulo: string;
  descricao: string;
  valor: number | null;
  unidade: 'percentual' | 'moeda';
  variacao: number | null;
  referencia: string | null;
  fonte: string;
}

interface Registro {
  itens: Indicador[];
  atualizado_em: string | null;
}

/** As 4 chaves, na ordem fixa do cartão — independente da ordem em que o
 *  serviço externo gravou (Promise.allSettled não garante ordem estável). */
const ORDEM: ChaveIndicador[] = ['ipca', 'selic', 'cdi', 'dolar'];

export async function indicadoresEconomicos(): Promise<Indicador[]> {
  const { dado, indisponivel } = await unico<Registro>('indicadores_economicos');
  const porChave = new Map((dado?.itens ?? []).map((i) => [i.chave, i]));

  return ORDEM.map((chave) => {
    const encontrado = porChave.get(chave);
    if (encontrado) return encontrado;

    // Sem registro ainda (serviço nunca rodou) ou Directus fora do ar: o
    // cartão mostra "indisponível" para aquele indicador especificamente,
    // nunca esconde a coluna nem inventa valor.
    const ROTULOS: Record<ChaveIndicador, { rotulo: string; descricao: string; unidade: Indicador['unidade']; fonte: string }> = {
      ipca: { rotulo: 'IPCA', descricao: 'Inflação acumulada em 12 meses', unidade: 'percentual', fonte: 'Banco Central (SGS)' },
      selic: { rotulo: 'Selic', descricao: 'Taxa básica de juros (meta Copom, ao ano)', unidade: 'percentual', fonte: 'Banco Central (SGS)' },
      cdi: { rotulo: 'CDI', descricao: 'Certificado de Depósito Interbancário, anualizado', unidade: 'percentual', fonte: 'Banco Central (SGS)' },
      dolar: { rotulo: 'Dólar comercial', descricao: 'Cotação em reais (compra)', unidade: 'moeda', fonte: 'AwesomeAPI' },
    };
    return { chave, ...ROTULOS[chave], valor: null, variacao: null, referencia: null };
  }).map((i) => (indisponivel ? { ...i, valor: null, variacao: null, referencia: null } : i));
}

/* Formatação usada pela faixa compacta do cabeçalho (Cabecalho.astro) —
   único lugar que mostra os indicadores desde que o cartão "Economia" saiu
   da home (2026-09-03, a pedido do usuário). */
const formatoPercentual = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function valorFormatado(i: Indicador): string {
  if (i.valor === null) return '—';
  return i.unidade === 'moeda' ? formatoMoeda.format(i.valor) : `${formatoPercentual.format(i.valor)}%`;
}
