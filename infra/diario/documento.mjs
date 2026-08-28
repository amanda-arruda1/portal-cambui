/**
 * Monta o HTML de uma edição do Diário — que é a fonte tanto do PDF assinado
 * quanto da versão acessível lida na tela.
 *
 * O SUMÁRIO E O PROBLEMA DAS DUAS PASSADAS
 * O número da página de cada matéria só existe depois de paginar, e paginar
 * depende do sumário, que precisa dos números. Resolvido assim: a primeira
 * passada imprime "00" dentro de uma caixa de largura FIXA; descobrimos em que
 * página cada matéria caiu lendo o PDF gerado; a segunda passada troca só o
 * texto dentro daquelas caixas. Como a largura não muda, a paginação da
 * segunda passada é idêntica à da primeira — e o sumário fica correto.
 *
 * Alternativa descartada: medir posições no DOM e dividir pela altura da
 * página. Não funciona, porque quebra de página forçada não aparece nas
 * coordenadas do fluxo contínuo — o sumário sairia errado exatamente nas
 * edições grandes, que são as que mais precisam dele.
 */
import { readFile } from 'node:fs/promises';
import QRCode from 'qrcode';
import { romano, dataBr, explicarPrazo, textoDe } from '../../apps/web/src/lib/diario/dominio.mjs';

const RAIZ = new URL('../../', import.meta.url).pathname;

/* ─────────────────────────────── recursos ──────────────────────────────── */

const cache = new Map();
async function dataUri(caminho, mime) {
  if (cache.has(caminho)) return cache.get(caminho);
  const b = await readFile(caminho);
  const uri = `data:${mime};base64,${b.toString('base64')}`;
  cache.set(caminho, uri);
  return uri;
}

export async function recursos() {
  return {
    /* As MESMAS fontes do portal. O Chromium embute só os glifos usados, então
     * o custo no PDF final é de dezenas de KiB, não das centenas do woff2. */
    bricolage: await dataUri(`${RAIZ}apps/web/public/fontes/bricolage-grotesque.woff2`, 'font/woff2'),
    inter: await dataUri(`${RAIZ}apps/web/public/fontes/inter.woff2`, 'font/woff2'),
    brasao: await dataUri(`${RAIZ}apps/web/public/brasao-simbolo.png`, 'image/png'),
  };
}

export async function qrPara(url) {
  return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 0, scale: 4,
    color: { dark: '#141C18FF', light: '#FFFFFFFF' } });
}

/* ─────────────────────────────── auxiliares ────────────────────────────── */

const escapar = (t) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Rótulo do ato como se lê: "Portaria nº 412/2026". */
export function tituloDoAto(m, rotuloTipo) {
  const partes = [rotuloTipo];
  if (m.numero_ato) partes.push(`nº ${m.numero_ato}${m.ano_ato ? `/${m.ano_ato}` : ''}`);
  return partes.join(' ');
}

/** Localizador da matéria dentro da edição. Serve ao leitor (é o que ele cita
 *  ao telefone) E à segunda passada, que procura por ele no texto do PDF. */
export const localizador = (edicao, indice) => `M${String(edicao.numero).padStart(5, '0')}-${String(indice).padStart(3, '0')}`;

/* ────────────────────────────────── CSS ────────────────────────────────── */

