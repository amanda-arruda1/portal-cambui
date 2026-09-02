/**
 * Consultas ao CMS, uma função por necessidade de página.
 *
 * O filtro `status: publicado` está em TODAS as consultas: o fluxo editorial é
 * rascunho -> em_revisao -> aprovado -> publicado, e só o último estado é
 * público. Centralizar isso aqui evita que uma página nova esqueça o filtro e
 * vaze rascunho de secretaria.
 */
import { listar, umPor } from './directus';
import type { Documento, LinkUtil, Noticia, Pagina, Secretaria, Selo, Servico } from './tipos';

const PUBLICADO = JSON.stringify({ status: { _eq: 'publicado' } });

const CAMPOS_NOTICIA =
  'id,status,titulo,slug,resumo,conteudo,imagem,imagem_descricao,data_publicacao,destaque,secretaria.nome,secretaria.slug';

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
