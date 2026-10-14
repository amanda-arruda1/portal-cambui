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
import type { CategoriaPatrimonio, ColetaLixo, ConselhoMunicipal, Documento, DocumentoPatrimonio, LinkUtil, Noticia, Pagina, PerguntaFrequente, Secretaria, Selo, Servico, TelefoneUtil } from './tipos';

const PUBLICADO = JSON.stringify({ status: { _eq: 'publicado' } });

const CAMPOS_NOTICIA =
  'id,status,titulo,slug,resumo,conteudo,imagem,imagem_descricao,arquivo,data_publicacao,destaque,secretaria.nome,secretaria.slug';

export function noticiasRecentes(limite = 9, pagina = 1) {
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

export function noticiaPorSlug(slug: string) {
  return umPor<Noticia>('noticias', {
    fields: CAMPOS_NOTICIA,
    filter: JSON.stringify({ status: { _eq: 'publicado' }, slug: { _eq: slug } }),
  });
}

export function secretarias() {
  return listar<Secretaria>('secretarias', {
    fields: '*',
    filter: PUBLICADO,
    sort: 'ordem,nome',
    limit: 100,
  });
}

export function secretariaPorSlug(slug: string) {
  return umPor<Secretaria>('secretarias', {
    fields: '*',
    filter: JSON.stringify({ status: { _eq: 'publicado' }, slug: { _eq: slug } }),
  });
}

export function servicos(limite = 200) {
  return listar<Servico>('servicos', {
    fields: 'id,status,nome,slug,descricao,categoria,publico_alvo,url_externa,como_solicitar,secretaria.nome,secretaria.slug',
    filter: PUBLICADO,
    sort: 'categoria,nome',
    limit: limite,
  });
}

export function documentos(tipo?: string, limite = 50, pagina = 1) {
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

export function paginaPorSlug(slug: string) {
  return umPor<Pagina>('paginas', {
    fields: '*',
    filter: JSON.stringify({ status: { _eq: 'publicado' }, slug: { _eq: slug } }),
  });
}

/** Um documento por id — usado quando a página precisa de UM documento
 *  específico (ex.: o Organograma Institucional em /estrutura-administrativa),
 *  não uma listagem. */
export function documentoPorId(id: string) {
  return umPor<Documento>('documentos', {
    fields: '*',
    filter: JSON.stringify({ status: { _eq: 'publicado' }, id: { _eq: id } }),
  });
}

export function linksUteis() {
  return listar<LinkUtil>('links_uteis', {
    fields: '*',
    filter: PUBLICADO,
    sort: 'grupo,ordem,nome',
    limit: 100,
  });
}

/** Selos e certificações institucionais — exibidos no rodapé (todas as
 *  páginas) e em detalhe na página de Transparência. */
export function selos() {
  return listar<Selo>('selos', {
    fields: '*',
    filter: PUBLICADO,
    sort: 'ordem,nome',
    limit: 50,
  });
}

/** Perguntas frequentes, agrupadas por categoria na própria página. */
export function perguntasFrequentes() {
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
export function buscar(termo: string, limite = 30) {
  return listar<Noticia>('noticias', {
    fields: CAMPOS_NOTICIA,
    filter: PUBLICADO,
    search: termo,
    sort: '-data_publicacao',
    limit: limite,
  });
}