function estilo(r, { demonstracao }) {
  return `
@font-face{font-family:'Bricolage';src:url('${r.bricolage}') format('woff2');font-weight:200 800;font-display:block}
@font-face{font-family:'Inter';src:url('${r.inter}') format('woff2');font-weight:100 900;font-display:block}

/* A4 com margens que suportam encadernação: mais folga na lombada. O diário é
   impresso e arquivado em pasta com furos — margem apertada some no furador. */
@page{size:A4;margin:24mm 16mm 20mm 20mm}

:root{
  --serra:#0C5430; --serra-noite:#06301C; --carmim:#A8303C;
  --tinta:#141C18; --musgo:#4C5A51; --fio:#C9D2CC;
}
*{box-sizing:border-box}
body{margin:0;font-family:'Inter',system-ui,sans-serif;font-size:9.6pt;line-height:1.5;
  color:var(--tinta);font-variant-numeric:tabular-nums;
  /* Hifenização: coluna estreita de diário com palavra longa ("desapropriação")
     abre rios de espaço em branco sem isto. */
  hyphens:auto;-webkit-hyphens:auto;text-align:justify}
h1,h2,h3,h4{font-family:'Bricolage',system-ui,sans-serif;font-weight:600;
  line-height:1.2;text-align:left;hyphens:none;margin:0}

${demonstracao ? `
/* Marca d'água. position:fixed repete em todas as páginas impressas. */
.marca-agua{position:fixed;inset:0;z-index:0;pointer-events:none;
  display:flex;align-items:center;justify-content:center;overflow:hidden}
.marca-agua span{font-family:'Bricolage',sans-serif;font-weight:700;font-size:26pt;
  color:rgba(168,48,60,.13);transform:rotate(-32deg);white-space:nowrap;
  letter-spacing:.06em;text-align:center;line-height:1.7}
.pagina,.capa,.sumario{position:relative;z-index:1}
` : ''}

/* ── capa ───────────────────────────────────────────────────────────────── */
.capa{page-break-after:always;padding-top:2mm}
.capa-topo{display:flex;gap:7mm;align-items:flex-start;
  border-bottom:2.5pt solid var(--serra);padding-bottom:5mm}
.capa-topo img{width:24mm;height:24mm;object-fit:contain;flex:none}
.capa-titulo{flex:1}
.capa-titulo h1{font-size:17pt;color:var(--serra-noite);letter-spacing:-.01em}
.capa-titulo p{margin:1.5mm 0 0;font-size:8.6pt;color:var(--musgo)}
.capa-faixa{display:flex;justify-content:space-between;align-items:baseline;
  margin-top:4mm;font-family:'Bricolage',sans-serif}
.capa-faixa .edicao{font-size:26pt;font-weight:700;color:var(--serra);letter-spacing:-.02em}
.capa-faixa .ano{font-size:10pt;color:var(--musgo)}

.tipo-especial{display:inline-block;margin-top:3mm;padding:1.2mm 3mm;
  background:var(--carmim);color:#fff;font-size:8pt;font-weight:600;
  font-family:'Bricolage',sans-serif;letter-spacing:.04em;text-transform:uppercase}

/* As duas datas, lado a lado e rotuladas. É o bloco mais importante da capa:
   é dele que sai a resposta a "quando começa a contar o meu prazo". */
.datas{display:flex;gap:0;margin:6mm 0;border:1pt solid var(--fio)}
.datas>div{flex:1;padding:3.5mm 4mm}
.datas>div+div{border-left:1pt solid var(--fio);background:#F4F7F5}
.datas dt{font-size:7.4pt;text-transform:uppercase;letter-spacing:.06em;
  color:var(--musgo);font-weight:600;margin:0}
.datas dd{margin:1mm 0 0;font-family:'Bricolage',sans-serif;font-size:13pt;
  font-weight:600;color:var(--serra-noite)}
.datas .nota{margin:1.5mm 0 0;font-size:7.4pt;color:var(--musgo);line-height:1.4}
.aviso-prazo{font-size:8pt;color:var(--musgo);border-left:2.5pt solid var(--serra);
  padding-left:3.5mm;margin:0 0 6mm}

.expediente{display:grid;grid-template-columns:1fr 1fr;gap:3mm 8mm;margin-top:6mm;
  padding-top:4mm;border-top:1pt solid var(--fio);font-size:8.4pt}
.expediente .cargo{color:var(--musgo);font-size:7.4pt;text-transform:uppercase;letter-spacing:.05em}
.expediente .nome{font-weight:600}
.rodape-capa{margin-top:6mm;padding-top:4mm;border-top:1pt solid var(--fio);
  font-size:7.6pt;color:var(--musgo);line-height:1.5;text-align:left}
.verificacao{display:flex;gap:5mm;align-items:center;margin-top:4mm}
.verificacao img{width:20mm;height:20mm}
.verificacao .codigo{font-family:'Bricolage',monospace;font-size:11pt;font-weight:700;
  letter-spacing:.08em;color:var(--serra-noite)}

/* ── sumário ────────────────────────────────────────────────────────────── */
.sumario{page-break-after:always}
.sumario>h2{font-size:15pt;color:var(--serra-noite);
  border-bottom:2pt solid var(--serra);padding-bottom:2.5mm;margin-bottom:5mm}
.sumario h3{font-size:10pt;color:var(--serra);margin:5mm 0 2mm;
  text-transform:uppercase;letter-spacing:.05em}
.sumario h4{font-size:8.6pt;color:var(--musgo);margin:3mm 0 1.5mm;font-weight:500}
.sumario ol{list-style:none;margin:0;padding:0}
.sumario li{display:flex;align-items:baseline;gap:2mm;padding:1.1mm 0;
  border-bottom:.5pt dotted var(--fio);font-size:8.6pt;text-align:left}
.sumario li a{color:var(--tinta);text-decoration:none;flex:1;hyphens:none}
.sumario .ato{font-weight:600;color:var(--serra-noite)}
/* Largura FIXA: é o que garante que a segunda passada não mude a paginação. */
.sumario .pag{flex:none;width:9mm;text-align:right;font-weight:600;color:var(--serra)}

/* ── matérias ───────────────────────────────────────────────────────────── */
.caderno-abre{page-break-before:always;margin:0 0 5mm;padding-bottom:2.5mm;
  border-bottom:2pt solid var(--serra)}
.caderno-abre h2{font-size:13pt;color:var(--serra-noite);text-transform:uppercase;letter-spacing:.05em}
.caderno-abre p{margin:1.5mm 0 0;font-size:8pt;color:var(--musgo);text-align:left}

.materia{margin:0 0 7mm;page-break-inside:auto}
/* Nunca deixar o título órfão no pé da página: cabeçalho e as primeiras
   linhas caminham juntos. */
.materia-cab{page-break-after:avoid;page-break-inside:avoid;margin-bottom:2.5mm}
.materia-orgao{font-size:7.6pt;text-transform:uppercase;letter-spacing:.06em;
  color:var(--musgo);font-weight:600}
.materia-cab h3{font-size:11pt;color:var(--serra-noite);margin:.8mm 0}
.materia-ementa{font-size:8.8pt;color:var(--musgo);font-style:italic;
  margin:0;padding-left:3mm;border-left:2pt solid var(--fio)}
.materia-loc{float:right;font-size:7pt;color:var(--musgo);
  font-family:'Bricolage',monospace;letter-spacing:.05em}
.materia-corpo{orphans:3;widows:3}
.materia-corpo p{margin:0 0 2.2mm}
.materia-corpo h4{font-size:9.2pt;margin:3.5mm 0 1.5mm;color:var(--serra-noite)}
.materia-corpo ul,.materia-corpo ol{margin:0 0 2.5mm;padding-left:6mm}
.materia-corpo li{margin-bottom:1mm}
.materia-corpo table{width:100%;border-collapse:collapse;margin:2.5mm 0;font-size:8pt}
.materia-corpo th,.materia-corpo td{border:.5pt solid var(--fio);padding:1.2mm 2mm;text-align:left}
.materia-corpo th{background:#EEF2EF;font-weight:600;color:var(--serra-noite)}
.materia-corpo thead{display:table-header-group} /* cabeçalho repete a cada página */
.materia-corpo blockquote{margin:2.5mm 0;padding-left:4mm;border-left:2pt solid var(--fio);color:var(--musgo)}
.assina{margin-top:3mm;font-size:8.4pt;text-align:left}
.assina .nome{font-weight:600}
.assina .cargo{color:var(--musgo);font-size:7.8pt}

.remissao{margin-top:2.5mm;padding:2mm 3mm;background:#FBF3F4;
  border-left:2.5pt solid var(--carmim);font-size:8pt;text-align:left}
.remissao strong{color:var(--carmim)}

.anulada-faixa{margin:0 0 6mm;padding:3mm 4mm;border:1.5pt solid var(--carmim);
  background:#FBF3F4;text-align:left}
.anulada-faixa strong{color:var(--carmim);font-family:'Bricolage',sans-serif;
  display:block;font-size:10pt;margin-bottom:1mm}
.anulada-faixa p{margin:0;font-size:8.2pt}

.encerramento{margin-top:8mm;padding-top:4mm;border-top:1pt solid var(--fio);
  font-size:7.8pt;color:var(--musgo);text-align:left;line-height:1.5}
`;
}

