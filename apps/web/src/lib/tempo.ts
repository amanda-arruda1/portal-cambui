/**
 * Previsão do tempo de Cambuí/MG, para a faixa do brasão no cabeçalho.
 *
 * O portal-web NUNCA fala com a Open-Meteo diretamente — roda com
 * IPAddressDeny=any e não alcança a internet, de propósito. Quem busca e
 * grava aqui é o portal-tempo.service, separado, a cada 30 minutos (ver
 * infra/scripts/atualizar-tempo.mjs). Esta função só LÊ o singleton
 * `previsao-tempo` (Global do Payload) — mesma regra de leitura pública de qualquer
 * outra coleção (lib/payload.ts): nunca lança, degrada em silêncio.
 */
import { globalDadosExternos } from './payload';

export interface PrevisaoTempo {
  temperatura: number;
  sensacao_termica: number | null;
  codigo_tempo: number;
  umidade: number | null;
  vento_kmh: number | null;
  atualizado_em: string | null;
}

export async function previsaoTempo(): Promise<PrevisaoTempo | null> {
  const g = await globalDadosExternos('previsao-tempo');
  if (!g || typeof g.temperatura !== 'number' || typeof g.codigoTempo !== 'number') return null;
  return {
    temperatura: g.temperatura, sensacao_termica: g.sensacaoTermica ?? null, codigo_tempo: g.codigoTempo,
    umidade: g.umidade ?? null, vento_kmh: g.ventoKmh ?? null, atualizado_em: g.atualizadoEm ?? null,
  };
}

/** Categoria de ícone a partir do código WMO (open-meteo.com/en/docs —
 *  "WMO Weather interpretation codes"). Cambuí não tem neve de verdade, mas
 *  o código existe na tabela e é tratado por completude, não por chance de
 *  ocorrer. */
export type CategoriaTempo = 'sol' | 'parcialmente-nublado' | 'nublado' | 'neblina' | 'chuva' | 'tempestade' | 'neve';

const FAIXAS: Array<{ codigos: number[]; categoria: CategoriaTempo; texto: string }> = [
  { codigos: [0], categoria: 'sol', texto: 'céu limpo' },
  { codigos: [1], categoria: 'parcialmente-nublado', texto: 'poucas nuvens' },
  { codigos: [2], categoria: 'parcialmente-nublado', texto: 'parcialmente nublado' },
  { codigos: [3], categoria: 'nublado', texto: 'nublado' },
  { codigos: [45, 48], categoria: 'neblina', texto: 'neblina' },
  { codigos: [51, 53, 55, 56, 57], categoria: 'chuva', texto: 'garoa' },
  { codigos: [61, 63, 65, 66, 67, 80, 81, 82], categoria: 'chuva', texto: 'chuva' },
  { codigos: [71, 73, 75, 77, 85, 86], categoria: 'neve', texto: 'neve' },
  { codigos: [95, 96, 99], categoria: 'tempestade', texto: 'tempestade' },
];

function faixaDe(codigo: number) {
  return FAIXAS.find((f) => f.codigos.includes(codigo)) ?? { categoria: 'nublado' as const, texto: 'condição indisponível' };
}

export function categoriaTempo(codigo: number): CategoriaTempo {
  return faixaDe(codigo).categoria;
}

export function condicaoTexto(codigo: number): string {
  return faixaDe(codigo).texto;
}

const formatoGrau = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function temperaturaFormatada(valor: number): string {
  return `${formatoGrau.format(valor)}°`;
}
