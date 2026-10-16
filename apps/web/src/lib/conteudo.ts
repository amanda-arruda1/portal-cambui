/**
 * Consultas ao CMS, uma função por necessidade de página.
 *
 * O filtro `status: publicado` está em TODAS as consultas: o fluxo editorial é
 * rascunho -> em_revisao -> aprovado -> publicado, e só o último estado é
 * público. Centralizar isso aqui evita que uma página nova esqueça o filtro e
 * vaze rascunho de secretaria.
 */
import { listar, umPor } from './directus';
import { fonteCms, listarPayload, reescreverMidia, urlMidia } from './payload';
import type { CategoriaPatrimonio, ColetaLixo, ConselhoMunicipal, Documento, DocumentoPatrimonio, Noticia, Pagina, PerguntaFrequente, Secretaria, Selo, Servico, TelefoneUtil } from './tipos';

const PUBLICADO = JSON.stringify({ status: { _eq: 'publicado' } });

const CAMPOS_NOTICIA =
  'id,status,titulo,slug,resumo,conteudo,imagem,imagem_descricao,arquivo,data_publicacao,destaque,secretaria.nome,secretaria.slug';

/** Notícia do Payload (camelCase, corpo em `conteudoHtml`, arquivos como objetos populados) no formato do portal. */
const marcador = (m: any): string | null => (m && typeof m === 'object' && m.filename ? `midia:${encodeURIComponent(m.filename)}` : null);

function noticiaDoPayload(d: DocPayload): Noticia {
  const sec = d.secretaria && typeof d.secretaria === 'object' ? d.secretaria : null;
  return {
    id: d.id, status: d.status, titulo: d.titulo, slug: d.slug, resumo: d.resumo ?? null,
    conteudo: reescreverMidia(d.conteudoHtml),
    imagem: marcador(d.imagem), imagem_descricao: d.imagemDescricao ?? null, arquivo: marcador(d.arquivo),
    data_publicacao: d.dataPublicacao, destaque: !!d.destaque,
    secretaria: sec ? { nome: sec.nome, slug: sec.slug } : null,
  };
}
// Datas de publicação repetidas existem (dados importados): o desempate por slug mantém a paginação estável.
const ORDEM_NOTICIAS_PAYLOAD = '-dataPublicacao,slug';

export async function noticiasRecentes(limite = 9, pagina = 1) {
  if (fonteCms('noticias') === 'payload') {
    const r = await listarPayload<DocPayload>('noticias', { sort: ORDEM_NOTICIAS_PAYLOAD, limit: limite, page: pagina, depth: 1 });
    return { ...r, dados: r.dados.map(noticiaDoPayload) };
  }
  return noticiasRecentesDirectus(limite, pagina);
}

function noticiasRecentesDirectus(limite: number, pagina: number) {
  return listar<Noticia>('noticias', {
    fields: CAMPOS_NOTICIA,
    filter: PUBLICADO,
    sort: '-data_publicacao',
    limit: limite,
    page: pagina,
    meta: 'filter_count',
  });
}

export function noticiasEmDestaque(limite = 3) {
  return listar<Noticia>('noticias', {
    fields: CAMPOS_NOTICIA,
    filter: JSON.stringify({ status: { _eq: 'publicado' }, destaque: { _eq: true } }),
    sort: '-data_publicacao',
    limit: limite,
  });
}

export async function noticiaPorSlug(slug: string) {
  if (fonteCms('noticias') === 'payload') {
    const r = await listarPayload<DocPayload>('noticias', { limit: 1, depth: 1, onde: { slug } });
    return { dado: r.dados[0] ? noticiaDoPayload(r.dados[0]) : null, indisponivel: r.indisponivel };
  }
  return noticiaPorSlugDirectus(slug);
}

function noticiaPorSlugDirectus(slug: string) {
  return umPor<Noticia>('noticias', {
    fields: CAMPOS_NOTICIA,
    filter: JSON.stringify({ status: { _eq: 'publicado' }, slug: { _eq: slug } }),
  });
}

type DocPayload = { id: string } & Record<string, any>;

