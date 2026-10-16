import { DefaultDashboard, type DashboardViewServerProps } from '@payloadcms/next/views'
import { formatAdminURL } from 'payload/shared'
import Link from 'next/link'
import React from 'react'
import { temModulo } from '../acesso'

/**
 * Página inicial do painel: boas-vindas, atalhos das tarefas mais comuns e números do que está pendente — e, logo abaixo, a
 * listagem normal das coleções (DefaultDashboard), para não perder a navegação. Atalhos e números respeitam o PERFIL: cada
 * pessoa só vê o que o seu papel e os seus módulos permitem. Os números são reais (contagem com as permissões do próprio usuário).
 * Estilos em `src/app/(payload)/custom.scss` (classes `portal-dash*`).
 */
/** Ícones em SVG (emoji/símbolos Unicode dependem da fonte do computador e aparecem como quadrado vazio em alguns). */
const ICONES: Record<string, React.ReactNode> = {
  noticia: <path d="M4 5h13v14H6a2 2 0 0 1-2-2V5zm13 3h3v9a2 2 0 0 1-2 2M7 9h7M7 12h7M7 15h4" />,
  licitacao: <path d="M12 4v16M5 20h14M7 8h10M7 8l-3 6a3 3 0 0 0 6 0L7 8zm10 0l-3 6a3 3 0 0 0 6 0l-3-6z" />,
  pasta: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />,
}
const Icone = ({ nome }: { nome: string }) => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONES[nome]}</svg>
)

export default async function CustomDashboard(props: DashboardViewServerProps) {
  const { payload, user } = props
  const admin = payload.config.routes.admin
  const url = (path: `/${string}`) => formatAdminURL({ adminRoute: admin, path })
  const u = user as { nomeExibicao?: string; nome?: string; email?: string } | null
  const nome = (u?.nomeExibicao || u?.nome || u?.email?.split('@')[0] || '').trim().split(' ')[0] || ''

  const contar = async (collection: 'noticias' | 'licitacoes' | 'obras', status: string) => {
    try { return (await payload.count({ collection, where: { status: { equals: status } }, user, overrideAccess: false })).totalDocs } catch { return null }
  }

  const atalhos = [
    { modulo: 'noticias', rotulo: 'Criar nova notícia', ajuda: 'Escrever e enviar para aprovação', href: url('/collections/noticias/create'), icone: 'noticia' },
    { modulo: 'licitacoes', rotulo: 'Nova licitação', ajuda: 'Cadastrar edital ou importar do PNCP', href: url('/collections/licitacoes/create'), icone: 'licitacao' },
    { modulo: null, rotulo: 'Gerenciador de pastas', ajuda: 'Organizar e enviar arquivos', href: url('/collections/pastas'), icone: 'pasta' },
  ].filter((a) => a.modulo === null || temModulo(user, a.modulo))

  const medidas = [
    { modulo: 'licitacoes', colecao: 'licitacoes' as const, status: 'publicado', rotulo: 'Licitações publicadas' },
    { modulo: 'licitacoes', colecao: 'licitacoes' as const, status: 'em_revisao', rotulo: 'Licitações em revisão' },
    { modulo: 'noticias', colecao: 'noticias' as const, status: 'publicado', rotulo: 'Notícias publicadas' },
    { modulo: 'noticias', colecao: 'noticias' as const, status: 'em_revisao', rotulo: 'Notícias em revisão' },
    { modulo: 'obras', colecao: 'obras' as const, status: 'publicado', rotulo: 'Obras publicadas' },
    { modulo: 'obras', colecao: 'obras' as const, status: 'em_revisao', rotulo: 'Obras em revisão' },
  ].filter((m) => temModulo(user, m.modulo))
  const cartoes = await Promise.all(medidas.map(async (m) => ({
    ...m,
    total: await contar(m.colecao, m.status),
    href: url(`/collections/${m.colecao}?where[status][equals]=${m.status}`),
  })))

  return (
    <>
      <div className="portal-dash">
        <header className="portal-dash__cabecalho">
          <h1 className="portal-dash__titulo">{nome ? `Bem-vindo(a), ${nome}` : 'Bem-vindo(a)'}</h1>
          <p className="portal-dash__sub">Painel de conteúdo do Portal da Prefeitura de Cambuí. Escolha uma tarefa para começar.</p>
        </header>

        <section aria-labelledby="dash-atalhos">
          <h2 id="dash-atalhos" className="portal-dash__secao">Atalhos rápidos</h2>
          <div className="portal-dash__atalhos">
            {atalhos.map((a) => (
              <Link key={a.rotulo} href={a.href} className="portal-dash__atalho">
                <span className="portal-dash__atalho-icone" aria-hidden="true"><Icone nome={a.icone} /></span>
                <span className="portal-dash__atalho-texto">
                  <strong>{a.rotulo}</strong>
                  <span>{a.ajuda}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {cartoes.length > 0 && (
          <section aria-labelledby="dash-metricas">
            <h2 id="dash-metricas" className="portal-dash__secao">Métricas rápidas</h2>
            <div className="portal-dash__metricas">
              {cartoes.map((c) => (
                <Link key={c.rotulo} href={c.href} className={`portal-dash__metrica${c.status === 'em_revisao' ? ' portal-dash__metrica--atencao' : ''}`}>
                  <span className="portal-dash__metrica-valor">{c.total ?? '—'}</span>
                  <span className="portal-dash__metrica-rotulo">{c.rotulo}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <h2 className="portal-dash__secao portal-dash__secao--colecoes">Navegação completa</h2>
      </div>
      <DefaultDashboard {...props} />
    </>
  )
}
