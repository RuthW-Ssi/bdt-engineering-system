import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, Search, X } from 'lucide-react'
import type { DiffRowDto, DiffStatus, AssemblyDiffItemDto, PartDiffItemDto, JunctionDiffItem } from '../../api/dispatches'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PartEntry {
  junctionRow: DiffRowDto<JunctionDiffItem>
  partRow: DiffRowDto<PartDiffItemDto> | undefined
  effectiveStatus: DiffStatus
}

interface AssemblyNode {
  assemblyRow: DiffRowDto<AssemblyDiffItemDto>
  mark: string
  parts: PartEntry[]
  hasChanges: boolean
}

interface Props {
  assembly_diff: DiffRowDto<AssemblyDiffItemDto>[]
  part_diff: DiffRowDto<PartDiffItemDto>[]
  junction_diff: DiffRowDto<JunctionDiffItem>[]
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<DiffStatus, { label: string; color: string; bg: string }> = {
  added:     { label: '+', color: '#065F46', bg: '#D1F2E0' },
  removed:   { label: '-', color: '#991B1B', bg: '#FEE2E2' },
  changed:   { label: '~', color: '#92400E', bg: '#FEF3C7' },
  unchanged: { label: '=', color: '#9CA3AF', bg: '#F3F4F6' },
}

const ROW_BG: Record<DiffStatus, string> = {
  added:     '#F0FDF4',
  removed:   '#FFF1F1',
  changed:   '#FFFBEB',
  unchanged: 'white',
}

const PRIORITY: Record<DiffStatus, number> = { removed: 4, added: 3, changed: 2, unchanged: 1 }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function combinedStatus(a: DiffStatus, b: DiffStatus | undefined): DiffStatus {
  if (!b) return a
  return PRIORITY[a] >= PRIORITY[b] ? a : b
}

function PartChangeSummaryChip({ parts }: { parts: PartEntry[] }) {
  const added   = parts.filter(p => p.effectiveStatus === 'added').length
  const removed = parts.filter(p => p.effectiveStatus === 'removed').length
  const changed = parts.filter(p => p.effectiveStatus === 'changed').length
  if (added === 0 && removed === 0 && changed === 0) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      {added   > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#065F46', background: '#D1F2E0', borderRadius: 3, padding: '1px 4px' }}>+{added}</span>}
      {removed > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#991B1B', background: '#FEE2E2', borderRadius: 3, padding: '1px 4px' }}>-{removed}</span>}
      {changed > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FEF3C7', borderRadius: 3, padding: '1px 4px' }}>~{changed}</span>}
    </span>
  )
}

function Badge({ status }: { status: DiffStatus }) {
  const b = STATUS_BADGE[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 16, height: 16, borderRadius: 4, fontSize: 10, fontWeight: 700,
      color: b.color, background: b.bg, flexShrink: 0,
    }}>
      {b.label}
    </span>
  )
}

function DiffCell({ prev, curr, format, mono }: {
  prev: unknown; curr: unknown
  format?: (v: unknown) => string
  mono?: boolean
}) {
  const fmt = (v: unknown) => {
    if (v == null) return '—'
    return format ? format(v) : String(v)
  }
  const ps = fmt(prev), cs = fmt(curr)
  const changed = prev != null && curr != null && ps !== cs

  const style: React.CSSProperties = {
    fontSize: 12,
    fontFamily: mono ? 'monospace' : undefined,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  }

  if (!changed) return <span style={style}>{cs !== '—' ? cs : ps}</span>

  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ ...style, fontSize: 10, color: '#9CA3AF', textDecoration: 'line-through' }}>{ps}</span>
      <span style={{ ...style, color: '#059669', fontWeight: 600 }}>{cs}</span>
    </span>
  )
}

// ─── Shared column widths ─────────────────────────────────────────────────────

const COL = {
  asmMark:  140,
  partMark: 120,
  qty:       52,
  profile:   80,
  grade:     48,
  length:    88,
  weight:   100,
  area:     100,
  dims:     130,
} as const