/** Secretaria do Payload (camelCase, texto rico em campos `*Html`) no formato que o portal já usa. */
function secretariaDoPayload(d: DocPayload): Secretaria {
  return {
    id: d.id, status: d.status, nome: d.nome, slug: d.slug, sigla: d.sigla ?? null,
    palavras_chave: d.palavrasChave ?? null,
    descricao: reescreverMidia(d.descricaoHtml),
    responsavel: d.responsavel ?? null, cargo_responsavel: d.cargoResponsavel ?? null,
    biografia_responsavel: reescreverMidia(d.biografiaResponsavelHtml),
    endereco: d.endereco ?? null, telefone: d.telefone ?? null, email: d.email ?? null,
    horario_atendimento: d.horarioAtendimento ?? null, ordem: d.ordem ?? null,
  };
}

export async function secretarias() {
  if (fonteCms('secretarias') === 'payload') {
    const r = await listarPayload<DocPayload>('secretarias', { sort: 'ordem,nome' });
    return { ...r, dados: r.dados.map(secretariaDoPayload) };
  }
  return secretariasDirectus();
}

function secretariasDirectus() {
  return listar<Secretaria>('secretarias', {
    fields: '*',
    filter: PUBLICADO,
    sort: 'ordem,nome',
    limit: 100,
  });
}

export async function secretariaPorSlug(slug: string) {
  if (fonteCms('secretarias') === 'payload') {
    const r = await listarPayload<DocPayload>('secretarias', { limit: 1, onde: { slug } });
    return { dado: r.dados[0] ? secretariaDoPayload(r.dados[0]) : null, indisponivel: r.indisponivel };
  }
  return secretariaPorSlugDirectus(slug);
}

function secretariaPorSlugDirectus(slug: string) {
  return umPor<Secretaria>('secretarias', {
    fields: '*',
    filter: JSON.stringify({ status: { _eq: 'publicado' }, slug: { _eq: slug } }),
  });
}

export async function servicos(limite = 200) {
  if (fonteCms('servicos') === 'payload') {
    const r = await listarPayload<DocPayload>('servicos', { sort: 'categoria,ordem,nome', limit: limite, depth: 1 });
    return { ...r, dados: r.dados.map(servicoDoPayload) };
  }
  return listar<Servico>('servicos', {
    fields: 'id,status,nome,slug,descricao,categoria,publico_alvo,url_externa,como_solicitar,secretaria.nome,secretaria.slug',
    filter: PUBLICADO,
    sort: 'categoria,nome',
    limit: limite,
  });
}

function servicoDoPayload(d: DocPayload): Servico {
  const sec = d.secretaria && typeof d.secretaria === 'object' ? d.secretaria : null;
  return {
    id: d.id, status: d.status, nome: d.nome, slug: d.slug, descricao: d.descricao ?? null, categoria: d.categoria ?? null,
    publico_alvo: d.publicoAlvo ?? null, url_externa: d.urlExterna ?? null, como_solicitar: reescreverMidia(d.comoSolicitarHtml),
    secretaria: sec ? { nome: sec.nome, slug: sec.slug } : null,
    necessidade: d.necessidade ?? null, detalhe: d.detalhe ?? null, destino: d.destino ?? null, ordem: d.ordem ?? null,
  };
}

/** Documento do Payload no formato do portal. `data_documento` volta a ser AAAA-MM-DD (o Payload devolve meia-noite UTC,
 *  que no fuso de Brasília cairia no dia anterior). */
function documentoDoPayload(d: DocPayload): Documento {
  const sec = d.secretaria && typeof d.secretaria === 'object' ? d.secretaria : null;
  return {
    id: d.id, status: d.status, titulo: d.titulo, tipo: d.tipo, numero: d.numero ?? null,
    data_documento: String(d.dataDocumento).slice(0, 10), descricao: d.descricao ?? null,
    arquivo: marcador(d.arquivo), url_externa: d.urlExterna ?? null,
    secretaria: sec ? { nome: sec.nome, slug: sec.slug } : null,
  };
}

export async function documentos(tipo?: string, limite = 50, pagina = 1) {
  if (fonteCms('documentos') === 'payload') {
    const r = await listarPayload<DocPayload>('documentos', { sort: '-dataDocumento', limit: limite, page: pagina, depth: 1, onde: tipo ? { tipo } : undefined });
    return { ...r, dados: r.dados.map(documentoDoPayload) };
  }
  return documentosDirectus(tipo, limite, pagina);
}

function documentosDirectus(tipo: string | undefined, limite: number, pagina: number) {
  const filtro = tipo
    ? { status: { _eq: 'publicado' }, tipo: { _eq: tipo } }
    : { status: { _eq: 'publicado' } };
  return listar<Documento>('documentos', {
    fields: '*',
    filter: JSON.stringify(filtro),
    sort: '-data_documento',
    limit: limite,
    page: pagina,
    meta: 'filter_count',
  });
}

