#!/usr/bin/env node
/**
 * Gera o par de certificados do AMBIENTE DE DEMONSTRAÇÃO.
 *
 * ISTO NÃO É ICP-BRASIL E NÃO PODE SER USADO EM PRODUÇÃO. Existe para que a
 * cadeia inteira — assinar, verificar, detectar adulteração — funcione de ponta
 * a ponta sem depender de um certificado real, que custa dinheiro e não deve
 * circular em ambiente de teste. O nome comum diz isso em letras maiúsculas
 * justamente para que ninguém confunda numa captura de tela.
 *
 * Em produção troca-se por: A1 (arquivo .pfx no cofre do servidor) ou A3
 * (token, assinado fora e enviado por upload). Ver ARQUITETURA.md.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const exec = promisify(execFile);
const PASTA = process.env.DIARIO_CERT_DIR || '/opt/portal-cambui/data/diario/certificados';

export const CAMINHOS = {
  pasta: PASTA,
  raizChave: join(PASTA, 'ac-demo.key'),
  raizCert: join(PASTA, 'ac-demo.pem'),
  signChave: join(PASTA, 'signatario-demo.key'),
  signCert: join(PASTA, 'signatario-demo.pem'),
};

const existe = (c) => access(c).then(() => true, () => false);

/** Formata para o [CC]YYMMDDHHMMSSZ que o OpenSSL espera — sem o "T" do ISO,
 *  que ele recusa com "start date is invalid". */
const carimbo = (d) => d.toISOString().replace(/[-:T]/g, '').replace(/\.\d{3}/, '');

export async function garantirCertificadoDemo({ silencioso = false } = {}) {
  await mkdir(PASTA, { recursive: true, mode: 0o750 });
  if (await existe(CAMINHOS.signCert)) {
    if (!silencioso) console.log('= certificados de demonstração já existem');
    return CAMINHOS;
  }

  const dizer = (m) => { if (!silencioso) console.log(m); };

  /* Validade começa 4 anos atrás.
   *
   * Não é truque: o acervo de demonstração cobre 24 meses, e cada edição é
   * assinada com a data em que teria circulado. Um certificado emitido hoje
   * marcaria TODAS as edições históricas como "assinadas fora da validade" —
   * um alarme falso em cada página, que ensinaria o avaliador a ignorar o
   * alarme. Em produção, o certificado é o real e a validade é a que ele tem. */
  const inicio = new Date(Date.now() - 4 * 365 * 86400_000);
  const fim = new Date(Date.now() + 6 * 365 * 86400_000);

  dizer('+ autoridade certificadora de demonstração');
  await exec('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256',
    '-not_before', carimbo(inicio), '-not_after', carimbo(fim),
    '-keyout', CAMINHOS.raizChave, '-out', CAMINHOS.raizCert,
    '-subj', '/C=BR/ST=Minas Gerais/L=Cambui/O=AMBIENTE DE DEMONSTRACAO/OU=Portal Cambui/CN=AC DEMONSTRACAO - NAO E ICP-BRASIL',
    '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);

  dizer('+ certificado do signatário de demonstração');
  const pedido = join(PASTA, 'signatario-demo.csr');
  await exec('openssl', ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256',
    '-keyout', CAMINHOS.signChave, '-out', pedido,
    '-subj', '/C=BR/ST=Minas Gerais/L=Cambui/O=Municipio de Cambui/OU=Diario Oficial Eletronico/CN=SIGNATARIO DE DEMONSTRACAO - DADOS FICTICIOS']);

  const ext = join(PASTA, 'signatario.ext');
  /* keyUsage nonRepudiation é o que caracteriza certificado de assinatura, e
   * não de autenticação de servidor. Validadores olham isso. */
  await writeFile(ext, [
    'basicConstraints=critical,CA:FALSE',
    'keyUsage=critical,digitalSignature,nonRepudiation',
    'extendedKeyUsage=emailProtection',
    'subjectKeyIdentifier=hash',
    'authorityKeyIdentifier=keyid,issuer',
  ].join('\n') + '\n');

  await exec('openssl', ['x509', '-req', '-in', pedido, '-CA', CAMINHOS.raizCert, '-CAkey', CAMINHOS.raizChave,
    '-CAcreateserial', '-out', CAMINHOS.signCert, '-sha256', '-extfile', ext,
    '-not_before', carimbo(new Date(inicio.getTime() + 86400_000)),
    '-not_after', carimbo(new Date(fim.getTime() - 86400_000))]);

  dizer(`✓ certificados de demonstração em ${PASTA}`);
  return CAMINHOS;
}

if (import.meta.url === `file://${process.argv[1]}`) await garantirCertificadoDemo();
