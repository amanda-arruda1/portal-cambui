/**
 * Âncoras de confiança para a verificação de assinatura.
 *
 * Em produção, aqui entram os certificados raiz da ICP-Brasil, que o ITI
 * publica. TODO(implantação): baixar de https://www.gov.br/iti/ (âncoras da
 * AC Raiz v5/v10) e colocar em data/diario/confianca/. Enquanto isso, a única
 * âncora é a AC de demonstração — e a página diz isso em voz alta, em vez de
 * exibir um "confiável" que não significa nada.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PASTA = process.env.DIARIO_CONFIANCA_DIR || '/opt/portal-cambui/data/diario/certificados';
const INTERVALO_MS = 300_000;

let em = 0;
let cache: { pems: string[]; demonstracao: boolean } = { pems: [], demonstracao: false };

export function ancoras(): { pems: string[]; demonstracao: boolean } {
  if (Date.now() - em < INTERVALO_MS && cache.pems.length) return cache;
  em = Date.now();
  try {
    if (!existsSync(PASTA)) return (cache = { pems: [], demonstracao: false });
    const arquivos = readdirSync(PASTA).filter((f) => f.endsWith('.pem') && !f.includes('signatario'));
    const pems = arquivos.map((f) => readFileSync(join(PASTA, f), 'utf8'));
    cache = { pems, demonstracao: arquivos.some((f) => f.includes('demo')) };
  } catch {
    /* Não poder ler a âncora não pode derrubar a página: a verificação de
     * INTEGRIDADE continua funcionando sem ela — só a de confiança fica sem
     * resposta, e a tela diz isso. */
    cache = { pems: [], demonstracao: false };
  }
  return cache;
}
