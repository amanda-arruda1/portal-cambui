/**
 * Cliente do Directus autenticado como a pessoa da secretaria.
 *
 * Distinção que sustenta o modelo de segurança: aqui NÃO existe token de
 * serviço. Toda requisição vai com o token de quem está na sessão, então quem
 * decide o que ela pode ler ou escrever é a política do Directus
 * (infra/directus/papeis.json), não este arquivo. Um erro de tela vira "403",
 * não vira vazamento.
 *
 * Como em lib/directus.ts, nada aqui lança: o painel precisa dizer "o sistema
 * de conteúdo está fora" em português, não despejar exceção.
 */

import type { Acao, Sessao } from './sessao.ts';
import { conflitoDeInteresse } from './sessao.ts';
import type { Situacao } from '../tipos.ts';

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const TEMPO_LIMITE_MS = 10_000;

export type Saida<T> = { ok: true; dados: T } | { ok: false; motivo: string; status: number };

/** Coleções que o painel edita. Lista fechada: caminho de coleção não vem da
 *  URL sem passar por aqui, senão vira leitura arbitrária do CMS. */
export const COLECOES_EDITAVEIS = ['noticias', 'documentos', 'servicos', 'paginas', 'links_uteis', 'secretarias'] as const;
export type ColecaoEditavel = (typeof COLECOES_EDITAVEIS)[number];

export function colecaoValida(nome: string): nome is ColecaoEditavel {
  return (COLECOES_EDITAVEIS as readonly string[]).includes(nome);
}

/** Resolve o parâmetro de rota para uma coleção da lista, ou null. É o que
 *  impede /painel/directus_users de virar uma tela. */
export function colecaoOuNulo(bruto: string): ColecaoEditavel | null {
  return colecaoValida(bruto) ? bruto : null;
}

/** Rótulos das coleções, para título de tela e mensagem de erro. */
export const ROTULO: Record<ColecaoEditavel, string> = {
  noticias: 'Notícias',
  documentos: 'Documentos e editais',
  servicos: 'Serviços',
  paginas: 'Páginas',
  links_uteis: 'Links úteis',
  secretarias: 'Secretarias',
};