export async function paginaPorSlug(slug: string) {
  if (fonteCms('paginas') === 'payload') {
    const r = await listarPayload<DocPayload>('paginas', { limit: 1, onde: { slug } });
    const d = r.dados[0];
    const dado: Pagina | null = d ? { id: d.id, status: d.status, titulo: d.titulo, slug: d.slug, conteudo: reescreverMidia(d.conteudoHtml), atualizado_em: d.atualizadoEm ?? null } : null;
    return { dado, indisponivel: r.indisponivel };
  }
  return paginaPorSlugDirectus(slug);
}

function paginaPorSlugDirectus(slug: string) {
  return umPor<Pagina>('paginas', {
    fields: '*',
    filter: JSON.stringify({ status: { _eq: 'publicado' }, slug: { _eq: slug } }),
  });
}

/** Um documento por id — usado quando a página precisa de UM documento
 *  específico (ex.: o Organograma Institucional em /estrutura-administrativa),
 *  não uma listagem. */
/** `id` é o UUID que o documento tinha no Directus (fixo no código das páginas): no Payload vale o `idLegado`. */
export async function documentoPorId(id: string) {
  if (fonteCms('documentos') === 'payload') {
    const r = await listarPayload<DocPayload>('documentos', { limit: 1, depth: 1, onde: { idLegado: id } });
    return { dado: r.dados[0] ? documentoDoPayload(r.dados[0]) : null, indisponivel: r.indisponivel };
  }
  return documentoPorIdDirectus(id);
}

function documentoPorIdDirectus(id: string) {
  return umPor<Documento>('documentos', {
    fields: '*',
    filter: JSON.stringify({ status: { _eq: 'publicado' }, id: { _eq: id } }),
  });
}

/** Selos e certificações institucionais — exibidos no rodapé (todas as
 *  páginas) e em detalhe na página de Transparência. */
export async function selos() {
  if (fonteCms('selos') === 'payload') {
    const r = await listarPayload<DocPayload>('selos', { sort: 'ordem,nome', limit: 50, depth: 1 });
    return {
      ...r,
      dados: r.dados.map((d): Selo => ({
        id: d.id, status: d.status, nome: d.nome, orgao_emissor: d.orgaoEmissor, descricao: d.descricao ?? null, imagem: marcador(d.imagem),
        data_concessao: d.dataConcessao ?? null, url_comprovacao: d.urlComprovacao ?? null, ordem: d.ordem ?? null,
      })),
    };
  }
  return listar<Selo>('selos', {
    fields: '*',
    filter: PUBLICADO,
    sort: 'ordem,nome',
    limit: 50,
  });
}

/** Perguntas frequentes, agrupadas por categoria na própria página. */
export async function perguntasFrequentes() {
  if (fonteCms('perguntas_frequentes') === 'payload') {
    const r = await listarPayload<DocPayload>('perguntas-frequentes', { sort: 'categoria,ordem,pergunta', limit: 300, depth: 1 });
    return {
      ...r,
      dados: r.dados.map((d): PerguntaFrequente => {
        const sec = d.secretaria && typeof d.secretaria === 'object' ? d.secretaria : null;
        return { id: d.id, status: d.status, pergunta: d.pergunta, resposta: reescreverMidia(d.respostaHtml) ?? '', categoria: d.categoria ?? null, secretaria: sec ? { nome: sec.nome, slug: sec.slug } : null, ordem: d.ordem ?? null };
      }),
    };
  }
  return listar<PerguntaFrequente>('perguntas_frequentes', {
    fields: 'id,status,pergunta,resposta,categoria,ordem,secretaria.nome,secretaria.slug',
    filter: PUBLICADO,
    sort: 'categoria,ordem,pergunta',
    limit: 300,
  });
}

/** Telefones úteis além das secretarias (que já têm telefone/email próprios
 *  no cadastro): emergências, escolas, unidades de saúde, assistência
 *  social, departamentos e diversos. Agrupados por categoria na própria
 *  página — mesmo padrão de 'perguntasFrequentes'. */
