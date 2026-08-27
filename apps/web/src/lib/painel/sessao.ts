/**
 * Sessão de quem contribui com conteúdo.
 *
 * A prefeitura pediu que as secretarias NÃO usem o painel do Directus. Então o
 * Astro é quem autentica: recebe usuário e senha, troca com o Directus por um
 * par de tokens e guarda esse par na sessão do servidor. O navegador da
 * secretaria recebe só o cookie de sessão do Astro — o token do CMS nunca sai
 * do host.
 *
 * Consequência boa: sair do painel invalida a sessão no servidor; token
 * roubado do navegador não existe porque nunca esteve lá.
 */

import type { AstroCookies } from 'astro';

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const TEMPO_LIMITE_MS = 10_000;

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  /** Nome do papel ("Redator de secretaria", "Revisor", "Publicador"). */
  papel: string | null;
  /** UUID da secretaria a que pertence; null para revisor/publicador. */
  secretaria: string | null;
  secretariaNome: string | null;
  /** Se a pessoa já configurou o segundo fator. */
  temSegundoFator: boolean;
}

export interface Sessao {
  acesso: string;
  renovacao: string;
  /** Instante (ms) em que o token de acesso expira. */
  expiraEm: number;
  usuario: Usuario;
}

/** Chave única dentro da sessão do Astro. */
const CHAVE = 'painel';

/* ---------- erros com texto para quem está na secretaria ---------- */

export type FalhaEntrada =
  | { tipo: 'credenciais' }
  | { tipo: 'email_malformado' }
  | { tipo: 'otp_necessario' }
  | { tipo: 'otp_invalido' }
  | { tipo: 'segundo_fator_ausente' }
  | { tipo: 'cms_indisponivel'; detalhe: string }
  | { tipo: 'sem_papel' };

export const MENSAGEM: Record<FalhaEntrada['tipo'], string> = {
  credenciais: 'E-mail ou senha incorretos.',
  email_malformado: 'Esse endereço de e-mail não está completo. Confira e tente de novo.',
  otp_necessario: 'Informe o código de seis dígitos do seu aplicativo autenticador.',
  otp_invalido: 'O código do autenticador não confere. Ele muda a cada 30 segundos — tente o próximo.',
  segundo_fator_ausente:
    'Sua função exige verificação em duas etapas e ela ainda não foi configurada. Procure a TI para ativar o segundo fator antes de entrar.',
  cms_indisponivel: 'O sistema de conteúdo está indisponível no momento. Tente novamente em alguns minutos.',
  sem_papel: 'Sua conta não tem função definida no portal. Procure a TI.',
};

/* ---------- conversa com o Directus ---------- */

async function pedir(caminho: string, opcoes: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', ...(opcoes.headers ?? {}) },
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
}

/** Códigos que o Directus usa quando o segundo fator está no caminho. */
function classificarErro(corpo: unknown, status: number): FalhaEntrada {
  const erros = (corpo as { errors?: Array<{ message?: string; extensions?: { code?: string } }> })?.errors ?? [];
  const codigos = erros.map((e) => e.extensions?.code ?? '');
  const mensagens = erros.map((e) => (e.message ?? '').toLowerCase());

  if (codigos.includes('INVALID_OTP')) return { tipo: 'otp_invalido' };
  // O Directus recusa e-mail malformado com 400 antes de olhar a senha. Sem
  // este caso, quem digitasse o endereço pela metade lia "sistema
  // indisponível" e abriria chamado com a TI por um erro de digitação.
  if (codigos.includes('INVALID_PAYLOAD')) return { tipo: 'email_malformado' };
  // O Directus responde INVALID_CREDENTIALS com a mensagem citando o OTP tanto
  // quando falta quanto quando a conta não tem segundo fator configurado.
  if (mensagens.some((m) => m.includes('otp') || m.includes('two-factor') || m.includes('tfa'))) {
    return { tipo: 'otp_necessario' };
  }
  if (status === 401 || codigos.includes('INVALID_CREDENTIALS')) return { tipo: 'credenciais' };
  return { tipo: 'cms_indisponivel', detalhe: `HTTP ${status}` };
}

async function perfil(acesso: string): Promise<Usuario | null> {
  const r = await pedir(
    '/users/me?fields=id,first_name,last_name,email,tfa_secret,role.name,secretaria.id,secretaria.nome',
    { headers: { Authorization: `Bearer ${acesso}` } },
  );
  if (!r.ok) return null;
  const d = (await r.json()).data as Record<string, any>;

  return {
    id: d.id,
    nome: [d.first_name, d.last_name].filter(Boolean).join(' ') || d.email,
    email: d.email,
    papel: d.role?.name ?? null,
    secretaria: d.secretaria?.id ?? null,
    secretariaNome: d.secretaria?.nome ?? null,
    // O Directus não devolve o segredo em si; devolve preenchido ou nulo.
    temSegundoFator: Boolean(d.tfa_secret),
  };
}

