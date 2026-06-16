import { useState } from 'react'
import { Loader2, AlertTriangle, Info, ChevronDown } from 'lucide-react'
import { useAssembliesByPrefix } from '../../hooks/useMo'
import type { AssemblyPickerGroup, AssemblyPickerItem } from '../../api/mo'

const DIM_LABEL: Record<string, string> = { project: 'Project', zone: 'Zone', subzone: 'Sub Zone' }

/** [{label:'Project', value:'THEPHA 28x54m'}, {label:'Zone', value:'Grid Line B'}, …] */
function groupSegments(g: AssemblyPickerGroup): { label: string; value: string }[] {
  if (!g.key) return [{ label: '', value: g.label }]
  return Object.entries(g.key).map(([dim, val]) => ({ label: DIM_LABEL[dim] ?? dim, value: val ?? '-' }))
}

/**
 * Section 2 · grouped assemblies with qty inputs.
 * - qty capped at remaining (P13 client-side; BE re-validates → 400)
 * - cross-project selection warning (P14, warn + allow)
 * - "Show completed" toggle reveals fully-allocated assemblies (P16)
 */
export function AssemblyPicker({
  markPrefix,
  selected,
  onSetQty,
}: {
  markPrefix: string
  selected: Record<number, { item: AssemblyPickerItem; qty: number }>
  onSetQty: (item: AssemblyPickerItem, qty: number) => void
}) {
  const [showCompleted, setShowCompleted] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const { data, isLoading } = useAssembliesByPrefix(markPrefix, !showCompleted)

  const toggleGroup = (key: string) =>
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const selectedProjects = new Set(
    Object.values(selected).filter(s => s.qty > 0).map(s => s.item.project ?? '—'),
  )
  const crossProject = selectedProjects.size > 1

  if (isLoading) {
    return <div className="flex items-center" style={{ height: 80, color: '#C2C2C2' }}><Loader2 size={18} className="animate-spin" /></div>
  }

  const groups = data?.groups ?? []
  const totalItems = data?.total ?? 0

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#777' }}>{totalItems} assemblies</span>
        <label className="flex items-center gap-1.5" style={{ fontSize: 12, color: '#555', cursor: 'pointer' }}>
          <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} />
          Show completed
        </label>
      </div>

      {crossProject && (
        <div className="flex items-center gap-2" style={{ background: '#FAEEDA', border: '1px solid #E8C98A', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#854F0B' }}>
          <AlertTriangle size={14} />
          This MO spans multiple projects ({[...selectedProjects].join(', ')}). Allowed, but double-check intent.
        </div>
      )}

      {totalItems === 0 ? (
        <div style={{ color: '#8E8E8E', fontSize: 13, padding: '12px 0' }}>No assemblies available for this mark prefix.</div>
      ) : (
        groups.map((g, gi) => {
          const gkey = `${gi}::${g.label}`
          const isCollapsed = collapsed.has(gkey)
          const selectedInGroup = g.items.filter(it => (selected[it.id]?.qty ?? 0) > 0).length
          return (
          <div key={gkey} style={{ marginBottom: 14 }}>
            {g.label !== 'All' && (
              <button
                onClick={() => toggleGroup(gkey)}
                className="flex items-center gap-1.5"
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 6 }}
              >
                <ChevronDown size={13} style={{ color: '#999', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
                <span className="flex items-center" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {groupSegments(g).map((s, i) => (
                    <span key={i} className="flex items-center" style={{ gap: 5 }}>
                      {i > 0 && <span style={{ color: '#D0D0D0' }}>·</span>}
                      {s.label && <span style={{ fontSize: 12, fontWeight: 700, color: '#2A2A2A' }}>{s.label}:</span>}
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#888' }}>{s.value}</span>
                    </span>
                  ))}
                </span>
                {g.bom_version != null && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#0C447C', background: '#E3EEF8', borderRadius: 999, padding: '1px 8px' }} title="latest BOM version for this zone">
                    BOM v{g.bom_version}
                  </span>
                )}
                <span style={{ fontSize: 11, fontWeight: 600, color: '#BBB', marginLeft: 2 }}>· {g.items.length}</span>
                {selectedInGroup > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#C8202A', background: '#FCEBEB', borderRadius: 999, padding: '0 7px' }}>{selectedInGroup} selected</span>
                )}
              </button>
            )}
            {!isCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {g.items.map(item => {
                const sel = selected[item.id]?.qty ?? 0
                const maxQty = Math.floor(item.remaining) // integer ceiling = remaining
                const full = maxQty <= 0
                return (
                  <div key={item.id} className="flex items-center gap-3" style={{ border: '1px solid ' + (sel > 0 ? '#C8202A55' : '#E8E8E8'), borderRadius: 6, padding: '8px 12px', background: sel > 0 ? '#FFF7F7' : '#fff' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{item.assembly_mark}</span>
                      {item.name && <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>{item.name}</span>}
                    </div>
                    <Breakdown item={item} />
                    <div style={{ textAlign: 'right', fontSize: 11, color: '#888', minWidth: 120 }}>
                      Total {item.total} · Alloc {item.allocated} · <strong style={{ color: '#0C447C' }}>Rem {maxQty}</strong>
                    </div>
                    <input
                      type="number" inputMode="numeric" min={0} max={maxQty} step={1} disabled={full}
                      value={sel || ''}
                      // block decimal/exponent/sign so only whole numbers can be typed
                      onKeyDown={e => { if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault() }}
                      onChange={e => {
                        const raw = Math.floor(Number(e.target.value) || 0)
                        onSetQty(item, Math.max(0, Math.min(maxQty, raw))) // hard clamp ≤ remaining
                      }}
                      placeholder={full ? '0' : `0–${maxQty}`}
                      title={full ? 'Fully allocated' : `Max ${maxQty}`}
                      style={{ width: 84, padding: '6px 8px', fontSize: 13, textAlign: 'right', border: '1px solid #C2C2C2', borderRadius: 4, color: '#1A1A1A', background: full ? '#F5F5F5' : '#fff', cursor: full ? 'not-allowed' : 'text' }}
                    />
                  </div>
                )
              })}
            </div>
            )}
          </div>
          )
        })
      )}
    </div>
  )
}

function Breakdown({ item }: { item: AssemblyPickerItem }) {
  const [open, setOpen] = useState(false)
  if (!item.allocation_breakdown.length) return <span style={{ width: 16 }} />
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Info size={14} style={{ color: '#0C447C', cursor: 'help' }} />
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 20, zIndex: 20, background: '#1F1F1F', color: '#fff', borderRadius: 6, padding: '6px 10px', fontSize: 11, whiteSpace: 'nowrap' }}>
          {item.allocation_breakdown.map(b => (
            <div key={b.mo_code}>{b.mo_code} ({b.qty})</div>
          ))}
        </div>
      )}
    </div>
  )
}
