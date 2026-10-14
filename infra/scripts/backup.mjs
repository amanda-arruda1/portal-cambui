#!/usr/bin/env node
/**
 * Backup do Portal Cambuí — snapshots diários em disco, com verificação.
 *
 *   node backup.mjs               executa o backup e a retenção
 *   node backup.mjs --simular     mostra o que faria, sem gravar nada
 *   node backup.mjs --so-retencao aplica só a retenção (nada de novo é copiado)
 *
 * O QUE ENTRA (tudo o que só existe neste servidor):
 *   bancos/     pg_dump -Fc do Postgres do Directus e do Postgres do Payload
 *   arquivos/   uploads do Directus, media do Payload, acervo do Diário Oficial, marco dos avisos
 *   segredos/   os .env (senhas de banco e chaves) — modo 0400/0700, root apenas
 *
 * O QUE NÃO ENTRA, e por quê: o código e a infraestrutura (git), Redis (cache), as sessões do painel
 * (efêmeras), imagens derivadas em cache (regeneráveis) e o diretório bruto do Postgres (os dumps bastam).
 *
 * COMO FUNCIONA
 *  - ORDEM: bancos primeiro, arquivos depois. Um arquivo enviado entre os dois passos entra no backup sem
 *    linha no banco (órfão inofensivo); o inverso — linha de banco apontando para arquivo ausente — não ocorre.
 *  - Cada execução cria um snapshot completo e independente em <DESTINO>/AAAA-MM-DDTHHMMSS. Arquivo igual ao
 *    do snapshot anterior (mesmo tamanho e mtime) vira HARDLINK, não cópia: só o que mudou ocupa espaço.
 *    Por isso os arquivos do snapshot ficam somente-leitura (0400): alterar um alteraria todos os que o
 *    compartilham.
 *  - O snapshot nasce como `.em-andamento-*` e só ganha o nome final, por rename atômico, depois de
 *    verificado. Um snapshot incompleto nunca é confundido com um bom.
 *  - Verificação: cada dump é lido de volta (pg_restore -l), tem SHA-256 registrado, e uma amostra de
 *    arquivos é comparada byte a byte com a origem. Qualquer falha encerra com código 1 (o serviço systemd
 *    fica "failed") e o ULTIMO_STATUS.json diz o motivo.
 *  - Retenção: os 14 snapshots mais recentes + o mais novo de cada uma das últimas 8 semanas + o mais novo
 *    de cada um dos últimos 6 meses.
 *
 * ISTO NÃO É BACKUP FORA DO SERVIDOR. Protege de erro humano, migração ruim e exclusão acidental; NÃO protege
 * de perda do disco ou da VM. Veja BACKUP_COPIA_EXTERNA no fim deste arquivo.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SIMULAR = process.argv.includes('--simular');
const SO_RETENCAO = process.argv.includes('--so-retencao');
const REPO = '/opt/portal-cambui';
const DESTINO = process.env.BACKUP_DESTINO || '/var/backups/portal-cambui';

const BANCOS = [
  { nome: 'directus', container: 'portal-postgres' },
  { nome: 'payload', container: 'payload-postgres' },
];
const ARQUIVOS = [
  { nome: 'directus-uploads', origem: `${REPO}/data/directus/uploads` },
  { nome: 'payload-media', origem: `${REPO}/novo-cms-payload/media` },
  { nome: 'diario', origem: `${REPO}/data/diario` },
  { nome: 'avisos', origem: `${REPO}/data/avisos` },
];
const SEGREDOS = [`${REPO}/.env`, `${REPO}/.env.web`, `${REPO}/.env.diario`, `${REPO}/novo-cms-payload/.env`];

const RETER = { diarios: 14, semanas: 8, meses: 6 };
const AMOSTRA_ARQUIVOS = 40;

const agora = new Date();
const pad = (n) => String(n).padStart(2, '0');
const carimbo = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}T${pad(agora.getHours())}${pad(agora.getMinutes())}${pad(agora.getSeconds())}`;
const log = (m) => console.log(`[backup ${new Date().toISOString()}] ${m}`);
const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;

class Falha extends Error {}

/* ---------- utilidades ---------- */

function sha256Arquivo(caminho) {
  const h = createHash('sha256');
  const fd = fs.openSync(caminho, 'r');
  const buf = Buffer.allocUnsafe(1 << 20);
  try { for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  return h.digest('hex');
}

function executar(cmd, args, opcoes = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', opcoes.saida ?? 'pipe', 'pipe'] });
    let erro = '';
    p.stderr.on('data', (d) => { erro += d; });
    if (opcoes.saida === undefined) p.stdout.resume();
    p.on('close', (codigo) => (codigo === 0 ? resolve() : reject(new Falha(`${cmd} ${args.slice(0, 3).join(' ')}… saiu com ${codigo}: ${erro.trim().slice(0, 400)}`))));
    p.on('error', reject);
  });
}

