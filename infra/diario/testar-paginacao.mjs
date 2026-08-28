#!/usr/bin/env node
/**
 * Confere que o número de página gravado em cada matéria é MESMO a página em
 * que ela está no PDF.
 *
 * Existe porque este defeito já aconteceu: a lista de matérias em ordem do
 * documento foi indexada pela lista em ordem de inserção, e todas as matérias
 * receberam a página de outra. Nada quebrou, nada apareceu no log — só a
 * referência de citação passou a mentir, que é exatamente o dano que este
 * módulo existe para evitar.
 *
 *   node infra/diario/testar-paginacao.mjs [--edicoes=5]
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizar } from '../../apps/web/src/lib/diario/dominio.mjs';
import { tipoDeAto } from '../directus/diario/enums.mjs';

const exec = promisify(execFile);
const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const TOKEN = process.env.DIRECTUS_TOKEN_ESQUEMA || process.env.DIRECTUS_TOKEN || '';
const QUANTAS = Number(process.argv.find((x) => x.startsWith('--edicoes='))?.split('=')[1] ?? 5);

async function api(caminho) {
  const r = await fetch(`${BASE}${caminho}`, TOKEN ? { headers: { Authorization: `Bearer ${TOKEN}` } } : {});
  if (!r.ok) throw new Error(`GET ${caminho} → ${r.status}`);
  return (await r.json()).data;
}

async function paginasDoPdf(idArquivo) {
  const r = await fetch(`${BASE}/assets/${idArquivo}`, TOKEN ? { headers: { Authorization: `Bearer ${TOKEN}` } } : {});
  const bytes = Buffer.from(await r.arrayBuffer());
  const pasta = await mkdtemp(join(tmpdir(), 'diario-pag-'));
  try {
    const arq = join(pasta, 'e.pdf');
    await writeFile(arq, bytes);
    const { stdout } = await exec('pdftotext', ['-layout', '-enc', 'UTF-8', arq, '-']);
    return stdout.split('\f');
  } finally { await rm(pasta, { recursive: true, force: true }).catch(() => {}); }
}

const edicoes = await api(
  `/items/diario_edicoes?limit=${QUANTAS}&sort=-numero&filter[importada_acervo][_eq]=false` +
  '&filter[situacao][_eq]=publicada&fields=id,numero,arquivo_pdf,total_paginas');

console.log(`\nconferindo a paginação de ${edicoes.length} edição(ões)\n`);

let erros = 0, conferidas = 0;
for (const e of edicoes) {
  if (!e.arquivo_pdf) continue;
  const paginasCruas = await paginasDoPdf(e.arquivo_pdf);
  const materias = await api(
    `/items/diario_materias?limit=-1&sort=ordem&filter[edicao][_eq]=${e.id}` +
    '&fields=id,tipo_ato,numero_ato,ano_ato,ementa,pagina_inicial');

  /* COMO SE IDENTIFICA A MATÉRIA NA PÁGINA
   *
   * Duas tentativas anteriores falharam, e por motivos instrutivos:
   *   • pela ementa — ela aparece TAMBÉM no sumário, que numa edição de 200
   *     matérias ocupa sete páginas. Reprovou 189 matérias que estavam certas.
   *   • por um trecho do corpo — o preâmbulo dos atos é padronizado e se
   *     repete; e uma janela do meio costuma ser partida por quebra de página,
   *     sumindo do texto extraído.
   *
   * O que funciona: no CORPO, o título do ato ocupa uma LINHA SOZINHO
   * ("Portaria nº 155/2026"); no sumário ele vem colado à ementa na mesma
   * linha. Procurar a linha isolada distingue os dois sem ambiguidade.
   */
  let ruins = 0;
  for (const m of materias) {
    const titulo = normalizar(
      `${tipoDeAto(m.tipo_ato).rotulo}${m.numero_ato ? ` nº ${m.numero_ato}/${m.ano_ato}` : ''}`
    ).replace(/\s+/g, ' ').trim();
    if (!m.numero_ato) continue;                        // sem número não há título único

    const ondes = paginasCruas
      .map((p, i) => (p.split('\n').some((linha) => {
        const l = normalizar(linha).replace(/\s+/g, ' ').trim();
        return l === titulo;
      }) ? i + 1 : 0))
      .filter(Boolean);

    if (ondes.length !== 1) continue;                   // ambíguo: não conclui nada
    conferidas++;
    if (ondes[0] !== m.pagina_inicial) {
      ruins++; erros++;
      console.error(`  ✗ edição ${e.numero}: ${titulo} — ` +
        `gravada na página ${m.pagina_inicial}, está na ${ondes[0]}`);
    }
  }
  console.log(`  ${ruins === 0 ? '✓' : '✗'} edição nº ${e.numero}: ${materias.length} matérias, ${e.total_paginas} páginas` +
    (ruins ? ` — ${ruins} com página errada` : ''));
}

console.log(`\n${conferidas} matéria(s) conferida(s), ${erros} com página errada.\n`);
if (erros) {
  console.error('A referência de citação dessas matérias está MENTINDO sobre a página.');
  process.exit(1);
}