async function chamar<T>(sessao: Sessao, caminho: string, opcoes: RequestInit = {}): Promise<Saida<T>> {
  try {
    const r = await fetch(`${BASE}${caminho}`, {
      ...opcoes,
      headers: {
        Authorization: `Bearer ${sessao.acesso}`,
        ...(opcoes.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(opcoes.headers ?? {}),
      },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });

    // 401 é sessão inválida (token vencido, Directus reiniciado com outra
    // chave, usuário removido) — não é falta de permissão. Quem trata é a
    // página, mandando a pessoa de volta à tela de entrada; devolver a
    // mensagem crua do CMS deixaria "Invalid user credentials." em inglês na
    // cara de quem está na secretaria.
    if (r.status === 401) {
      return { ok: false, status: 401, motivo: 'Sua sessão expirou. Entre novamente.' };
    }
    if (r.status === 403) {
      return { ok: false, status: 403, motivo: 'Sua função no portal não permite esta operação.' };
    }
    if (r.status === 404) {
      return { ok: false, status: 404, motivo: 'Este item não existe mais ou está fora do seu alcance.' };
    }
    if (!r.ok) {
      const corpo = await r.json().catch(() => ({} as any));
      const primeiro = corpo?.errors?.[0]?.message;
      return { ok: false, status: r.status, motivo: primeiro || `O sistema de conteúdo respondeu HTTP ${r.status}.` };
    }

    // DELETE e algumas operações devolvem 204 sem corpo.
    if (r.status === 204) return { ok: true, dados: undefined as T };
    return { ok: true, dados: (await r.json()).data as T };
  } catch (erro) {
    const detalhe = erro instanceof Error && erro.name === 'TimeoutError' ? 'demorou demais para responder' : 'não respondeu';
    return { ok: false, status: 503, motivo: `O sistema de conteúdo ${detalhe}. Tente de novo em alguns minutos.` };
  }
}

export interface ItemDaFila {
  id: string;
  status: Situacao;
  /** 'titulo' nas coleções de texto, 'nome' nas demais — normalizado aqui. */
  rotulo: string;
  date_updated: string | null;
  user_created: string | null;
  user_updated: string | null;
}

/** Coleções cujo campo de identificação é 'nome' e não 'titulo'. */
const CAMPO_ROTULO: Record<ColecaoEditavel, 'titulo' | 'nome'> = {
  noticias: 'titulo',
  documentos: 'titulo',
  paginas: 'titulo',
  servicos: 'nome',
  links_uteis: 'nome',
  secretarias: 'nome',
};

export async function listarFila(
  sessao: Sessao,
  colecao: ColecaoEditavel,
  situacoes: Situacao[],
  limite = 50,
): Promise<Saida<ItemDaFila[]>> {
  const rotulo = CAMPO_ROTULO[colecao];
  const parametros = new URLSearchParams({
    fields: `id,status,${rotulo},date_updated,user_created,user_updated`,
    sort: '-date_updated',
    limit: String(limite),
    'filter[status][_in]': situacoes.join(','),
  });

  const r = await chamar<Array<Record<string, any>>>(sessao, `/items/${colecao}?${parametros}`);
  if (!r.ok) return r;

  return {
    ok: true,
    dados: r.dados.map((i) => ({
      id: i.id,
      status: i.status,
      rotulo: i[rotulo] ?? '(sem título)',
      date_updated: i.date_updated ?? null,
      user_created: i.user_created ?? null,
      user_updated: i.user_updated ?? null,
    })),
  };
}

/** Quantos itens há em cada situação — o painel abre mostrando a fila. */
export async function contarPorSituacao(
  sessao: Sessao,
  colecao: ColecaoEditavel,
): Promise<Saida<Record<string, number>>> {
  const parametros = new URLSearchParams({ groupBy: 'status', aggregate: JSON.stringify({ count: 'id' }) });
  const r = await chamar<Array<{ status: string; count: { id: number | string } }>>(
    sessao,
    `/items/${colecao}?${parametros}`,
  );
  if (!r.ok) return r;

  const contagem: Record<string, number> = {};
  for (const linha of r.dados) contagem[linha.status] = Number(linha.count?.id ?? 0);
  return { ok: true, dados: contagem };
}

/**
 * Muda a situação de um item.
 *
 * Se a transição é permitida para o papel, quem decide é o Directus, pela
 * 'validation' da permissão de update. O que ESTA função garante é a outra
 * regra, a que o Directus não expressa: ninguém aprova nem publica o próprio
 * texto.
 *
 * O autor é lido do CMS aqui dentro, de propósito. A versão anterior confiava
 * no campo oculto 'autor' que vinha do formulário — e campo de formulário é
 * dado do cliente: bastava forjar outro identificador para aprovar o próprio
 * texto. Foi reproduzido em teste antes da correção. O valor que a tela envia
 * agora serve só para decidir se o botão aparece.
 */
export async function mudarSituacao(
  sessao: Sessao,
  colecao: ColecaoEditavel,
  id: string,
  destino: Situacao,
  acao?: Acao,
): Promise<Saida<{ id: string; status: Situacao }>> {
  if (acao === 'aprovar' || acao === 'publicar') {
    const atual = await chamar<{ user_created: string | null }>(
      sessao,
      `/items/${colecao}/${encodeURIComponent(id)}?fields=user_created`,
    );
    if (!atual.ok) return atual;

    if (conflitoDeInteresse(sessao, atual.dados.user_created ?? null, acao)) {
      return {
        ok: false,
        status: 409,
        motivo: 'Você redigiu este item — a conferência precisa ser de outra pessoa.',
      };
    }
  }

  return chamar(sessao, `/items/${colecao}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: destino }),
  });
}

/** Um item inteiro, para preencher o formulário de edição. */
export async function obterItem(
  sessao: Sessao,
  colecao: ColecaoEditavel,
  id: string,
  campos: string[],
): Promise<Saida<Record<string, any>>> {
  const parametros = new URLSearchParams({
    fields: ['id', 'status', 'user_created', 'date_updated', ...campos].join(','),
  });
  return chamar(sessao, `/items/${colecao}/${encodeURIComponent(id)}?${parametros}`);
}

export async function criarItem(
  sessao: Sessao,
  colecao: ColecaoEditavel,
  valores: Record<string, unknown>,
): Promise<Saida<{ id: string }>> {
  return chamar(sessao, `/items/${colecao}`, { method: 'POST', body: JSON.stringify(valores) });
}

export async function atualizarItem(
  sessao: Sessao,
  colecao: ColecaoEditavel,
  id: string,
  valores: Record<string, unknown>,
): Promise<Saida<{ id: string }>> {
  return chamar(sessao, `/items/${colecao}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(valores),
  });
}

