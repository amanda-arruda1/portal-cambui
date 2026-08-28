#!/usr/bin/env node
/**
 * Teste de ponta a ponta da assinatura: gera um PDF, assina, confere, adultera
 * e confirma que a adulteração é RECUSADA.
 *
 * O caso que mais importa é o terceiro: anexar conteúdo depois de um PDF
 * assinado deixa a assinatura "conferindo" para a parte antiga. Um verificador
 * ingênuo mostra selo verde num documento alterado — e é assim que se falsifica
 * um ato administrativo sem quebrar criptografia nenhuma.
 */
import assert from 'node:assert/strict';
import { stringParaPdf } from './cromo.mjs';
import { assinarPdf } from './assinatura.mjs';
import { garantirCertificadoDemo } from './certificado-demo.mjs';
import { verificarPdf } from '../../apps/web/src/lib/diario/verificar.mjs';
import { readFile } from 'node:fs/promises';

let passou = 0;
const teste = (nome, f) => {
  try { f(); passou++; console.log(`  ✓ ${nome}`); }
  catch (e) { console.error(`  ✗ ${nome}\n    ${e.message}`); process.exitCode = 1; }
};

console.log('\nassinatura e verificação de PDF\n');

const certs = await garantirCertificadoDemo({ silencioso: true });
const ancora = await readFile(certs.raizCert, 'utf8');

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Prova</title>
<style>@page{size:A4;margin:20mm}h2{page-break-before:always}</style></head><body>
<h1 id="topo">Sumário</h1><ul><li><a href="#m1">Portaria 1</a></li></ul>
<h2 id="m1">Portaria nº 1/2026</h2><p>Texto com acentuação: ação, órgão, três.</p></body></html>`;

const original = await stringParaPdf(html);
const assinado = await assinarPdf(original, {
  certificado: certs.signCert, chave: certs.signChave, cadeia: certs.raizCert,
  signatario: 'SIGNATÁRIO DE DEMONSTRAÇÃO',
});

teste('o PDF original permanece intacto dentro do assinado', () => {
  assert.ok(assinado.subarray(0, original.length).equals(original));
});

const bom = verificarPdf(assinado, { ancoras: [ancora] });
teste('PDF íntegro é aceito', () => {
  assert.equal(bom.assinado, true);
  assert.equal(bom.integro, true, bom.detalhe);
  assert.equal(bom.cobreTudo, true);
  assert.equal(bom.confiavel, true);
  assert.equal(bom.padrao, 'ETSI.CAdES.detached');
});

teste('o signatário lido é o certificado de assinatura, não a autoridade certificadora', () => {
  assert.match(bom.signatario ?? '', /SIGNATARIO/i);
  assert.match(bom.emissor ?? '', /AC DEMONSTRACAO/i);
});

teste('o certificado estava válido na data da assinatura', () => {
  assert.equal(bom.validoNaAssinatura, true);
});

teste('um único bit trocado no miolo é DETECTADO', () => {
  const falso = Buffer.from(assinado);
  const alvo = falso.indexOf(Buffer.from('/Type /Page'));
  falso[alvo + 400] ^= 0x01;
  const r = verificarPdf(falso, { ancoras: [ancora] });
  assert.equal(r.integro, false, 'adulteração passou despercebida');
  assert.match(r.detalhe, /ADULTERADO/);
});

teste('conteúdo ANEXADO depois da assinatura é DETECTADO', () => {
  const anexado = Buffer.concat([assinado, Buffer.from('\n% conteudo acrescentado depois\n')]);
  const r = verificarPdf(anexado, { ancoras: [ancora] });
  assert.equal(r.integro, true, 'a assinatura ainda confere para a parte antiga — é esperado');
  assert.equal(r.cobreTudo, false, 'ATAQUE NÃO DETECTADO: a assinatura não cobria o arquivo inteiro e passou');
  assert.match(r.detalhe, /acrescentado DEPOIS/);
});

teste('PDF sem assinatura é reconhecido como tal', () => {
  const r = verificarPdf(original);
  assert.equal(r.assinado, false);
});

teste('cadeia desconhecida NÃO é declarada confiável', () => {
  const r = verificarPdf(assinado, { ancoras: [] });
  assert.equal(r.integro, true, 'integridade não depende da âncora');
  assert.equal(r.confiavel, false, 'sem âncora, não se pode afirmar confiança');
});

console.log(`\n${passou} teste(s) passaram.\n`);
