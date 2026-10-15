'use client'
import { useAuth } from '@payloadcms/ui'
import React, { useState } from 'react'
import { TERMOS_TEXTO, TERMOS_TITULO, TERMOS_VERSAO } from '../termos-de-uso'

/**
 * Tela de aceite do termo de uso. Provider do painel: enquanto o usuário logado não aceitou a VERSÃO atual do termo, no lugar do
 * painel aparece só esta tela (aceitar, ou sair). O aceite é gravado pelo endpoint `/api/users/aceitar-termos` (o campo é
 * protegido: o próprio usuário não consegue gravá-lo por um PATCH comum).
 */
export const TermosProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const [lido, setLido] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const u = user as { collection?: string; versaoTermosAceita?: string | null } | null
  const pendente = Boolean(u && u.collection === 'users' && u.versaoTermosAceita !== TERMOS_VERSAO)
  if (!pendente) return <>{children}</>

  const aceitar = async () => {
    setEnviando(true); setErro(null)
    try {
      const r = await fetch('/cms/api/users/aceitar-termos', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versao: TERMOS_VERSAO }) })
      if (!r.ok) throw new Error(String(r.status))
      window.location.reload() // recarrega o usuário (agora com o aceite) e libera o painel
    } catch {
      setErro('Não foi possível registrar o aceite. Tente de novo; se persistir, fale com a administração do portal.')
      setEnviando(false)
    }
  }

  return (
    <main
      role="dialog" aria-modal="true" aria-labelledby="termos-titulo"
      style={{ minHeight: '100vh', background: 'var(--theme-bg)', color: 'var(--theme-text)', display: 'flex', justifyContent: 'center', padding: '32px 16px' }}
    >
      <div style={{ maxWidth: 720, width: '100%' }}>
        <h1 id="termos-titulo" style={{ marginTop: 0 }}>{TERMOS_TITULO}</h1>
        <p>Antes de usar o painel, leia e aceite o termo abaixo. Isso é pedido uma vez (e de novo se o termo mudar).</p>
        <section
          tabIndex={0} aria-label="Texto do termo de uso"
          onScroll={(e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setLido(true) }}
          style={{ maxHeight: '50vh', overflowY: 'auto', border: '1px solid var(--theme-elevation-300)', borderRadius: 4, padding: 16, background: 'var(--theme-elevation-50)' }}
        >
          {TERMOS_TEXTO.map((s) => (
            <div key={s.titulo}><h2 style={{ fontSize: '1.1em' }}>{s.titulo}</h2><p>{s.texto}</p></div>
          ))}
          <p style={{ opacity: 0.7 }}>Versão do termo: {TERMOS_VERSAO}.</p>
        </section>
        {!lido && <p role="status" style={{ opacity: 0.8 }}>Role o texto até o fim para liberar o botão de aceite.</p>}
        {erro && <p role="alert" style={{ color: 'var(--theme-error-500)' }}>{erro}</p>}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <button
            type="button" onClick={aceitar} disabled={!lido || enviando}
            aria-label="Li e aceito o termo de uso do painel"
            style={{ padding: '10px 18px', fontWeight: 600, cursor: !lido || enviando ? 'not-allowed' : 'pointer', opacity: !lido || enviando ? 0.5 : 1, background: 'var(--theme-elevation-800)', color: 'var(--theme-elevation-0)', border: 0, borderRadius: 4 }}
          >
            {enviando ? 'Registrando…' : 'Li e aceito'}
          </button>
          <a href="/cms/admin/logout" style={{ padding: '10px 18px', border: '1px solid var(--theme-elevation-300)', borderRadius: 4, color: 'inherit', textDecoration: 'none' }}>Não aceito (sair)</a>
        </div>
      </div>
    </main>
  )
}
