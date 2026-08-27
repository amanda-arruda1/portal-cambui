/**
 * Sinalização de conteúdo de demonstração.
 *
 * Existe por causa de um risco concreto: o portal responde num endereço
 * `.gov.br` alcançável da internet, e conteúdo inventado ali pode ser lido como
 * informação oficial do município. Enquanto houver demonstração no banco, o
 * site inteiro precisa dizer isso — em QUALQUER domínio, não só no de
 * homologação.
 *
 * O sinal é a EXISTÊNCIA do arquivo de marcação que o popular-demonstracao.mjs
 * escreve. Amarrar o aviso ao dado, e não ao domínio, é o ponto: no dia da
 * virada, esquecer de remover a demonstração não faz o aviso sumir — faz ele
 * aparecer no site oficial, que é exatamente o alarme que se quer.
 */

import { existsSync, statSync } from 'node:fs';

const MARCACAO = process.env.MARCACAO_DEMONSTRACAO || '/opt/portal-cambui/data/demonstracao.json';

/** Verificar o disco a cada requisição seria desperdício; a cada 30 s o aviso
 *  some (ou aparece) rápido o bastante para quem está operando. */
const INTERVALO_MS = 30_000;

let ultimaConsulta = 0;
let ultimoValor = false;

export function emDemonstracao(): boolean {
  const agora = Date.now();
  if (agora - ultimaConsulta < INTERVALO_MS) return ultimoValor;

  ultimaConsulta = agora;
  try {
    ultimoValor = existsSync(MARCACAO) && statSync(MARCACAO).size > 0;
  } catch {
    // Falha de leitura não pode derrubar o portal. Na dúvida, NÃO avisa: um
    // aviso fantasma no site oficial seria pior do que a ausência dele aqui,
    // e a remoção da demonstração apaga o arquivo de qualquer forma.
    ultimoValor = false;
  }
  return ultimoValor;
}
