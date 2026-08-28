/**
 * Núcleo do Órgão Oficial: as regras que precisam dar a MESMA resposta no
 * portal, no painel, no gerador de PDF e no seed.
 *
 * Escrito em .mjs (com tipos em dominio.d.ts) de propósito: os scripts de
 * infraestrutura são Node puro e o portal é TypeScript. Uma segunda
 * implementação da contagem de prazo, ainda que idêntica hoje, é uma bomba com
 * temporizador — no dia em que uma delas mudar, um prazo passa a ser calculado
 * de dois jeitos e alguém perde um recurso.
 */

/* ───────────────────────────── feriados ─────────────────────────────────── */

/**
 * Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano).
 * Carnaval, Sexta-feira Santa e Corpus Christi são todos deslocamentos dele —
 * e todos caem em dia útil, então mexem na contagem de prazo.
 */
export function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const somarDias = (data, n) => new Date(data.getTime() + n * 86_400_000);
const iso = (d) => d.toISOString().slice(0, 10);

/**
 * Feriados que suspendem expediente em Cambuí/MG, por ano.
 *
 * TODO(cliente): confirmar com a Procuradoria a lista municipal. Os nacionais e
 * o estadual (21/04, Tiradentes, já é nacional) estão corretos; os municipais
 * abaixo são PLAUSÍVEIS e precisam de conferência antes da virada:
 *   • 08/12 — Nossa Senhora da Conceição, padroeira (data tradicional)
 *   • aniversário do município
 * Enquanto não confirmados, a página do órgão oficial diz que o calendário é
 * provisório, em vez de fingir precisão que não temos.
 */
export function feriados(ano) {
  const p = pascoa(ano);
  const lista = [
    [`${ano}-01-01`, 'Confraternização Universal'],
    [iso(somarDias(p, -48)), 'Carnaval'],
    [iso(somarDias(p, -47)), 'Carnaval'],
    [iso(somarDias(p, -2)), 'Sexta-feira Santa'],
    [`${ano}-04-21`, 'Tiradentes'],
    [`${ano}-05-01`, 'Dia do Trabalho'],
    [iso(somarDias(p, 60)), 'Corpus Christi'],
    [`${ano}-09-07`, 'Independência'],
    [`${ano}-10-12`, 'Nossa Senhora Aparecida'],
    [`${ano}-11-02`, 'Finados'],
    [`${ano}-11-15`, 'Proclamação da República'],
    [`${ano}-11-20`, 'Consciência Negra'],
    [`${ano}-12-08`, 'Nossa Senhora da Conceição — padroeira (TODO: confirmar)'],
    [`${ano}-12-25`, 'Natal'],
  ];
  return new Map(lista);
}

const cacheFeriados = new Map();
function feriadosDe(ano) {
  if (!cacheFeriados.has(ano)) cacheFeriados.set(ano, feriados(ano));
  return cacheFeriados.get(ano);
}

/** Aceita Date ou 'AAAA-MM-DD' e devolve sempre uma data em UTC, sem hora.
 *  Sem isto, o fuso -03 empurra a data um dia para trás na virada — bug que
 *  num diário oficial significa publicar com data errada. */
