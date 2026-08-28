/**
 * Fábrica de conteúdo fictício do Diário Oficial.
 *
 * REGRAS QUE VALEM AQUI:
 *   • Nenhuma pessoa e nenhuma empresa real. Nomes montados por combinação, com
 *     razões sociais genéricas de município pequeno.
 *   • CPF e CNPJ com dígito verificador VÁLIDO — porque a interface tem de ser
 *     testada com o que ela vai receber. CPF nunca aparece inteiro em tela.
 *   • Datas relativas ao momento do seed. Data fixa envelhece e, num diário, um
 *     acervo que termina em 2024 parece sistema abandonado.
 *   • Sorteio determinístico: o mesmo seed produz o mesmo acervo. Sem isso,
 *     "reproduza o erro da edição 118" é impossível.
 */
import { paraSlug, publicacaoLegal, ehDiaUtil, comoDia, romano } from '../../../apps/web/src/lib/diario/dominio.mjs';

/* ─────────────────────── sorteio determinístico ─────────────────────────── */

export function criarSorteio(semente = 20260828) {
  let s = semente >>> 0;
  const proximo = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  return {
    real: proximo,
    inteiro: (min, max) => min + Math.floor(proximo() * (max - min + 1)),
    de: (lista) => lista[Math.floor(proximo() * lista.length)],
    talvez: (p) => proximo() < p,
    /** Sorteio com peso: [{item, peso}]. */
    pesado(lista) {
      const total = lista.reduce((a, i) => a + i.peso, 0);
      let r = proximo() * total;
      for (const i of lista) { r -= i.peso; if (r <= 0) return i.item; }
      return lista.at(-1).item;
    },
    embaralhar(lista) {
      const c = [...lista];
      for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(proximo() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
      return c;
    },
  };
}

/* ──────────────────────────── documentos ────────────────────────────────── */

function digitos(base, pesos) {
  const soma = base.reduce((a, d, i) => a + d * pesos[i], 0);
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

/** CPF sintaticamente válido. Só existe para provar a máscara — nunca sai inteiro. */
export function cpfFicticio(sorteio) {
  const base = Array.from({ length: 9 }, () => sorteio.inteiro(0, 9));
  const d1 = digitos(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitos([...base, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, d1, d2].join('');
}

export function cnpjFicticio(sorteio) {
  const base = [...Array.from({ length: 8 }, () => sorteio.inteiro(0, 9)), 0, 0, 0, 1];
  const d1 = digitos(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitos([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const t = [...base, d1, d2].join('');
  return `${t.slice(0, 2)}.${t.slice(2, 5)}.${t.slice(5, 8)}/${t.slice(8, 12)}-${t.slice(12)}`;
}

/* ─────────────────────────── nomes fictícios ────────────────────────────── */

const PRENOMES = ['Adriana', 'Alcides', 'Aparecida', 'Benedito', 'Cláudia', 'Custódio', 'Dalva', 'Edmilson',
  'Eunice', 'Fabiana', 'Geraldo', 'Helena', 'Ivone', 'Joaquim', 'Lourdes', 'Marcelo', 'Nair', 'Osvaldo',
  'Patrícia', 'Quitéria', 'Rogério', 'Sebastiana', 'Tarcísio', 'Vanderlei', 'Zilda', 'Amauri', 'Bernadete',
  'Cleuza', 'Dirceu', 'Elza', 'Fernando', 'Gilmar', 'Iracema', 'Jandira', 'Laércio', 'Marlene'];

const SOBRENOMES = ['de Alcântara', 'Bittencourt', 'Camargo Vilela', 'do Amaral', 'Estevam', 'Fagundes',
  'Guimarães Prado', 'Horta', 'Junqueira', 'Lemos Vieira', 'Machado Reis', 'Nogueira Braga', 'de Paiva',
  'Quintanilha', 'Rezende Faria', 'Sampaio Toledo', 'Tavares Lima', 'Ubaldo', 'Vasconcelos Mendes',
  'Werneck', 'Zamboni', 'Andrade Peixoto', 'Bueno Ferraz', 'Cordeiro Assis'];

export const nomePessoa = (s) => `${s.de(PRENOMES)} ${s.de(SOBRENOMES)}`;

/** Razões sociais genéricas de município pequeno. Nenhuma é real. */
const PREFIXOS_EMPRESA = ['Comercial', 'Distribuidora', 'Construtora', 'Serviços', 'Transportes',
  'Engenharia', 'Indústria e Comércio', 'Tecnologia', 'Alimentos', 'Materiais'];
const NUCLEOS_EMPRESA = ['Serra Verde', 'Vale do Rio Claro', 'Ponto Alto', 'Bom Retiro', 'Três Pinheiros',
  'Campo Belo do Sul', 'Mantiqueira Central', 'Alto da Boa Vista', 'Pedra Lisa', 'Cruz das Almas',
  'Rio Manso', 'Boa Esperança do Norte', 'Vila Nova Aurora', 'Morro Azul'];
const SUFIXOS_EMPRESA = ['Ltda.', 'Ltda. ME', 'Ltda. EPP', 'Eireli', 'S.A.'];

export function empresaFicticia(s) {
  return { razao: `${s.de(PREFIXOS_EMPRESA)} ${s.de(NUCLEOS_EMPRESA)} ${s.de(SUFIXOS_EMPRESA)}`, cnpj: cnpjFicticio(s) };
}

/* ────────────────────────────── cargos ──────────────────────────────────── */

const CARGOS_EFETIVOS = ['Agente Comunitário de Saúde', 'Auxiliar de Serviços Gerais', 'Professor de Educação Básica I',
  'Professor de Educação Básica II', 'Técnico em Enfermagem', 'Motorista', 'Operador de Máquinas Pesadas',
  'Auxiliar Administrativo', 'Fiscal de Tributos', 'Assistente Social', 'Engenheiro Civil',
  'Médico Clínico Geral', 'Cirurgião-Dentista', 'Nutricionista', 'Monitor de Creche', 'Coletor de Lixo',
  'Agente de Combate às Endemias', 'Auxiliar de Biblioteca', 'Fonoaudiólogo', 'Psicólogo'];

const CARGOS_COMISSAO = ['Chefe de Gabinete', 'Diretor de Departamento de Compras', 'Assessor Jurídico',
  'Coordenador de Vigilância Sanitária', 'Diretor Escolar', 'Chefe de Divisão de Tributos',
  'Coordenador de Proteção Social Básica', 'Diretor de Obras'];

const BAIRROS = ['Centro', 'Vila Rica', 'Jardim Bela Vista', 'São Benedito', 'Nossa Senhora Aparecida',
  'Alto do Cruzeiro', 'Vila Nova', 'Recanto das Águas', 'Bairro dos Fernandes', 'Boa Vista'];

/* ─────────────────────── objetos de contratação ─────────────────────────── */

const OBJETOS = [
  'aquisição de gêneros alimentícios para a merenda escolar da rede municipal de ensino',
  'contratação de empresa especializada em serviços de coleta, transporte e destinação final de resíduos sólidos urbanos',
  'aquisição de medicamentos da farmácia básica para a Secretaria Municipal de Saúde',
  'contratação de serviços de manutenção preventiva e corretiva da frota municipal',
  'aquisição de material de expediente e papelaria para as unidades administrativas',
  'contratação de empresa para execução de recapeamento asfáltico em vias urbanas',
  'aquisição de material de construção para as obras de manutenção predial',
  'contratação de serviços de transporte escolar da zona rural',
  'aquisição de equipamentos de informática para as escolas municipais',
  'contratação de empresa especializada em serviços de limpeza e conservação predial',
  'aquisição de material odontológico para as unidades básicas de saúde',
  'contratação de serviços de locação de máquinas pesadas com operador',
  'aquisição de uniformes e materiais escolares para os alunos da rede municipal',
  'contratação de empresa para reforma da Unidade Básica de Saúde do bairro São Benedito',
  'aquisição de combustíveis e lubrificantes para a frota do Município',
  'contratação de serviços de exames laboratoriais complementares',
  'aquisição de mobiliário escolar para as creches municipais',
  'contratação de empresa especializada em manutenção de iluminação pública',
];

const MODALIDADES_DEMO = [
  { nome: 'Pregão Eletrônico', peso: 45 }, { nome: 'Dispensa de Licitação', peso: 20 },
  { nome: 'Concorrência', peso: 10 }, { nome: 'Inexigibilidade de Licitação', peso: 8 },
  { nome: 'Tomada de Preços', peso: 7 }, { nome: 'Chamamento Público', peso: 5 },
  { nome: 'Credenciamento', peso: 5 },
];

/* ─────────────────────── distribuição dos atos ──────────────────────────── */

/** Peso calcado no que um município deste porte realmente publica: a maior
 *  parte de um diário municipal é ato de pessoal e portaria. */
export const PESO_TIPOS = [
  { item: 'ato_de_pessoal', peso: 22 }, { item: 'portaria', peso: 20 },
  { item: 'extrato_de_contrato', peso: 10 }, { item: 'decreto', peso: 8 },
  { item: 'aviso_de_licitacao', peso: 7 }, { item: 'termo_aditivo', peso: 5 },
  { item: 'homologacao', peso: 5 }, { item: 'resultado_de_julgamento', peso: 5 },
  { item: 'extrato_de_ata_de_registro_de_precos', peso: 4 }, { item: 'edital', peso: 4 },
  { item: 'convocacao', peso: 3 }, { item: 'lei', peso: 3 },
  { item: 'resolucao', peso: 2 }, { item: 'instrucao_normativa', peso: 1 },
  { item: 'lei_complementar', peso: 1 },
];

export const CADERNO_DO_TIPO = {
  lei: 'executivo', lei_complementar: 'executivo', decreto: 'executivo', portaria: 'executivo',
  resolucao: 'executivo', instrucao_normativa: 'executivo', outros: 'executivo',
  edital: 'licitacoes-e-contratos', aviso_de_licitacao: 'licitacoes-e-contratos',
  resultado_de_julgamento: 'licitacoes-e-contratos', homologacao: 'licitacoes-e-contratos',
  extrato_de_contrato: 'licitacoes-e-contratos', extrato_de_ata_de_registro_de_precos: 'licitacoes-e-contratos',
  termo_aditivo: 'licitacoes-e-contratos',
  ato_de_pessoal: 'atos-de-pessoal', convocacao: 'atos-de-pessoal',
  errata: 'executivo', republicacao: 'executivo',
};

/* ─────────────────────────── redação dos atos ───────────────────────────── */

const p = (t) => `<p>${t}</p>`;
const moeda = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const porExtensoData = (d) => comoDia(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });

const FECHO = (data, prefeita) => p(`Cambuí, ${porExtensoData(data)}.`) +
  `<p class="assinatura"><strong>${prefeita.nome}</strong><br>${prefeita.cargo}</p>`;

/**
 * Redige uma matéria completa a partir do tipo. Devolve
 * { ementa, corpo, assinaturaNome, assinaturaCargo, dados }.
 */
export function redigir({ tipo, s, data, numero, ano, secretaria, prefeita, licitacao }) {
  const secNome = secretaria?.nome ?? 'Secretaria Municipal de Administração';

  switch (tipo) {
    case 'ato_de_pessoal': {
      const pessoa = nomePessoa(s);
      const cpf = cpfFicticio(s);
      const efetivo = s.talvez(0.6);
      const cargo = efetivo ? s.de(CARGOS_EFETIVOS) : s.de(CARGOS_COMISSAO);
      const acao = s.pesado([
        { item: 'nomear', peso: 30 }, { item: 'exonerar', peso: 22 }, { item: 'conceder_licenca', peso: 18 },
        { item: 'aposentar', peso: 10 }, { item: 'designar', peso: 20 },
      ]);
      const mapa = {
        nomear: {
          ementa: `Nomeia ${pessoa} para o cargo de ${cargo}.`,
          corpo: p(`A Prefeita Municipal de Cambuí, Estado de Minas Gerais, no uso das atribuições que lhe confere a Lei Orgânica do Município, <strong>RESOLVE</strong>:`) +
            p(`<strong>Art. 1º</strong> Fica nomeado(a) <strong>${pessoa}</strong>, portador(a) do CPF nº ${'***.' + cpf.slice(3, 6) + '.' + cpf.slice(6, 9) + '-**'}, para exercer o cargo de <strong>${cargo}</strong>, ${efetivo ? 'de provimento efetivo, em virtude de aprovação em concurso público' : 'de provimento em comissão'}, lotado(a) na ${secNome}.`) +
            p(`<strong>Art. 2º</strong> Este ato entra em vigor na data de sua publicação, retroagindo seus efeitos a ${porExtensoData(data)}.`),
        },
        exonerar: {
          ementa: `Exonera, a pedido, ${pessoa} do cargo de ${cargo}.`,
          corpo: p(`A Prefeita Municipal de Cambuí, no uso de suas atribuições legais, <strong>RESOLVE</strong>:`) +
            p(`<strong>Art. 1º</strong> Fica exonerado(a), <strong>a pedido</strong>, <strong>${pessoa}</strong>, do cargo de ${cargo}, lotado(a) na ${secNome}.`) +
            p(`<strong>Art. 2º</strong> Este ato entra em vigor na data de sua publicação.`),
        },
        conceder_licenca: {
          ementa: `Concede licença para tratamento de saúde a ${pessoa}.`,
          corpo: p(`A Prefeita Municipal de Cambuí, considerando o laudo da perícia médica oficial, <strong>RESOLVE</strong>:`) +
            p(`<strong>Art. 1º</strong> Fica concedida a <strong>${pessoa}</strong>, ocupante do cargo de ${cargo}, licença para tratamento de saúde pelo prazo de ${s.inteiro(15, 90)} (${['quinze', 'trinta', 'sessenta', 'noventa'][s.inteiro(0, 3)]}) dias, nos termos do Estatuto dos Servidores Públicos Municipais.`) +
            p(`<strong>Art. 2º</strong> Este ato entra em vigor na data de sua publicação.`),
        },
        aposentar: {
          ementa: `Concede aposentadoria voluntária por tempo de contribuição a ${pessoa}.`,
          corpo: p(`A Prefeita Municipal de Cambuí, nos termos do art. 40 da Constituição Federal e da legislação previdenciária aplicável, <strong>RESOLVE</strong>:`) +
            p(`<strong>Art. 1º</strong> Fica concedida aposentadoria voluntária por tempo de contribuição a <strong>${pessoa}</strong>, ocupante do cargo efetivo de ${cargo}, com proventos integrais.`) +
            p(`<strong>Art. 2º</strong> Este ato entra em vigor na data de sua publicação, ficando o Instituto de Previdência responsável pelo pagamento dos proventos.`),
        },
        designar: {
          ementa: `Designa ${pessoa} para compor comissão ${s.de(['de recebimento de bens e serviços', 'de sindicância administrativa', 'permanente de licitação', 'de avaliação de desempenho'])}.`,
          corpo: p(`A Prefeita Municipal de Cambuí, no uso de suas atribuições, <strong>RESOLVE</strong>:`) +
            p(`<strong>Art. 1º</strong> Fica designado(a) <strong>${pessoa}</strong>, ocupante do cargo de ${cargo}, para compor a comissão referida na ementa deste ato, sem prejuízo de suas atribuições ordinárias e sem ônus adicional ao erário.`) +
            p(`<strong>Art. 2º</strong> Este ato entra em vigor na data de sua publicação.`),
        },
      };
      const escolhido = mapa[acao];
      return { ...escolhido, corpo: escolhido.corpo + FECHO(data, prefeita), assinaturaNome: prefeita.nome, assinaturaCargo: prefeita.cargo };
    }

    case 'portaria': {
      const assunto = s.de([
        { e: 'Institui comissão para elaboração do inventário anual de bens patrimoniais.', c: 'inventário' },
        { e: 'Designa fiscal de contrato administrativo.', c: 'fiscal' },
        { e: 'Estabelece escala de plantão para o período de recesso.', c: 'plantão' },
        { e: 'Instaura processo administrativo disciplinar.', c: 'PAD' },
        { e: 'Autoriza o afastamento de servidor para participação em curso de capacitação.', c: 'capacitação' },
        { e: 'Dispõe sobre o horário de funcionamento das repartições públicas municipais no período de festas.', c: 'horário' },
      ]);
      const responsavel = nomePessoa(s);
      return {
        ementa: assunto.e,
        corpo: p(`A Prefeita Municipal de Cambuí, Estado de Minas Gerais, no uso das atribuições que lhe são conferidas pela Lei Orgânica do Município, <strong>RESOLVE</strong>:`) +
          p(`<strong>Art. 1º</strong> ${assunto.e.replace(/\.$/, '')}, sob a responsabilidade de <strong>${responsavel}</strong>, no âmbito da ${secNome}.`) +
          p(`<strong>Art. 2º</strong> Os trabalhos deverão ser concluídos no prazo de ${s.inteiro(15, 90)} dias, contados da publicação desta Portaria, prorrogável uma única vez por igual período mediante justificativa fundamentada.`) +
          p(`<strong>Art. 3º</strong> Esta Portaria entra em vigor na data de sua publicação, revogadas as disposições em contrário.`) +
          FECHO(data, prefeita),
        assinaturaNome: prefeita.nome, assinaturaCargo: prefeita.cargo,
      };
    }

    case 'decreto': {
      const tema = s.de([
        { e: 'Declara ponto facultativo nas repartições públicas municipais na data que especifica.', tipo: 'ponto' },
        { e: 'Regulamenta a concessão de diárias no âmbito da Administração Direta.', tipo: 'diarias' },
        { e: 'Dispõe sobre a abertura de crédito adicional suplementar no orçamento vigente.', tipo: 'credito' },
        { e: 'Declara situação de emergência em razão de estiagem prolongada.', tipo: 'emergencia' },
        { e: 'Regulamenta o funcionamento do Conselho Municipal de Política Urbana.', tipo: 'conselho' },
      ]);
      const valor = s.inteiro(80_000, 1_400_000);
      const corpoTema = tema.tipo === 'credito'
        ? p(`<strong>Art. 1º</strong> Fica aberto crédito adicional suplementar no valor de <strong>${moeda(valor)}</strong> (${valor > 1_000_000 ? 'mais de um milhão de reais' : 'valor por extenso conforme minuta'}), destinado a reforçar as dotações orçamentárias discriminadas no Anexo Único deste Decreto.`) +
          p(`<strong>Art. 2º</strong> Os recursos necessários à abertura do crédito de que trata o art. 1º correrão à conta de anulação parcial de dotações orçamentárias, nos termos do art. 43, §1º, inciso III, da Lei Federal nº 4.320/1964.`)
        : tema.tipo === 'ponto'
          ? p(`<strong>Art. 1º</strong> Fica declarado ponto facultativo nas repartições públicas municipais no dia ${porExtensoData(new Date(comoDia(data).getTime() + 86400000 * s.inteiro(5, 30)))}.`) +
            p(`<strong>Art. 2º</strong> Ficam ressalvados os serviços essenciais e de caráter continuado, notadamente saúde, limpeza urbana e vigilância, cujas chefias imediatas organizarão escala de plantão.`)
          : p(`<strong>Art. 1º</strong> ${tema.e.replace(/^\w/, (c) => c.toUpperCase()).replace(/\.$/, '')}, na forma dos anexos que integram este Decreto.`) +
            p(`<strong>Art. 2º</strong> Compete à ${secNome} a adoção das providências necessárias ao fiel cumprimento do disposto neste Decreto.`);
      return {
        ementa: tema.e,
        corpo: p(`A <strong>PREFEITA MUNICIPAL DE CAMBUÍ</strong>, Estado de Minas Gerais, no uso das atribuições que lhe confere o art. 71 da Lei Orgânica do Município,`) +
          p(`<strong>DECRETA:</strong>`) + corpoTema +
          p(`<strong>Art. 3º</strong> Este Decreto entra em vigor na data de sua publicação.`) + FECHO(data, prefeita),
        assinaturaNome: prefeita.nome, assinaturaCargo: prefeita.cargo,
      };
    }

    case 'lei':
    case 'lei_complementar': {
      const tema = s.de([
        'Denomina logradouro público no Bairro ' + s.de(BAIRROS) + '.',
        'Autoriza o Poder Executivo a celebrar convênio com o Estado de Minas Gerais para execução de obras de infraestrutura.',
        'Institui o Programa Municipal de Incentivo à Agricultura Familiar.',
        'Dispõe sobre a política municipal de proteção aos animais domésticos.',
        'Altera dispositivos da Lei que institui o Plano Diretor Participativo do Município.',
      ]);
      return {
        ementa: tema,
        corpo: p(`<em>O povo do Município de Cambuí, Estado de Minas Gerais, por seus representantes na Câmara Municipal, aprovou e eu, Prefeita Municipal, em seu nome, sanciono a seguinte Lei:</em>`) +
          p(`<strong>Art. 1º</strong> ${tema.replace(/\.$/, '')}, nos termos e condições estabelecidos nesta Lei.`) +
          p(`<strong>Art. 2º</strong> As despesas decorrentes da execução desta Lei correrão à conta das dotações orçamentárias próprias, suplementadas se necessário.`) +
          p(`<strong>Art. 3º</strong> O Poder Executivo regulamentará esta Lei no prazo de 90 (noventa) dias contados de sua publicação.`) +
          p(`<strong>Art. 4º</strong> Esta Lei entra em vigor na data de sua publicação.`) + FECHO(data, prefeita),
        assinaturaNome: prefeita.nome, assinaturaCargo: prefeita.cargo,
      };
    }

    case 'aviso_de_licitacao': {
      const objeto = licitacao?.objeto_resumo ?? s.de(OBJETOS);
      const modalidade = licitacao ? null : s.pesado(MODALIDADES_DEMO.map((m) => ({ item: m.nome, peso: m.peso })));
      const nomeMod = licitacao?.modalidadeRotulo ?? modalidade;
      const valor = licitacao?.valor_estimado ?? s.inteiro(30_000, 2_500_000);
      const sessao = new Date(comoDia(data).getTime() + 86400000 * s.inteiro(8, 25));
      const proc = licitacao?.numero_processo ?? `${s.inteiro(1000, 1400)}/${ano}`;
      return {
        ementa: `${nomeMod} nº ${numero}/${ano} — ${objeto}.`,
        corpo: p(`O <strong>Município de Cambuí/MG</strong> torna público que fará realizar licitação na modalidade <strong>${nomeMod}</strong>, do tipo menor preço, para ${objeto}.`) +
          `<table><tbody>
            <tr><th>Processo administrativo</th><td>${proc}</td></tr>
            <tr><th>Valor estimado</th><td>${moeda(Number(valor))}</td></tr>
            <tr><th>Abertura das propostas</th><td>${porExtensoData(sessao)}, às ${s.de(['09h00', '09h30', '13h30', '14h00'])}</td></tr>
            <tr><th>Local</th><td>Portal de compras públicas, com acesso pelo sítio oficial do Município</td></tr>
          </tbody></table>` +
          p(`O edital e seus anexos encontram-se à disposição dos interessados no sítio oficial do Município e no Portal Nacional de Contratações Públicas (PNCP), nos termos da Lei Federal nº 14.133/2021.`) +
          p(`Informações pelo telefone (35) 3431-0000, de segunda a sexta-feira, das 8h às 16h.`) +
          p(`<strong>${nomePessoa(s)}</strong><br>Agente de Contratação`),
        assinaturaNome: null,
        dados: { valor, sessao, proc, modalidade: nomeMod, objeto },
      };
    }

    case 'edital': {
      const tipo = s.de(['Concurso Público', 'Processo Seletivo Simplificado', 'Chamamento Público']);
      const vagas = s.inteiro(3, 40);
      return {
        ementa: `Edital de ${tipo} nº ${numero}/${ano} — abertura de inscrições para provimento de ${vagas} vagas.`,
        corpo: p(`O <strong>Município de Cambuí/MG</strong>, por meio da ${secNome}, torna pública a abertura de inscrições para o <strong>${tipo} nº ${numero}/${ano}</strong>, destinado ao provimento de ${vagas} (${vagas}) vagas e à formação de cadastro de reserva.`) +
          `<table><thead><tr><th>Cargo</th><th>Vagas</th><th>Escolaridade</th><th>Vencimento</th></tr></thead><tbody>` +
          Array.from({ length: s.inteiro(3, 6) }, () => {
            const c = s.de(CARGOS_EFETIVOS);
            return `<tr><td>${c}</td><td>${s.inteiro(1, 8)}</td><td>${s.de(['Ensino Fundamental', 'Ensino Médio', 'Ensino Médio Técnico', 'Ensino Superior'])}</td><td>${moeda(s.inteiro(1500, 8500))}</td></tr>`;
          }).join('') + `</tbody></table>` +
          p(`As inscrições serão realizadas exclusivamente pela internet, no período de ${porExtensoData(new Date(comoDia(data).getTime() + 86400000 * 5))} a ${porExtensoData(new Date(comoDia(data).getTime() + 86400000 * 25))}.`) +
          p(`Fica assegurada a reserva de vagas às pessoas com deficiência, na forma da legislação vigente, bem como a reserva prevista na legislação municipal para candidatos negros.`) +
          p(`O edital completo, com o conteúdo programático e o cronograma, está disponível no sítio oficial do Município.`),
        assinaturaNome: prefeita.nome, assinaturaCargo: prefeita.cargo,
      };
    }

    case 'resultado_de_julgamento':
    case 'homologacao': {
      const emp = empresaFicticia(s);
      const objeto = licitacao?.objeto_resumo ?? s.de(OBJETOS);
      const valor = s.inteiro(20_000, 1_800_000);
      const mod = licitacao?.modalidadeRotulo ?? s.pesado(MODALIDADES_DEMO.map((m) => ({ item: m.nome, peso: m.peso })));
      const homolog = tipo === 'homologacao';
      return {
        ementa: `${homolog ? 'Homologação' : 'Resultado de julgamento'} do ${mod} nº ${numero}/${ano} — ${objeto}.`,
        corpo: p(`O Município de Cambuí/MG torna público o ${homolog ? 'ato de homologação e adjudicação' : 'resultado do julgamento'} do <strong>${mod} nº ${numero}/${ano}</strong>, cujo objeto é ${objeto}.`) +
          `<table><thead><tr><th>Empresa vencedora</th><th>CNPJ</th><th>Valor</th></tr></thead>
           <tbody><tr><td>${emp.razao}</td><td>${emp.cnpj}</td><td>${moeda(valor)}</td></tr></tbody></table>` +
          (homolog
            ? p(`Fica <strong>HOMOLOGADO</strong> o procedimento licitatório e <strong>ADJUDICADO</strong> o objeto à empresa acima identificada, autorizada a celebração do respectivo contrato.`)
            : p(`Fica declarada vencedora a empresa acima, restando aberto o prazo recursal previsto no art. 165 da Lei Federal nº 14.133/2021, contado da publicação deste aviso.`)) +
          p(`<strong>${nomePessoa(s)}</strong><br>${homolog ? 'Prefeita Municipal' : 'Agente de Contratação'}`),
        assinaturaNome: null,
        dados: { empresa: emp, valor },
      };
    }

    case 'extrato_de_contrato':
    case 'extrato_de_ata_de_registro_de_precos':
    case 'termo_aditivo': {
      const emp = empresaFicticia(s);
      const objeto = s.de(OBJETOS);
      const valor = s.inteiro(15_000, 900_000);
      const meses = s.de([6, 12, 12, 12, 24]);
      const ata = tipo === 'extrato_de_ata_de_registro_de_precos';
      const aditivo = tipo === 'termo_aditivo';
      const rotulo = ata ? 'Ata de Registro de Preços' : aditivo ? 'Termo Aditivo' : 'Contrato';
      return {
        /* A razão social já termina em ponto ("Ltda."). Sem esta aparagem a
           ementa sai com ".." — detalhe que salta aos olhos numa listagem. */
        ementa: `Extrato d${ata ? 'a' : 'o'} ${rotulo} nº ${numero}/${ano} — ${emp.razao.replace(/\.$/, '')}.`,
        corpo: `<table><tbody>
            <tr><th>Instrumento</th><td>${rotulo} nº ${numero}/${ano}</td></tr>
            <tr><th>Contratante</th><td>Município de Cambuí/MG</td></tr>
            <tr><th>Contratada</th><td>${emp.razao} — CNPJ ${emp.cnpj}</td></tr>
            <tr><th>Objeto</th><td>${aditivo ? `${s.talvez(0.5) ? 'Prorrogação do prazo de vigência' : 'Acréscimo quantitativo de 25% (vinte e cinco por cento)'} do contrato originário, cujo objeto é ${objeto}` : objeto}</td></tr>
            <tr><th>Valor</th><td>${moeda(valor)}</td></tr>
            <tr><th>Vigência</th><td>${meses} meses, contados da assinatura</td></tr>
            <tr><th>Dotação orçamentária</th><td>${s.inteiro(2, 9)}.${s.inteiro(1, 9)}.${s.inteiro(10, 99)}.${s.inteiro(100, 999)}.${s.inteiro(1000, 9999)}</td></tr>
            <tr><th>Fundamento legal</th><td>Lei Federal nº 14.133/2021</td></tr>
          </tbody></table>` +
          p(`Data da assinatura: ${porExtensoData(data)}.`),
        assinaturaNome: null,
        dados: { empresa: emp, valor },
      };
    }

    case 'convocacao': {
      const quantos = s.inteiro(2, 6);
      const pessoas = Array.from({ length: quantos }, () => ({ nome: nomePessoa(s), cpf: cpfFicticio(s), cargo: s.de(CARGOS_EFETIVOS) }));
      return {
        ementa: `Convoca candidatos aprovados em concurso público para apresentação de documentos e posse.`,
        corpo: p(`O Município de Cambuí/MG <strong>CONVOCA</strong> os candidatos abaixo relacionados, aprovados no concurso público municipal, a comparecerem à ${secNome}, no prazo de <strong>30 (trinta) dias</strong> contados da publicação deste ato, munidos da documentação exigida em edital, para fins de posse.`) +
          `<table><thead><tr><th>Classificação</th><th>Candidato</th><th>CPF</th><th>Cargo</th></tr></thead><tbody>` +
          pessoas.map((x, i) => `<tr><td>${i + 1}º</td><td>${x.nome}</td><td>***.${x.cpf.slice(3, 6)}.${x.cpf.slice(6, 9)}-**</td><td>${x.cargo}</td></tr>`).join('') +
          `</tbody></table>` +
          p(`O não comparecimento no prazo estabelecido implicará desistência tácita da vaga, nos termos do edital do certame.`),
        assinaturaNome: prefeita.nome, assinaturaCargo: prefeita.cargo,
      };
    }

    case 'resolucao':
    case 'instrucao_normativa': {
      const ementa = s.de([
        'Estabelece procedimentos para a instrução de processos de pagamento no âmbito da Administração Direta.',
        'Dispõe sobre os critérios de concessão de auxílio-transporte aos servidores municipais.',
        'Aprova o regimento interno do Conselho Municipal de Assistência Social.',
        'Fixa normas para o uso de veículos oficiais do Município.',
      ]);
      return {
        ementa,
        corpo: p(`${tipo === 'resolucao' ? 'O Conselho' : 'A Secretaria'} ${tipo === 'resolucao' ? 'Municipal competente' : secNome}, no uso de suas atribuições legais e regimentais, <strong>RESOLVE</strong>:`) +
          p(`<strong>Art. 1º</strong> ${ementa.replace(/\.$/, '')}, observadas as diretrizes constantes desta norma.`) +
          p(`<strong>Art. 2º</strong> Os casos omissos serão resolvidos pela autoridade competente, ouvida a Procuradoria-Geral do Município.`) +
          p(`<strong>Art. 3º</strong> Esta norma entra em vigor na data de sua publicação.`),
        assinaturaNome: nomePessoa(s), assinaturaCargo: `Secretário(a) Municipal`,
      };
    }

    default:
      return {
        ementa: 'Ato administrativo diverso.',
        corpo: p('Texto do ato.'),
        assinaturaNome: prefeita.nome, assinaturaCargo: prefeita.cargo,
      };
  }
}

/* ─────────────────── matérias especiais (casos de borda) ────────────────── */

/** Lei orçamentária: matéria MUITO longa, com tabelas grandes. É ela que
 *  descobre se o sumário, a paginação e a página HTML aguentam. */
export function leiOrcamentaria({ s, data, numero, ano, prefeita }) {
  const orgaos = ['Câmara Municipal', 'Gabinete da Prefeita', 'Secretaria Municipal de Administração e Finanças',
    'Secretaria Municipal de Educação', 'Secretaria Municipal de Saúde', 'Secretaria Municipal de Obras e Serviços Urbanos',
    'Secretaria Municipal de Assistência Social', 'Secretaria Municipal de Meio Ambiente e Agricultura',
    'Secretaria Municipal de Cultura, Esporte e Turismo', 'Encargos Gerais do Município', 'Reserva de Contingência'];
  const funcoes = ['Legislativa', 'Administração', 'Educação', 'Saúde', 'Urbanismo', 'Assistência Social',
    'Gestão Ambiental', 'Agricultura', 'Cultura', 'Desporto e Lazer', 'Encargos Especiais'];

  let total = 0;
  const linhas = orgaos.map((o, i) => {
    const v = s.inteiro(400_000, 28_000_000); total += v;
    return `<tr><td>${String(i + 1).padStart(2, '0')}</td><td>${o}</td><td>${funcoes[i % funcoes.length]}</td><td style="text-align:right">${moeda(v)}</td></tr>`;
  }).join('');

  const receitas = [
    ['Receitas Correntes', 'Impostos, Taxas e Contribuições de Melhoria', s.inteiro(8_000_000, 14_000_000)],
    ['Receitas Correntes', 'Receita de Contribuições', s.inteiro(1_000_000, 3_000_000)],
    ['Receitas Correntes', 'Receita Patrimonial', s.inteiro(200_000, 900_000)],
    ['Receitas Correntes', 'Transferências Correntes — União', s.inteiro(20_000_000, 40_000_000)],
    ['Receitas Correntes', 'Transferências Correntes — Estado', s.inteiro(9_000_000, 20_000_000)],
    ['Receitas de Capital', 'Operações de Crédito', s.inteiro(0, 4_000_000)],
    ['Receitas de Capital', 'Transferências de Capital', s.inteiro(500_000, 5_000_000)],
  ];
  const totalReceita = receitas.reduce((a, r) => a + r[2], 0);

  return {
    ementa: `Estima a receita e fixa a despesa do Município de Cambuí para o exercício financeiro de ${ano + 1}.`,
    corpo:
      p(`<em>O povo do Município de Cambuí, Estado de Minas Gerais, por seus representantes na Câmara Municipal, aprovou e eu, Prefeita Municipal, em seu nome, sanciono a seguinte Lei:</em>`) +
      p(`<strong>Art. 1º</strong> Esta Lei estima a Receita e fixa a Despesa do Município de Cambuí para o exercício financeiro de ${ano + 1}, compreendendo o Orçamento Fiscal e o Orçamento da Seguridade Social, no valor global de <strong>${moeda(total)}</strong>.`) +
      p(`<strong>Art. 2º</strong> A Receita Orçamentária é estimada na forma da legislação vigente e de acordo com o desdobramento constante do Anexo I desta Lei, conforme discriminação a seguir:`) +
      `<h4>Anexo I — Estimativa da Receita</h4><table><thead><tr><th>Categoria</th><th>Origem</th><th style="text-align:right">Valor</th></tr></thead><tbody>` +
      receitas.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td style="text-align:right">${moeda(r[2])}</td></tr>`).join('') +
      `<tr><th colspan="2">Total da Receita</th><th style="text-align:right">${moeda(totalReceita)}</th></tr></tbody></table>` +
      p(`<strong>Art. 3º</strong> A Despesa Orçamentária, no mesmo valor da Receita, é fixada por órgão e função de governo conforme o Anexo II:`) +
      `<h4>Anexo II — Fixação da Despesa por Órgão</h4><table><thead><tr><th>Cód.</th><th>Órgão</th><th>Função</th><th style="text-align:right">Valor</th></tr></thead><tbody>${linhas}<tr><th colspan="3">Total da Despesa</th><th style="text-align:right">${moeda(total)}</th></tr></tbody></table>` +
      p(`<strong>Art. 4º</strong> Fica o Poder Executivo autorizado a abrir créditos adicionais suplementares até o limite de <strong>${s.inteiro(10, 25)}%</strong> (por cento) do total da despesa fixada nesta Lei, mediante a utilização dos recursos previstos no art. 43 da Lei Federal nº 4.320, de 17 de março de 1964.`) +
      p(`<strong>Art. 5º</strong> Fica o Poder Executivo autorizado a realizar operações de crédito por antecipação da receita orçamentária, observados os limites da Lei Complementar Federal nº 101, de 4 de maio de 2000.`) +
      p(`<strong>Art. 6º</strong> As despesas com pessoal e encargos sociais observarão os limites estabelecidos na Lei de Responsabilidade Fiscal, cabendo à Secretaria Municipal de Administração e Finanças o acompanhamento mensal e a adoção das medidas corretivas cabíveis.`) +
      p(`<strong>Art. 7º</strong> A execução orçamentária observará o cronograma de desembolso mensal a ser fixado por decreto, no prazo de 30 (trinta) dias contados da publicação desta Lei.`) +
      p(`<strong>Art. 8º</strong> Esta Lei entra em vigor em 1º de janeiro de ${ano + 1}.`) +
      FECHO(data, prefeita),
    assinaturaNome: prefeita.nome, assinaturaCargo: prefeita.cargo,
  };
}

/** Matéria de uma linha. Existe porque layout que só foi testado com texto
 *  médio quebra nos extremos — e o extremo curto é comum em diário. */
export function materiaCurta({ data, prefeita }) {
  return {
    ementa: 'Torna sem efeito a publicação anterior.',
    corpo: p('Fica sem efeito a publicação do ato constante da edição anterior, por incorreção material.'),
    assinaturaNome: prefeita.nome, assinaturaCargo: prefeita.cargo,
  };
}

export { OBJETOS, CARGOS_EFETIVOS, BAIRROS, MODALIDADES_DEMO };
