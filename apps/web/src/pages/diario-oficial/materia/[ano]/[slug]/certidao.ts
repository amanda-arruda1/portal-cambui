/**
 * Certidão de Publicação, sob demanda.
 *
 * É o documento que o servidor anexa ao processo administrativo para provar
 * que o ato foi publicado. Hoje isso se faz com captura de tela — que não tem
 * assinatura, não tem data confiável e qualquer pessoa monta no editor de
 * imagens. Este item, sozinho, justifica o módulo perante o controle interno.
 *
 * O portal não assina: pede ao serviço que detém a chave.
 */
import type { APIRoute } from 'astro';
import { acervo } from '../../../../../lib/diario/indice';
import { pedirCertidao } from '../../../../../lib/diario/servico';

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const a = await acervo();
  const m = a.porSlug.get(String(params.slug));
  if (!m || String(m.edicaoObj?.ano ?? m.ano_ato) !== String(params.ano)) {
    return new Response('Matéria não encontrada.', { status: 404 });
  }

  /* LAI, art. 10, §3º: não se exige identificação para pedir informação
   * pública. O campo existe porque quem anexa a processo costuma querer o
   * próprio nome na certidão — mas é opcional, e não é registrado de outra
   * forma. */
  const solicitante = (url.searchParams.get('solicitante') ?? '').trim().slice(0, 120) || undefined;

  const r = await pedirCertidao(m.id, solicitante);
  if (!r.ok) {
    return new Response(
      `Não foi possível emitir a certidão agora.\n\n${r.mensagem}\n\n` +
      `Enquanto isso, o documento com fé pública continua disponível: baixe o PDF assinado da ` +
      `Edição nº ${m.edicaoObj?.numero} na página da edição.`,
      { status: r.status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  /* Buffer é um Uint8Array, mas o tipo de BodyInit não o aceita diretamente.
   * A view sem cópia resolve, e sem duplicar o PDF na memória. */
  return new Response(new Uint8Array(r.certidao.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="certidao-publicacao-${r.certidao.codigo}.pdf"`,
      'X-Diario-Codigo': r.certidao.codigo,
      'Cache-Control': 'no-store',
    },
  });
};
