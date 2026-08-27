#!/usr/bin/env node
/**
 * Confere os formulários do painel contra o esquema do CMS.
 *
 *   cd /opt/portal-cambui/apps/web && node scripts/verificar-campos.mjs
 *
 * src/lib/painel/campos.ts descreve a TELA; infra/directus/esquema.json
 * descreve o BANCO. São arquivos separados de propósito — rótulo em português,
 * ordem de preenchimento e texto de ajuda não pertencem ao esquema. O preço da
 * separação é poder divergir, e é exatamente isso que este script pega:
 *
 *   - campo no esquema que o formulário não oferece (a secretaria nunca
 *     conseguiria preencher);
 *   - campo no formulário que o esquema não tem (gravação daria erro no CMS);
 *   - obrigatoriedade divergente (o formulário deixa passar e o banco recusa);
 *   - lista de opções divergente (valor que o banco não aceita).
 *
 * Rodar depois de mexer em qualquer um dos dois arquivos. Sai com código 1
 * quando encontra divergência.
 */

import { readFile } from 'node:fs/promises';
import { CAMPOS } from '../src/lib/painel/campos.ts';

const esquema = JSON.parse(
  await readFile(new URL('../../../infra/directus/esquema.json', import.meta.url), 'utf8'),
);

/** Campos que toda coleção tem e que o formulário NÃO deve oferecer: são
 *  preenchidos pelo Directus ou pelo fluxo editorial, nunca digitados. */
const AUTOMATICOS = new Set(['id', 'status', 'user_created', 'date_created', 'user_updated', 'date_updated']);

const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const vermelho = (t) => `\x1b[31m${t}\x1b[0m`;
const cinza = (t) => `\x1b[90m${t}\x1b[0m`;

const problemas = [];

const colecoesDoEsquema = new Map(esquema.colecoes.map((c) => [c.nome, c]));

for (const [colecao, campos] of Object.entries(CAMPOS)) {
  const noEsquema = colecoesDoEsquema.get(colecao);
  if (!noEsquema) {
    problemas.push(`coleção "${colecao}" existe no formulário e NÃO no esquema`);
    continue;
  }

  const doEsquema = new Map(noEsquema.campos.map((c) => [c.campo, c]));
  const doFormulario = new Map(campos.map((c) => [c.nome, c]));

  for (const nome of doEsquema.keys()) {
    if (AUTOMATICOS.has(nome)) continue;
    if (!doFormulario.has(nome)) {
      problemas.push(`${colecao}.${nome}: está no esquema, falta no formulário — ninguém consegue preencher`);
    }
  }

  for (const nome of doFormulario.keys()) {
    if (!doEsquema.has(nome)) {
      problemas.push(`${colecao}.${nome}: está no formulário, falta no esquema — a gravação daria erro`);
    }
  }

  for (const [nome, campoEsquema] of doEsquema) {
    const campoTela = doFormulario.get(nome);
    if (!campoTela) continue;

    const obrigatorioNoBanco = campoEsquema.obrigatorio === true;
    const obrigatorioNaTela = campoTela.obrigatorio === true;
    if (obrigatorioNoBanco !== obrigatorioNaTela) {
      problemas.push(
        `${colecao}.${nome}: obrigatório no ${obrigatorioNoBanco ? 'esquema' : 'formulário'} e opcional no ${obrigatorioNoBanco ? 'formulário' : 'esquema'}`,
      );
    }

    if (campoEsquema.opcoes) {
      const noBanco = [...campoEsquema.opcoes].sort();
      const naTela = (campoTela.opcoes ?? []).map((o) => o.valor).sort();
      if (JSON.stringify(noBanco) !== JSON.stringify(naTela)) {
        problemas.push(
          `${colecao}.${nome}: opções divergentes — esquema [${noBanco.join(', ')}] vs formulário [${naTela.join(', ')}]`,
        );
      }
    }
  }
}

for (const nome of colecoesDoEsquema.keys()) {
  if (!(nome in CAMPOS)) {
    problemas.push(`coleção "${nome}" existe no esquema e NÃO tem formulário`);
  }
}

const totalCampos = Object.values(CAMPOS).reduce((s, c) => s + c.length, 0);

if (problemas.length === 0) {
  console.log(
    verde('\nSEM DIVERGÊNCIA') +
      `: ${Object.keys(CAMPOS).length} coleções, ${totalCampos} campos conferidos ` +
      cinza('(campos automáticos ignorados: ' + [...AUTOMATICOS].join(', ') + ')') +
      '\n',
  );
  process.exit(0);
}

console.log(vermelho(`\n${problemas.length} DIVERGÊNCIA(S):\n`));
for (const p of problemas) console.log(`  ${vermelho('•')} ${p}`);
console.log();
process.exit(1);
