/**
 * Cliente do serviço de assinatura.
 *
 * O portal NÃO assina nada: ele pede. A chave privada vive noutro processo,
 * com outro usuário — ver infra/systemd/portal-diario.service. Se este serviço
 * estiver fora do ar, a certidão falha com uma mensagem honesta em vez de o
 * portal improvisar um documento sem assinatura, que seria pior do que nada.
 */
const BASE = process.env.DIARIO_SERVICO_URL || 'http://127.0.0.1:4322';
const SEGREDO = process.env.DIARIO_SERVICO_SEGREDO || '';
const TEMPO_LIMITE_MS = 60_000; // renderizar e assinar leva alguns segundos

export interface Certidao {
  pdf: Buffer; codigo: string; sha256: string;
}

export async function pedirCertidao(idMateria: string, solicitante?: string):
  Promise<{ ok: true; certidao: Certidao } | { ok: false; status: number; mensagem: string }> {
  if (!SEGREDO) {
    return { ok: false, status: 503, mensagem: 'O serviço de emissão de certidões não está configurado neste servidor.' };
  }
  try {
    const r = await fetch(`${BASE}/certidao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Diario-Segredo': SEGREDO },
      body: JSON.stringify({ materia: idMateria, solicitante }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!r.ok) {
      const corpo = await r.json().catch(() => ({}));
      /* O detalhe entra na mensagem: "falha ao processar" sozinho não ajuda
       * ninguém a resolver, e este texto vai para quem opera o portal. */
      const base = corpo.erro ?? `O serviço respondeu HTTP ${r.status}.`;
      return { ok: false, status: r.status, mensagem: corpo.detalhe ? `${base} — ${corpo.detalhe}` : base };
    }
    return {
      ok: true,
      certidao: {
        pdf: Buffer.from(await r.arrayBuffer()),
        codigo: r.headers.get('X-Diario-Codigo') ?? '',
        sha256: r.headers.get('X-Diario-Sha256') ?? '',
      },
    };
  } catch (e) {
    const tempo = e instanceof Error && e.name === 'TimeoutError';
    return {
      ok: false, status: 504,
      mensagem: tempo
        ? 'A emissão da certidão demorou mais do que o esperado. Tente novamente em alguns instantes.'
        : 'O serviço de emissão de certidões não respondeu.',
    };
  }
}

export async function fecharEdicaoNoServico(idEdicao: string, quem: string):
  Promise<{ ok: boolean; status: number; corpo: any }> {
  if (!SEGREDO) return { ok: false, status: 503, corpo: { erro: 'Serviço de assinatura não configurado.' } };
  try {
    const r = await fetch(`${BASE}/fechar-edicao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Diario-Segredo': SEGREDO },
      body: JSON.stringify({ edicao: idEdicao, quem }),
      /* Fechar uma edição de 80 páginas leva mais tempo do que uma certidão. */
      signal: AbortSignal.timeout(300_000),
    });
    return { ok: r.ok, status: r.status, corpo: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, status: 504, corpo: { erro: 'O serviço de assinatura não respondeu.' } };
  }
}

export async function saudeDoServico(): Promise<{ ok: boolean; demonstracao: boolean; signatario: string | null }> {
  try {
    const r = await fetch(`${BASE}/saude`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return { ok: false, demonstracao: false, signatario: null };
    const c = await r.json();
    return { ok: true, demonstracao: Boolean(c.demonstracao), signatario: c.signatario ?? null };
  } catch {
    return { ok: false, demonstracao: false, signatario: null };
  }
}