export function comoDia(v) {
  if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  const [a, m, d] = String(v).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

export function ehFeriado(data) {
  const d = comoDia(data);
  return feriadosDe(d.getUTCFullYear()).has(iso(d));
}

export function nomeFeriado(data) {
  const d = comoDia(data);
  return feriadosDe(d.getUTCFullYear()).get(iso(d)) ?? null;
}

export function ehDiaUtil(data) {
  const d = comoDia(data);
  const semana = d.getUTCDay();
  return semana !== 0 && semana !== 6 && !ehFeriado(d);
}

export function proximoDiaUtil(data) {
  let d = somarDias(comoDia(data), 1);
  while (!ehDiaUtil(d)) d = somarDias(d, 1);
  return d;
}

/* ──────────────────────── as duas datas do diário ───────────────────────── */

/**
 * A partir da DISPONIBILIZAÇÃO (quando o PDF foi ao ar), calcula a data de
 * PUBLICAÇÃO PARA FINS LEGAIS — a que conta prazo.
 *
 * Quem manda é a lei municipal instituidora, por isso a regra é parâmetro. A
 * mais comum em diário eletrônico municipal espelha o art. 4º, §3º da Lei
 * 11.419/2006: publica-se no primeiro dia útil seguinte ao da disponibilização.
 *
 * @param {Date|string} disponibilizacao
 * @param {'primeiro_dia_util_seguinte'|'mesmo_dia'|'dia_seguinte_corrido'} regra
 * @returns {Date}
 */
export function publicacaoLegal(disponibilizacao, regra = 'primeiro_dia_util_seguinte') {
  const d = comoDia(disponibilizacao);
  switch (regra) {
    case 'mesmo_dia': return d;
    case 'dia_seguinte_corrido': return somarDias(d, 1);
    case 'primeiro_dia_util_seguinte':
    default: return proximoDiaUtil(d);
  }
}

/**
 * Explicação em português do que aquelas duas datas significam para quem tem
 * prazo correndo. Vai literalmente para a tela — não é comentário.
 */
export function explicarPrazo(disponibilizacao, publicacao, regra) {
  const mesmo = iso(comoDia(disponibilizacao)) === iso(comoDia(publicacao));
  if (mesmo) {
    return 'Nesta edição, a data de disponibilização e a de publicação legal coincidem: ' +
      'o prazo começa a contar a partir do primeiro dia útil seguinte a esta data.';
  }
  return 'O arquivo foi disponibilizado no portal em uma data e considera-se PUBLICADO em outra. ' +
    'Prazo se conta a partir da data de publicação legal — ' +
    (regra === 'primeiro_dia_util_seguinte'
      ? 'aqui, o primeiro dia útil seguinte à disponibilização.'
      : 'conforme a regra fixada na lei que instituiu este veículo.');
}

/* ─────────────────────────── citação e códigos ──────────────────────────── */

const ROMANOS = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];

export function romano(n) {
  let resto = Math.max(1, Math.trunc(n)), saida = '';
  for (const [valor, letra] of ROMANOS) while (resto >= valor) { saida += letra; resto -= valor; }
  return saida;
}

export const dataBr = (v) => {
  const d = comoDia(v);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
};

/**
 * A referência de citação, no formato que se preenche em edital e em formulário
 * de tribunal de contas. É a razão de ser mais concreta deste módulo: hoje o
 * servidor monta essa frase à mão e erra o número da página.
 *
 * "Publicado no Diário Oficial Eletrônico do Município de Cambuí, Ano V,
 *  Edição nº 412, de 12/09/2026, páginas 7 a 8."
 */
export function referenciaCitacao({ veiculo, edicao, materia }) {
  const partes = [`Publicado no ${veiculo?.nome_veiculo ?? 'Diário Oficial Eletrônico'}`];
  if (edicao?.volume) partes.push(`Ano ${romano(edicao.volume)}`);
  partes.push(`Edição nº ${edicao?.numero}`);
  partes.push(`de ${dataBr(edicao?.data_publicacao_legal)}`);

  const ini = materia?.pagina_inicial, fim = materia?.pagina_final;
  if (ini && fim && fim > ini) partes.push(`páginas ${ini} a ${fim}`);
  else if (ini) partes.push(`página ${ini}`);

  return partes.join(', ') + '.';
}

/** Código verificador: curto, sem caracteres ambíguos, legível ao telefone.
 *  Sem I, O, 0 e 1 — ninguém consegue ditar "IlO0" sem errar. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function codigoVerificador(semente) {
  let h = 0x811c9dc5;
  for (const c of String(semente)) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  let saida = '';
  for (let i = 0; i < 12; i++) { saida += ALFABETO[h % ALFABETO.length]; h = Math.imul(h ^ (h >>> 7), 0x01000193) >>> 0; }
  return `${saida.slice(0, 4)}-${saida.slice(4, 8)}-${saida.slice(8, 12)}`;
}

/* ──────────────────────────────── LGPD ──────────────────────────────────── */

/**
 * CPF sempre mascarado na exibição pública: ***.456.789-**
 * Publicidade legal autoriza publicar o ato, não expor o documento inteiro de
 * quem é objeto dele. CNPJ de pessoa jurídica é público e sai inteiro.
 */
