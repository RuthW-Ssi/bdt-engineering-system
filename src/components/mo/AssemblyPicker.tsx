import { useState, useMemo } from 'react'
import { Loader2, Info, ChevronDown, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { useAssembliesByPrefix } from '../../hooks/useMo'
import type { AssemblyPickerGroup, AssemblyPickerItem } from '../../api/mo'
import type { AssemblyFilter } from './AssemblyFilterBar'

const DIM_LABEL: Record<string, string> = { project: 'Project', zone: 'Zone', subzone: 'Sub Zone' }

function groupSegments(g: AssemblyPickerGroup): { label: string; value: string }[] {
  if (!g.key) return [{ label: '', value: g.label }]
  return Object.entries(g.key).map(([dim, val]) => ({ label: DIM_LABEL[dim] ?? dim, value: val ?? '-' }))
}

function groupDisplayName(g: AssemblyPickerGroup, sortBy: AssemblyFilter['sortBy']): { label: string; value: string } {
  if (!g.key) return { label: '', value: g.label }
  if (sortBy === 'project') return { label: DIM_LABEL.project, value: g.key.project ?? '-' }
  if (sortBy === 'zone')    return { label: DIM_LABEL.zone,    value: g.key.zone    ?? '-' }
  if (sortBy === 'subzone') return { label: DIM_LABEL.subzone, value: g.key.subzone ?? '-' }
  return groupSegments(g)[0] ?? { label: '', value: g.label }
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr)
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function sortGroups(groups: AssemblyPickerGroup[], sortBy: AssemblyFilter['sortBy']): AssemblyPickerGroup[] {
  return [...groups].sort((a, b) => {
    if (sortBy === 'project') return (a.key?.project ?? '').localeCompare(b.key?.project ?? '')
    if (sortBy === 'zone')    return (a.key?.zone ?? '').localeCompare(b.key?.zone ?? '')
    if (sortBy === 'subzone') return (a.key?.subzone ?? '').localeCompare(b.key?.subzone ?? '')
    return (a.items[0]?.assembly_mark ?? '').localeCompare(b.items[0]?.assembly_mark ?? '')
  })
}

function ItemDateBadge({ dateStr, label }: { dateStr: string | null; label: string }) {
  if (!dateStr) return null
  const days = daysUntil(dateStr)
  if (days === null) return null

  const isOverdue = days < 0
  const isToday   = days === 0
  const isUrgent  = days <= 30

  const dot     = isOverdue || isToday ? '🔴' : isUrgent ? '🟡' : '🟢'
  const dayText = isOverdue ? `${Math.abs(days)}D overdue` : isToday ? 'today' : `${days}D`
  const color   = isOverdue || isToday ? '#B91C1C' : isUrgent ? '#92400E' : '#166534'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color, marginTop: 3 }}>
      <span style={{ fontSize: 10 }}>{dot}</span>
      <span>{label}</span>
      <span style={{ fontWeight: 400, color: '#555' }}>{dateStr}</span>
      <span style={{ opacity: 0.7 }}>({dayText})</span>
    </span>
  )
}

const BULK_BTN: React.CSSProperties = {
  background: '#fff', border: '1px solid #E8E8E8', borderRadius: 6,
  padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center',
  gap: 3, color: '#999', fontSize: 11, fontWeight: 500,
}

/**
 * Section 2 · grouped assemblies with qty inputs.
 * Filter/sort state is lifted to MoNew → passed via `filter` prop.
 */
