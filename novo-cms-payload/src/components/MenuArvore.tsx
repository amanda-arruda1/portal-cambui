'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useField } from '@payloadcms/ui'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

/**
 * Editor do Menu Principal: árvore de DOIS níveis (botão → itens do dropdown) com arrastar e soltar.
 *
 * - Arraste pelo ícone ⠿ para reordenar.
 * - Solte um botão DENTRO da área de outro botão para ele virar item do dropdown (ex.: "Patrimônio Cultural" dentro de "A cidade").
 *   A mudança é aplicada ao SOLTAR; durante o arraste só se destaca a área de destino.
 * - Solte um item do dropdown SOBRE um botão do nível principal para tirá-lo do dropdown.
 * - Teclado: foque o ícone ⠿, Espaço pega, setas movem, Espaço solta.
 *
 * Valor guardado (JSON): `[{ rotulo, destino?, filhos?: [{ rotulo, destino }] }]`. Os ids abaixo existem só nesta tela.
 */

type No = { id: string; rotulo: string; destino: string; filhos: No[] }
type Salvo = { rotulo: string; destino?: string; filhos?: Array<{ rotulo: string; destino: string }> }

const RAIZ = 'raiz'
const idFilhos = (id: string) => `filhos:${id}`
const ehContainer = (id: UniqueIdentifier) => id === RAIZ || String(id).startsWith('filhos:')

/** Ids de itens NOVOS (criados no navegador, depois da hidratação). Os do carregamento são posicionais (ver `paraArvore`): ids com
 *  `Date.now()`/aleatório diferem entre o HTML do servidor e o do cliente e geram aviso de hidratação. */
let contador = 0
const novoId = () => `x${Date.now().toString(36)}${(contador++).toString(36)}`

/** Páginas e links que o editor sugere no campo Destino (qualquer endereço digitado também vale). */
const SUGESTOES: Array<{ valor: string; rotulo: string }> = [
  { valor: '/servicos', rotulo: 'Serviços' },
  { valor: '/a-cidade', rotulo: 'A cidade' },
  { valor: '/secretarias', rotulo: 'A Prefeitura (secretarias)' },
  { valor: '/estrutura-administrativa', rotulo: 'Estrutura administrativa' },
  { valor: '/telefones', rotulo: 'Telefones Úteis' },
  { valor: '/patrimonio-cultural', rotulo: 'Patrimônio Cultural' },
  { valor: '/transparencia', rotulo: 'Transparência' },
  { valor: '/licitacoes', rotulo: 'Licitações' },
  { valor: '/obras', rotulo: 'Obras públicas' },
  { valor: '/noticias', rotulo: 'Notícias' },
  { valor: '/documentos', rotulo: 'Documentos' },
  { valor: '/perguntas-frequentes', rotulo: 'Perguntas frequentes' },
  { valor: '/contato', rotulo: 'Contato' },
  { valor: '/acessibilidade', rotulo: 'Acessibilidade' },
  { valor: '/privacidade', rotulo: 'Privacidade' },
  { valor: '@diarioAmm', rotulo: 'Diário Oficial (AMM-MG) — link externo' },
  { valor: '@ouvidoria', rotulo: 'Ouvidoria e e-SIC — link externo' },
  { valor: '@transparencia', rotulo: 'Portal da Transparência — link externo' },
  { valor: '@ponto', rotulo: 'Ponto eletrônico — link externo' },
  { valor: '@holerite', rotulo: 'Holerite eletrônico — link externo' },
  { valor: '@webmail', rotulo: 'Webmail — link externo' },
]

