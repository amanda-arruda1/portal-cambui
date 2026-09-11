/**
 * Fonte dos registros do assistente de contatos — lado servidor.
 *
 * Junta o contato geral da Prefeitura (`dados/instituicional.ts`, estático)
 * com as secretarias do CMS. Cache de 60s em memória, mesmo padrão de
 * `lib/licitacoes.ts` — sem ele, o componente carregaria em TODA página do
 * site (é montado em `Base.astro`) e bateria no Directus a cada visita.
 * Fica só aqui: não mexe no `secretarias()` compartilhado por
 * `contato.astro`/`secretarias/index.astro`, para não mudar o que já
 * funciona nessas páginas.
 */
import { secretarias } from './conteudo';
import type { RegistroContato } from './contatos-busca';
import { EMAIL_CONTATO, HORARIO_ATENDIMENTO, MUNICIPIO, TELEFONES } from '../dados/instituicional';

const VALIDADE_MS = 60_000;
let cache: { em: number; dados: RegistroContato[] } | null = null;

function contatoGeral(): RegistroContato[] {
  if (TELEFONES.length === 0 && !EMAIL_CONTATO) return [];
  return [
    {
      id: 'geral',
      titulo: `Prefeitura de ${MUNICIPIO.nome}`,
      subtitulo: 'Atendimento geral',
      telefone: TELEFONES[0]?.numero ?? null,
      email: EMAIL_CONTATO,
      horario: HORARIO_ATENDIMENTO,
      destino: '/contato',
      palavrasChave: 'prefeitura sede gabinete geral',
    },
  ];
}

export async function registrosDeContato(): Promise<{ dados: RegistroContato[]; indisponivel: boolean }> {
  if (cache && Date.now() - cache.em < VALIDADE_MS) return { dados: cache.dados, indisponivel: false };

  const geral = contatoGeral();
  const r = await secretarias();
  if (r.indisponivel) {
    // Falha silenciosa: o assistente perde as secretarias, mas o contato
    // geral (estático, sem CMS) continua funcionando.
    return { dados: cache?.dados ?? geral, indisponivel: cache === null };
  }

  const doCms: RegistroContato[] = r.dados.map((s) => ({
    id: s.slug,
    titulo: s.nome,
    subtitulo: s.sigla,
    telefone: s.telefone,
    email: s.email,
    horario: s.horario_atendimento,
    destino: `/secretarias/${s.slug}`,
    palavrasChave: s.palavras_chave,
  }));

  const dados = [...geral, ...doCms];
  cache = { em: Date.now(), dados };
  return { dados, indisponivel: false };
}