function NumCol({ prev, curr, format, width }: {
  prev: unknown; curr: unknown
  format: (v: unknown) => string
  width: number
}) {
  return (
    <span style={{ width, flexShrink: 0, textAlign: 'right', fontSize: 11 }}>
      <DiffCell prev={prev} curr={curr} format={format} />
    </span>
  )
}


// ─── Assembly row content ─────────────────────────────────────────────────────

function assemblyDims(a: AssemblyDiffItemDto | null | undefined): string | null {
  if (!a || (a.length_mm == null && a.width_mm == null && a.height_mm == null)) return null
  return [a.length_mm, a.width_mm, a.height_mm].map(v => v ?? '—').join(' × ')
}

function AssemblyRowContent({ row }: { row: DiffRowDto<AssemblyDiffItemDto> }) {
  const p = row.prev, c = row.curr
  const fmtWt   = (v: unknown) => v != null ? `${Number(v).toFixed(1)} kg` : '—'
  const fmtArea  = (v: unknown) => v != null ? `${Number(v).toFixed(2)} m²` : '—'
  const fmtQty   = (v: unknown) => v != null ? `×${Number(v)}` : '—'
  const hasArea  = p?.surface_area_m2 != null || c?.surface_area_m2 != null
  const pDims = assemblyDims(p), cDims = assemblyDims(c)
  const hasDims = pDims != null || cDims != null

  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, gap: 14, paddingRight: 12 }}>
      <span style={{ width: COL.asmMark, flexShrink: 0, fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <DiffCell prev={p?.assembly_mark} curr={c?.assembly_mark} mono />
      </span>
      <span style={{ flex: 1, minWidth: 0,  fontSize: 12, color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <DiffCell prev={p?.name} curr={c?.name} />
      </span>
      <NumCol prev={p?.qty}            curr={c?.qty}            format={fmtQty}  width={COL.qty} />
      <NumCol prev={p?.weight_kg}      curr={c?.weight_kg}      format={fmtWt}   width={COL.weight} />
      {hasArea && <NumCol prev={p?.surface_area_m2} curr={c?.surface_area_m2} format={fmtArea} width={COL.area} />}
      {hasDims && (
        <span style={{ width: COL.dims, flexShrink: 0, textAlign: 'right', fontSize: 11, fontFamily: 'monospace' }}>
          <DiffCell prev={pDims} curr={cDims} mono />
        </span>
      )}
    </div>
  )
}

// ─── Part row content ─────────────────────────────────────────────────────────

function PartRowContent({
  junctionRow, partRow,
}: {
  junctionRow: DiffRowDto<JunctionDiffItem>
  partRow: DiffRowDto<PartDiffItemDto> | undefined
}) {
  const pj = junctionRow.prev, cj = junctionRow.curr
  const pp = partRow?.prev,    cp = partRow?.curr
  const fmtWt  = (v: unknown) => v != null ? `${Number(v).toFixed(2)} kg` : '—'
  const fmtLen = (v: unknown) => v != null ? `${Number(v).toFixed(0)} mm` : '—'
  const fmtQty = (v: unknown) => v != null ? `×${Number(v)}` : '—'
  const hasLen = pp?.length_mm != null || cp?.length_mm != null

  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, gap: 14, paddingRight: 12 }}>
      <span style={{ width: COL.partMark, flexShrink: 0, fontFamily: 'monospace', fontSize: 11, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <DiffCell prev={pj?.part_mark ?? pp?.part_mark} curr={cj?.part_mark ?? cp?.part_mark} mono />
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <DiffCell prev={pp?.description} curr={cp?.description} />
      </span>
      {(pp?.profile != null || cp?.profile != null) && (
        <span style={{ width: COL.profile, flexShrink: 0, fontSize: 11, color: '#9CA3AF', textAlign: 'right', fontFamily: 'monospace' }}>
          <DiffCell prev={pp?.profile} curr={cp?.profile} mono />
        </span>
      )}
      {(pp?.grade != null || cp?.grade != null) && (
        <span style={{ width: COL.grade, flexShrink: 0, fontSize: 11, color: '#9CA3AF', textAlign: 'right', fontFamily: 'monospace' }}>
          <DiffCell prev={pp?.grade} curr={cp?.grade} mono />
        </span>
      )}
      <NumCol prev={pj?.qty}       curr={cj?.qty}       format={fmtQty} width={COL.qty} />
      {hasLen && <NumCol prev={pp?.length_mm} curr={cp?.length_mm} format={fmtLen} width={COL.length} />}
      <NumCol prev={pp?.weight_kg} curr={cp?.weight_kg} format={fmtWt}  width={COL.weight} />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DiffHierarchyView({ assembly_diff, part_diff, junction_diff }: Props) {
  const [showUnchanged, setShowUnchanged] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const term = searchTerm.trim().toLowerCase()

  // Auto-expand all when searching
  useEffect(() => {
    if (term) setCollapsed(new Set())
  }, [term])

  // part_mark → DiffRowDto<PartDiffItemDto>
  const partMap = new Map<string, DiffRowDto<PartDiffItemDto>>()
  for (const row of part_diff) {
    const mark = (row.curr ?? row.prev)?.part_mark
    if (mark) partMap.set(mark, row)
  }

  // assembly_mark → junction rows
  const junctionsByAsm = new Map<string, DiffRowDto<JunctionDiffItem>[]>()
  for (const row of junction_diff) {
    const mark = (row.curr ?? row.prev)?.assembly_mark ?? ''
    const list = junctionsByAsm.get(mark) ?? []
    list.push(row)
    junctionsByAsm.set(mark, list)
  }

  // Build ordered assembly nodes
  const nodes: AssemblyNode[] = assembly_diff.map(asmRow => {
    const mark = (asmRow.curr ?? asmRow.prev)?.assembly_mark ?? ''
    const junctions = junctionsByAsm.get(mark) ?? []
    const parts: PartEntry[] = junctions.map(j => {
      const partMark = (j.curr ?? j.prev)?.part_mark ?? ''
      const partRow = partMap.get(partMark)
      return { junctionRow: j, partRow, effectiveStatus: combinedStatus(j.status, partRow?.status) }
    })
    const hasChanges = asmRow.status !== 'unchanged' || parts.some(p => p.effectiveStatus !== 'unchanged')
    return { assemblyRow: asmRow, mark, parts, hasChanges }
  })

  // Orphan parts: standalone in current dispatch (not in any curr junction)
  // Using only curr junction marks so parts that moved from assembly→standalone still appear here
  const currJunctionMarks = new Set<string>()
  for (const row of junction_diff) {
    if (row.curr?.part_mark) currJunctionMarks.add(row.curr.part_mark)
  }
  const orphanPartsAll = part_diff.filter(r => {
    const mark = (r.curr ?? r.prev)?.part_mark
    return mark && !currJunctionMarks.has(mark)
  })

  const orphanParts = !term ? orphanPartsAll : orphanPartsAll.filter(r => {
    const mark = (r.curr ?? r.prev)?.part_mark ?? ''
    const desc = (r.curr ?? r.prev)?.description ?? ''
    return mark.toLowerCase().includes(term) || desc.toLowerCase().includes(term)
  })

  const baseNodes = showUnchanged ? nodes : nodes.filter(n => n.hasChanges)

  const visibleNodes = !term ? baseNodes : baseNodes
    .filter(n => {
      const asmMatch = (n.mark.toLowerCase().includes(term)) ||
        ((n.assemblyRow.curr ?? n.assemblyRow.prev)?.name ?? '').toLowerCase().includes(term)
      const partMatch = n.parts.some(p => {
        const pm = (p.junctionRow.curr ?? p.junctionRow.prev)?.part_mark ?? ''
        const desc = (p.partRow?.curr ?? p.partRow?.prev)?.description ?? ''
        return pm.toLowerCase().includes(term) || desc.toLowerCase().includes(term)
      })
      return asmMatch || partMatch
    })
    .map(n => {
      const asmMatch = (n.mark.toLowerCase().includes(term)) ||
        ((n.assemblyRow.curr ?? n.assemblyRow.prev)?.name ?? '').toLowerCase().includes(term)
      if (asmMatch) return n
      return {
        ...n,
        parts: n.parts.filter(p => {
          const pm = (p.junctionRow.curr ?? p.junctionRow.prev)?.part_mark ?? ''
          const desc = (p.partRow?.curr ?? p.partRow?.prev)?.description ?? ''
          return pm.toLowerCase().includes(term) || desc.toLowerCase().includes(term)
        }),
      }
    })



  const toggleCollapse = (mark: string) => {
    setCollapsed(s => {
      const next = new Set(s)
      next.has(mark) ? next.delete(mark) : next.add(mark)
      return next
    })
  }

  const allMarks = nodes.map(n => n.mark)
  const collapseAll = () => setCollapsed(new Set(allMarks))
  const expandAll = () => setCollapsed(new Set())

  return (
    <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderBottom: '1px solid #F0F0F0', background: '#FAFAFA' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Changes
        </span>
        <span style={{ fontSize: 10, color: '#9CA3AF' }}>
          {assembly_diff.filter(r => r.curr != null).length} assemblies
        </span>
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6B7280', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={showUnchanged}
            onChange={e => setShowUnchanged(e.target.checked)}
            style={{ width: 12, height: 12 }}
          />
          Show unchanged
        </label>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 16px', background: '#F9FAFB', borderBottom: '1px solid #F0F0F0' }}>
        {([
          { status: 'added',     label: 'Added' },
          { status: 'removed',   label: 'Removed' },
          { status: 'changed',   label: 'Changed' },
          { status: 'unchanged', label: 'Unchanged' },
        ] as { status: DiffStatus; label: string }[]).map(({ status, label }) => {
          const b = STATUS_BADGE[status]
          return (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 16, height: 16, borderRadius: 4, fontSize: 10, fontWeight: 700,
                color: b.color, background: b.bg,
              }}>
                {b.label}
              </span>
              <span style={{ fontSize: 10, color: '#6B7280' }}>{label}</span>
            </div>
          )
        })}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Search input */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={11} style={{ position: 'absolute', left: 6, color: '#9CA3AF', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                height: 24, paddingLeft: 22, paddingRight: searchTerm ? 22 : 6,
                fontSize: 11, border: `1px solid ${searchTerm ? '#185FA5' : '#E5E7EB'}`,
                borderRadius: 4, outline: 'none', background: 'white',
                minWidth: 140, color: '#1F1F1F',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{ position: 'absolute', right: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0, display: 'flex' }}
              >
                <X size={10} />
              </button>
            )}
          </div>

          <span style={{ width: 1, height: 14, background: '#E5E7EB', flexShrink: 0 }} />

          {(['expand', 'collapse'] as const).map(action => (
            <button
              key={action}
              onClick={action === 'collapse' ? collapseAll : expandAll}
              style={{
                fontSize: 10, fontWeight: 500, color: '#6B7280',
                background: 'white', border: '1px solid #E5E7EB',
                borderRadius: 4, padding: '2px 7px', cursor: 'pointer',
              }}
            >
              {action === 'collapse' ? 'Collapse all' : 'Expand all'}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable data area */}
      <div style={{ overflowX: 'auto', flex: 1 }}>
        <div style={{ minWidth: 700 }}>

      {/* Assembly nodes */}
      {visibleNodes.map(node => {
        const isCollapsed = collapsed.has(node.mark)
        const visibleParts = showUnchanged
          ? node.parts
          : node.parts.filter(p => p.effectiveStatus !== 'unchanged')
        const hasVisibleParts = node.parts.length > 0

        const asmHighlighted = term !== '' && (
          node.mark.toLowerCase().includes(term) ||
          ((node.assemblyRow.curr ?? node.assemblyRow.prev)?.name ?? '').toLowerCase().includes(term)
        )

        return (
          <div key={node.mark}>
            {/* Assembly row */}
            <div
              onClick={() => toggleCollapse(node.mark)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 0 7px 12px',
                background: ROW_BG[node.assemblyRow.status],
                borderBottom: '1px solid #EBEBEB',
                borderLeft: asmHighlighted ? '3px solid #FBBF24' : '3px solid transparent',
                cursor: hasVisibleParts ? 'pointer' : 'default',
              }}
            >
              <span style={{ width: 14, color: '#9CA3AF', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                {hasVisibleParts
                  ? (isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />)
                  : null}
              </span>
              <Badge status={node.assemblyRow.status} />
              {(node.assemblyRow.status === 'unchanged' || node.assemblyRow.status === 'changed') && (
                <PartChangeSummaryChip parts={node.parts} />
              )}
              <AssemblyRowContent row={node.assemblyRow} />
            </div>

            {/* Part rows */}
            {!isCollapsed && visibleParts.map((entry, i) => {
              const pm = (entry.junctionRow.curr ?? entry.junctionRow.prev)?.part_mark ?? ''
              const desc = (entry.partRow?.curr ?? entry.partRow?.prev)?.description ?? ''
              const partHighlighted = term !== '' && (pm.toLowerCase().includes(term) || desc.toLowerCase().includes(term))
              return (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 0 5px 0',
                  background: ROW_BG[entry.effectiveStatus],
                  borderBottom: '1px solid #F5F5F5',
                  borderLeft: partHighlighted ? '3px solid #FBBF24' : '3px solid transparent',
                }}
              >
                {/* Tree indent */}
                <div style={{
                  width: 44, flexShrink: 0, alignSelf: 'stretch',
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                  paddingRight: 6,
                  borderRight: '2px solid #E5E7EB',
                  marginRight: 6,
                  color: '#CBD5E1', fontSize: 11,
                }}>
                  {i === visibleParts.length - 1 ? '└' : '├'}
                </div>
                <Badge status={entry.effectiveStatus} />
                <PartRowContent junctionRow={entry.junctionRow} partRow={entry.partRow} />
              </div>
              )
            })}
          </div>
        )
      })}

      {/* Orphan parts section */}
      {orphanParts.length > 0 && (
        <div>
          <div style={{
            padding: '5px 12px', fontSize: 10, fontWeight: 700, color: '#9CA3AF',
            textTransform: 'uppercase', letterSpacing: '0.05em',
            background: '#F9FAFB', borderTop: '1px solid #E5E7EB', borderBottom: '1px solid #E5E7EB',
          }}>
            Standalone Parts
          </div>
          {orphanParts.map((row, i) => {
            const oMark = (row.curr ?? row.prev)?.part_mark ?? ''
            const oDesc = (row.curr ?? row.prev)?.description ?? ''
            const oHighlighted = term !== '' && (oMark.toLowerCase().includes(term) || oDesc.toLowerCase().includes(term))
            return (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 12px 4px 52px',
                background: ROW_BG[row.status], borderBottom: '1px solid #F3F4F6',
                borderLeft: oHighlighted ? '3px solid #FBBF24' : '3px solid transparent',
              }}
            >
              <Badge status={row.status} />
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#374151', flexShrink: 0 }}>
                {(row.curr ?? row.prev)?.part_mark}
              </span>
              <span style={{ fontSize: 12, color: '#6B7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(row.curr ?? row.prev)?.description}
              </span>
            </div>
            )
          })}
        </div>
      )}

      {visibleNodes.length === 0 && orphanParts.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 12, fontStyle: 'italic' }}>
          No changes
        </div>
      )}

        </div>{/* minWidth wrapper */}
      </div>{/* overflow-x scroll */}
    </div>
  )
}