export interface OpcaoSecretaria {
  id: string;
  nome: string;
}

/**
 * Secretarias para o seletor do formulário.
 *
 * Devolve só o que a política do papel deixa ler: o redator enxerga uma
 * (a dele), o revisor enxerga todas. Não há filtro nosso aqui de propósito —
 * quem restringe é o Directus, e duplicar a regra criaria divergência.
 */
export async function listarSecretarias(sessao: Sessao): Promise<Saida<OpcaoSecretaria[]>> {
  const parametros = new URLSearchParams({ fields: 'id,nome', sort: 'nome', limit: '-1' });
  return chamar<OpcaoSecretaria[]>(sessao, `/items/secretarias?${parametros}`);
}

/**
 * Identificador da pasta de arquivos públicos, resolvido pelo nome.
 *
 * O campo 'folder' do Directus é uma chave UUID, não um rótulo. Mandar o nome
 * ("publicos") faz o Postgres recusar com
 * `invalid input syntax for type uuid`, e o envio inteiro morre com HTTP 500 —
 * foi o que aconteceu com os primeiros arquivos enviados de verdade.
 *
 * Resolvido em tempo de execução e guardado em memória: assim a pasta pode ser
 * recriada pelo painel do Directus sem que nada aqui precise mudar.
 *
 * Pasta ausente FALHA o envio, de propósito. A versão anterior caía para a raiz
 * "para não recusar um edital" — e o resultado era pior: o arquivo ficava
 * gravado e invisível, porque a política pública só libera leitura do que está
 * na pasta. O edital não era publicado de verdade, e ninguém percebia até um
 * cidadão reclamar do link morto. Recusar na hora é o que produz um chamado
 * para a TI em vez de conteúdo fantasma.
 */
let pastaPublicaId: string | null | undefined;

async function idDaPastaPublica(sessao: Sessao, nome: string): Promise<string | null> {
  if (pastaPublicaId !== undefined) return pastaPublicaId;

  const parametros = new URLSearchParams({ 'filter[name][_eq]': nome, fields: 'id', limit: '1' });
  const r = await chamar<Array<{ id: string }>>(sessao, `/folders?${parametros}`);

  if (!r.ok || !r.dados[0]) {
    console.error(`[upload] pasta "${nome}" não encontrada no CMS — envios de arquivo estão bloqueados.`);
    pastaPublicaId = null;
  } else {
    pastaPublicaId = r.dados[0].id;
  }
  return pastaPublicaId;
}

export interface ArquivoEnviado {
  id: string;
  filename_download: string;
  type: string;
  filesize: number;
}

/**
 * Entrega ao Directus um arquivo JÁ INSPECIONADO.
 *
 * Só é chamada depois de lib/upload/inspecionar() aprovar. Manter esta função
 * "burra" é proposital: quem decide o que entra é um lugar só, e ele tem
 * bateria de teste.
 */
export async function enviarArquivo(
  sessao: Sessao,
  dados: Uint8Array,
  nome: string,
  tipoMime: string,
  pasta?: string,
): Promise<Saida<ArquivoEnviado>> {
  const forma = new FormData();

  // 'pasta' chega como NOME (é o que está em papeis.json e faz sentido ler);
  // o Directus quer o UUID.
  if (pasta) {
    const idPasta = await idDaPastaPublica(sessao, pasta);
    if (!idPasta) {
      return {
        ok: false,
        status: 500,
        motivo:
          `A pasta de arquivos públicos ("${pasta}") não existe no sistema de conteúdo. ` +
          'O arquivo não foi guardado porque ficaria invisível para o cidadão. Avise a TI.',
      };
    }
    forma.append('folder', idPasta);
  }
  forma.append('title', nome);
  // O campo do arquivo tem de ser o ÚLTIMO: o Directus lê os metadados na
  // ordem em que chegam e ignora o que vier depois do binário.
  forma.append('file', new Blob([dados as BufferSource], { type: tipoMime }), nome);

  return chamar<ArquivoEnviado>(sessao, '/files', { method: 'POST', body: forma });
}
