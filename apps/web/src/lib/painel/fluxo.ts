/**
 * O fluxo editorial exigido pela prefeitura, escrito uma vez só.
 *
 *   rascunho → em_revisao → aprovado → publicado → arquivado
 *
 * Ele existe em três lugares e os três precisam concordar:
 *   1. aqui, para desenhar os botões da tela;
 *   2. em infra/directus/papeis.json, como permissão de linha — é quem MANDA;
 *   3. no campo 'status' de infra/directus/esquema.json, como lista de valores.
 * Se este arquivo permitir algo que a permissão nega, o resultado é um 403 com
 * mensagem em português — feio, mas seguro. O contrário (tela nega, permissão
 * permite) é só a tela ficando aquém, nunca um vazamento.
 */

import type { Situacao } from '../tipos.ts';
import type { Acao, Sessao } from './sessao.ts';
import { conflitoDeInteresse, podeNoPapel } from './sessao.ts';

export interface Transicao {
  acao: Acao;
  de: Situacao;
  para: Situacao;
  rotulo: string;
  /** Ação que faz conteúdo aparecer para o cidadão ganha confirmação. */
  confirmar?: string;
  /** Destaque visual: 'principal' avança o fluxo, 'secundaria' volta atrás. */
  peso: 'principal' | 'secundaria';
}

export const TRANSICOES: Transicao[] = [
  { acao: 'enviar_para_revisao', de: 'rascunho', para: 'em_revisao', rotulo: 'Enviar para revisão', peso: 'principal' },
  { acao: 'aprovar', de: 'em_revisao', para: 'aprovado', rotulo: 'Aprovar', peso: 'principal' },
  { acao: 'devolver', de: 'em_revisao', para: 'rascunho', rotulo: 'Devolver para ajuste', peso: 'secundaria' },
  {
    acao: 'publicar',
    de: 'aprovado',
    para: 'publicado',
    rotulo: 'Publicar',
    confirmar: 'Publicar deixa este conteúdo visível para qualquer cidadão no site da prefeitura. Confirma?',
    peso: 'principal',
  },
  { acao: 'devolver', de: 'aprovado', para: 'em_revisao', rotulo: 'Devolver para revisão', peso: 'secundaria' },
  {
    acao: 'arquivar',
    de: 'publicado',
    para: 'arquivado',
    rotulo: 'Arquivar',
    confirmar: 'Arquivar tira este conteúdo do site. Ele continua guardado e pode voltar. Confirma?',
    peso: 'secundaria',
  },
];

export interface TransicaoNaTela extends Transicao {
  /** Preenchido quando a transição existe mas esta pessoa não pode fazê-la
   *  agora — mostrar o motivo ensina o fluxo; esconder o botão só confunde. */
  impedimento: string | null;
}

export function transicoesDe(
  sessao: Sessao,
  situacao: Situacao,
  autorDoItem: string | null,
): TransicaoNaTela[] {
  return TRANSICOES.filter((t) => t.de === situacao).flatMap((t) => {
    if (!podeNoPapel(sessao.usuario.papel, t.acao)) return [];

    const impedimento = conflitoDeInteresse(sessao, autorDoItem, t.acao)
      ? 'Você redigiu este item — a conferência precisa ser de outra pessoa.'
      : null;

    return [{ ...t, impedimento }];
  });
}

/**
 * Em que situações cada papel consegue EDITAR o conteúdo de um item.
 *
 * Espelha 'situacoes_editaveis' de infra/directus/papeis.json. O publicador
 * acumula a política do revisor, por isso alcança todas. Serve para mostrar a
 * tela em modo leitura em vez de deixar a pessoa digitar por dez minutos e
 * levar 403 ao salvar — a decisão continua sendo do Directus.
 */
const EDITAVEIS: Record<string, Situacao[]> = {
  'Redator de secretaria': ['rascunho', 'em_revisao'],
  Revisor: ['rascunho', 'em_revisao', 'aprovado'],
  Publicador: ['rascunho', 'em_revisao', 'aprovado', 'publicado', 'arquivado'],
};

export function podeEditar(papel: string | null, situacao: Situacao): boolean {
  return (EDITAVEIS[papel ?? ''] ?? []).includes(situacao);
}

/** Rótulo e cor de cada situação, para as etiquetas das listas. */
export const APARENCIA: Record<Situacao, { rotulo: string; classe: string }> = {
  rascunho: { rotulo: 'Rascunho', classe: 'bg-papel-suave text-grafite border-prata' },
  em_revisao: { rotulo: 'Em revisão', classe: 'bg-azul-claro text-azul-escuro border-azul' },
  aprovado: { rotulo: 'Aprovado', classe: 'bg-papel text-trigo border-trigo' },
  publicado: { rotulo: 'Publicado', classe: 'bg-papel text-verde-texto border-verde' },
  arquivado: { rotulo: 'Arquivado', classe: 'bg-papel-suave text-grafite border-prata' },
};

export const ORDEM_DA_FILA: Situacao[] = ['em_revisao', 'aprovado', 'rascunho', 'publicado', 'arquivado'];

/** O que cada papel vê primeiro ao abrir o painel — a fila que é dele. */
export function filaDoPapel(papel: string | null): { situacoes: Situacao[]; titulo: string } {
  switch (papel) {
    case 'Publicador':
      return { situacoes: ['aprovado', 'em_revisao'], titulo: 'Aguardando publicação' };
    case 'Revisor':
      return { situacoes: ['em_revisao', 'rascunho'], titulo: 'Aguardando revisão' };
    default:
      return { situacoes: ['rascunho', 'em_revisao'], titulo: 'Seus textos em andamento' };
  }
}
