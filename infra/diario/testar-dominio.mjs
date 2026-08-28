#!/usr/bin/env node
/**
 * Testes do núcleo do domínio — as regras cujo erro custa prazo.
 * Sem framework: são asserções, e `node --test` traria mais cerimônia do que
 * valor para 30 casos.
 */
import assert from 'node:assert/strict';
import * as d from '../../apps/web/src/lib/diario/dominio.mjs';

let passou = 0;
const teste = (nome, f) => {
  try { f(); passou++; console.log(`  ✓ ${nome}`); }
  catch (e) { console.error(`  ✗ ${nome}\n    ${e.message}`); process.exitCode = 1; }
};

console.log('\nnúcleo do Diário Oficial\n');

teste('Páscoa calculada corretamente (conferida contra o calendário)', () => {
  assert.equal(d.pascoa(2024).toISOString().slice(0, 10), '2024-03-31');
  assert.equal(d.pascoa(2025).toISOString().slice(0, 10), '2025-04-20');
  assert.equal(d.pascoa(2026).toISOString().slice(0, 10), '2026-04-05');
  assert.equal(d.pascoa(2027).toISOString().slice(0, 10), '2027-03-28');
});

teste('feriados móveis derivam da Páscoa', () => {
  assert.equal(d.nomeFeriado('2026-02-17'), 'Carnaval');
  assert.equal(d.nomeFeriado('2026-04-03'), 'Sexta-feira Santa');
  assert.equal(d.nomeFeriado('2026-06-04'), 'Corpus Christi');
});

teste('dia útil ignora fim de semana e feriado', () => {
  assert.equal(d.ehDiaUtil('2026-08-28'), true);   // sexta
  assert.equal(d.ehDiaUtil('2026-08-29'), false);  // sábado
  assert.equal(d.ehDiaUtil('2026-04-21'), false);  // Tiradentes
});

teste('publicação legal: sexta → segunda', () => {
  assert.equal(d.publicacaoLegal('2026-09-11').toISOString().slice(0, 10), '2026-09-14');
});

teste('publicação legal pula feriado — 20/04 vai para 22/04 por causa de Tiradentes', () => {
  assert.equal(d.publicacaoLegal('2026-04-20').toISOString().slice(0, 10), '2026-04-22');
});

teste('publicação legal respeita a regra do veículo', () => {
  assert.equal(d.publicacaoLegal('2026-09-11', 'mesmo_dia').toISOString().slice(0, 10), '2026-09-11');
  assert.equal(d.publicacaoLegal('2026-09-11', 'dia_seguinte_corrido').toISOString().slice(0, 10), '2026-09-12');
});

teste('fuso não desloca a data (o bug clássico de -03)', () => {
  assert.equal(d.dataBr('2026-01-01'), '01/01/2026');
  assert.equal(d.dataBr(new Date(Date.UTC(2026, 0, 1))), '01/01/2026');
});

teste('referência de citação no formato exigido em formulário', () => {
  assert.equal(
    d.referenciaCitacao({
      veiculo: { nome_veiculo: 'Diário Oficial Eletrônico do Município de Cambuí' },
      edicao: { volume: 5, numero: 412, data_publicacao_legal: '2026-09-12' },
      materia: { pagina_inicial: 7, pagina_final: 8 },
    }),
    'Publicado no Diário Oficial Eletrônico do Município de Cambuí, Ano V, Edição nº 412, de 12/09/2026, páginas 7 a 8.');
});

teste('citação com página única diz "página", não "páginas"', () => {
  const t = d.referenciaCitacao({
    veiculo: { nome_veiculo: 'X' }, edicao: { volume: 1, numero: 9, data_publicacao_legal: '2026-01-05' },
    materia: { pagina_inicial: 3, pagina_final: 3 },
  });
  assert.ok(t.includes('página 3.'), t);
});

teste('código verificador é estável e sem caracteres ambíguos', () => {
  const c = d.codigoVerificador('edicao-412-2026');
  assert.equal(c, d.codigoVerificador('edicao-412-2026'));
  assert.match(c, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.ok(!/[IO01]/.test(c), 'não pode conter I, O, 0 nem 1 — ninguém dita isso ao telefone sem errar');
});

teste('CPF sai sempre mascarado', () => {
  assert.equal(d.mascararCpf('12345678909'), '***.456.789-**');
  assert.equal(d.mascararCpf('123.456.789-09'), '***.456.789-**');
  assert.equal(d.mascararCpf('123'), null);
});

teste('detector de dado sensível acha CPF sem máscara e CEP', () => {
  const r = d.rastrearSensiveis('Nomeia JOÃO, CPF 123.456.789-09, residente na rua X, CEP 37600-000.');
  const chaves = r.map((x) => x.chave);
  assert.ok(chaves.includes('cpf_completo'));
  assert.ok(chaves.includes('cep_residencial'));
});

teste('detector NÃO acusa CPF já mascarado', () => {
  const r = d.rastrearSensiveis('CPF ***.456.789-**');
  assert.ok(!r.some((x) => x.chave === 'cpf_completo'));
});

teste('reconhece citação de ato como gente escreve', () => {
  assert.deepEqual(d.reconhecerAto('Decreto 1.245/2026'), { tipo_ato: 'decreto', numero: '1245', ano: 2026 });
  assert.deepEqual(d.reconhecerAto('portaria nº 88 de 2025'), { tipo_ato: 'portaria', numero: '88', ano: 2025 });
  assert.deepEqual(d.reconhecerAto('lei complementar 12/24'), { tipo_ato: 'lei_complementar', numero: '12', ano: 2024 });
  assert.equal(d.reconhecerAto('padaria'), null);
  assert.equal(d.reconhecerAto('merenda escolar'), null);
});

teste('romano para o "Ano V" da citação', () => {
  assert.equal(d.romano(1), 'I');
  assert.equal(d.romano(5), 'V');
  assert.equal(d.romano(9), 'IX');
  assert.equal(d.romano(14), 'XIV');
});

teste('normalizar tira acento para a busca', () => {
  assert.equal(d.normalizar('Exoneração de Servidor'), 'exoneracao de servidor');
});

teste('textoDe extrai texto legível do HTML', () => {
  assert.equal(d.textoDe('<p>Art. 1º <strong>Fica</strong> nomeado.</p><p>Art. 2º Vigora.</p>').replace(/\n+/g, ' | '),
    'Art. 1º Fica nomeado. | Art. 2º Vigora.');
});

console.log(`\n${passou} teste(s) passaram.\n`);
