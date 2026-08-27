/**
 * Recebimento de arquivo enviado por uma secretaria.
 *
 * É o único caminho por onde um arquivo entra no portal vindo da internet. A
 * ordem importa e não pode ser invertida:
 *
 *   navegador → ESTE ENDPOINT → inspeção (lib/upload) → Directus
 *
 * O arquivo só existe em memória enquanto é julgado. Reprovado, é descartado
 * sem nunca tocar o disco — não há o que varrer depois, não há o que limpar da
 * quarentena, e o Directus jamais vê o conteúdo.
 *
 * A varredura periódica (portal-antivirus.timer) continua existindo como rede
 * de segurança para o que entrar por outro caminho (o painel do Directus, por
 * exemplo, alcançável só pela faixa da TrustIT).
 */

import type { APIRoute } from 'astro';
import { inspecionar } from '../../../lib/upload/index.ts';
import { TAMANHO_MAXIMO_ABSOLUTO } from '../../../lib/upload/politica.ts';
import { enviarArquivo } from '../../../lib/painel/cms.ts';

/** Pasta de destino no Directus. Precisa bater com 'pasta_publica' de
 *  infra/directus/papeis.json, que é o que a política pública libera para
 *  leitura — arquivo em outra pasta fica invisível para o cidadão. */
const PASTA_PUBLICA = 'publicos';

function json(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const sessao = locals.sessao;
  // O middleware já barrou quem não entrou; esta guarda existe para o caso de
  // a rota mudar de lugar um dia e sair de baixo de /painel.
  if (!sessao) return json({ erro: 'Sessão expirada. Entre novamente.' }, 401);

  /* Recusa pelo cabeçalho antes de ler o corpo: sem isto, um envio de 2 GB
   * seria integralmente carregado na memória do processo só para ser reprovado
   * no fim. O Nginx também corta (client_max_body_size), mas o portal não pode
   * depender de estar atrás dele. */
  const declarado = Number(request.headers.get('content-length') ?? 0);
  if (declarado > TAMANHO_MAXIMO_ABSOLUTO * 1.1) {
    return json(
      { erro: `O envio excede o limite de ${Math.round(TAMANHO_MAXIMO_ABSOLUTO / (1024 * 1024))} MB.` },
      413,
    );
  }

  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return json({ erro: 'Não foi possível ler o envio. Tente novamente.' }, 400);
  }

  const arquivo = formulario.get('arquivo');
  if (!(arquivo instanceof File)) {
    return json({ erro: 'Nenhum arquivo foi enviado.' }, 400);
  }

  const dados = new Uint8Array(await arquivo.arrayBuffer());
  const veredito = await inspecionar(dados, arquivo.name, arquivo.type);

  /* Registro de auditoria no journal. Vale para os dois desfechos: uma recusa
   * por antivírus é informação de segurança, e uma sequência de recusas por
   * "coerencia" costuma ser gente confusa com o formato, não ataque. */
  const quem = `${sessao.usuario.email} (${sessao.usuario.papel ?? 'sem papel'})`;
  if (!veredito.aceito) {
    console.warn(
      `[upload] RECUSADO por "${veredito.etapa}" — ${quem} — arquivo "${arquivo.name}" ` +
        `(${dados.length} B)${veredito.assinatura ? ` — assinatura ${veredito.assinatura}` : ''}`,
    );
    // 422: o envio chegou inteiro e foi entendido; o conteúdo é que não passa.
    return json({ erro: veredito.motivo, etapa: veredito.etapa }, 422);
  }

  const enviado = await enviarArquivo(sessao, dados, veredito.nome, arquivo.type || 'application/octet-stream', PASTA_PUBLICA);
  if (!enviado.ok) {
    console.error(`[upload] falha ao gravar no CMS — ${quem} — "${veredito.nome}": ${enviado.motivo}`);
    return json({ erro: enviado.motivo }, enviado.status);
  }

  console.info(
    `[upload] aceito — ${quem} — "${veredito.nome}" (${veredito.formato}, ${veredito.tamanho} B, ` +
      `sha256 ${veredito.digestao}) → arquivo ${enviado.dados.id}`,
  );

  return json(
    {
      id: enviado.dados.id,
      nome: veredito.nome,
      formato: veredito.formato,
      tamanho: veredito.tamanho,
      digestao: veredito.digestao,
    },
    201,
  );
};

/** Qualquer outro método: o endpoint só recebe. */
export const ALL: APIRoute = () =>
  new Response('Método não permitido.', { status: 405, headers: { Allow: 'POST' } });