export function telefonesUteis() {
  // Migração Directus → Payload: CMS_TELEFONES=payload liga a leitura pelo novo CMS.
  if (fonteCms('telefones_uteis') === 'payload') {
    return listarPayload<TelefoneUtil>('telefones-uteis', { sort: 'categoria,ordem,nome' });
  }
  return listar<TelefoneUtil>('telefones_uteis', {
    fields: 'id,status,nome,categoria,endereco,telefone,email,ordem',
    filter: PUBLICADO,
    sort: 'categoria,ordem,nome',
    limit: 300,
  });
}

/** Documentos do Patrimônio Cultural (livros, dossiês de tombamento,
 *  inventários, legislação e outros arquivos), agrupados por categoria na
 *  própria página — mesmo padrão de 'perguntasFrequentes'. */
export async function documentosPatrimonio(categoria?: CategoriaPatrimonio) {
  if (fonteCms('patrimonio_documentos') === 'payload') {
    // depth 1 traz o objeto do arquivo (nome) para montar o link /midia/. A secretaria não é exibida nesta página.
    const r = await listarPayload<Omit<DocumentoPatrimonio, 'arquivo' | 'secretaria' | 'url_externa'> & { arquivo: unknown; urlExterna: string | null }>('patrimonio-cultural', {
      sort: 'ordem,-periodo,titulo', depth: 1, onde: categoria ? { categoria } : undefined,
    });
    // O Payload usa camelCase (urlExterna); o resto do portal espera os nomes do Directus (url_externa).
    return { ...r, dados: r.dados.map(({ urlExterna, ...d }) => ({ ...d, arquivo: null, arquivo_url: urlMidia(d.arquivo), url_externa: urlExterna, secretaria: null })) as DocumentoPatrimonio[] };
  }
  const filtro = categoria
    ? { status: { _eq: 'publicado' }, categoria: { _eq: categoria } }
    : { status: { _eq: 'publicado' } };
  return listar<DocumentoPatrimonio>('patrimonio_documentos', {
    fields: '*',
    filter: JSON.stringify(filtro),
    sort: 'ordem,-periodo,titulo',
    limit: 300,
  });
}

/** Cronograma de coleta de lixo por bairro/região. */
export function coletaLixo() {
  if (fonteCms('coleta_lixo') === 'payload') {
    return listarPayload<ColetaLixo>('coleta-lixo', { sort: 'nome' });
  }
  return listar<ColetaLixo>('coleta_lixo', {
    fields: 'id,status,nome,dias,horario',
    filter: PUBLICADO,
    sort: 'nome',
    limit: 300,
  });
}

/** Conselhos municipais e a base legal de cada um, agrupados por categoria na
 *  própria página — mesmo padrão de 'perguntasFrequentes' e 'telefonesUteis'. */
export async function conselhosMunicipais() {
  if (fonteCms('conselhos_municipais') === 'payload') {
    // O Payload guarda o texto rico como JSON do Lexical; o campo virtual `conteudoHtml` já vem em HTML.
    const r = await listarPayload<ConselhoMunicipal & { conteudoHtml: string | null }>('conselhos-municipais', { sort: 'categoria,ordem,nome' });
    return { ...r, dados: r.dados.map(({ conteudoHtml, ...c }) => ({ ...c, conteudo: reescreverMidia(conteudoHtml) })) };
  }
  return listar<ConselhoMunicipal>('conselhos_municipais', {
    fields: 'id,status,nome,categoria,conteudo,ordem',
    filter: PUBLICADO,
    sort: 'categoria,ordem,nome',
    limit: 100,
  });
}

/**
 * Busca no conteúdo publicado. Usa o parâmetro `search` do Directus, que por
 * sua vez cai no índice de texto completo configurado no Postgres com a
 * configuração `portugues_sem_acento` — é o que faz "educacao" achar
 * "Educação".
 */
export async function buscar(termo: string, limite = 30) {
  if (fonteCms('noticias') === 'payload') {
    const r = await listarPayload<DocPayload>('noticias', {
      sort: ORDEM_NOTICIAS_PAYLOAD, limit: limite, depth: 1,
      busca: { campos: ['titulo', 'slug', 'resumo', 'imagemDescricao', 'textoBusca'], termo },
    });
    return { ...r, dados: r.dados.map(noticiaDoPayload) };
  }
  return buscarDirectus(termo, limite);
}

function buscarDirectus(termo: string, limite: number) {
  return listar<Noticia>('noticias', {
    fields: CAMPOS_NOTICIA,
    filter: PUBLICADO,
    search: termo,
    sort: '-data_publicacao',
    limit: limite,
  });
}