/* Arquivos que a própria aplicação reescreve a cada poucos minutos e que não são dado: o batimento do Directus.
 * Incluí-los só gera diferença entre origem e cópia sem significado. */
const IGNORAR = new Set(['directus-health-file']);

/** Percorre uma árvore e devolve os arquivos comuns [{rel, abs, tamanho, mtimeMs, modo}]. */
function listar(raiz) {
  const saida = [];
  const andar = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) andar(abs, r);
      else if (e.isFile() && !IGNORAR.has(e.name)) { const s = fs.statSync(abs); saida.push({ rel: r, abs, tamanho: s.size, mtimeMs: s.mtimeMs, modo: s.mode & 0o777 }); }
    }
  };
  if (fs.existsSync(raiz)) andar(raiz, '');
  return saida;
}

/* ---------- etapas ---------- */

async function dumpBanco(banco, pasta) {
  const arquivo = path.join(pasta, `${banco.nome}.dump`);
  const fluxo = fs.createWriteStream(arquivo, { mode: 0o400 });
  await new Promise((ok, falha) => fluxo.on('open', ok).on('error', falha));
  await executar('docker', ['exec', banco.container, 'sh', '-c', 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'], { saida: fluxo });
  await new Promise((ok) => fluxo.end(ok));

  // Leitura de volta: um dump truncado ou corrompido não lista o sumário.
  // O arquivo vai como stdin direto (não por pipe): o pg_restore -l lê só o sumário e fecha a entrada,
  // e enviar o dump inteiro por pipe estoura EPIPE.
  const fd = fs.openSync(arquivo, 'r');
  let sumario;
  try { sumario = execFileSync('docker', ['exec', '-i', banco.container, 'pg_restore', '-l'], { stdio: [fd, 'pipe', 'pipe'], maxBuffer: 1 << 28 }).toString(); }
  finally { fs.closeSync(fd); }
  const entradas = sumario.split('\n').filter((l) => l && !l.startsWith(';')).length;
  const tabelas = sumario.split('\n').filter((l) => /\sTABLE DATA\s/.test(l)).length;
  if (entradas < 50 || tabelas < 10) throw new Falha(`dump de ${banco.nome} suspeito: ${entradas} entradas, ${tabelas} tabelas com dados`);
  const tamanho = fs.statSync(arquivo).size;
  log(`  banco ${banco.nome}: ${mb(tamanho)}, ${entradas} entradas no sumário, ${tabelas} tabelas com dados`);
  return { arquivo: `bancos/${banco.nome}.dump`, tamanho, sha256: sha256Arquivo(arquivo), entradas, tabelasComDados: tabelas };
}

function copiarArvore(origem, destino, anterior) {
  const arquivos = listar(origem);
  let copiados = 0, ligados = 0, bytesCopiados = 0, bytes = 0;
  const idxAnterior = new Map(anterior ? listar(anterior).map((a) => [a.rel, a]) : []);
  fs.mkdirSync(destino, { recursive: true, mode: 0o700 });
  for (const a of arquivos) {
    const alvo = path.join(destino, a.rel);
    fs.mkdirSync(path.dirname(alvo), { recursive: true, mode: 0o700 });
    bytes += a.tamanho;
    const antes = idxAnterior.get(a.rel);
    if (antes && antes.tamanho === a.tamanho && Math.abs(antes.mtimeMs - a.mtimeMs) < 1000) {
      fs.linkSync(antes.abs, alvo); ligados++;
    } else {
      fs.copyFileSync(a.abs, alvo, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(alvo, 0o400);
      fs.utimesSync(alvo, a.mtimeMs / 1000, a.mtimeMs / 1000);
      copiados++; bytesCopiados += a.tamanho;
    }
  }
  return { arquivos: arquivos.length, bytes, copiados, ligados, bytesCopiados, registro: arquivos };
}

/**
 * Confere a CÓPIA contra o que foi registrado na hora de copiar. Dois cuidados que um teste ingênuo erra:
 *  - arquivo novo na origem DEPOIS da cópia não é defeito do backup (uploads acontecem a qualquer hora);
 *  - arquivo que a aplicação reescreveu depois da cópia (marco dos avisos, p. ex.) não pode reprovar um
 *    backup bom: se o mtime/tamanho de hoje não é o da hora da cópia, a amostra pula esse arquivo.
 */
function verificarAmostra(destino, resumo) {
  const copiados = listar(destino);
  if (copiados.length !== resumo.arquivos) throw new Falha(`${destino}: ${copiados.length} arquivos na cópia, ${resumo.arquivos} registrados`);
  const registro = resumo.registro;
  const escolhidos = new Set();
  while (escolhidos.size < Math.min(AMOSTRA_ARQUIVOS, registro.length)) escolhidos.add(randomInt(registro.length));
  let comparados = 0, mudaramDepois = 0;
  for (const i of escolhidos) {
    const a = registro[i];
    let agora;
    try { agora = fs.statSync(a.abs); } catch { mudaramDepois++; continue; } // apagado depois da cópia
    if (agora.size !== a.tamanho || Math.abs(agora.mtimeMs - a.mtimeMs) >= 1000) { mudaramDepois++; continue; }
    if (sha256Arquivo(a.abs) !== sha256Arquivo(path.join(destino, a.rel))) throw new Falha(`conteúdo diferente da origem: ${a.rel}`);
    comparados++;
  }
  return { comparados, mudaramDepois };
}

function snapshotsCompletos() {
  if (!fs.existsSync(DESTINO)) return [];
  return fs.readdirSync(DESTINO).filter((n) => /^\d{4}-\d{2}-\d{2}T\d{6}$/.test(n) && fs.existsSync(path.join(DESTINO, n, 'manifest.json'))).sort();
}

/** Quais snapshots a política manda manter. */
export function escolherManter(nomes, ref = new Date()) {
  const ordenados = [...nomes].sort().reverse(); // do mais novo para o mais velho
  const manter = new Set(ordenados.slice(0, RETER.diarios));
  const data = (n) => new Date(`${n.slice(0, 10)}T12:00:00`);
  const semana = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dia = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dia); const ini = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${Math.ceil(((t - ini) / 86400000 + 1) / 7)}`; };
  const mes = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const vistosSemana = new Map(), vistosMes = new Map();
  for (const n of ordenados) { // o primeiro visto de cada período é o mais novo dele
    const d = data(n);
    if (!vistosSemana.has(semana(d))) vistosSemana.set(semana(d), n);
    if (!vistosMes.has(mes(d))) vistosMes.set(mes(d), n);
  }
  [...vistosSemana.values()].slice(0, RETER.semanas).forEach((n) => manter.add(n));
  [...vistosMes.values()].slice(0, RETER.meses).forEach((n) => manter.add(n));
  return manter;
}

function aplicarRetencao() {
  const todos = snapshotsCompletos();
  const manter = escolherManter(todos);
  const remover = todos.filter((n) => !manter.has(n));
  for (const n of remover) {
    log(`  retenção: removendo ${n}`);
    if (!SIMULAR) {
      // NÃO fazer chmod aqui: os arquivos são hardlinks compartilhados com snapshots que ficam, e o chmod
      // muda o inode — tornaria graváveis os arquivos dos snapshots preservados. Como root, rm basta.
      fs.rmSync(path.join(DESTINO, n), { recursive: true, force: true });
    }
  }
  // restos de execuções interrompidas
  if (fs.existsSync(DESTINO)) for (const n of fs.readdirSync(DESTINO).filter((x) => x.startsWith('.em-andamento-'))) {
    log(`  limpando execução interrompida: ${n}`);
    if (!SIMULAR) fs.rmSync(path.join(DESTINO, n), { recursive: true, force: true });
  }
  return { mantidos: manter.size, removidos: remover.length };
}

function gravarStatus(obj) {
  if (SIMULAR) return;
  fs.mkdirSync(DESTINO, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(DESTINO, 'ULTIMO_STATUS.json'), JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 });
}

/* ---------- principal ---------- */

async function principal() {
  const inicio = Date.now();
  if (!SIMULAR) fs.mkdirSync(DESTINO, { recursive: true, mode: 0o700 });

  // Uma execução por vez: o timer pode disparar enquanto uma manual ainda roda.
  const trava = path.join(DESTINO, '.trava');
  if (!SIMULAR) {
    try { fs.writeFileSync(trava, String(process.pid), { flag: 'wx' }); }
    catch {
      const pid = Number(fs.readFileSync(trava, 'utf8'));
      let viva = false; try { process.kill(pid, 0); viva = true; } catch { /* processo morto */ }
      if (viva) throw new Falha(`já há um backup em execução (pid ${pid})`);
      fs.writeFileSync(trava, String(process.pid)); // trava órfã de execução que morreu
    }
  }
  try {
    if (SO_RETENCAO) { log('só retenção'); const r = aplicarRetencao(); log(`retenção: mantidos ${r.mantidos}, removidos ${r.removidos}`); return; }

    const anteriores = snapshotsCompletos();
    const anterior = anteriores.length ? path.join(DESTINO, anteriores.at(-1)) : null;
    const emAndamento = path.join(DESTINO, `.em-andamento-${carimbo}`);
    log(`${SIMULAR ? '[SIMULAÇÃO] ' : ''}snapshot ${carimbo} (anterior: ${anteriores.at(-1) ?? 'nenhum — este será completo'})`);

    if (SIMULAR) {
      for (const a of ARQUIVOS) { const l = listar(a.origem); log(`  arquivos ${a.nome}: ${l.length} arquivos, ${mb(l.reduce((s, x) => s + x.tamanho, 0))}`); }
      for (const b of BANCOS) log(`  banco ${b.nome}: dump do container ${b.container}`);
      for (const s of SEGREDOS) log(`  segredo: ${s} ${fs.existsSync(s) ? 'ok' : 'AUSENTE'}`);
      aplicarRetencao();
      return;
    }

    fs.mkdirSync(emAndamento, { mode: 0o700 });
    const manifesto = { versao: 1, snapshot: carimbo, inicio: agora.toISOString(), git: null, bancos: {}, arquivos: {}, segredos: [] };
    try { manifesto.git = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD']).toString().trim(); } catch { /* sem git: segue */ }

    // 1) bancos
    log('1/4 bancos de dados');
    fs.mkdirSync(path.join(emAndamento, 'bancos'), { mode: 0o700 });
    for (const b of BANCOS) manifesto.bancos[b.nome] = await dumpBanco(b, path.join(emAndamento, 'bancos'));

    // 2) arquivos
    log('2/4 arquivos');
    for (const a of ARQUIVOS) {
      const destino = path.join(emAndamento, 'arquivos', a.nome);
      const r = copiarArvore(a.origem, destino, anterior ? path.join(anterior, 'arquivos', a.nome) : null);
      manifesto.arquivos[a.nome] = r;
      log(`  ${a.nome}: ${r.arquivos} arquivos, ${mb(r.bytes)} (${r.copiados} copiados = ${mb(r.bytesCopiados)}, ${r.ligados} reaproveitados)`);
    }

    // 3) segredos
    log('3/4 segredos');
    fs.mkdirSync(path.join(emAndamento, 'segredos'), { mode: 0o700 });
    for (const s of SEGREDOS) {
      if (!fs.existsSync(s)) { log(`  AUSENTE (ignorado): ${s}`); continue; }
      const nome = path.relative(REPO, s).replaceAll('/', '__');
      fs.copyFileSync(s, path.join(emAndamento, 'segredos', nome)); fs.chmodSync(path.join(emAndamento, 'segredos', nome), 0o400);
      manifesto.segredos.push(nome);
    }

    // 4) verificação
    log('4/4 verificação');
    for (const a of ARQUIVOS) {
      const v = verificarAmostra(path.join(emAndamento, 'arquivos', a.nome), manifesto.arquivos[a.nome]);
      log(`  ${a.nome}: contagem confere e ${v.comparados} arquivos sorteados idênticos byte a byte${v.mudaramDepois ? ` (${v.mudaramDepois} mudaram na origem depois da cópia e foram pulados)` : ''}`);
    }
    for (const a of Object.values(manifesto.arquivos)) delete a.registro; // só serve à verificação
    manifesto.fim = new Date().toISOString();
    manifesto.duracaoSegundos = Math.round((Date.now() - inicio) / 1000);
    fs.writeFileSync(path.join(emAndamento, 'manifest.json'), JSON.stringify(manifesto, null, 2) + '\n', { mode: 0o400 });
    fs.renameSync(emAndamento, path.join(DESTINO, carimbo)); // só agora o snapshot "existe"

    const ret = aplicarRetencao();
    const total = Object.values(manifesto.arquivos).reduce((s, x) => s + x.bytes, 0);
    gravarStatus({ ok: true, snapshot: carimbo, em: new Date().toISOString(), duracaoSegundos: manifesto.duracaoSegundos, bytesLogicos: total, retencao: ret, snapshotsGuardados: snapshotsCompletos().length });
    log(`CONCLUÍDO em ${manifesto.duracaoSegundos}s — snapshots guardados: ${snapshotsCompletos().length}`);
  } finally {
    if (!SIMULAR) fs.rmSync(trava, { force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  principal().catch((e) => {
    console.error(`[backup] FALHOU: ${e.message}`);
    gravarStatus({ ok: false, em: new Date().toISOString(), motivo: e.message });
    process.exit(1);
  });
}

/*
 * BACKUP_COPIA_EXTERNA — pendente, depende de uma decisão que não é técnica: PARA ONDE enviar.
 * Qualquer destino serve (storage da TrustIT, S3, outro servidor da prefeitura), desde que:
 *   - receba CIFRADO: segredos/ contém senhas de banco e chaves;
 *   - seja de outra máquina/disco, senão não protege de perda da VM.
 * Quando houver destino, o ponto de encaixe é depois do rename do snapshot, em principal().
 */
