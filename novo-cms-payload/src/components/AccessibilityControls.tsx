'use client'
import { usePreferences } from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

/**
 * Tamanho da fonte do painel (A- / A / A+), guardado nas PREFERÊNCIAS do usuário (acompanha a pessoa em qualquer computador)
 * e, como cópia local, no navegador (aplica na hora, antes de a preferência carregar).
 * Injeta a variável CSS global `--acessibilidade-fonte` e uma regra que a aplica ao `html`. O painel inteiro é em `rem`,
 * então textos, botões e espaçamentos crescem juntos.
 */
const TAMANHOS = [
  { id: 'menor', px: 14, rotulo: 'A-', aria: 'Diminuir o tamanho da fonte (14 pixels)' },
  { id: 'normal', px: 16, rotulo: 'A', aria: 'Tamanho padrão da fonte (16 pixels)' },
  { id: 'maior', px: 18, rotulo: 'A+', aria: 'Aumentar o tamanho da fonte (18 pixels)' },
] as const
type Id = (typeof TAMANHOS)[number]['id']

const CHAVE = 'portal-tamanho-fonte'
const ESTILO_ID = 'acessibilidade-fonte-estilo'

const aplicar = (id: Id) => {
  const px = TAMANHOS.find((t) => t.id === id)?.px ?? 16
  document.documentElement.style.setProperty('--acessibilidade-fonte', `${px}px`)
  if (!document.getElementById(ESTILO_ID)) {
    const el = document.createElement('style')
    el.id = ESTILO_ID
    el.textContent = 'html { font-size: var(--acessibilidade-fonte, 16px) !important; }'
    document.head.appendChild(el)
  }
}
const valido = (v: unknown): v is Id => TAMANHOS.some((t) => t.id === v)
const lerLocal = (): Id | null => { try { const v = localStorage.getItem(CHAVE); return valido(v) ? v : null } catch { return null } }
const gravarLocal = (id: Id) => { try { localStorage.setItem(CHAVE, id) } catch { /* modo privativo: só não lembra */ } }

export const AccessibilityControls: React.FC = () => {
  const { getPreference, setPreference } = usePreferences()
  const [atual, setAtual] = useState<Id>(lerLocal() ?? 'normal')

  useEffect(() => { aplicar(atual) }, [atual])
  useEffect(() => {
    getPreference<Id>(CHAVE).then((v) => { if (valido(v)) { setAtual(v); gravarLocal(v) } }).catch(() => undefined)
  }, [getPreference])

  const escolher = useCallback((id: Id) => {
    setAtual(id)
    gravarLocal(id)
    setPreference(CHAVE, id).catch(() => undefined)
  }, [setPreference])

  return (
    <div role="group" aria-label="Tamanho da fonte do painel" style={{ display: 'flex', gap: 4, alignItems: 'center', marginRight: 8 }}>
      {TAMANHOS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => escolher(t.id)}
          aria-label={t.aria}
          aria-pressed={atual === t.id}
          title={t.aria}
          style={{
            minWidth: 32, height: 28, padding: '0 6px', cursor: 'pointer', borderRadius: 4, fontWeight: 600,
            fontSize: t.id === 'menor' ? 11 : t.id === 'normal' ? 13 : 15, // o rótulo já "demonstra" o tamanho; px fixos para não crescerem junto com o html
            border: '1px solid var(--theme-elevation-300)',
            background: atual === t.id ? 'var(--theme-elevation-800)' : 'var(--theme-elevation-50)',
            color: atual === t.id ? 'var(--theme-elevation-0)' : 'var(--theme-elevation-800)',
          }}
        >
          {t.rotulo}
        </button>
      ))}
    </div>
  )
}
