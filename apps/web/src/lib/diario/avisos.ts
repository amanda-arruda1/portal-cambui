/**
 * Avisos de nova edição do Diário por e-mail — o lado do portal.
 *
 * Mesma arquitetura dos avisos de licitação, e pelas mesmas razões: o portal
 * ESCREVE NA FILA e devolve o controle; quem envia é o serviço `portal-avisos`.
 * O processo web roda com `IPAddressDeny=any` e não ganha saída para a internet
 * só para mandar mensagem.
 *
 * Usa o mesmo token de serviço dos avisos de licitação — ver
 * infra/directus/diario/aplicar-avisos.mjs para por que não é um terceiro.
 */
const BASE = (process.env.DIRECTUS_INTERNAL_URL || 'http://127.0.0.1:8055').replace(/\/+$/, '');
const TOKEN = process.env.DIRECTUS_TOKEN_AVISOS || '';

export const AVISOS_LIGADOS = TOKEN.length > 0;

export type Saida<T> = { ok: true; dados: T } | { ok: false; motivo: string };

async function api<T>(caminho: string, opcoes: RequestInit = {}): Promise<Saida<T>> {
  if (!TOKEN) return { ok: false, motivo: 'O serviço de avisos ainda não foi configurado.' };
  try {
    const r = await fetch(`${BASE}${caminho}`, {
      ...opcoes,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(opcoes.headers ?? {}) },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      const corpo = await r.json().catch(() => ({}) as any);
      const e = corpo?.errors?.[0];
      if (e?.extensions?.code === 'RECORD_NOT_UNIQUE') return { ok: false, motivo: 'JA_EXISTE' };
      if (e?.extensions?.code === 'INVALID_PAYLOAD') return { ok: false, motivo: 'EMAIL_INVALIDO' };
      return { ok: false, motivo: e?.message ?? `HTTP ${r.status}` };
    }
    if (r.status === 204) return { ok: true, dados: undefined as T };
    return { ok: true, dados: (await r.json()).data as T };
  } catch {
    return { ok: false, motivo: 'O sistema não respondeu.' };
  }
}

function gerarToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const escapar = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface AssinanteDiario {
  id: string; email: string; token: string; confirmado: boolean;
  cadernos: string | null; secretarias: string | null; palavras_chave: string | null;
}

