#!/usr/bin/env node
/**
 * Ensaio de restauração — prova que o backup RESTAURA, não só que existe.
 *
 *   node backup-testar-restauracao.mjs            testa o snapshot mais recente
 *   node backup-testar-restauracao.mjs <nome>     testa um snapshot específico (ex.: 2026-10-14T153847)
 *
 * Não toca em nenhum banco nem arquivo de produção: sobe um Postgres TEMPORÁRIO (sem rede, dados em memória),
 * restaura os dois dumps nele, compara com os bancos reais e confere se todo arquivo que o banco referencia
 * existe no snapshot. O container é removido ao final, com sucesso ou não.
 *
 * Saída 0 = restauração íntegra; 1 = problema (a mensagem diz qual).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DESTINO = process.env.BACKUP_DESTINO || '/var/backups/portal-cambui';
const IMAGEM = 'postgres:16.15';
const NOME = `teste-restauracao-${process.pid}`;

// Tabelas que mudam sozinhas (sessões, cache, histórico): diferença de contagem aqui não indica defeito.
const RUIDOSAS = new Set(['directus_sessions', 'directus_activity', 'directus_revisions', 'directus_notifications', 'previsao_tempo', 'indicadores_economicos', 'payload_preferences', 'payload_locked_documents', 'payload_locked_documents_rels', 'payload_kv', 'users_sessions']);

const snapshots = fs.readdirSync(DESTINO).filter((n) => /^\d{4}-\d{2}-\d{2}T\d{6}$/.test(n) && fs.existsSync(path.join(DESTINO, n, 'manifest.json'))).sort();
const snapshot = process.argv[2] || snapshots.at(-1);
if (!snapshot || !snapshots.includes(snapshot)) { console.error(`snapshot inexistente: ${snapshot}`); process.exit(1); }
const raiz = path.join(DESTINO, snapshot);

const docker = (args, opcoes = {}) => execFileSync('docker', args, { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'], ...opcoes }).toString();
const psql = (container, banco, sql) => docker(['exec', container, 'psql', '-U', 'postgres', '-d', banco, '-At', '-F', '|', '-c', sql]);
const psqlVivo = (container, sql) => docker(['exec', container, 'sh', '-c', `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F '|' -c "${sql}"`]);

let problemas = 0;
const ok = (c, msg) => { if (!c) problemas++; console.log(`  ${c ? '✓' : '✗'} ${msg}`); };

/** {tabela → linhas} de todas as tabelas do schema public, por contagem exata. */
function contagens(consulta) {
  const nomes = consulta(`select tablename from pg_tables where schemaname='public' order by 1`).split('\n').filter(Boolean);
  const sql = nomes.map((t) => `select '${t}', count(*) from public."${t}"`).join(' union all ');
  return Object.fromEntries(consulta(sql).split('\n').filter(Boolean).map((l) => { const [t, n] = l.split('|'); return [t, Number(n)]; }));
}

console.log(`Ensaio de restauração do snapshot ${snapshot}`);
const manifesto = JSON.parse(fs.readFileSync(path.join(raiz, 'manifest.json'), 'utf8'));
console.log(`  (feito em ${manifesto.inicio}, git ${String(manifesto.git).slice(0, 10)})`);