/* ──────────────────────────── cabeçalho e rodapé ───────────────────────── */

/** Templates que o Chromium repete em TODA página. Só aceitam CSS embutido. */
export function cabecalhoRodape({ veiculo, edicao, qr, urlVerificacao, demonstracao }) {
  const nome = escapar(veiculo.nome_curto || veiculo.nome_veiculo);
  const comum = 'font-family:Arial,Helvetica,sans-serif;color:#4C5A51;width:100%;';

  const cabecalho = `<div style="${comum}font-size:6.8pt;padding:0 20mm 0 20mm;">
    <div style="display:flex;justify-content:space-between;align-items:center;
                border-bottom:.5pt solid #C9D2CC;padding-bottom:1mm;">
      <span style="font-weight:700;color:#0C5430;">${nome}</span>
      <span>Edição nº ${edicao.numero} — ${escapar(dataBr(edicao.data_publicacao_legal))}${demonstracao ? ' — DEMONSTRAÇÃO' : ''}</span>
    </div></div>`;

  /* O QR e o código verificador vão no RODAPÉ DE TODA PÁGINA, e não só na
   * capa, porque folha de diário circula solta: alguém imprime a página 7 e a
   * anexa a um processo. Aquela folha, sozinha, tem de dizer como se confere. */
  const rodape = `<div style="${comum}font-size:6.4pt;padding:0 20mm;">
    <div style="display:flex;justify-content:space-between;align-items:center;
                border-top:.5pt solid #C9D2CC;padding-top:1.2mm;gap:4mm;">
      <div style="display:flex;align-items:center;gap:2mm;flex:1;">
        <img src="${qr}" style="width:9mm;height:9mm;" alt="">
        <span style="line-height:1.3;">Confira a autenticidade em<br>
          <span style="color:#141C18;">${escapar(urlVerificacao)}</span><br>
          Código: <b style="letter-spacing:.06em;">${escapar(edicao.codigo_verificador ?? '')}</b></span>
      </div>
      <span style="text-align:right;white-space:nowrap;">
        Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
    </div></div>`;

  return { cabecalho, rodape };
}

