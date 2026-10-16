#!/usr/bin/env node
/**
 * Corrige uma lacuna na política pública do Directus: a permissão de leitura
 * de `directus_files` nunca incluiu o campo `filename_download`.
 *
 * Descoberto em 2026-09-11: a página de licitações pede
 * `arquivo.filename_download` (pra montar o link de download com o nome
 * certo do arquivo). Sem permissão nesse campo, o Directus recusa a
 * consulta INTEIRA com 403 — não só o campo — e `lib/directus.ts` (que
 * trata 403 como "coleção indisponível") engole o erro e mostra "Nenhum
 * documento anexado", mesmo com os PDFs cadastrados certinho. Afetava
 * TODAS as licitações com anexo, não só as importadas do site antigo.
 *
 * Não existe script anterior que gerencie essa permissão — foi configurada
 * por fora (provavelmente na hora que a pasta "publicos" foi criada), sem
 * ficar versionada. Este script existe pra isso não se perder de novo se a
 * política pública precisar ser reconstruída do zero.
 *
 *   node infra/directus/corrigir-permissao-arquivos-publicos.mjs
 *
 * Idempotente: só adiciona o campo se ele ainda não estiver lá.
 */
import { readFileSync } from 'node:fs';

function carregarEnv(caminho) {
  const env = {};
  try {
    for (const linha of readFileSync(caminho, 'utf-8').split('\n')) {
      const l = linha.trim();
      if (!l || l.startsWith('#')) continue;
      const i = l.indexOf('=');
      if (i === -1) continue;
      env[l.slice(0, i)] = l.slice(i + 1);
    }
  } catch {}
  return env;
}
const envArquivo = carregarEnv('/opt/portal-cambui/.env');
const BASE = (process.env.DIRECTUS_INTERNAL_URL || envArquivo.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const TOKEN = process.env.DIRECTUS_TOKEN || envArquivo.DIRECTUS_TOKEN_ESQUEMA;
if (!TOKEN) throw new Error('Defina DIRECTUS_TOKEN (ou DIRECTUS_TOKEN_ESQUEMA no .env).');

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, { ...opcoes,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(opcoes.headers ?? {}) } });
  if (!r.ok) throw new Error(`${opcoes.method ?? 'GET'} ${caminho} → ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : (await r.json()).data;
}

const CAMPO = 'filename_download';

const politica = (await api(`/policies?filter[name][_eq]=${encodeURIComponent('$t:public_label')}&fields=id,name`))[0];
if (!politica) throw new Error('Política pública ($t:public_label) não encontrada.');

const permissoes = await api(`/permissions?filter[policy][_eq]=${politica.id}&filter[collection][_eq]=directus_files&filter[action][_eq]=read&fields=id,fields`);
if (permissoes.length === 0) throw new Error('Permissão de leitura pública de directus_files não encontrada — nada pra corrigir aqui, o problema é outro.');

for (const p of permissoes) {
  const campos = Array.isArray(p.fields) ? p.fields : [];
  if (campos.includes(CAMPO) || campos.includes('*')) {
    console.log(`permissão ${p.id}: já tem "${CAMPO}", nada a fazer.`);
    continue;
  }
  const novos = [...campos, CAMPO];
  await api(`/permissions/${p.id}`, { method: 'PATCH', body: JSON.stringify({ fields: novos }) });
  console.log(`permissão ${p.id}: adicionado "${CAMPO}" — campos agora: ${novos.join(', ')}`);
}