export function AssemblyPicker({
  markPrefix,
  selected,
  onSetQty,
  filter,
}: {
  markPrefix: string
  selected: Record<number, { item: AssemblyPickerItem; qty: number }>
  onSetQty: (item: AssemblyPickerItem, qty: number) => void
  filter: AssemblyFilter
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const apiGroupBy = filter.groupBy === 'none' ? 'project,zone,subzone' : filter.groupBy
  const { data, isLoading } = useAssembliesByPrefix(markPrefix, true, apiGroupBy)

  const groups = useMemo(() => {
    const raw = data?.groups ?? []
    const allItems = raw.flatMap(g => g.items)

    const baseGroups: AssemblyPickerGroup[] = filter.groupBy === 'none' || filter.sortBy === 'mark'
      ? [{ key: null, label: 'All', bom_version: null, project_due_date: null, zone_end_date: null, sub_zone_due_date: null, items: allItems }]
      : raw

    const filtered = baseGroups.filter(g => {
      // hide groups with null value for the selected sort level
      if (filter.sortBy === 'subzone' && g.key?.subzone == null) return false
      if (filter.sortBy === 'zone'    && g.key?.zone    == null) return false
      // urgency filter — always against the zone end date, regardless of
      // grouping level (no more project/zone/sub-zone due-date split).
      if (filter.urgentDays === null && !filter.showOverdue) return true
      const days = daysUntil(g.zone_end_date)
      if (days === null) return true
      if (filter.urgentDays !== null && filter.showOverdue) return days <= filter.urgentDays
      if (filter.urgentDays !== null) return days >= 0 && days <= filter.urgentDays
      if (filter.showOverdue) return days < 0
      return true
    })

    return sortGroups(filtered, filter.sortBy)
  }, [data, filter])

  const toggleGroup = (key: string) =>
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  if (isLoading) {
    return <div className="flex items-center" style={{ height: 80, color: '#C2C2C2' }}><Loader2 size={18} className="animate-spin" /></div>
  }

  const totalItems = data?.total ?? 0

  const allKeys = groups.map((g, gi) => `${gi}::${g.label}`)
  const allCollapsed = allKeys.length > 0 && allKeys.every(k => collapsed.has(k))
  const visibleItems = groups.flatMap(g => g.items)

  function toggleAll() {
    if (allCollapsed) setCollapsed(new Set())
    else setCollapsed(new Set(allKeys))
  }

  function setAllMin() {
    for (const item of visibleItems) onSetQty(item, 0)
  }

  function setAllMax() {
    for (const item of visibleItems) {
      const max = Math.floor(item.remaining)
      if (max > 0) onSetQty(item, max)
    }
  }

  return (
    <div>
      <div className="flex items-center" style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#777' }}>{totalItems} assemblies</span>
        {(filter.urgentDays !== null || filter.showOverdue) && (
          <span style={{ fontSize: 11, color: '#C8202A', marginLeft: 8 }}>
            · showing {groups.reduce((s, g) => s + g.items.length, 0)} filtered
          </span>
        )}
        <div style={{ flex: 1 }} />
        {visibleItems.length > 0 && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={setAllMin} title="Set all to 0" style={BULK_BTN}>Min</button>
            <button onClick={setAllMax} title="Set all to max remaining" style={BULK_BTN}>Max</button>
            <button
              onClick={toggleAll}
              title={allCollapsed ? 'Expand all' : 'Collapse all'}
              style={BULK_BTN}
            >
              {allCollapsed ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
            </button>
          </div>
        )}
      </div>


      {totalItems === 0 ? (
        <div style={{ color: '#8E8E8E', fontSize: 13, padding: '12px 0' }}>No assemblies available for this mark prefix.</div>
      ) : groups.length === 0 ? null : (
        groups.map((g, gi) => {
          const gkey = `${gi}::${g.label}`
          const isCollapsed = collapsed.has(gkey)
          const selectedInGroup = g.items.filter(it => (selected[it.id]?.qty ?? 0) > 0).length
          return (
          <div key={gkey} style={{ marginBottom: 14 }}>
            {g.label !== 'All' && (() => {
              const seg = groupDisplayName(g, filter.sortBy)
              return (
              <button
                onClick={() => toggleGroup(gkey)}
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 6 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ChevronDown size={13} style={{ color: '#999', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
                  {seg.label && <span style={{ fontSize: 10, fontWeight: 600, color: '#AAA', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{seg.label}</span>}
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>{seg.value}</span>
                  {g.bom_version != null && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#0C447C', background: '#E3EEF8', borderRadius: 999, padding: '1px 8px' }}>
                      BOM v{g.bom_version}
                    </span>
                  )}
                  {selectedInGroup > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#C8202A', background: '#FCEBEB', borderRadius: 999, padding: '0 7px' }}>{selectedInGroup} selected</span>
                  )}
                </div>
              </button>
              )
            })()}
            {!isCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {g.items.map(item => {
                const sel = selected[item.id]?.qty ?? 0
                const maxQty = Math.floor(item.remaining)
                const full = maxQty <= 0
                return (
                  <div key={item.id} className="flex items-center gap-3" style={{ border: '1px solid ' + (sel > 0 ? '#C8202A55' : '#E8E8E8'), borderRadius: 6, padding: '8px 12px', background: sel > 0 ? '#FFF7F7' : '#fff' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div>
                        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{item.assembly_mark}</span>
                        {item.name && <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>{item.name}</span>}
                      </div>
                      <ItemDateBadge dateStr={item.zone_end_date} label="Due date" />
                    </div>
                    <Breakdown item={item} />
                    <div style={{ textAlign: 'right', fontSize: 11, color: '#888', minWidth: 120 }}>
                      Total {item.total} · Alloc {item.allocated} · <strong style={{ color: '#0C447C' }}>Rem {maxQty}</strong>
                    </div>
                    <input
                      type="number" inputMode="numeric" min={0} max={maxQty} step={1} disabled={full}
                      value={sel || ''}
                      onKeyDown={e => { if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault() }}
                      onChange={e => {
                        const raw = Math.floor(Number(e.target.value) || 0)
                        onSetQty(item, Math.max(0, Math.min(maxQty, raw)))
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
