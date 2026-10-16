#!/usr/bin/env node
/**
 * Migra o acervo de Patrimônio Cultural do site antigo para 'patrimonio_documentos'.
 *
 *   DIRECTUS_TOKEN=<token de admin ou de serviço> node infra/directus/patrimonio/migrar.mjs
 *   ... --simular      baixa nada, só mostra o que faria
 *
 * Fonte: as 7 subpáginas de "O Município > Patrimônio Cultural" no site
 * antigo (prefeituradecambui.mg.gov.br/o-municipio/patrimonio-cultural/...),
 * levantadas por leitura direta em 2026-09-03 — a busca automática (WebFetch)
 * levou 403 nas páginas HTML (proteção da Cloudflare), mas os PDFs em si são
 * públicos e respondem normalmente a um fetch comum; por isso este script
 * baixa cada um e reenvia para o Directus, em vez de só linkar a URL antiga
 * (que não é nossa para manter no ar).
 *
 * ÚNICA EXCEÇÃO: o inventário de 2025 vive em ecrie.com.br, sistema de
 * terceiro — fica como 'url_externa', não é baixado nem re-hospedado aqui.
 *
 * Título e período são o texto exatamente como aparece no site antigo, não o
 * nome do arquivo (que diverge em alguns casos — ex.: o PDF do inventário de
 * "2022" chama-se "CBU-EX-2024-DIVULGACAO.pdf" na origem).
 *
 * Idempotente por (categoria, titulo, periodo): rodar de novo não duplica.
 */
import { DOCUMENTOS, PAGINAS } from './dados.mjs';

function slugificar(texto) {
  return texto
    .normalize('NFD')
    // Intervalo escapado de propósito (sinais combinantes, invisíveis aqui) —
    // mesma regra de apps/web/src/lib/painel/campos.ts:gerarSlug.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const SIMULAR = process.argv.includes('--simular');

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
  if (!r.ok) throw new Error(`Login: HTTP ${r.status} ${await r.text()}`);
  return (await r.json()).data.access_token;
}

const token = SIMULAR && !process.env.DIRECTUS_TOKEN && !process.env.DIRECTUS_EMAIL ? null : await obterToken();

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opcoes.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(opcoes.headers ?? {}),
    },
  });
  if (!r.ok) {
    const detalhe = opcoes.body instanceof FormData ? '(multipart)' : String(opcoes.body ?? '').slice(0, 500);
    throw new Error(`${opcoes.method ?? 'GET'} ${caminho} → HTTP ${r.status} ${(await r.text()).slice(0, 400)}\n  corpo: ${detalhe}`);
  }
  return r.status === 204 ? null : (await r.json()).data;
}

if (SIMULAR && !token) {
  console.log(`${DOCUMENTOS.length} documento(s) seriam migrados, ${PAGINAS.length} página(s) seriam criadas/atualizadas.`);
  for (const d of DOCUMENTOS) console.log(`+ [${d.categoria}] ${d.titulo}${d.periodo ? ` (${d.periodo})` : ''}`);
  process.exit(0);
}

const pasta = (await api('/folders?limit=-1&fields=id,name')).find((f) => f.name === 'publicos');
if (!pasta) throw new Error("Pasta 'publicos' não existe no Directus.");

const secretarias = await api('/items/secretarias?limit=-1&fields=id,nome');
const secretaria = secretarias.find((s) => s.nome.includes('Cultura e Turismo'));
if (!secretaria) throw new Error('Secretaria "Cultura e Turismo" não encontrada — cadastre-a antes de migrar.');

let criados = 0;
let pulados = 0;
let falhas = 0;

for (const d of DOCUMENTOS) {
  const filtro = new URLSearchParams({
    'filter[categoria][_eq]': d.categoria,
    'filter[titulo][_eq]': d.titulo,
    ...(d.periodo ? { 'filter[periodo][_eq]': d.periodo } : { 'filter[periodo][_null]': 'true' }),
    limit: '1',
    fields: 'id',
  });
  const existentes = await api(`/items/patrimonio_documentos?${filtro}`);
  if (existentes.length > 0) {
    console.log(`= [${d.categoria}] ${d.titulo}${d.periodo ? ` (${d.periodo})` : ''}: já existe, pulando.`);
    pulados += 1;
    continue;
  }

  const corpo = {
    status: 'publicado',
    categoria: d.categoria,
    titulo: d.titulo,
    periodo: d.periodo ?? null,
    secretaria: secretaria.id,
    arquivo: null,
    url_externa: null,
  };

  if (SIMULAR) {
    console.log(`+ [${d.categoria}] ${d.titulo}${d.periodo ? ` (${d.periodo})` : ''} — criaria (${d.urlExterna ? 'link externo' : 'baixaria PDF'}).`);
    criados += 1;
    continue;
  }

  if (d.urlExterna) {
    corpo.url_externa = d.urlExterna;
  } else {
    console.log(`  baixando: ${d.url}`);
    let resposta;
    try {
      resposta = await fetch(d.url);
    } catch (erro) {
      console.error(`! [${d.categoria}] ${d.titulo}${d.periodo ? ` (${d.periodo})` : ''}: falha de rede (${erro.message}) — pulando, o link já estava quebrado ou instável na origem.`);
      falhas += 1;
      continue;
    }
    if (!resposta.ok) {
      console.error(`! [${d.categoria}] ${d.titulo}${d.periodo ? ` (${d.periodo})` : ''}: HTTP ${resposta.status} em ${d.url} — pulando, o link já estava quebrado na origem (site antigo).`);
      falhas += 1;
      continue;
    }
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    // Nome do arquivo derivado do TÍTULO, não da URL de origem: alguns nomes
    // de arquivo do site antigo têm bytes Latin-1 soltos (ex.: "%ed" de um í
    // isolado) que não formam UTF-8 válido — decodeURIComponent quebra neste
    // caso real ("livro_do_patrimonio_cambu%ed_2009_2010.pdf").
    const nomeArquivo = `${slugificar(d.titulo)}${d.periodo ? `-${slugificar(d.periodo)}` : ''}.pdf`;

    const forma = new FormData();
    forma.append('folder', pasta.id);
    forma.append('title', d.titulo);
    forma.append('file', new Blob([bytes], { type: 'application/pdf' }), nomeArquivo);
    const arquivo = await api('/files', { method: 'POST', body: forma });
    corpo.arquivo = arquivo.id;
  }

  await api('/items/patrimonio_documentos', { method: 'POST', body: JSON.stringify(corpo) });
  console.log(`+ [${d.categoria}] ${d.titulo}${d.periodo ? ` (${d.periodo})` : ''}: criado.`);
  criados += 1;
}

for (const p of PAGINAS) {
  const filtro = new URLSearchParams({ 'filter[slug][_eq]': p.slug, limit: '1', fields: 'id' });
  const existentes = await api(`/items/paginas?${filtro}`);
  if (existentes.length > 0) {
    console.log(`= página "${p.slug}": já existe, não sobrescrevendo (edite pelo painel).`);
    continue;
  }
  if (SIMULAR) {
    console.log(`+ página "${p.slug}": criaria.`);
    continue;
  }
  await api('/items/paginas', {
    method: 'POST',
    body: JSON.stringify({ status: 'publicado', titulo: p.titulo, slug: p.slug, conteudo: p.conteudo }),
  });
  console.log(`+ página "${p.slug}": criada.`);
}

console.log(`\n${criados} documento(s) migrado(s), ${pulados} já existiam, ${falhas} falharam (link quebrado na origem — ver linhas "!" acima).`);
if (falhas > 0) process.exitCode = 1;
