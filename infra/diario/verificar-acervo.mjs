#!/usr/bin/env node
/**
 * Verificação periódica de integridade do acervo.
 *
 *   npm run verificar              # confere tudo
 *   npm run verificar -- --ultimas=30
 *
 * Recalcula o SHA-256 de cada PDF publicado, compara com o gravado, e revalida
 * a assinatura. É o que detecta **corrupção silenciosa** — que é como acervo
 * digital morre de verdade: não com um estrondo, mas com um bit trocado num
 * disco que ninguém leu nos últimos três anos.
 *
 * Sai com código 1 se achar qualquer problema, para poder ir num timer do
 * systemd e gritar sozinho.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { verificarPdf } from '../../apps/web/src/lib/diario/verificar.mjs';

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const TOKEN = process.env.DIRECTUS_TOKEN_ESQUEMA || process.env.DIRECTUS_TOKEN || '';
const PASTA_ANCORAS = process.env.DIARIO_CONFIANCA_DIR || '/opt/portal-cambui/data/diario/certificados';
const ULTIMAS = Number(process.argv.find((x) => x.startsWith('--ultimas='))?.split('=')[1] ?? 0);

async function api(caminho) {
  const r = await fetch(`${BASE}${caminho}`, TOKEN ? { headers: { Authorization: `Bearer ${TOKEN}` } } : {});
  if (!r.ok) throw new Error(`GET ${caminho} → ${r.status}`);
  return (await r.json()).data;
}

const ancoras = existsSync(PASTA_ANCORAS)
  ? await Promise.all(readdirSync(PASTA_ANCORAS)
      .filter((f) => f.endsWith('.pem') && !f.includes('signatario'))
      .map((f) => readFile(join(PASTA_ANCORAS, f), 'utf8')))
  : [];

const p = new URLSearchParams({
  limit: ULTIMAS ? String(ULTIMAS) : '-1', sort: '-numero',
  fields: 'id,numero,data_publicacao_legal,arquivo_pdf,sha256,importada_acervo,anulada',
  'filter[situacao][_eq]': 'publicada',
});
const edicoes = await api(`/items/diario_edicoes?${p}`);

console.log(`Verificando ${edicoes.length} edição(ões) publicada(s)…\n`);

let ok = 0;
const problemas = [];

for (const e of edicoes) {
  const rotulo = `edição nº ${e.numero} (${e.data_publicacao_legal})`;

  if (!e.arquivo_pdf) { problemas.push(`${rotulo}: sem arquivo PDF.`); continue; }
  if (!e.sha256) { problemas.push(`${rotulo}: sem hash gravado — não há com o que comparar.`); continue; }

  const r = await fetch(`${BASE}/assets/${e.arquivo_pdf}`, TOKEN ? { headers: { Authorization: `Bearer ${TOKEN}` } } : {});
  if (!r.ok) { problemas.push(`${rotulo}: PDF inacessível (HTTP ${r.status}).`); continue; }

  const bytes = Buffer.from(await r.arrayBuffer());
  const hash = createHash('sha256').update(bytes).digest('hex');

  if (hash !== e.sha256) {
    problemas.push(`${rotulo}: HASH DIVERGENTE. Gravado ${e.sha256.slice(0, 16)}…, calculado ${hash.slice(0, 16)}…. ` +
      'O arquivo mudou depois de publicado — restaure do backup e investigue.');
    continue;
  }

  /* Edição importada do acervo não tem assinatura de origem, e isso é
   * esperado: ela vem de antes do sistema. Cobrar assinatura dela produziria
   * um alarme permanente que ensina a ignorar alarmes. */
  if (!e.importada_acervo) {
    const laudo = verificarPdf(bytes, { ancoras });
    if (!laudo.integro) { problemas.push(`${rotulo}: assinatura NÃO confere — ${laudo.detalhe}`); continue; }
    if (!laudo.cobreTudo) { problemas.push(`${rotulo}: há conteúdo acrescentado depois da assinatura.`); continue; }
  }

  ok++;
  if (ok % 25 === 0) process.stdout.write(`\r  ${ok} conferidas…   `);
}

console.log(`\r  ${ok} edição(ões) íntegra(s).${' '.repeat(20)}`);

if (problemas.length) {
  console.error(`\n${problemas.length} PROBLEMA(S):\n`);
  for (const x of problemas) console.error(`  • ${x}`);
  console.error('\nAcervo de diário oficial é permanente por definição legal. Trate como incidente.');
  process.exit(1);
}
console.log('\nAcervo íntegro: todos os PDFs batem com o hash gravado e as assinaturas conferem.');
