/**
 * Verificação em duas etapas (TOTP).
 *
 * Existe porque a política do Publicador tem `enforce_tfa`: sem o segundo
 * fator, o Directus recusa a sessão. Sem esta tela, a função Publicador era um
 * papel que ninguém conseguia usar — a conta nascia inacessível.
 *
 * ORDEM QUE FUNCIONA, e que não dá para inverter: a pessoa precisa **entrar**
 * para cadastrar o segundo fator, e um Publicador sem segundo fator não entra.
 * Então cadastra-se a pessoa como Revisor, ela entra e cadastra o autenticador,
 * e só depois recebe o papel de Publicador.
 *
 * O segredo nunca é gravado por nós: vai do Directus para a tela (no QR) e
 * volta pelo armazenamento de sessão do servidor. Não entra em log — nem no de
 * acesso, nem no journal.
 */

import QRCode from 'qrcode';
import type { Saida } from './cms.ts';
import type { Sessao } from './sessao.ts';

const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const TEMPO_LIMITE_MS = 10_000;

export interface SegredoPendente {
  secret: string;
  otpauth: string;
}

async function chamar<T>(sessao: Sessao, caminho: string, corpo: unknown): Promise<Saida<T>> {
  try {
    const r = await fetch(`${BASE}${caminho}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessao.acesso}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });

    if (r.ok) {
      if (r.status === 204) return { ok: true, dados: undefined as T };
      const texto = await r.text();
      return { ok: true, dados: (texto ? JSON.parse(texto).data : undefined) as T };
    }

    const erro = (await r.json().catch(() => ({}) as any))?.errors?.[0];
    const codigo = erro?.extensions?.code;
    const mensagem = String(erro?.message ?? '');

    // O Directus usa INVALID_PAYLOAD tanto para senha quanto para código, e a
    // diferença está no texto. Traduzir aqui evita mostrar "Invalid payload"
    // para quem está na secretaria.
    if (mensagem.toLowerCase().includes('otp')) {
      return { ok: false, status: 400, motivo: 'O código não confere. Ele muda a cada 30 segundos — tente o próximo.' };
    }
    if (codigo === 'INVALID_CREDENTIALS' || r.status === 401 || mensagem.toLowerCase().includes('password')) {
      return { ok: false, status: 401, motivo: 'Senha incorreta.' };
    }
    if (codigo === 'INVALID_OTP') {
      return { ok: false, status: 400, motivo: 'O código não confere. Ele muda a cada 30 segundos — tente o próximo.' };
    }
    return { ok: false, status: r.status, motivo: erro?.message || `O sistema respondeu HTTP ${r.status}.` };
  } catch {
    return { ok: false, status: 503, motivo: 'O sistema de conteúdo não respondeu. Tente de novo.' };
  }
}

/**
 * Reescreve o endereço do autenticador.
 *
 * O Directus gera o rótulo como "Directus:<e-mail>", que na tela do celular de
 * quem trabalha na secretaria não quer dizer nada. Só o segredo e os
 * parâmetros de cálculo importam para o código funcionar; o rótulo é texto.
 */
function comNomeDoPortal(otpauth: string, email: string): string {
  try {
    const origem = new URL(otpauth);
    const parametros = new URLSearchParams(origem.search);
    const emissor = 'Portal Cambui';
    parametros.set('issuer', emissor);
    return `otpauth://totp/${encodeURIComponent(`${emissor}:${email}`)}?${parametros.toString()}`;
  } catch {
    return otpauth;
  }
}

export async function gerarSegredo(sessao: Sessao, senha: string): Promise<Saida<SegredoPendente>> {
  const r = await chamar<{ secret: string; otpauth_url: string }>(sessao, '/users/me/tfa/generate', {
    password: senha,
  });
  if (!r.ok) return r;

  return {
    ok: true,
    dados: {
      secret: r.dados.secret,
      otpauth: comNomeDoPortal(r.dados.otpauth_url, sessao.usuario.email),
    },
  };
}

export async function ativar(sessao: Sessao, secret: string, otp: string): Promise<Saida<void>> {
  return chamar<void>(sessao, '/users/me/tfa/enable', { secret, otp });
}

export async function desativar(sessao: Sessao, otp: string): Promise<Saida<void>> {
  return chamar<void>(sessao, '/users/me/tfa/disable', { otp });
}

/** QR em SVG, embutido na página. Nada de imagem gerada por serviço externo:
 *  o segredo do segundo fator não sai desta máquina. */
export async function qrEmSvg(otpauth: string): Promise<string> {
  return QRCode.toString(otpauth, {
    type: 'svg',
    margin: 1,
    width: 240,
    errorCorrectionLevel: 'M',
    color: { dark: '#1A1A1A', light: '#FFFFFF' },
  });
}

/** Agrupa o segredo de 4 em 4 para quem for digitar à mão no celular. */
export function segredoLegivel(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? [secret]).join(' ');
}
