/**
 * Troca da própria senha, pela tela "Minha conta".
 *
 * Diferente do reset feito pelo administrador (usuarios.ts, que gera uma senha
 * e a mostra uma vez), aqui é a própria pessoa escolhendo — por isso a troca
 * exige confirmar a senha atual antes.
 *
 * O Directus não tem endpoint dedicado a "trocar senha confirmando a atual":
 * PATCH /users/me aceita a senha nova sem perguntar a antiga, pois confia no
 * token da sessão. A confirmação é reaproveitada de /auth/login (mesma conta
 * que sessao.ts já usa para entrar) — se ele aceitar e-mail+senha atual, ela
 * confere. Numa conta com segundo fator, /auth/login responde "falta o
 * código" (otp_necessario) só DEPOIS de validar a senha (ver o comentário em
 * sessao.ts sobre 'tinhaCodigo') — então essa resposta também conta como
 * senha correta, sem exigir o código aqui.
 */

import { entrar, MENSAGEM } from './sessao.ts';
import type { Sessao } from './sessao.ts';
import type { Saida } from './cms.ts';

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const TEMPO_LIMITE_MS = 10_000;

export async function trocarSenha(sessao: Sessao, senhaAtual: string, senhaNova: string): Promise<Saida<void>> {
  if (!senhaAtual) return { ok: false, status: 400, motivo: 'Informe a senha atual.' };
  if (senhaNova.length < 8) {
    return { ok: false, status: 400, motivo: 'A nova senha precisa de pelo menos 8 caracteres.' };
  }
  if (senhaNova === senhaAtual) {
    return { ok: false, status: 400, motivo: 'A nova senha precisa ser diferente da atual.' };
  }

  const teste = await entrar(sessao.usuario.email, senhaAtual);
  if (!teste.ok && teste.falha.tipo !== 'otp_necessario') {
    if (teste.falha.tipo === 'credenciais') return { ok: false, status: 401, motivo: 'Senha atual incorreta.' };
    return { ok: false, status: 503, motivo: MENSAGEM[teste.falha.tipo] };
  }

  try {
    const r = await fetch(`${BASE}/users/me`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sessao.acesso}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: senhaNova }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (r.ok) return { ok: true, dados: undefined };

    const corpo = await r.json().catch(() => ({}) as any);
    const motivo = corpo?.errors?.[0]?.message;
    return { ok: false, status: r.status, motivo: motivo || `O sistema de conteúdo respondeu HTTP ${r.status}.` };
  } catch {
    return { ok: false, status: 503, motivo: 'O sistema de conteúdo não respondeu. Tente de novo.' };
  }
}