export function corpoConfirmacao(base: string, assinante: { email: string; token: string }) {
  const confirmar = `${base}/diario-oficial/avisos/confirmar?t=${assinante.token}`;
  const sair = `${base}/diario-oficial/avisos/sair?t=${assinante.token}`;

  const texto = [
    'Diário Oficial Eletrônico do Município de Cambuí',
    '',
    `Alguém (esperamos que você) cadastrou o endereço ${assinante.email} para`,
    'receber aviso quando o município publicar uma nova edição do Diário Oficial.',
    '',
    'Confirme clicando no endereço abaixo. Enquanto você não confirmar, NENHUM',
    'aviso é enviado.',
    '',
    confirmar,
    '',
    'Se não foi você, ignore esta mensagem — sem a confirmação, o cadastro não',
    'produz efeito nenhum. Se preferir, pode apagá-lo agora:',
    '',
    sair,
    '',
    '--',
    'Este é um envio automático; não responda a esta mensagem.',
    'O aviso por e-mail é uma cortesia e NÃO substitui a publicação oficial:',
    'o que produz efeitos é a edição publicada no Diário Oficial, na data de',
    'publicação legal indicada em cada edição.',
  ].join('\n');

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#e9edea;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#141c18;line-height:1.6">
<table role="presentation" style="max-width:560px;margin:0 auto;background:#fff;border-radius:6px;border-top:5px solid #0c5430" cellpadding="0" cellspacing="0" width="100%">
<tr><td style="padding:28px 28px 8px">
<p style="margin:0;font-size:13px;letter-spacing:.09em;text-transform:uppercase;color:#4c5a51">Município de Cambuí — Minas Gerais</p>
<h1 style="margin:8px 0 0;font-size:24px;line-height:1.2">Confirme seu cadastro nos avisos do Diário Oficial</h1>
</td></tr>
<tr><td style="padding:16px 28px">
<p style="margin:0 0 16px">Alguém — esperamos que você — cadastrou <strong>${escapar(assinante.email)}</strong> para receber aviso quando o município publicar uma nova edição do Diário Oficial.</p>
<p style="margin:0 0 20px"><strong>Enquanto você não confirmar, nenhum aviso é enviado.</strong></p>
<p style="margin:0 0 24px"><a href="${confirmar}" style="display:inline-block;background:#0c5430;color:#fff;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:4px">Confirmar meu cadastro</a></p>
<p style="margin:0 0 8px;font-size:14px;color:#4c5a51">Se o botão não funcionar, copie este endereço:</p>
<p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${confirmar}" style="color:#0c5430">${confirmar}</a></p>
<p style="margin:0;font-size:14px;color:#4c5a51">Não foi você? Ignore esta mensagem — sem confirmação o cadastro não produz efeito. Se preferir, <a href="${sair}" style="color:#a8303c">apague-o agora</a>.</p>
</td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid #e9edea;font-size:12px;color:#4c5a51">
<p style="margin:0 0 6px">Envio automático — não responda a esta mensagem.</p>
<p style="margin:0">O aviso por e-mail é uma cortesia e não substitui a publicação oficial. O que produz efeitos é a edição publicada, na data de publicação legal nela indicada.</p>
</td></tr></table></body></html>`;

  return { assunto: 'Confirme seu cadastro nos avisos do Diário Oficial de Cambuí', texto, html };
}

export async function cadastrar(
  base: string,
  dados: { email: string; cadernos: string[]; secretarias: string[]; palavras: string },
): Promise<Saida<{ jaExistia: boolean }>> {
  const token = gerarToken();

  const criacao = await api<{ id: string }>('/items/diario_assinantes', {
    method: 'POST',
    body: JSON.stringify({
      email: dados.email,
      cadernos: dados.cadernos.join(','),
      secretarias: dados.secretarias.join(','),
      palavras_chave: dados.palavras,
      token, confirmado: false,
      criado_em: new Date().toISOString(),
    }),
  });

  /* E-mail repetido devolve a MESMA resposta de sucesso: dizer "esse e-mail já
   * está cadastrado" transformaria o formulário num verificador de quem se
   * inscreveu — que é justamente o que uma base de assinantes não pode virar. */
  if (!criacao.ok && criacao.motivo === 'JA_EXISTE') return { ok: true, dados: { jaExistia: true } };
  if (!criacao.ok) return criacao;

  const corpo = corpoConfirmacao(base, { email: dados.email, token });
  const fila = await api('/items/diario_envios', {
    method: 'POST',
    body: JSON.stringify({
      destinatario: dados.email, assunto: corpo.assunto,
      corpo_texto: corpo.texto, corpo_html: corpo.html,
      tipo: 'confirmacao', estado: 'pendente', tentativas: 0,
      criado_em: new Date().toISOString(), assinante: criacao.dados.id,
    }),
  });
  if (!fila.ok) return { ok: false, motivo: fila.motivo };
  return { ok: true, dados: { jaExistia: false } };
}

async function porToken(token: string): Promise<AssinanteDiario | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const p = new URLSearchParams({
    limit: '1', fields: 'id,email,token,confirmado,cadernos,secretarias,palavras_chave',
    'filter[token][_eq]': token,
  });
  const r = await api<AssinanteDiario[]>(`/items/diario_assinantes?${p}`);
  return r.ok ? (r.dados[0] ?? null) : null;
}

export async function confirmar(token: string): Promise<{ estado: 'confirmado' | 'ja_confirmado' | 'invalido'; email?: string }> {
  const a = await porToken(token);
  if (!a) return { estado: 'invalido' };
  if (a.confirmado) return { estado: 'ja_confirmado', email: a.email };
  const r = await api(`/items/diario_assinantes/${a.id}`, {
    method: 'PATCH', body: JSON.stringify({ confirmado: true, confirmado_em: new Date().toISOString() }),
  });
  return r.ok ? { estado: 'confirmado', email: a.email } : { estado: 'invalido' };
}

/** Descadastro APAGA o registro. Marcar como inativo guardaria o e-mail de quem
 *  pediu para sair — o contrário do que a LGPD espera. */
export async function descadastrar(token: string): Promise<{ estado: 'removido' | 'invalido'; email?: string }> {
  const a = await porToken(token);
  if (!a) return { estado: 'invalido' };
  const r = await api(`/items/diario_assinantes/${a.id}`, { method: 'DELETE' });
  return r.ok ? { estado: 'removido', email: a.email } : { estado: 'invalido' };
}