export function mascararCpf(cpf) {
  const so = String(cpf ?? '').replace(/\D/g, '');
  if (so.length !== 11) return null;
  return `***.${so.slice(3, 6)}.${so.slice(6, 9)}-**`;
}

/** Padrões que NÃO deveriam aparecer no corpo de uma matéria. Serve para o
 *  painel avisar ANTES de publicar — depois de publicado, não há desfazer. */
export const PADROES_SENSIVEIS = [
  { chave: 'cpf_completo', rotulo: 'CPF sem máscara',
    re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
    conselho: 'Mascare como ***.456.789-** antes de publicar.' },
  { chave: 'rg', rotulo: 'Número de RG',
    re: /\bRG\s*n?[º°.:]?\s*[\d.\-/]{5,}/gi,
    conselho: 'Documento de identidade não é necessário para a publicidade do ato.' },
  { chave: 'cep_residencial', rotulo: 'Endereço com CEP',
    re: /\b\d{5}-?\d{3}\b/g,
    conselho: 'Endereço residencial de pessoa física não deve ser publicado.' },
  { chave: 'cns', rotulo: 'Cartão Nacional de Saúde',
    re: /\b[1-2]\d{14}\b/g,
    conselho: 'Dado de saúde. Não publique.' },
  { chave: 'menor', rotulo: 'Possível menção a menor de idade',
    re: /\b(menor|adolescente|criança)\b[^.]{0,60}\b(nascid[oa]|CPF|filh[oa])\b/gi,
    conselho: 'Dado de criança e adolescente exige cuidado redobrado (ECA e LGPD, art. 14).' },
];

export function rastrearSensiveis(texto) {
  const limpo = String(texto ?? '').replace(/<[^>]*>/g, ' ');
  const achados = [];
  for (const p of PADROES_SENSIVEIS) {
    const ocorrencias = limpo.match(p.re);
    if (ocorrencias?.length) {
      achados.push({ chave: p.chave, rotulo: p.rotulo, conselho: p.conselho,
        quantidade: ocorrencias.length, exemplo: ocorrencias[0] });
    }
  }
  return achados;
}

/* ───────────────────────────── texto e busca ────────────────────────────── */

/** Sem acento, minúsculo. Usado na busca e nos slugs. */
export const normalizar = (t) => String(t ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function paraSlug(t) {
  return normalizar(t).replace(/<[^>]*>/g, ' ').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 90);
}

/** Texto puro a partir do HTML do corpo, para busca e para o resumo. */
export function textoDe(html) {
  return String(html ?? '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    /* Espaço no início da linha vem das tags fechadas: sem aparar, ele aparece
     * no trecho da busca e no resumo, e fica visível para o cidadão. */
    .replace(/^[ \t]+/gm, '').replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Reconhece a citação de um ato escrita como gente escreve:
 * "Decreto 1.245/2026", "decreto nº 1245 de 2026", "portaria 88/25".
 * É o que faz a busca levar DIRETO à matéria em vez de listar 40 resultados.
 */
export function reconhecerAto(termo) {
  const t = normalizar(termo).replace(/\s+/g, ' ').trim();
  const tipos = [
    ['lei complementar', 'lei_complementar'], ['lei', 'lei'], ['decreto', 'decreto'],
    ['portaria', 'portaria'], ['resolucao', 'resolucao'], ['instrucao normativa', 'instrucao_normativa'],
    ['edital', 'edital'], ['aviso', 'aviso_de_licitacao'], ['termo aditivo', 'termo_aditivo'],
    ['contrato', 'extrato_de_contrato'], ['ata', 'extrato_de_ata_de_registro_de_precos'],
  ];
  for (const [rotulo, valor] of tipos) {
    const re = new RegExp(`^${rotulo}\\s*(?:n?[o°º.]?\\s*)?([\\d.]+)\\s*(?:/|\\s+de\\s+|\\s+)\\s*(\\d{2,4})?`, 'i');
    const m = re.exec(t);
    if (m) {
      const numero = m[1].replace(/\./g, '');
      let ano = m[2] ? Number(m[2]) : null;
      if (ano !== null && ano < 100) ano += ano > 50 ? 1900 : 2000;
      return { tipo_ato: valor, numero, ano };
    }
  }
  return null;
}
