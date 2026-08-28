/**
 * Fecha uma edição: monta o PDF, descobre a paginação, assina e devolve os
 * metadados que a edição precisa guardar.
 *
 * A ordem importa e não é arbitrária:
 *   1. renderiza sem números de página  → descobre em que página cada matéria caiu
 *   2. renderiza de novo com o sumário correto
 *   3. calcula o SHA-256 do PDF NÃO assinado (é o que a certidão referencia)
 *   4. assina
 *   5. calcula o SHA-256 do PDF ASSINADO (é o que a página de autenticidade compara)
 *
 * O passo 5 é o que vale para o cidadão: ele baixa o arquivo assinado, e é o
 * hash DELE que tem de bater. Guardar só o hash do não assinado — erro fácil —
 * faria toda conferência por upload falhar.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { stringParaPdf } from './cromo.mjs';
import { assinarPdf } from './assinatura.mjs';
import { htmlDaEdicao, cabecalhoRodape, recursos, qrPara, localizador, tituloDoAto } from './documento.mjs';
import { textoDe, referenciaCitacao } from '../../apps/web/src/lib/diario/dominio.mjs';

const exec = promisify(execFile);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/** Texto de cada página do PDF. O pdftotext separa páginas com \f. */
async function textoPorPagina(pdf) {
  const pasta = await mkdtemp(join(tmpdir(), 'diario-pag-'));
  try {
    const arquivo = join(pasta, 'e.pdf');
    await writeFile(arquivo, pdf);
    const { stdout } = await exec('pdftotext', ['-layout', '-enc', 'UTF-8', arquivo, '-']);
    return stdout.split('\f');
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Mapa localizador → número da página, lido do PDF já renderizado.
 * Procura a PRIMEIRA página que contém o localizador, ignorando o sumário
 * (que também o contém? não: o sumário mostra o título, não o localizador —
 * é por isso que o localizador serve de âncora sem ambiguidade).
 */
function mapearPaginas(paginas, materias) {
  const mapa = new Map();
  for (const m of materias) {
    const alvo = m.localizador;
    const i = paginas.findIndex((p) => p.includes(alvo));
    if (i >= 0) mapa.set(alvo, i + 1);
  }
  return mapa;
}

/**
 * Prepara as matérias no formato que o documento espera.
 *
 * ATENÇÃO: devolve na ordem do DOCUMENTO (caderno, depois ordem), que NÃO é a
 * ordem em que elas vieram. Todo consumidor deve casar por `id`, nunca por
 * posição — indexar uma lista pela outra atribui a página de uma matéria a
 * outra, e a página errada vai para a referência de citação.
 */
export function prepararMaterias({ edicao, materias, cadernos, rotuloTipo, nomeOrgao }) {
  const ordenadas = [...materias].sort((a, b) => {
    const ca = cadernos.findIndex((c) => c.id === a.caderno) - cadernos.findIndex((c) => c.id === b.caderno);
    return ca !== 0 ? ca : (a.ordem ?? 0) - (b.ordem ?? 0);
  });
  return ordenadas.map((m, i) => {
    const caderno = cadernos.find((c) => c.id === m.caderno);
    const ementa = textoDe(m.ementa);
    return {
      ...m,
      cadernoSlug: caderno?.slug ?? 'executivo',
      orgao: nomeOrgao(m),
      titulo: tituloDoAto(m, rotuloTipo(m.tipo_ato)),
      ementa,
      ementaCurta: ementa.length > 120 ? ementa.slice(0, 117).trimEnd() + '…' : ementa,
      localizador: localizador(edicao, i + 1),
      remissao: m.remissaoHtml ?? null,
    };
  });
}

/**
 * Gera e assina o PDF de uma edição.
 * @returns {Promise<{pdf:Buffer, totalPaginas:number, sha256:string,
 *                    shaSemAssinatura:string, materias:Array}>}
 */
export async function fecharEdicao({
  veiculo, edicao, cadernos, materias, urlBase,
  certificado, chave, cadeia, signatario, assinar = true,
}) {
  const r = await recursos();
  const urlVerificacao = `${urlBase}/diario-oficial/autenticidade`;
  const qr = await qrPara(`${urlVerificacao}?codigo=${encodeURIComponent(edicao.codigo_verificador ?? '')}`);
  const { cabecalho, rodape } = cabecalhoRodape({
    veiculo, edicao, qr, urlVerificacao, demonstracao: Boolean(edicao.demonstracao),
  });
  const margens = { topo: 0.95, base: 0.85, esquerda: 0, direita: 0 };
  const montar = (paginas) => htmlDaEdicao({ veiculo, edicao, cadernos, materias, recursos: r, qr, urlVerificacao, paginas });

  /* 1ª passada: só para descobrir a paginação. */
  const rascunho = await stringParaPdf(montar(null), { cabecalho, rodape, margens });
  const paginas = mapearPaginas(await textoPorPagina(rascunho), materias);

  /* 2ª passada: sumário com os números certos. A largura da caixa do número é
   * fixa no CSS, então a paginação não se move entre as duas passadas. */
  let pdf = await stringParaPdf(montar(paginas), { cabecalho, rodape, margens });

  /* Conferência: se a paginação escorregou, o sumário está mentindo. Melhor
   * falhar aqui do que publicar um sumário que aponta para a página errada. */
  const paginasFinais = await textoPorPagina(pdf);
  const conferencia = mapearPaginas(paginasFinais, materias);
  const divergentes = [...paginas.entries()].filter(([k, v]) => conferencia.get(k) !== v);
  if (divergentes.length) {
    throw new Error(
      `A paginação mudou entre as duas passadas em ${divergentes.length} matéria(s) — ` +
      `o sumário apontaria para a página errada. Primeira divergência: ${divergentes[0][0]} ` +
      `(sumário diz ${divergentes[0][1]}, está na ${conferencia.get(divergentes[0][0])}).`);
  }

  const totalPaginas = paginasFinais.filter((p) => p.trim()).length;
  const shaSemAssinatura = sha256(pdf);

  if (assinar) {
    pdf = await assinarPdf(pdf, {
      certificado, chave, cadeia, signatario,
      motivo: `Publicação da Edição nº ${edicao.numero} do ${veiculo.nome_veiculo}`,
      local: 'Cambuí/MG',
      quando: new Date(edicao.data_disponibilizacao ?? Date.now()),
    });
  }

  /* Atualiza as páginas nas matérias, para gravar no banco. */
  const comPaginas = materias.map((m) => ({ ...m, pagina_inicial: paginas.get(m.localizador) ?? null }));
  /* Página final = a anterior à da próxima matéria, ou o total. */
  for (let i = 0; i < comPaginas.length; i++) {
    const proxima = comPaginas[i + 1]?.pagina_inicial;
    comPaginas[i].pagina_final = proxima ? Math.max(comPaginas[i].pagina_inicial ?? 1, proxima - (proxima > (comPaginas[i].pagina_inicial ?? 1) ? 1 : 0)) : totalPaginas;
    if (comPaginas[i].pagina_final < comPaginas[i].pagina_inicial) comPaginas[i].pagina_final = comPaginas[i].pagina_inicial;
  }

  return { pdf, totalPaginas, sha256: sha256(pdf), shaSemAssinatura, materias: comPaginas, paginas };
}

/* ────────────────────────── certidão de publicação ─────────────────────── */

/**
 * Certidão de Publicação: o documento que o servidor anexa ao processo para
 * PROVAR que o ato foi publicado. Hoje isso se faz com captura de tela, que não
 * prova nada — não tem assinatura, não tem data confiável e qualquer um monta
 * uma no editor de imagens.
 */
export async function emitirCertidao({
  veiculo, edicao, materia, codigo, urlBase, certificado, chave, cadeia, signatario, agora = new Date(),
}) {
  const r = await recursos();
  const urlVerificacao = `${urlBase}/diario-oficial/autenticidade`;
  const qr = await qrPara(`${urlVerificacao}?codigo=${encodeURIComponent(codigo)}`);
  const referencia = referenciaCitacao({ veiculo, edicao, materia });
  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const dataExtenso = agora.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Certidão de Publicação ${esc(codigo)}</title><style>
@font-face{font-family:'Bricolage';src:url('${r.bricolage}') format('woff2');font-weight:200 800}
@font-face{font-family:'Inter';src:url('${r.inter}') format('woff2');font-weight:100 900}
@page{size:A4;margin:25mm 22mm}
body{font-family:'Inter',sans-serif;font-size:10.5pt;line-height:1.65;color:#141C18;margin:0}
h1{font-family:'Bricolage',sans-serif;font-size:17pt;color:#06301C;text-align:center;
   letter-spacing:.02em;margin:0 0 2mm;text-transform:uppercase}
.sub{text-align:center;color:#4C5A51;font-size:8.6pt;margin:0 0 9mm;
     text-transform:uppercase;letter-spacing:.08em}
.topo{display:flex;gap:6mm;align-items:center;border-bottom:2.5pt solid #0C5430;
      padding-bottom:5mm;margin-bottom:8mm}
.topo img{width:22mm;height:22mm;object-fit:contain}
.topo div{font-size:9pt;line-height:1.4}
.topo b{font-family:'Bricolage',sans-serif;font-size:11.5pt;color:#06301C;display:block}
.corpo p{text-align:justify;margin:0 0 4mm;text-indent:10mm}
.ref{background:#F4F7F5;border-left:3pt solid #0C5430;padding:4mm 5mm;margin:6mm 0;
     text-indent:0;font-size:10pt}
.ref b{display:block;font-family:'Bricolage',sans-serif;color:#06301C;
       font-size:8pt;text-transform:uppercase;letter-spacing:.06em;margin-bottom:1.5mm}
.dados{width:100%;border-collapse:collapse;margin:6mm 0;font-size:9.2pt}
.dados th{text-align:left;padding:2mm 3mm 2mm 0;color:#4C5A51;font-weight:600;
          width:44mm;vertical-align:top;font-size:8.4pt;text-transform:uppercase;letter-spacing:.04em}
.dados td{padding:2mm 0;border-bottom:.5pt solid #C9D2CC}
.local{text-align:center;margin:10mm 0 0;font-size:10pt}
.selo{margin-top:9mm;padding-top:5mm;border-top:1pt solid #C9D2CC;
      display:flex;gap:5mm;align-items:center;font-size:7.8pt;color:#4C5A51;line-height:1.45}
.selo img{width:22mm;height:22mm;flex:none}
.selo .cod{font-family:'Bricolage',monospace;font-size:11pt;font-weight:700;
           letter-spacing:.08em;color:#06301C}
.aviso{margin-top:6mm;font-size:7.6pt;color:#4C5A51;text-align:justify;
       border-top:.5pt solid #C9D2CC;padding-top:3mm}
${edicao.demonstracao ? `.marca{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.marca span{font-family:'Bricolage',sans-serif;font-weight:700;font-size:24pt;color:rgba(168,48,60,.13);
            transform:rotate(-30deg);text-align:center;line-height:1.6}` : ''}
</style></head><body>
${edicao.demonstracao ? `<div class="marca"><span>DOCUMENTO FICTÍCIO<br>AMBIENTE DE DEMONSTRAÇÃO</span></div>` : ''}
<div class="topo">
  <img src="${r.brasao}" alt="">
  <div><b>${esc(veiculo.ente)}</b>${esc(veiculo.responsavel_publicacao ?? '')}
  ${veiculo.cnpj ? `<br>CNPJ ${esc(veiculo.cnpj)}` : ''}</div>
</div>

<h1>Certidão de Publicação</h1>
<p class="sub">${esc(veiculo.nome_veiculo)}</p>

<div class="corpo">
<p><b>CERTIFICO</b>, para os devidos fins de direito e a pedido de parte interessada, que o
ato adiante identificado foi publicado no ${esc(veiculo.nome_veiculo)}, órgão oficial de
publicidade dos atos deste Município${veiculo.lei_numero ? `, instituído pela ${esc(veiculo.lei_numero)}` : ''},
na forma e na data abaixo especificadas.</p>

<table class="dados">
  <tr><th>Ato</th><td>${esc(materia.titulo)}</td></tr>
  <tr><th>Ementa</th><td>${esc(materia.ementa)}</td></tr>
  <tr><th>Órgão de origem</th><td>${esc(materia.orgao ?? '—')}</td></tr>
  ${materia.processo_administrativo ? `<tr><th>Processo</th><td>${esc(materia.processo_administrativo)}</td></tr>` : ''}
  <tr><th>Edição</th><td>nº ${edicao.numero}, Ano ${esc(String(edicao.volume ?? ''))} (${edicao.ano})</td></tr>
  <tr><th>Disponibilização</th><td>${esc(materia.dataDisponibilizacao)}</td></tr>
  <tr><th>Publicação legal</th><td><b>${esc(materia.dataPublicacaoLegal)}</b> — é desta data que se contam os prazos</td></tr>
  <tr><th>Páginas</th><td>${materia.pagina_inicial ?? '—'}${materia.pagina_final && materia.pagina_final !== materia.pagina_inicial ? ` a ${materia.pagina_final}` : ''}</td></tr>
  <tr><th>Impressão digital da edição</th><td style="word-break:break-all;font-size:7.6pt">SHA-256 ${esc(edicao.sha256 ?? '—')}</td></tr>
</table>

<div class="ref"><b>Referência para citação</b>${esc(referencia)}</div>

<p>A presente certidão é emitida por sistema e assinada digitalmente, dispensando assinatura
manuscrita. Sua autenticidade e a da edição referida podem ser conferidas de forma
independente por qualquer pessoa, no endereço indicado ao pé desta folha.</p>
</div>

<p class="local">Cambuí, Minas Gerais, ${esc(dataExtenso)}.</p>

<div class="selo">
  <img src="${qr}" alt="QR Code de conferência">
  <div><span class="cod">${esc(codigo)}</span><br>
  Confira esta certidão e a edição em ${esc(urlVerificacao)}<br>
  Validador oficial do Governo Federal: https://validar.iti.gov.br</div>
</div>

<p class="aviso">Esta certidão atesta a publicação do ato no órgão oficial deste Município e não
substitui o Portal Nacional de Contratações Públicas (PNCP) nem o Diário Oficial do Estado,
onde a lei os exigir. Em caso de divergência entre esta certidão e o arquivo assinado da
edição, prevalece o arquivo assinado.</p>
</body></html>`;

  let pdf = await stringParaPdf(html, { margens: { topo: 0, base: 0, esquerda: 0, direita: 0 } });
  pdf = await assinarPdf(pdf, {
    certificado, chave, cadeia, signatario,
    motivo: `Certidão de publicação ${codigo}`, local: 'Cambuí/MG', quando: agora,
  });
  return { pdf, sha256: sha256(pdf), referencia };
}
