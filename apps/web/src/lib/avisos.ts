/**
 * Avisos de licitação por e-mail — o lado do portal.
 *
 * O QUE ESTE ARQUIVO NÃO FAZ: enviar e-mail. Ele escreve na fila
 * (`licitacao_envios`) e devolve o controle. Quem envia é o serviço
 * `portal-avisos`, separado, porque o processo web roda com
 * `IPAddressDeny=any` e não deve ganhar saída para a internet só para mandar
 * mensagem. Enfileirar também dá, de graça: repetição em caso de falha, limite
 * de vazão, e servidor de e-mail fora do ar não trava o cadastro de ninguém.
 *
 * Usa uma conta de serviço do Payload (`PAYLOAD_TOKEN_AVISOS`, coleção `contas-servico`), com permissão
 * estreita e separada das demais credenciais.
 */

const BASE_PAYLOAD = (process.env.PAYLOAD_INTERNAL_URL || 'http://127.0.0.1:3000/cms').replace(/\/+$/, '');
const TOKEN_PAYLOAD = process.env.PAYLOAD_TOKEN_AVISOS || '';

export const AVISOS_LIGADOS = TOKEN_PAYLOAD.length > 0;

export type Saida<T> = { ok: true; dados: T } | { ok: false; motivo: string };

/** Chamada ao Payload. Devolve o JSON cru. */
async function apiPayload<T>(caminho: string, opcoes: RequestInit = {}): Promise<Saida<T>> {
  if (!TOKEN_PAYLOAD) return { ok: false, motivo: 'O serviço de avisos ainda não foi configurado.' };
  try {
    const r = await fetch(`${BASE_PAYLOAD}${caminho}`, {
      ...opcoes,
      headers: { 'Content-Type': 'application/json', Authorization: `contas-servico API-Key ${TOKEN_PAYLOAD}`, ...(opcoes.headers ?? {}) },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      const corpo = (await r.json().catch(() => ({}))) as any;
      return { ok: false, motivo: corpo?.errors?.[0]?.message ?? `HTTP ${r.status}` };
    }
    if (r.status === 204) return { ok: true, dados: undefined as T };
    return { ok: true, dados: (await r.json()) as T };
  } catch {
    return { ok: false, motivo: 'O sistema não respondeu.' };
  }
}

/** Token de confirmação/descadastro. 32 bytes de aleatoriedade criptográfica —
 *  ele é a única prova de que quem clicou é dono da caixa postal. */
function gerarToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export interface Assinante {
  id: string; email: string; token: string; confirmado: boolean;
  modalidades: string | null; palavras_chave: string | null;
}

const escapar = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Corpo do e-mail de confirmação — o duplo opt-in.
 *
 * Texto e HTML, sempre os dois: cliente de e-mail de prefeitura ainda é
 * Outlook antigo, e mensagem só-HTML às vezes chega vazia. O link de
 * descadastro entra AQUI TAMBÉM, e não só nos avisos: quem se arrependeu antes
 * de confirmar precisa de saída.
 */
export function corpoConfirmacao(base: string, assinante: { email: string; token: string }) {
  const confirmar = `${base}/licitacoes/avisos/confirmar?t=${assinante.token}`;
  const sair = `${base}/licitacoes/avisos/sair?t=${assinante.token}`;

  const texto = [
    'Prefeitura Municipal de Cambuí — avisos de licitação',
    '',
    `Alguém (esperamos que você) cadastrou o endereço ${assinante.email} para`,
    'receber aviso quando o município publicar novas licitações.',
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
    'A divulgação oficial das licitações ocorre no PNCP e no veículo oficial do',
    'Município. Em caso de divergência, prevalece o edital publicado oficialmente.',
  ].join('\n');

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#e9edea;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#141c18;line-height:1.6">
<table role="presentation" style="max-width:560px;margin:0 auto;background:#fff;border-radius:6px;border-top:5px solid #0c5430" cellpadding="0" cellspacing="0" width="100%">
<tr><td style="padding:28px 28px 8px">
<p style="margin:0;font-size:13px;letter-spacing:.09em;text-transform:uppercase;color:#4c5a51">Prefeitura Municipal de Cambuí</p>
<h1 style="margin:8px 0 0;font-size:24px;line-height:1.2">Confirme seu cadastro nos avisos de licitação</h1>
</td></tr>
<tr><td style="padding:16px 28px">
<p style="margin:0 0 16px">Alguém — esperamos que você — cadastrou <strong>${escapar(assinante.email)}</strong> para receber aviso quando o município publicar novas licitações.</p>
<p style="margin:0 0 20px"><strong>Enquanto você não confirmar, nenhum aviso é enviado.</strong></p>
<p style="margin:0 0 24px"><a href="${confirmar}" style="display:inline-block;background:#0c5430;color:#fff;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:4px">Confirmar meu cadastro</a></p>
<p style="margin:0 0 8px;font-size:14px;color:#4c5a51">Se o botão não funcionar, copie este endereço:</p>
<p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${confirmar}" style="color:#0c5430">${confirmar}</a></p>
<p style="margin:0;font-size:14px;color:#4c5a51">Não foi você? Ignore esta mensagem — sem confirmação o cadastro não produz efeito. Se preferir, <a href="${sair}" style="color:#a8303c">apague-o agora</a>.</p>
</td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid #e9edea;font-size:12px;color:#4c5a51">
<p style="margin:0 0 6px">Envio automático — não responda a esta mensagem.</p>
<p style="margin:0">A divulgação oficial das licitações ocorre no PNCP e no veículo oficial do Município. Em caso de divergência, prevalece o edital publicado oficialmente.</p>
</td></tr></table></body></html>`;

  return { assunto: 'Confirme seu cadastro nos avisos de licitação de Cambuí', texto, html };
}

/* ─────────────────────────  operações  ───────────────────────── */

export async function cadastrar(
  base: string,
  dados: { email: string; modalidades: string[]; palavras: string },
): Promise<Saida<{ jaExistia: boolean }>> {
  const token = gerarToken();
  return cadastrarNoPayload(base, dados, token);
}

async function cadastrarNoPayload(
  base: string,
  dados: { email: string; modalidades: string[]; palavras: string },
  token: string,
): Promise<Saida<{ jaExistia: boolean }>> {
  const criacao = await apiPayload<{ doc: { id: number } }>('/api/licitacao-assinantes', {
    method: 'POST',
    body: JSON.stringify({
      email: dados.email, modalidades: dados.modalidades.join(','), palavrasChave: dados.palavras,
      token, confirmado: false, criadoEm: new Date().toISOString(),
    }),
  });
  if (!criacao.ok) {
    // O Payload recusa e-mail repetido com um 400 genérico ("campo inválido: email"): confirma que é repetição olhando a base.
    const q = new URLSearchParams({ limit: '1', depth: '0', 'where[email][equals]': dados.email });
    const existente = await apiPayload<{ totalDocs: number }>(`/api/licitacao-assinantes?${q}`);
    if (existente.ok && existente.dados.totalDocs > 0) return { ok: true, dados: { jaExistia: true } };
    return criacao;
  }

  const corpo = corpoConfirmacao(base, { email: dados.email, token });
  const fila = await apiPayload('/api/licitacao-envios', {
    method: 'POST',
    body: JSON.stringify({
      destinatario: dados.email, assunto: corpo.assunto, corpoTexto: corpo.texto, corpoHtml: corpo.html,
      tipo: 'confirmacao', estado: 'pendente', tentativas: 0, criadoEm: new Date().toISOString(), assinante: criacao.dados.doc.id,
    }),
  });
  if (!fila.ok) return { ok: false, motivo: fila.motivo };
  return { ok: true, dados: { jaExistia: false } };
}

/** Busca pelo token. Nunca por e-mail: quem clica no link prova que tem a caixa
 *  postal, e é essa a única prova que aceitamos. */
async function porToken(token: string): Promise<Assinante | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const p = new URLSearchParams({ limit: '1', depth: '0', 'where[token][equals]': token });
  const r = await apiPayload<{ docs: Array<{ id: number; email: string; token: string; confirmado: boolean; modalidades: string | null; palavrasChave: string | null }> }>(`/api/licitacao-assinantes?${p}`);
  const d = r.ok ? r.dados.docs[0] : null;
  return d ? { id: String(d.id), email: d.email, token: d.token, confirmado: d.confirmado, modalidades: d.modalidades, palavras_chave: d.palavrasChave } : null;
}

export async function confirmar(token: string): Promise<{ estado: 'confirmado' | 'ja_confirmado' | 'invalido'; email?: string }> {
  const a = await porToken(token);
  if (!a) return { estado: 'invalido' };
  if (a.confirmado) return { estado: 'ja_confirmado', email: a.email };
  const p = await apiPayload(`/api/licitacao-assinantes/${a.id}`, { method: 'PATCH', body: JSON.stringify({ confirmado: true, confirmadoEm: new Date().toISOString() }) });
  return p.ok ? { estado: 'confirmado', email: a.email } : { estado: 'invalido' };
}

/** Descadastro APAGA o registro. Marcar como inativo guardaria o e-mail de
 *  quem pediu para sair — o contrário do que a LGPD espera. */
export async function descadastrar(token: string): Promise<{ estado: 'removido' | 'invalido'; email?: string }> {
  const a = await porToken(token);
  if (!a) return { estado: 'invalido' };
  const p = await apiPayload(`/api/licitacao-assinantes/${a.id}`, { method: 'DELETE' });
  return p.ok ? { estado: 'removido', email: a.email } : { estado: 'invalido' };
}