export async function entrar(
  email: string,
  senha: string,
  otp?: string,
): Promise<{ ok: true; sessao: Sessao } | { ok: false; falha: FalhaEntrada }> {
  let resposta: Response;
  try {
    resposta = await pedir('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: senha, ...(otp ? { otp } : {}) }),
    });
  } catch (erro) {
    return { ok: false, falha: { tipo: 'cms_indisponivel', detalhe: erro instanceof Error ? erro.message : 'falha de rede' } };
  }

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    return { ok: false, falha: classificarErro(corpo, resposta.status) };
  }

  const dados = (await resposta.json()).data as { access_token: string; refresh_token: string; expires: number };
  const usuario = await perfil(dados.access_token);
  if (!usuario) return { ok: false, falha: { tipo: 'cms_indisponivel', detalhe: 'não foi possível ler o perfil' } };
  if (!usuario.papel) return { ok: false, falha: { tipo: 'sem_papel' } };

  return {
    ok: true,
    sessao: {
      acesso: dados.access_token,
      renovacao: dados.refresh_token,
      // Margem de 30 s: renovar um pouco antes evita a corrida entre a
      // verificação e a requisição que vem logo em seguida.
      expiraEm: Date.now() + dados.expires - 30_000,
      usuario,
    },
  };
}

async function renovar(sessao: Sessao): Promise<Sessao | null> {
  try {
    const r = await pedir('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: sessao.renovacao, mode: 'json' }),
    });
    if (!r.ok) return null;
    const d = (await r.json()).data as { access_token: string; refresh_token: string; expires: number };
    return { ...sessao, acesso: d.access_token, renovacao: d.refresh_token, expiraEm: Date.now() + d.expires - 30_000 };
  } catch {
    return null;
  }
}

/* ---------- ponte com a sessão do Astro ---------- */

/** Tipo mínimo da sessão do Astro usado aqui — evita depender do formato
 *  interno do adaptador. */
type Armazem = {
  get: (chave: string) => Promise<unknown>;
  set: (chave: string, valor: unknown) => void;
  destroy?: () => void;
};

export async function guardar(armazem: Armazem, sessao: Sessao): Promise<void> {
  armazem.set(CHAVE, sessao);
}

/**
 * Devolve a sessão válida, renovando o token se necessário. null quando não há
 * ninguém autenticado — o middleware trata como "vá para a tela de entrada".
 */
export async function recuperar(armazem: Armazem): Promise<Sessao | null> {
  const guardada = (await armazem.get(CHAVE)) as Sessao | undefined;
  if (!guardada?.acesso) return null;

  if (Date.now() < guardada.expiraEm) return guardada;

  const renovada = await renovar(guardada);
  if (!renovada) {
    armazem.destroy?.();
    return null;
  }
  armazem.set(CHAVE, renovada);
  return renovada;
}

export async function sair(armazem: Armazem, cookies: AstroCookies): Promise<void> {
  const sessao = (await armazem.get(CHAVE)) as Sessao | undefined;
  if (sessao?.renovacao) {
    // Melhor esforço: derrubar o refresh_token do lado do Directus também.
    // Se falhar, a sessão local morre de qualquer jeito logo abaixo.
    await pedir('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: sessao.renovacao, mode: 'json' }),
    }).catch(() => undefined);
  }
  armazem.destroy?.();
  cookies.delete('astro-session', { path: '/' });
}

/* ---------- o que cada papel pode fazer no fluxo ---------- */

export type Acao = 'criar' | 'enviar_para_revisao' | 'aprovar' | 'devolver' | 'publicar' | 'arquivar';

/**
 * Espelha as permissões de infra/directus/papeis.json — de propósito.
 *
 * O Directus é quem DECIDE: se esta função errar para mais, a requisição é
 * recusada pelo CMS. O papel dela é só não mostrar botão que vai dar erro.
 * Nunca inverter essa ordem: tela não é controle de acesso.
 */
export function podeNoPapel(papel: string | null, acao: Acao): boolean {
  switch (papel) {
    // Papel que o próprio Directus cria na instalação. Tem admin_access, ou
    // seja, ignora permissão de linha por definição — esconder botão dele não
    // protege nada e só impediria a TI de semear o conteúdo inicial pelo
    // painel, que é a única tela disponível enquanto admin. não resolve no DNS.
    case 'Administrator':
      return true;
    case 'Redator de secretaria':
      return acao === 'criar' || acao === 'enviar_para_revisao';
    case 'Revisor':
      return acao === 'criar' || acao === 'enviar_para_revisao' || acao === 'aprovar' || acao === 'devolver';
    case 'Publicador':
      return true;
    default:
      return false;
  }
}

/**
 * Regra que o Directus não consegue expressar como permissão de linha:
 * ninguém aprova nem publica o próprio texto. Depende de comparar o autor do
 * item com quem está pedindo, e permissão de linha não alcança isso.
 */
export function conflitoDeInteresse(sessao: Sessao, autorDoItem: string | null, acao: Acao): boolean {
  if (acao !== 'aprovar' && acao !== 'publicar') return false;
  return Boolean(autorDoItem) && autorDoItem === sessao.usuario.id;
}
