/**
 * Cadastro de pessoas que usam o painel.
 *
 * Existe porque o painel do Directus não é alcançável (o registro `admin.`
 * nunca foi criado) e porque o projeto pediu que as secretarias nunca o vejam.
 * Esta tela é para a TI: só quem tem o papel Administrator chega nela.
 *
 * Como em todo o resto do painel, quem decide o que pode é o Directus — as
 * requisições vão com o token de quem está na sessão. Um Revisor que forjasse
 * a URL levaria 403 do CMS, não daqui.
 */

import type { Saida } from './cms.ts';
import type { Sessao } from './sessao.ts';

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const TEMPO_LIMITE_MS = 10_000;

/**
 * Papel de administração do CMS.
 *
 * No Directus ele carrega `admin_access`: ignora TODA permissão de coleção, lê e
 * escreve qualquer registro e mexe em papéis — inclusive para criar outros
 * administradores. Não é "um degrau acima de Publicador", é o dono do CMS.
 *
 * Por isso ele é atribuível por aqui, mas nunca por um clique só: as duas telas
 * exigem uma confirmação marcada à parte do select.
 */
export const PAPEL_ADMIN = 'Administrator';

/** Papéis do fluxo editorial, na ordem em que fazem sentido para quem cadastra. */
export const PAPEIS_DO_FLUXO = ['Redator de secretaria', 'Revisor', 'Publicador'] as const;

/**
 * O que a tela de pessoas oferece: o fluxo editorial e o administrador, nesta
 * ordem — o administrador por último porque é a exceção, não o padrão.
 *
 * ARMADILHA: a política do Administrator NÃO tem `enforce_tfa` (a do Publicador
 * tem). Uma conta de administrador entra só com senha, e é a conta mais poderosa
 * do portal. Quem criar uma precisa mandar a pessoa cadastrar o autenticador em
 * /painel/conta — as telas avisam isso, o Directus não avisa.
 */
export const PAPEIS_ATRIBUIVEIS = [...PAPEIS_DO_FLUXO, PAPEL_ADMIN] as const;

/** Ordena os papéis oferecidos como em PAPEIS_ATRIBUIVEIS; desconhecido vai ao fim. */
export function ordenarPapeis<T extends { name: string }>(lista: T[]): T[] {
  const pos = (n: string) => {
    const i = (PAPEIS_ATRIBUIVEIS as readonly string[]).indexOf(n);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...lista].sort((a, b) => pos(a.name) - pos(b.name));
}

export interface Papel {
  id: string;
  name: string;
  description: string | null;
}

export interface Pessoa {
  id: string;
  email: string;
  nome: string;
  papel: string | null;
  papelId: string | null;
  secretaria: string | null;
  secretariaNome: string | null;
  situacao: string;
  temSegundoFator: boolean;
  ultimoAcesso: string | null;
}

async function chamar<T>(sessao: Sessao, caminho: string, opcoes: RequestInit = {}): Promise<Saida<T>> {
  try {
    const r = await fetch(`${BASE}${caminho}`, {
      ...opcoes,
      headers: {
        Authorization: `Bearer ${sessao.acesso}`,
        'Content-Type': 'application/json',
        ...(opcoes.headers ?? {}),
      },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });

    if (r.status === 401) return { ok: false, status: 401, motivo: 'Sua sessão expirou. Entre novamente.' };
    if (r.status === 403) {
      return { ok: false, status: 403, motivo: 'Só quem administra o portal pode gerenciar usuários.' };
    }
    if (!r.ok) {
      const corpo = await r.json().catch(() => ({}) as any);
      const primeiro = corpo?.errors?.[0];
      // O Directus devolve RECORD_NOT_UNIQUE quando o e-mail já existe — a
      // mensagem crua fala em "field" e "collection", que não ajuda ninguém.
      if (primeiro?.extensions?.code === 'RECORD_NOT_UNIQUE') {
        return { ok: false, status: r.status, motivo: 'Já existe uma conta com esse e-mail.' };
      }
      return { ok: false, status: r.status, motivo: primeiro?.message || `O CMS respondeu HTTP ${r.status}.` };
    }

    if (r.status === 204) return { ok: true, dados: undefined as T };
    return { ok: true, dados: (await r.json()).data as T };
  } catch (erro) {
    const detalhe = erro instanceof Error && erro.name === 'TimeoutError' ? 'demorou demais' : 'não respondeu';
    return { ok: false, status: 503, motivo: `O sistema de conteúdo ${detalhe}. Tente de novo.` };
  }
}

