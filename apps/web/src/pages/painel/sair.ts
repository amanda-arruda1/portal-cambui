/**
 * Saída do painel.
 *
 * Só POST: um <a href="/painel/sair"> seria disparado por qualquer imagem ou
 * pré-carregamento e derrubaria a sessão de quem está trabalhando.
 */
import type { APIRoute } from 'astro';
import { sair } from '../../lib/painel/sessao.ts';

export const POST: APIRoute = async ({ session, cookies, redirect }) => {
  await sair(session as any, cookies);
  return redirect('/painel/entrar', 303);
};