function paraArvore(valor: unknown): No[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((i, pos): No[] => {
    if (!i || typeof i !== 'object') return []
    const o = i as Record<string, unknown>
    const filhos = Array.isArray(o.filhos) ? o.filhos : []
    return [{
      id: `i${pos}`,
      rotulo: typeof o.rotulo === 'string' ? o.rotulo : '',
      destino: typeof o.destino === 'string' ? o.destino : '',
      filhos: filhos.flatMap((f, j): No[] => {
        if (!f || typeof f !== 'object') return []
        const fo = f as Record<string, unknown>
        return [{ id: `i${pos}f${j}`, rotulo: typeof fo.rotulo === 'string' ? fo.rotulo : '', destino: typeof fo.destino === 'string' ? fo.destino : '', filhos: [] }]
      }),
    }]
  })
}

function paraSalvo(arvore: No[]): Salvo[] {
  return arvore.map((n) => {
    const item: Salvo = { rotulo: n.rotulo.trim() }
    if (n.destino.trim()) item.destino = n.destino.trim()
    if (n.filhos.length > 0) item.filhos = n.filhos.map((f) => ({ rotulo: f.rotulo.trim(), destino: f.destino.trim() }))
    return item
  })
}

/** Mesma forma para comparar o valor do formulário com a árvore local (ignora ids e espaços). */
const assinatura = (valor: unknown): string => JSON.stringify(paraSalvo(paraArvore(valor)))

type Local = { pai: string | null; indice: number; no: No }

function achar(arvore: No[], id: UniqueIdentifier): Local | null {
  for (let i = 0; i < arvore.length; i++) {
    if (arvore[i].id === id) return { pai: null, indice: i, no: arvore[i] }
    const j = arvore[i].filhos.findIndex((f) => f.id === id)
    if (j >= 0) return { pai: arvore[i].id, indice: j, no: arvore[i].filhos[j] }
  }
  return null
}

function containerDe(arvore: No[], id: UniqueIdentifier): string | null {
  if (ehContainer(id)) return String(id)
  const l = achar(arvore, id)
  if (!l) return null
  return l.pai ? idFilhos(l.pai) : RAIZ
}

function listaDe(arvore: No[], container: string): No[] {
  if (container === RAIZ) return arvore
  return arvore.find((n) => idFilhos(n.id) === container)?.filhos ?? []
}

/** O menu tem só dois níveis: um botão que já tem dropdown não entra no dropdown de outro, e ninguém entra no próprio. */
function motivoDeRecusa(arvore: No[], id: UniqueIdentifier, destino: string): string | null {
  if (destino === RAIZ) return null
  const l = achar(arvore, id)
  if (!l) return null
  if (destino === idFilhos(l.no.id)) return 'Um botão não pode entrar no próprio dropdown.'
  if (l.no.filhos.length > 0) return `"${l.no.rotulo || 'Este botão'}" já tem um dropdown. O menu tem só dois níveis: tire os itens de dentro dele antes de colocá-lo dentro de outro botão.`
  return null
}

function mover(arvore: No[], id: UniqueIdentifier, destino: string, indice: number): No[] {
  const copia = structuredClone(arvore)
  const l = achar(copia, id)
  if (!l) return arvore
  const origem = l.pai ? copia.find((n) => n.id === l.pai)!.filhos : copia
  const [no] = origem.splice(l.indice, 1)
  const alvo = destino === RAIZ ? copia : copia.find((n) => idFilhos(n.id) === destino)?.filhos
  if (!alvo) return arvore
  alvo.splice(Math.max(0, Math.min(indice, alvo.length)), 0, no)
  return copia
}

/* ── estilos (variáveis do tema do Payload, para funcionar no modo claro e no escuro) ── */

const borda = '1px solid var(--theme-elevation-150)'
const estiloInput: CSSProperties = {
  width: '100%', padding: '7px 9px', border: borda, borderRadius: 4,
  background: 'var(--theme-input-bg)', color: 'var(--theme-text)', font: 'inherit', minWidth: 0,
}
const estiloIcone: CSSProperties = {
  border: 'none', background: 'transparent', color: 'var(--theme-elevation-600)', cursor: 'pointer', padding: '4px 6px', borderRadius: 4, font: 'inherit', lineHeight: 1,
}