try {
  docker(['run', '-d', '--rm', '--name', NOME, '--network', 'none', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_PASSWORD=ensaio', IMAGEM]);
  for (let i = 0; i < 60; i++) { if (spawnSync('docker', ['exec', NOME, 'pg_isready', '-U', 'postgres', '-q']).status === 0) break; execFileSync('sleep', ['1']); }
  // pg_isready responde antes de o servidor final subir (o entrypoint reinicia depois do initdb): confirma com uma consulta real
  for (let i = 0; i < 60; i++) { try { psql(NOME, 'postgres', 'select 1'); break; } catch { execFileSync('sleep', ['1']); } }

  const ALVOS = [
    { chave: 'directus', banco: 'restaurado_directus', vivo: 'portal-postgres' },
    { chave: 'payload', banco: 'restaurado_payload', vivo: 'payload-postgres' },
  ];
  const restaurados = {};
  for (const a of ALVOS) {
    console.log(`\n▶ ${a.chave}`);
    psql(NOME, 'postgres', `create database ${a.banco}`);
    const dump = path.join(raiz, 'bancos', `${a.chave}.dump`);
    const fd = fs.openSync(dump, 'r');
    // --no-owner: o dump cita o usuário de produção, que não existe neste Postgres temporário.
    const r = spawnSync('docker', ['exec', '-i', NOME, 'pg_restore', '-U', 'postgres', '-d', a.banco, '--no-owner', '--no-privileges', '--exit-on-error'], { stdio: [fd, 'pipe', 'pipe'] });
    fs.closeSync(fd);
    ok(r.status === 0, `pg_restore concluiu sem erro${r.status === 0 ? '' : `: ${r.stderr.toString().slice(0, 300)}`}`);
    if (r.status !== 0) continue;

    const restaurado = contagens((sql) => psql(NOME, a.banco, sql));
    const vivo = contagens((sql) => psqlVivo(a.vivo, sql.replaceAll('"', '\\"')));
    const tabelas = Object.keys(vivo);
    const faltando = tabelas.filter((t) => !(t in restaurado));
    ok(faltando.length === 0, `${tabelas.length} tabelas no banco real, ${Object.keys(restaurado).length} restauradas${faltando.length ? ` — faltam: ${faltando.join(', ')}` : ''}`);
    const dif = tabelas.filter((t) => t in restaurado && restaurado[t] !== vivo[t] && !RUIDOSAS.has(t));
    ok(dif.length === 0, `contagem de linhas igual ao banco real em todas as tabelas de conteúdo${dif.length ? ` — diferem: ${dif.map((t) => `${t} (${restaurado[t]} restaurado × ${vivo[t]} real)`).join(', ')}` : ''}`);
    const total = Object.entries(restaurado).filter(([t]) => !RUIDOSAS.has(t)).reduce((s, [, n]) => s + n, 0);
    console.log(`    ${total} linhas de conteúdo restauradas; principais: ${Object.entries(restaurado).filter(([t]) => !RUIDOSAS.has(t)).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([t, n]) => `${t}=${n}`).join(', ')}`);
    restaurados[a.chave] = a.banco;
  }

  console.log('\n▶ arquivos referenciados pelos bancos restaurados × snapshot');
  if (restaurados.directus) {
    const nomes = psql(NOME, restaurados.directus, `select filename_disk from directus_files where filename_disk is not null`).split('\n').filter(Boolean);
    const ausentes = nomes.filter((n) => !fs.existsSync(path.join(raiz, 'arquivos', 'directus-uploads', n)));
    ok(ausentes.length === 0, `${nomes.length} arquivos do Directus referenciados, todos presentes no snapshot${ausentes.length ? ` — AUSENTES: ${ausentes.slice(0, 5).join(', ')}${ausentes.length > 5 ? '…' : ''} (${ausentes.length})` : ''}`);
  }
  if (restaurados.payload) {
    const nomes = psql(NOME, restaurados.payload, `select filename from media where filename is not null`).split('\n').filter(Boolean);
    const ausentes = nomes.filter((n) => !fs.existsSync(path.join(raiz, 'arquivos', 'payload-media', n)));
    ok(ausentes.length === 0, `${nomes.length} arquivos do Payload referenciados, todos presentes no snapshot${ausentes.length ? ` — AUSENTES: ${ausentes.slice(0, 5).join(', ')} (${ausentes.length})` : ''}`);
  }
} finally {
  try { docker(['rm', '-f', NOME]); } catch { /* já removido */ }
}

console.log(problemas ? `\nENSAIO REPROVADO: ${problemas} problema(s)` : '\nENSAIO APROVADO: os dumps restauram e o snapshot tem todos os arquivos que o banco referencia');
process.exit(problemas ? 1 : 0);
