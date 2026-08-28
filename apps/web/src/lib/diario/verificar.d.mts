/** Tipos do verificador de assinatura. Ver verificar.mjs. */
export interface Laudo {
  assinado: boolean; integro: boolean; cobreTudo: boolean; confiavel: boolean;
  padrao: string | null; signatario: string | null; emissor: string | null;
  numeroSerie: string | null; validoDe: string | null; validoAte: string | null;
  validoNaAssinatura: boolean | null; algoritmo: string | null; carimbo: boolean;
  motivo: string | null; quando: string | null; assinaturas: number;
  sha256: string; detalhe: string; problemas: string[];
}
export function acharAssinaturas(pdf: Buffer): Array<{
  faixa: [number, number, number, number]; cms: Buffer; assinados: Buffer;
  subFilter: string | null; motivo: string | null; nome: string | null; quando: string[] | null;
}>;
export function verificarPdf(pdf: Buffer, o?: { ancoras?: string[] }): Laudo;