type AcoesCartao = {
  editar: (id: string, campo: 'rotulo' | 'destino', valor: string) => void
  remover: (id: string) => void
  moverPara: (id: string, destino: string) => void
}

type Destino = { valor: string; rotulo: string }

function Alca({ atributos, ouvintes, rotulo }: { atributos: Record<string, unknown>; ouvintes: Record<string, unknown> | undefined; rotulo: string }) {
  return (
    <button type="button" aria-label={`Arrastar ${rotulo || 'item'} (Espaço pega, setas movem, Espaço solta)`} title="Arrastar" style={{ ...estiloIcone, cursor: 'grab', fontSize: 18, touchAction: 'none' }} {...atributos} {...ouvintes}>
      ⠿
    </button>
  )
}

function Linha({ no, ehFilho, acoes, destinos, atual }: { no: No; ehFilho: boolean; acoes: AcoesCartao; destinos: Destino[]; atual: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: no.id })
  const { setNodeRef: setFilhosRef, isOver } = useDroppable({ id: idFilhos(no.id), disabled: ehFilho })
  const estilo: CSSProperties = {
    transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.4 : 1,
    border: borda, borderRadius: 6, background: ehFilho ? 'var(--theme-elevation-50)' : 'var(--theme-elevation-0, transparent)', padding: 8,
  }
  return (
    <li ref={setNodeRef} style={{ ...estilo, listStyle: 'none' }} data-menu-item={no.rotulo}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) minmax(0,1.3fr) auto auto', gap: 8, alignItems: 'center' }}>
        <Alca atributos={attributes as unknown as Record<string, unknown>} ouvintes={listeners as Record<string, unknown> | undefined} rotulo={no.rotulo} />
        <input type="text" aria-label="Nome do botão" placeholder="Nome" value={no.rotulo} maxLength={60} style={estiloInput} onChange={(e) => acoes.editar(no.id, 'rotulo', e.target.value)} />
        {/* Botão com dropdown só ABRE a lista no site: o destino não é usado (fica guardado, e volta a valer se o dropdown for esvaziado). */}
        <input
          type="text" aria-label={`Destino de ${no.rotulo || 'item'}`} list="menu-destinos"
          disabled={!ehFilho && no.filhos.length > 0}
          style={{ ...estiloInput, ...(!ehFilho && no.filhos.length > 0 ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}
          placeholder={!ehFilho && no.filhos.length > 0 ? 'Só abre o dropdown (não usa destino)' : '/pagina, https://… ou @link'}
          value={!ehFilho && no.filhos.length > 0 ? '' : no.destino} onChange={(e) => acoes.editar(no.id, 'destino', e.target.value)}
        />
        <select
          aria-label={`Mover ${no.rotulo || 'item'} para…`} title="Mover para…" value={atual} style={{ ...estiloInput, width: 'auto', minWidth: 150, maxWidth: 240 }}
          onChange={(e) => acoes.moverPara(no.id, e.target.value)}
        >
          {destinos.filter((d) => d.valor !== idFilhos(no.id)).map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
        </select>
        <button type="button" aria-label={`Remover ${no.rotulo || 'item'}`} title="Remover" style={{ ...estiloIcone, color: 'var(--theme-error-500)' }} onClick={() => acoes.remover(no.id)}>✕</button>
      </div>
      {!ehFilho && (
        <div
          ref={setFilhosRef} data-dropdown-de={no.rotulo}
          style={{
            marginTop: 8, marginLeft: 26, padding: 8, borderRadius: 6, minHeight: 44,
            border: `1px dashed ${isOver ? 'var(--theme-success-500)' : 'var(--theme-elevation-250)'}`,
            background: isOver ? 'var(--theme-success-50, rgba(0,160,80,.08))' : 'transparent',
          }}
        >
          <SortableContext items={no.filhos.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            {no.filhos.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--theme-elevation-500)', fontSize: 13 }}>
                Dropdown vazio — arraste outros botões para cá para transformar “{no.rotulo || 'este botão'}” em um menu suspenso.
              </p>
            ) : (
              <ul style={{ margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                {no.filhos.map((f) => <Linha key={f.id} no={f} ehFilho acoes={acoes} destinos={destinos} atual={idFilhos(no.id)} />)}
              </ul>
            )}
          </SortableContext>
        </div>
      )}
    </li>
  )
}

/** Lista do nível principal. Fica num componente próprio porque `useDroppable` só funciona DENTRO do DndContext. */
function Raiz({ arvore, acoes }: { arvore: No[]; acoes: AcoesCartao }) {
  const { setNodeRef } = useDroppable({ id: RAIZ })
  const destinos: Destino[] = [{ valor: RAIZ, rotulo: 'Nível principal' }, ...arvore.map((n) => ({ valor: idFilhos(n.id), rotulo: `Dentro de: ${n.rotulo || 'novo botão'}` }))]
  return (
    <SortableContext items={arvore.map((n) => n.id)} strategy={verticalListSortingStrategy}>
      <ul ref={setNodeRef} style={{ margin: 0, padding: 0, display: 'grid', gap: 8 }} data-menu-raiz>
        {arvore.map((n) => <Linha key={n.id} no={n} ehFilho={false} acoes={acoes} destinos={destinos} atual={RAIZ} />)}
      </ul>
    </SortableContext>
  )
}

/** Prioridade de soltura: item de dropdown > área de dropdown > botão do nível principal > lista principal. */
function criarColisao(arvoreRef: { current: No[] }): CollisionDetection {
  return (args) => {
    const ativo = String(args.active.id)
    const proprios = new Set<string>([idFilhos(ativo), ...(achar(arvoreRef.current, ativo)?.no.filhos.map((f) => f.id) ?? [])])
    // Sem ponteiro (teclado): as setas só REORDENAM entre irmãos (o item mais próximo do mesmo container). Aninhar pelo teclado é feito
    // no seletor "Mover para…" de cada item; deixar o teclado entrar em áreas de dropdown jogaria o botão para dentro do vizinho sem querer.
    if (!args.pointerCoordinates) {
      const meu = containerDe(arvoreRef.current, ativo)
      const irmaos = closestCenter(args).filter((c) => !ehContainer(c.id) && c.id !== args.active.id && containerDe(arvoreRef.current, c.id) === meu)
      return irmaos.slice(0, 1)
    }
    const dentro = pointerWithin(args)
    const candidatos = (dentro.length ? dentro : rectIntersection(args)).filter((c) => !proprios.has(String(c.id)))
    const peso = (id: UniqueIdentifier) => {
      if (id === RAIZ) return 3
      if (String(id).startsWith('filhos:')) return 1
      return achar(arvoreRef.current, id)?.pai ? 0 : 2
    }
    return [...candidatos].sort((a, b) => peso(a.id) - peso(b.id)).slice(0, 1)
  }
}

export const MenuArvore = ({ path, field }: { path: string; field?: { label?: unknown } }) => {
  const { value, setValue, showError, errorMessage } = useField<Salvo[] | null>({ path })
  const [arvore, setArvore] = useState<No[]>(() => paraArvore(value))
  const arvoreRef = useRef(arvore)
  arvoreRef.current = arvore
  const arrastando = useRef(false)
  /** Assinatura do último valor que ESTE editor conhece (carregado ou gravado por ele): serve para reconhecer mudança vinda de fora. */
  const conhecido = useRef(assinatura(value))
  const [ativo, setAtivo] = useState<No | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  useEffect(() => {
    if (!aviso) return
    const t = window.setTimeout(() => setAviso(null), 8000)
    return () => window.clearTimeout(t)
  }, [aviso])

  // Valor trocado de fora (carregamento tardio, "reverter", recarga após salvar): acompanha. Nunca no meio de um arraste, e nunca
  // para o que nós mesmos gravamos (senão o valor antigo do formulário desfaria o movimento em andamento).
  useEffect(() => {
    if (arrastando.current) return
    const externo = assinatura(value)
    if (externo !== conhecido.current) {
      conhecido.current = externo
      setArvore(paraArvore(value))
    }
  }, [value])

  const gravar = useCallback((nova: No[]) => {
    const salvo = paraSalvo(nova)
    conhecido.current = JSON.stringify(salvo)
    setArvore(nova)
    setValue(salvo)
  }, [setValue])

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const colisao = useMemo(() => criarColisao(arvoreRef), [])

  const aoComecar = (e: DragStartEvent) => {
    arrastando.current = true
    setAtivo(achar(arvoreRef.current, e.active.id)?.no ?? null)
    setAviso(null)
  }

  /** Posição de inserção ao soltar sobre um item: antes dele ou depois, conforme o cursor esteja acima ou abaixo do centro. */
  const indiceDeSoltura = (atual: No[], destino: string, active: DragEndEvent['active'], over: NonNullable<DragEndEvent['over']>): number => {
    const lista = listaDe(atual, destino)
    if (ehContainer(over.id)) return lista.length
    const base = lista.findIndex((n) => n.id === over.id)
    const t = active.rect.current.translated
    const abaixo = !!t && t.top + t.height / 2 > over.rect.top + over.rect.height / 2
    return Math.max(0, base) + (abaixo ? 1 : 0)
  }

  // Durante o arraste NADA muda de lugar (mudar o estado aqui mexe no layout e faz o item "quicar" entre áreas conforme o caminho do mouse):
  // só avisa quando o destino sob o cursor não é permitido. A área de dropdown sob o cursor já se destaca sozinha (isOver).
  const aoPassar = (e: DragOverEvent) => {
    const { active, over } = e
    const atual = arvoreRef.current
    const destino = over ? containerDe(atual, over.id) : null
    const origem = containerDe(atual, active.id)
    setAviso(destino && origem && destino !== origem ? motivoDeRecusa(atual, active.id, destino) : null)
  }

  const aoSoltar = (e: DragEndEvent) => {
    const { active, over } = e
    arrastando.current = false
    setAtivo(null)
    if (!over) { setAviso(null); return }
    const atual = arvoreRef.current
    const origem = containerDe(atual, active.id)
    const destino = containerDe(atual, over.id)
    if (!origem || !destino) return

    if (origem === destino) {
      setAviso(null)
      if (ehContainer(over.id) || active.id === over.id) return
      const lista = listaDe(atual, origem)
      const de = lista.findIndex((n) => n.id === active.id)
      const para = lista.findIndex((n) => n.id === over.id)
      if (de < 0 || para < 0) return
      const copia = structuredClone(atual)
      const alvo = origem === RAIZ ? copia : copia.find((n) => idFilhos(n.id) === origem)!.filhos
      alvo.splice(0, alvo.length, ...arrayMove(alvo, de, para))
      gravar(copia)
      return
    }

    const recusa = motivoDeRecusa(atual, active.id, destino)
    if (recusa) { setAviso(recusa); return }
    setAviso(null)
    gravar(mover(atual, active.id, destino, indiceDeSoltura(atual, destino, active, over)))
  }

  const aoCancelar = () => {
    arrastando.current = false
    setAtivo(null)
    setAviso(null)
  }

  const acoes: AcoesCartao = useMemo(() => ({
    editar: (id, campo, valor) => {
      const copia = structuredClone(arvoreRef.current)
      const l = achar(copia, id)
      if (!l) return
      l.no[campo] = valor
      gravar(copia)
    },
    remover: (id) => {
      const l = achar(arvoreRef.current, id)
      if (!l) return
      if (l.no.filhos.length > 0 && !window.confirm(`Remover “${l.no.rotulo}” e os ${l.no.filhos.length} itens que estão dentro dele?`)) return
      const copia = structuredClone(arvoreRef.current)
      const ach = achar(copia, id)!
      ;(ach.pai ? copia.find((n) => n.id === ach.pai)!.filhos : copia).splice(ach.indice, 1)
      gravar(copia)
    },
    // Alternativa ao arrastar (teclado, leitor de tela, celular): vai para o FIM do destino escolhido.
    moverPara: (id, destino) => {
      const atual = arvoreRef.current
      if (containerDe(atual, id) === destino) return
      const recusa = motivoDeRecusa(atual, id, destino)
      if (recusa) { setAviso(recusa); return }
      setAviso(null)
      gravar(mover(atual, id, destino, listaDe(atual, destino).length))
    },
  }), [gravar])

  const adicionar = (rotulo: string, destino: string) => gravar([...arvoreRef.current, { id: novoId(), rotulo, destino, filhos: [] }])
  const usados = useMemo(() => new Set(arvore.flatMap((n) => [n.destino, ...n.filhos.map((f) => f.destino)])), [arvore])
  const rotuloCampo = typeof field?.label === 'string' ? field.label : 'Botões do menu'

  return (
    <div style={{ margin: '0 0 24px' }} data-menu-arvore>
      <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>{rotuloCampo}</label>
      <p style={{ margin: '0 0 12px', color: 'var(--theme-elevation-600)', fontSize: 13 }}>
        Arraste pelo ícone <strong>⠿</strong>. Solte um botão <strong>dentro da área tracejada</strong> de outro para ele virar item do dropdown (por exemplo,
        “Patrimônio Cultural” dentro de “A cidade”). Para tirar um item do dropdown, solte-o <strong>sobre um botão do nível principal</strong>. O menu tem dois níveis, e um botão com itens dentro só abre o dropdown (não usa destino próprio).
      </p>

      <datalist id="menu-destinos">
        {SUGESTOES.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
      </datalist>

      {/* Espaço FIXO: o aviso aparecer/sumir não pode empurrar a lista no meio do arraste (o alvo mudaria de lugar). */}
      <div role="status" aria-live="polite" style={{ minHeight: 56, marginBottom: 4 }}>
        {aviso && <p style={{ margin: 0, padding: '8px 10px', borderRadius: 4, border: '1px solid var(--theme-warning-500)', background: 'var(--theme-warning-50)', color: 'var(--theme-warning-800, var(--theme-text))' }}>{aviso}</p>}
      </div>

      <DndContext id="menu-principal-dnd" sensors={sensores} collisionDetection={colisao} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} onDragStart={aoComecar} onDragOver={aoPassar} onDragEnd={aoSoltar} onDragCancel={aoCancelar}>
        <Raiz arvore={arvore} acoes={acoes} />
        <DragOverlay dropAnimation={null}>
          {ativo ? (
            <div style={{ padding: '8px 12px', border: '1px solid var(--theme-success-500)', borderRadius: 6, background: 'var(--theme-bg)', boxShadow: '0 6px 18px rgba(0,0,0,.25)' }}>
              ⠿ {ativo.rotulo || 'Novo botão'}{ativo.filhos.length > 0 ? ` (${ativo.filhos.length} no dropdown)` : ''}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' }}>
        <button type="button" className="btn btn--style-secondary btn--size-medium" onClick={() => adicionar('', '')}>+ Novo botão</button>
        <select
          aria-label="Adicionar página do portal" value="" style={{ ...estiloInput, width: 'auto', minWidth: 260 }}
          onChange={(e) => { const s = SUGESTOES.find((x) => x.valor === e.target.value); if (s) adicionar(s.rotulo.replace(/ — link externo$/, ''), s.valor) }}
        >
          <option value="">+ Adicionar página ou link do portal…</option>
          {SUGESTOES.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}{usados.has(s.valor) ? ' (já está no menu)' : ''}</option>)}
        </select>
      </div>

      {showError && errorMessage && <p role="alert" style={{ margin: '12px 0 0', color: 'var(--theme-error-500)' }}>{errorMessage}</p>}
    </div>
  )
}