function converter(d: Record<string, any>): Pessoa {
  return {
    id: d.id,
    email: d.email,
    nome: [d.first_name, d.last_name].filter(Boolean).join(' ') || d.email,
    papel: d.role?.name ?? null,
    papelId: d.role?.id ?? null,
    secretaria: d.secretaria?.id ?? null,
    secretariaNome: d.secretaria?.nome ?? null,
    situacao: d.status ?? 'active',
    temSegundoFator: Boolean(d.tfa_secret),
    ultimoAcesso: d.last_access ?? null,
  };
}

const CAMPOS =
  'id,email,first_name,last_name,status,tfa_secret,last_access,role.id,role.name,secretaria.id,secretaria.nome';

export async function listarPessoas(sessao: Sessao): Promise<Saida<Pessoa[]>> {
  const p = new URLSearchParams({ fields: CAMPOS, sort: 'email', limit: '-1' });
  const r = await chamar<Array<Record<string, any>>>(sessao, `/users?${p}`);
  return r.ok ? { ok: true, dados: r.dados.map(converter) } : r;
}

export async function obterPessoa(sessao: Sessao, id: string): Promise<Saida<Pessoa>> {
  const p = new URLSearchParams({ fields: CAMPOS });
  const r = await chamar<Record<string, any>>(sessao, `/users/${encodeURIComponent(id)}?${p}`);
  return r.ok ? { ok: true, dados: converter(r.dados) } : r;
}

export async function listarPapeis(sessao: Sessao): Promise<Saida<Papel[]>> {
  const p = new URLSearchParams({ fields: 'id,name,description', sort: 'name', limit: '-1' });
  return chamar<Papel[]>(sessao, `/roles?${p}`);
}

export interface DadosDaPessoa {
  email: string;
  nome: string;
  sobrenome: string;
  papelId: string | null;
  secretaria: string | null;
  situacao: string;
}

export async function criarPessoa(
  sessao: Sessao,
  dados: DadosDaPessoa,
  senha: string,
): Promise<Saida<{ id: string }>> {
  return chamar<{ id: string }>(sessao, '/users', {
    method: 'POST',
    body: JSON.stringify({
      email: dados.email,
      password: senha,
      first_name: dados.nome || null,
      last_name: dados.sobrenome || null,
      role: dados.papelId,
      secretaria: dados.secretaria,
      status: dados.situacao,
    }),
  });
}

export async function atualizarPessoa(
  sessao: Sessao,
  id: string,
  dados: Partial<DadosDaPessoa> & { senha?: string },
): Promise<Saida<{ id: string }>> {
  const corpo: Record<string, unknown> = {};
  if (dados.email !== undefined) corpo.email = dados.email;
  if (dados.nome !== undefined) corpo.first_name = dados.nome || null;
  if (dados.sobrenome !== undefined) corpo.last_name = dados.sobrenome || null;
  if (dados.papelId !== undefined) corpo.role = dados.papelId;
  if (dados.secretaria !== undefined) corpo.secretaria = dados.secretaria;
  if (dados.situacao !== undefined) corpo.status = dados.situacao;
  if (dados.senha) corpo.password = dados.senha;

  return chamar<{ id: string }>(sessao, `/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(corpo),
  });
}

/**
 * Senha inicial forte, gerada no servidor.
 *
 * Só letras e números: senha com símbolo se perde num copiar-e-colar por
 * WhatsApp ou numa leitura por telefone, que é como ela vai chegar à
 * secretaria de verdade. 20 caracteres desse alfabeto já são muito mais
 * entropia do que qualquer senha que uma pessoa escolheria.
 */
export function gerarSenha(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}

export const SITUACOES = [
  { valor: 'active', rotulo: 'Ativo' },
  { valor: 'suspended', rotulo: 'Suspenso' },
  { valor: 'archived', rotulo: 'Arquivado' },
];
