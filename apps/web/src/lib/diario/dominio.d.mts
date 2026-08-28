/** Tipos do núcleo do Órgão Oficial. Ver dominio.mjs para o porquê da divisão. */
export type RegraPrazo = 'primeiro_dia_util_seguinte' | 'mesmo_dia' | 'dia_seguinte_corrido';

export function pascoa(ano: number): Date;
export function feriados(ano: number): Map<string, string>;
export function comoDia(v: Date | string): Date;
export function ehFeriado(data: Date | string): boolean;
export function nomeFeriado(data: Date | string): string | null;
export function ehDiaUtil(data: Date | string): boolean;
export function proximoDiaUtil(data: Date | string): Date;
export function publicacaoLegal(disponibilizacao: Date | string, regra?: RegraPrazo): Date;
export function explicarPrazo(disponibilizacao: Date | string, publicacao: Date | string, regra: RegraPrazo): string;
export function romano(n: number): string;
export function dataBr(v: Date | string): string;
export function referenciaCitacao(a: { veiculo: any; edicao: any; materia?: any }): string;
export function codigoVerificador(semente: string | number): string;
export function mascararCpf(cpf: string | null | undefined): string | null;
export const PADROES_SENSIVEIS: Array<{ chave: string; rotulo: string; re: RegExp; conselho: string }>;
export function rastrearSensiveis(texto: string | null | undefined): Array<{
  chave: string; rotulo: string; conselho: string; quantidade: number; exemplo: string }>;
export function normalizar(t: string | null | undefined): string;
export function paraSlug(t: string): string;
export function textoDe(html: string | null | undefined): string;
export function reconhecerAto(termo: string): { tipo_ato: string; numero: string; ano: number | null } | null;
