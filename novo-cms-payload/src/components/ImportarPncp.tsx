'use client'
import { useState } from 'react'
import { useForm } from '@payloadcms/ui'

/**
 * Caixa "Importar do PNCP" no topo do formulário de Licitações. Preenche os campos e NÃO salva: o servidor revisa e confirma.
 * Só preenche o que o PNCP informou; o que já estava digitado e o PNCP não traz fica como está.
 */
export const ImportarPncp = () => {
  const { dispatchFields } = useForm()
  const [referencia, setReferencia] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; linhas: string[] } | null>(null)

  const importar = async () => {
    setOcupado(true); setMsg(null)
    try {
      // Funciona sob qualquer prefixo (o painel roda em /cms/admin): a API é irmã de /admin.
      const base = window.location.pathname.split('/admin')[0]
      const r = await fetch(`${base}/api/licitacoes/importar-pncp`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ referencia }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ tipo: 'erro', linhas: [j.erro ?? `O sistema respondeu HTTP ${r.status}.`] }); return }
      for (const [campo, valor] of Object.entries(j.dados as Record<string, unknown>)) {
        dispatchFields({ type: 'UPDATE', path: campo, value: valor })
      }
      setMsg({ tipo: 'ok', linhas: ['Campos preenchidos a partir do PNCP. Revise tudo antes de salvar.', ...(j.avisos ?? [])] })
    } catch {
      setMsg({ tipo: 'erro', linhas: ['Não consegui falar com o sistema. Preencha os campos manualmente.'] })
    } finally { setOcupado(false) }
  }

  return (
    <div style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 16, margin: '0 0 24px' }}>
      <strong>Importar do PNCP</strong>
      <p style={{ margin: '4px 0 12px', color: 'var(--theme-elevation-600)' }}>
        Cole a URL da contratação no PNCP ou o número de controle (00000000000000-1-000032/2026). Os campos são preenchidos para você revisar; nada é salvo até você confirmar.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="https://pncp.gov.br/app/editais/…"
          style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--theme-elevation-150)', borderRadius: 4, background: 'var(--theme-input-bg)', color: 'var(--theme-text)' }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (referencia.trim() && !ocupado) void importar() } }}
        />
        <button type="button" className="btn btn--style-primary btn--size-medium" disabled={ocupado || !referencia.trim()} onClick={() => void importar()}>
          {ocupado ? 'Buscando…' : 'Importar'}
        </button>
      </div>
      {msg && (
        <ul role="status" style={{ margin: '12px 0 0', paddingLeft: 18, color: msg.tipo === 'erro' ? 'var(--theme-error-500)' : 'inherit' }}>
          {msg.linhas.map((l) => <li key={l}>{l}</li>)}
        </ul>
      )}
    </div>
  )
}