/* ──────────────────────────────── documento ────────────────────────────── */

/**
 * @param {object} o
 * @param {object} o.veiculo
 * @param {object} o.edicao
 * @param {Array}  o.cadernos    [{slug,nome,descricao,ordem}]
 * @param {Array}  o.materias    já ordenadas, com {caderno, orgao, tipoRotulo, ...}
 * @param {object} o.recursos
 * @param {string} o.qr
 * @param {string} o.urlVerificacao
 * @param {Map<string,number>} [o.paginas]  localizador → página (2ª passada)
 */
export function htmlDaEdicao(o) {
  const { veiculo, edicao, cadernos, materias, recursos: r, qr, urlVerificacao, paginas } = o;
  const demonstracao = Boolean(edicao.demonstracao);

  const porCaderno = cadernos
    .map((c) => ({ caderno: c, itens: materias.filter((m) => m.cadernoSlug === c.slug) }))
    .filter((g) => g.itens.length);

  /* ── sumário ── */
  const sumario = porCaderno.map((g) => {
    const porOrgao = new Map();
    for (const m of g.itens) {
      const chave = m.orgao || 'Prefeitura Municipal de Cambuí';
      if (!porOrgao.has(chave)) porOrgao.set(chave, []);
      porOrgao.get(chave).push(m);
    }
    const blocos = [...porOrgao.entries()].map(([orgao, itens]) => `
      <h4>${escapar(orgao)}</h4>
      <ol>${itens.map((m) => {
        const pag = paginas?.get(m.localizador);
        return `<li><a href="#${escapar(m.localizador)}"><span class="ato">${escapar(m.titulo)}</span> — ${escapar(m.ementaCurta)}</a><span class="pag">${pag ?? '00'}</span></li>`;
      }).join('')}</ol>`).join('');
    return `<h3>${escapar(g.caderno.nome)}</h3>${blocos}`;
  }).join('');

  /* ── corpo ── */
  const corpo = porCaderno.map((g) => `
    <section class="caderno-abre">
      <h2>${escapar(g.caderno.nome)}</h2>
      ${g.caderno.descricao ? `<p>${escapar(g.caderno.descricao)}</p>` : ''}
    </section>
    ${g.itens.map((m) => `
      <article class="materia" id="${escapar(m.localizador)}">
        <header class="materia-cab">
          <span class="materia-loc">${escapar(m.localizador)}</span>
          <div class="materia-orgao">${escapar(m.orgao || 'Prefeitura Municipal de Cambuí')}</div>
          <h3>${escapar(m.titulo)}</h3>
          <p class="materia-ementa">${escapar(m.ementa)}</p>
        </header>
        ${m.remissao ? `<div class="remissao">${m.remissao}</div>` : ''}
        <div class="materia-corpo">${m.corpo ?? ''}</div>
        ${m.assinaturaNome ? `<div class="assina">
          <div class="nome">${escapar(m.assinaturaNome)}</div>
          <div class="cargo">${escapar(m.assinaturaCargo ?? '')}</div></div>` : ''}
      </article>`).join('')}
  `).join('');

  const disp = dataBr(edicao.data_disponibilizacao);
  const legal = dataBr(edicao.data_publicacao_legal);
  const expediente = Array.isArray(veiculo.expediente) ? veiculo.expediente : [];

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>${escapar(veiculo.nome_veiculo)} — Edição nº ${edicao.numero} de ${legal}</title>
<meta name="author" content="${escapar(veiculo.ente)}">
<style>${estilo(r, { demonstracao })}</style></head>
<body>
${demonstracao ? `<div class="marca-agua" aria-hidden="true"><span>DOCUMENTO FICTÍCIO<br>AMBIENTE DE DEMONSTRAÇÃO</span></div>` : ''}

<section class="capa">
  <div class="capa-topo">
    <img src="${r.brasao}" alt="Brasão do Município de Cambuí">
    <div class="capa-titulo">
      <h1>${escapar(veiculo.nome_veiculo)}</h1>
      <p>${escapar(veiculo.ente)}${veiculo.cnpj ? ` — CNPJ ${escapar(veiculo.cnpj)}` : ''}</p>
      <div class="capa-faixa">
        <span class="edicao">Edição nº ${edicao.numero}</span>
        <span class="ano">Ano ${romano(edicao.volume ?? 1)} — ${edicao.ano}</span>
      </div>
      ${edicao.tipo !== 'ordinaria' ? `<span class="tipo-especial">Edição ${escapar(edicao.tipo === 'extraordinaria' ? 'Extraordinária' : 'Suplementar')}</span>` : ''}
    </div>
  </div>

  ${edicao.anulada ? `<div class="anulada-faixa">
    <strong>EDIÇÃO ANULADA</strong>
    <p>Esta edição circulou e foi posteriormente anulada${edicao.anulada_em ? ` em ${escapar(dataBr(edicao.anulada_em))}` : ''}.
    Permanece acessível porque o ato de anulação também é público.
    ${escapar(edicao.anulada_justificativa ?? '')}</p></div>` : ''}

  <dl class="datas">
    <div>
      <dt>Disponibilização</dt>
      <dd>${disp}</dd>
      <p class="nota">Dia em que este arquivo assinado foi publicado no portal.</p>
    </div>
    <div>
      <dt>Publicação legal</dt>
      <dd>${legal}</dd>
      <p class="nota">Data que conta prazo, nos termos da lei que instituiu este veículo.</p>
    </div>
  </dl>
  <p class="aviso-prazo">${escapar(explicarPrazo(edicao.data_disponibilizacao, edicao.data_publicacao_legal, veiculo.regra_prazo))}</p>

  ${edicao.justificativa_extraordinaria ? `<p class="aviso-prazo"><b>Justificativa da edição extraordinária:</b> ${escapar(edicao.justificativa_extraordinaria)}</p>` : ''}

  ${expediente.length ? `<div class="expediente">${expediente.map((e) => `
    <div><div class="cargo">${escapar(e.cargo)}</div><div class="nome">${escapar(e.nome)}</div></div>`).join('')}</div>` : ''}

  <div class="rodape-capa">
    ${veiculo.lei_numero ? `<p style="margin:0 0 2mm"><b>Veículo oficial instituído pela ${escapar(veiculo.lei_numero)}${veiculo.lei_data ? `, de ${escapar(dataBr(veiculo.lei_data))}` : ''}.</b>
      ${veiculo.lei_ementa ? escapar(veiculo.lei_ementa) : ''}</p>` : ''}
    ${veiculo.responsavel_publicacao ? `<p style="margin:0 0 1mm">Responsável pela publicação: ${escapar(veiculo.responsavel_publicacao)}.</p>` : ''}
    ${veiculo.endereco ? `<p style="margin:0">${escapar(veiculo.endereco)}${veiculo.telefone ? ` — ${escapar(veiculo.telefone)}` : ''}</p>` : ''}
    <div class="verificacao">
      <img src="${qr}" alt="QR Code para conferir a autenticidade desta edição">
      <div>
        <div class="codigo">${escapar(edicao.codigo_verificador ?? '')}</div>
        <div style="margin-top:1mm">Confira a autenticidade em ${escapar(urlVerificacao)}</div>
      </div>
    </div>
    ${veiculo.nota_legal ? `<p style="margin:3mm 0 0">${escapar(veiculo.nota_legal)}</p>` : ''}
  </div>
</section>

<section class="sumario">
  <h2>Sumário desta edição</h2>
  ${sumario || '<p>Esta edição não contém matérias estruturadas.</p>'}
</section>

${corpo}

<div class="encerramento">
  <p>Fim da Edição nº ${edicao.numero}, de ${legal}. Total de matérias: ${materias.length}.</p>
  <p>Documento assinado digitalmente. A conferência de autenticidade é feita em
     ${escapar(urlVerificacao)} com o código ${escapar(edicao.codigo_verificador ?? '')},
     ou no validador oficial do Governo Federal em https://validar.iti.gov.br.</p>
</div>
</body></html>`;
}
