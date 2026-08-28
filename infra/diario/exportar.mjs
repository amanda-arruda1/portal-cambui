#!/usr/bin/env node
/**
 * Exportação completa do acervo: PDFs + metadados em JSON.
 *
 *   npm run export                      # para data/diario/exportacao/
 *   npm run export -- --destino=/mnt/x  # para outro lugar
 *   npm run export -- --sem-pdf         # só os metadados
 *
 * POR QUE ISTO EXISTE, e por que não é opcional: se um dia o município trocar
 * de fornecedor, ele leva o acervo inteiro — arquivos e estrutura — sem
 * depender de ninguém. Construir sem aprisionamento é argumento comercial, não
 * fraqueza: a prefeitura que sabe que pode sair é a que fica tranquila.
 *
 * O que sai:
 *   manifesto.json          — veículo, cadernos, contagens, hashes de tudo
 *   edicoes/NNNNN.json      — metadados de cada edição, com suas matérias
 *   edicoes/NNNNN.pdf       — o PDF assinado, byte a byte como publicado
 *   materias.jsonl          — uma matéria por linha, para carga em outro sistema
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const TOKEN = process.env.DIRECTUS_TOKEN_ESQUEMA || process.env.DIRECTUS_TOKEN || '';
const arg = (n, p) => process.argv.find((x) => x.startsWith(`--${n}=`))?.split('=')[1] ?? p;
const DESTINO = arg('destino', '/opt/portal-cambui/data/diario/exportacao');
const SEM_PDF = process.argv.includes('--sem-pdf');

async function api(caminho) {
  const r = await fetch(`${BASE}${caminho}`, TOKEN ? { headers: { Authorization: `Bearer ${TOKEN}` } } : {});
  if (!r.ok) throw new Error(`GET ${caminho} → ${r.status}`);
  return (await r.json()).data;
}

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

console.log(`Exportando o acervo do Diário Oficial para ${DESTINO}`);
await mkdir(join(DESTINO, 'edicoes'), { recursive: true });

const veiculo = await api('/items/diario_veiculo');
const cadernos = await api('/items/diario_cadernos?limit=-1&sort=ordem');
const edicoes = await api('/items/diario_edicoes?limit=-1&sort=numero&filter[situacao][_eq]=publicada');
console.log(`  ${edicoes.length} edições publicadas`);

const linhasMaterias = [];
const arquivos = [];
let comPdf = 0, semPdf = 0, divergentes = 0;

for (const e of edicoes) {
  const materias = await api(
    `/items/diario_materias?limit=-1&sort=ordem&filter[edicao][_eq]=${e.id}` +
    '&fields=*,secretaria.nome,secretaria.slug,caderno.slug,caderno.nome');

  const registro = {
    edicao: e,
    materias,
    exportado_em: new Date().toISOString(),
  };
  const nome = String(e.numero).padStart(5, '0');
  const json = JSON.stringify(registro, null, 2);
  await writeFile(join(DESTINO, 'edicoes', `${nome}.json`), json, 'utf8');
  arquivos.push({ arquivo: `edicoes/${nome}.json`, sha256: sha256(Buffer.from(json)) });

  for (const m of materias) {
    linhasMaterias.push(JSON.stringify({
      ...m,
      edicao_numero: e.numero,
      edicao_data_publicacao_legal: e.data_publicacao_legal,
      edicao_data_disponibilizacao: e.data_disponibilizacao,
      edicao_codigo_verificador: e.codigo_verificador,
      edicao_sha256: e.sha256,
    }));
  }

  if (!SEM_PDF && e.arquivo_pdf) {
    const r = await fetch(`${BASE}/assets/${e.arquivo_pdf}`, TOKEN ? { headers: { Authorization: `Bearer ${TOKEN}` } } : {});
    if (r.ok) {
      const bytes = Buffer.from(await r.arrayBuffer());
      await writeFile(join(DESTINO, 'edicoes', `${nome}.pdf`), bytes);
      const hash = sha256(bytes);
      arquivos.push({ arquivo: `edicoes/${nome}.pdf`, sha256: hash });
      /* Confere na hora: exportar um PDF que já não bate com o hash gravado
       * seria propagar a corrupção para o backup, em silêncio. */
      if (e.sha256 && e.sha256 !== hash) {
        divergentes++;
        console.warn(`  ! edição ${e.numero}: o PDF exportado NÃO bate com o hash gravado`);
      }
      comPdf++;
    } else { semPdf++; console.warn(`  ! edição ${e.numero}: PDF inacessível (HTTP ${r.status})`); }
  } else if (!e.arquivo_pdf) semPdf++;

  if (edicoes.indexOf(e) % 20 === 0) process.stdout.write(`\r  ${edicoes.indexOf(e) + 1}/${edicoes.length}   `);
}
console.log('');

const jsonl = linhasMaterias.join('\n') + '\n';
await writeFile(join(DESTINO, 'materias.jsonl'), jsonl, 'utf8');
arquivos.push({ arquivo: 'materias.jsonl', sha256: sha256(Buffer.from(jsonl)) });

const manifesto = {
  gerado_em: new Date().toISOString(),
  origem: process.env.PUBLIC_SITE_URL || 'https://portal.cambui.mg.gov.br',
  veiculo, cadernos,
  totais: { edicoes: edicoes.length, materias: linhasMaterias.length, pdfs: comPdf, sem_pdf: semPdf },
  formato: {
    'edicoes/NNNNN.json': 'metadados da edição e de todas as suas matérias',
    'edicoes/NNNNN.pdf': 'o PDF assinado, byte a byte como publicado',
    'materias.jsonl': 'uma matéria por linha (JSON Lines), para carga em outro sistema',
  },
  aviso: 'Cada PDF traz a sua própria assinatura digital e pode ser conferido de forma independente ' +
    'no validador oficial do Governo Federal (https://validar.iti.gov.br), sem depender deste portal ' +
    'nem de quem o mantém.',
  arquivos,
};
await writeFile(join(DESTINO, 'manifesto.json'), JSON.stringify(manifesto, null, 2), 'utf8');

console.log(`\n  ${edicoes.length} edições, ${linhasMaterias.length} matérias, ${comPdf} PDFs`);
if (semPdf) console.log(`  ${semPdf} edição(ões) sem PDF acessível`);
if (divergentes) {
  console.error(`\n  ATENÇÃO: ${divergentes} PDF(s) com hash divergente. Investigar antes de confiar neste backup.`);
  process.exitCode = 1;
} else {
  console.log(`\n  Manifesto em ${join(DESTINO, 'manifesto.json')}`);
}
