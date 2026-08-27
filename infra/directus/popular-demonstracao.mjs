#!/usr/bin/env node
/**
 * Popula o portal com conteúdo ILUSTRATIVO, para ver como ele fica antes de
 * existir conteúdo real — e remove tudo com um comando.
 *
 *   DIRECTUS_EMAIL=<admin> DIRECTUS_SENHA=<...> node popular-demonstracao.mjs --aplicar
 *   DIRECTUS_EMAIL=<admin> DIRECTUS_SENHA=<...> node popular-demonstracao.mjs --remover
 *   node popular-demonstracao.mjs --simular
 *
 * REVERSIBILIDADE É O PONTO. Todo item criado tem o id anotado em
 * data/demonstracao.json; o --remover apaga exatamente esses ids e mais nada.
 * Conteúdo que a prefeitura tenha escrito no meio não é tocado.
 *
 * Esse mesmo arquivo é o que faz o site inteiro exibir a faixa vermelha de
 * "versão de demonstração" (apps/web/src/lib/demonstracao.ts). O aviso está
 * amarrado ao DADO, não ao domínio: esquecer de remover antes da virada faz o
 * alarme aparecer no site oficial, em vez de o conteúdo falso passar batido.
 */
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const MARCACAO = new URL('../../data/demonstracao.json', import.meta.url);

const modo = process.argv.includes('--remover')
  ? 'remover'
  : process.argv.includes('--aplicar')
    ? 'aplicar'
    : 'simular';

const conteudo = JSON.parse(await readFile(new URL('./demonstracao.json', import.meta.url), 'utf8'));

/* ---------- imagens ilustrativas, geradas aqui ---------- */

/**
 * PNG de gradiente, escrito à mão.
 *
 * Sem dependência e, principalmente, sem baixar foto de banco de imagens: uma
 * fotografia daria ao conteúdo falso uma aparência de reportagem real. Um
 * gradiente abstrato é honesto — parece o que é, um espaço reservado.
 */
