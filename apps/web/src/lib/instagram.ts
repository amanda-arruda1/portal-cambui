/**
 * Feed do Instagram na home.
 *
 * SEM conta oficial confirmada ainda — `REDES_SOCIAIS` em
 * `dados/instituicional.ts` segue vazio, TODO(cliente) igual aos outros
 * dados que a prefeitura não mandou. Enquanto isso, `postsInstagram()`
 * devolve os 5 itens de `POSTS_SIMULADOS` abaixo com `simulado: true` — é a
 * flag que `InstagramFeed.astro` usa para mostrar o aviso discreto de
 * prévia, em vez de deixar conteúdo de mentira parecer publicação real.
 *
 * As imagens dos itens simulados são GERADAS (degradê + ponto tricotado da
 * marca, `ferramentas/`), não fotos: uma foto de mentira pareceria
 * reportagem real — o mesmo problema que
 * `infra/directus/popular-demonstracao.mjs` já resolveu do mesmo jeito para
 * o conteúdo de demonstração do resto do portal.
 *
 * Quando a Prefeitura confirmar a conta e gerar o token de longa duração
 * (Instagram Graph API, exige conta Business/Creator — a Basic Display API
 * foi DESATIVADA pela Meta em dez/2024, não usar como referência): defina
 * `INSTAGRAM_ACCESS_TOKEN` no `.env` e esta função passa a buscar de
 * verdade, sem mexer em mais nada — `InstagramFeed.astro` só lê o formato
 * `PostInstagram`. O token expira em 60 dias e PRECISA ser renovado
 * (endpoint `refresh_access_token`) por um job separado — esta função só
 * consome, não renova.
 */

export interface PostInstagram {
  id: string;
  imagem: string;
  legenda: string;
  /** ISO. */
  data: string;
  permalink: string;
}

export const PERFIL_INSTAGRAM = {
  // TODO(cliente): confirmar o @ oficial do município — segue o padrão do
  // domínio do portal enquanto isso não chega, igual REDES_SOCIAIS em
  // dados/instituicional.ts.
  handle: '@prefeituradecambui',
  url: 'https://www.instagram.com/prefeituradecambui/',
};

const POSTS_SIMULADOS: PostInstagram[] = [
  {
    id: 'simulado-1',
    imagem: '/imagens/instagram/exemplo-1.webp',
    legenda: 'Prévia do feed do Instagram — este card sai de cena assim que a conta oficial for conectada.',
    data: '2026-08-29',
    permalink: PERFIL_INSTAGRAM.url,
  },
  {
    id: 'simulado-2',
    imagem: '/imagens/instagram/exemplo-2.webp',
    legenda: 'Espaço reservado para o próximo post publicado no perfil oficial da Prefeitura.',
    data: '2026-08-26',
    permalink: PERFIL_INSTAGRAM.url,
  },
  {
    id: 'simulado-3',
    imagem: '/imagens/instagram/exemplo-3.webp',
    legenda: 'Assim que o token de acesso for configurado, os 5 posts mais recentes aparecem aqui automaticamente.',
    data: '2026-08-22',
    permalink: PERFIL_INSTAGRAM.url,
  },
  {
    id: 'simulado-4',
    imagem: '/imagens/instagram/exemplo-4.webp',
    legenda: 'Cada card vira o post real: imagem, legenda, data e link direto para o Instagram.',
    data: '2026-08-19',
    permalink: PERFIL_INSTAGRAM.url,
  },
  {
    id: 'simulado-5',
    imagem: '/imagens/instagram/exemplo-5.webp',
    legenda: 'Layout e navegação já valem para o conteúdo real — só falta a conta oficial.',
    data: '2026-08-14',
    permalink: PERFIL_INSTAGRAM.url,
  },
];

const VALIDADE_MS = 60_000;
let cache: { em: number; dados: PostInstagram[] } | null = null;

async function buscarDaApi(token: string): Promise<PostInstagram[]> {
  const campos = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
  const resp = await fetch(`https://graph.instagram.com/me/media?fields=${campos}&limit=5&access_token=${token}`);
  if (!resp.ok) throw new Error(`Instagram respondeu ${resp.status}`);
  const json = (await resp.json()) as {
    data?: Array<{
      id: string;
      caption?: string;
      media_type: string;
      media_url: string;
      thumbnail_url?: string;
      permalink: string;
      timestamp: string;
    }>;
  };
  return (json.data ?? []).map((p) => ({
    id: p.id,
    // Vídeo (Reels) não tem imagem em media_url — só a miniatura.
    imagem: p.media_type === 'VIDEO' ? (p.thumbnail_url ?? p.media_url) : p.media_url,
    legenda: p.caption ?? '',
    data: p.timestamp,
    permalink: p.permalink,
  }));
}

export async function postsInstagram(): Promise<{ dados: PostInstagram[]; simulado: boolean }> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;

  if (!token) return { dados: POSTS_SIMULADOS, simulado: true };

  if (cache && Date.now() - cache.em < VALIDADE_MS) return { dados: cache.dados, simulado: false };

  try {
    const dados = await buscarDaApi(token);
    cache = { em: Date.now(), dados };
    return { dados, simulado: false };
  } catch {
    // Falha da API não pode derrubar a home: volta o último cache válido ou,
    // na pior hipótese (primeira falha, sem cache ainda), o conteúdo
    // simulado — nunca uma seção quebrada.
    return { dados: cache?.dados ?? POSTS_SIMULADOS, simulado: cache === null };
  }
}