function pngGradiente(largura, altura, [r1, g1, b1], [r2, g2, b2]) {
  const linhas = [];
  for (let y = 0; y < altura; y++) {
    const t = y / (altura - 1);
    const linha = Buffer.alloc(1 + largura * 3);
    linha[0] = 0; // filtro "none"
    for (let x = 0; x < largura; x++) {
      // Leve variação horizontal para o gradiente não ficar chapado.
      const u = t * 0.85 + (x / largura) * 0.15;
      linha[1 + x * 3] = Math.round(r1 + (r2 - r1) * u);
      linha[2 + x * 3] = Math.round(g1 + (g2 - g1) * u);
      linha[3 + x * 3] = Math.round(b1 + (b2 - b1) * u);
    }
    linhas.push(linha);
  }

  const bloco = (tipo, dados) => {
    const t = Buffer.from(tipo, 'ascii');
    const tamanho = Buffer.alloc(4);
    tamanho.writeUInt32BE(dados.length, 0);
    const soma = Buffer.alloc(4);
    soma.writeUInt32BE(crc32(Buffer.concat([t, dados])) >>> 0, 0);
    return Buffer.concat([tamanho, t, dados, soma]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(Buffer.concat(linhas), { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

/* Paleta aprovada do portal — a imagem ilustrativa não inventa cor nova. */
const IMAGENS = {
  capacitacao: { de: [35, 74, 142], para: [26, 56, 104], alt: 'Imagem ilustrativa em tons de azul.' },
  limpeza: { de: [46, 125, 50], para: [26, 56, 104], alt: 'Imagem ilustrativa em tons de verde e azul.' },
  saude: { de: [158, 43, 43], para: [139, 35, 50], alt: 'Imagem ilustrativa em tons de vermelho.' },
  educacao: { de: [176, 141, 87], para: [35, 74, 142], alt: 'Imagem ilustrativa em tons de dourado e azul.' },
};

/* ---------- conversa com o Directus ---------- */

async function obterToken() {
  if (process.env.DIRECTUS_TOKEN) return process.env.DIRECTUS_TOKEN;
  const email = process.env.DIRECTUS_EMAIL;
  const senha = process.env.DIRECTUS_SENHA;
  if (!email || !senha) throw new Error('Defina DIRECTUS_TOKEN, ou DIRECTUS_EMAIL e DIRECTUS_SENHA.');
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  });
  if (!r.ok) throw new Error(`Falha no login: HTTP ${r.status} ${await r.text()}`);
  return (await r.json()).data.access_token;
}

let token = null;

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opcoes.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(opcoes.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error(`${opcoes.method ?? 'GET'} ${caminho} → HTTP ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : (await r.json()).data;
}

const criar = (colecao, item) => api(`/items/${colecao}`, { method: 'POST', body: JSON.stringify(item) });

/** Data no passado, a partir de "dias_atras", para a listagem não sair toda
 *  com o mesmo carimbo. */
function dataRelativa(dias) {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

/* ---------- simulação ---------- */

if (modo === 'simular') {
  console.log('\n=== SIMULAÇÃO — nada será escrito ===\n');
  for (const [colecao, itens] of Object.entries(conteudo)) {
    if (colecao.startsWith('_')) continue;
    console.log(`${colecao} (${itens.length})`);
    for (const i of itens) console.log(`   · ${i.titulo ?? i.nome}`);
    console.log('');
  }
  console.log(`Imagens ilustrativas geradas aqui: ${Object.keys(IMAGENS).length} (gradientes, 1200×630).`);
  console.log(`Marcação de reversão: ${MARCACAO.pathname}`);
  console.log('\nTudo entra como "publicado" e sai inteiro com --remover.\n');
  process.exit(0);
}

token = await obterToken();

/* ---------- remoção ---------- */

if (modo === 'remover') {
  if (!existsSync(MARCACAO)) {
    console.log('Não há demonstração aplicada (arquivo de marcação ausente). Nada a fazer.');
    process.exit(0);
  }
  const marcacao = JSON.parse(await readFile(MARCACAO, 'utf8'));

  for (const [colecao, ids] of Object.entries(marcacao.itens ?? {})) {
    if (!ids.length) continue;
    // Um a um, de propósito: se um item já tiver sido apagado à mão, o resto
    // ainda sai. Em lote, um id inexistente derrubaria a remoção inteira.
    let removidos = 0;
    for (const id of ids) {
      try {
        await api(`/items/${colecao}/${id}`, { method: 'DELETE' });
        removidos++;
      } catch (erro) {
        console.warn(`  ! ${colecao}/${id}: ${erro.message.slice(0, 80)}`);
      }
    }
    console.log(`  - ${colecao}: ${removidos}/${ids.length} removidos`);
  }

  let arquivos = 0;
  for (const id of marcacao.arquivos ?? []) {
    try {
      await api(`/files/${id}`, { method: 'DELETE' });
      arquivos++;
    } catch (erro) {
      console.warn(`  ! arquivo ${id}: ${erro.message.slice(0, 80)}`);
    }
  }
  if (arquivos) console.log(`  - arquivos: ${arquivos} removidos`);

  await unlink(MARCACAO);
  console.log('\nDemonstração removida. A faixa de aviso some em até 30 segundos.\n');
  process.exit(0);
}

/* ---------- aplicação ---------- */

if (existsSync(MARCACAO)) {
  console.error('Já existe demonstração aplicada. Rode --remover antes de aplicar de novo.');
  process.exit(1);
}

const marcacao = { criado_em: new Date().toISOString(), itens: {}, arquivos: [] };
const anotar = (colecao, id) => ((marcacao.itens[colecao] ??= []).push(id), id);

console.log(`Directus em ${BASE}\n`);

// 1. imagens
console.log('==> imagens ilustrativas');
const idPorImagem = {};
for (const [nome, cfg] of Object.entries(IMAGENS)) {
  const png = pngGradiente(1200, 630, cfg.de, cfg.para);
  const forma = new FormData();
  forma.append('title', `Imagem ilustrativa — ${nome}`);
  forma.append('description', cfg.alt);
  forma.append('file', new Blob([png], { type: 'image/png' }), `demo-${nome}.png`);
  const arquivo = await api('/files', { method: 'POST', body: forma });
  idPorImagem[nome] = arquivo.id;
  marcacao.arquivos.push(arquivo.id);
  console.log(`  + demo-${nome}.png (${(png.length / 1024).toFixed(0)} KB)`);
}

// 2. secretarias — precisam vir antes, as demais apontam para elas
console.log('==> secretarias');
const idPorSecretaria = {};
for (const s of conteudo.secretarias) {
  const criada = await criar('secretarias', { ...s, status: 'publicado' });
  idPorSecretaria[s.slug] = anotar('secretarias', criada.id);
  console.log(`  + ${s.nome}`);
}

const vincular = (slug) => (slug ? (idPorSecretaria[slug] ?? null) : null);

console.log('==> notícias');
for (const n of conteudo.noticias) {
  const { dias_atras, secretaria, imagem, ...resto } = n;
  const criada = await criar('noticias', {
    ...resto,
    status: 'publicado',
    data_publicacao: dataRelativa(dias_atras),
    secretaria: vincular(secretaria),
    imagem: imagem ? idPorImagem[imagem] : null,
    imagem_descricao: imagem ? IMAGENS[imagem].alt : null,
  });
  anotar('noticias', criada.id);
  console.log(`  + ${n.titulo}`);
}

console.log('==> serviços');
for (const s of conteudo.servicos) {
  const { secretaria, ...resto } = s;
  const criado = await criar('servicos', { ...resto, status: 'publicado', secretaria: vincular(secretaria) });
  anotar('servicos', criado.id);
  console.log(`  + ${s.nome}`);
}

console.log('==> documentos');
for (const d of conteudo.documentos) {
  const { dias_atras, secretaria, ...resto } = d;
  const criado = await criar('documentos', {
    ...resto,
    status: 'publicado',
    data_documento: dataRelativa(dias_atras).slice(0, 10),
    secretaria: vincular(secretaria),
  });
  anotar('documentos', criado.id);
  console.log(`  + ${d.titulo}`);
}

console.log('==> páginas');
for (const p of conteudo.paginas) {
  const criada = await criar('paginas', { ...p, status: 'publicado', atualizado_em: new Date().toISOString() });
  anotar('paginas', criada.id);
  console.log(`  + ${p.titulo}`);
}

console.log('==> links úteis');
for (const l of conteudo.links_uteis) {
  const criado = await criar('links_uteis', { ...l, status: 'publicado' });
  anotar('links_uteis', criado.id);
  console.log(`  + ${l.nome}`);
}

await writeFile(MARCACAO, JSON.stringify(marcacao, null, 2) + '\n', { mode: 0o644 });

const total = Object.values(marcacao.itens).reduce((s, v) => s + v.length, 0);
console.log(`\n${total} itens e ${marcacao.arquivos.length} imagens criados.`);
console.log(`Marcação em ${MARCACAO.pathname} — é ela que faz o site exibir a faixa de aviso.`);
console.log('\nPara desfazer:  node infra/directus/popular-demonstracao.mjs --remover\n');
