import { useState } from 'react'
import { Loader2, Search, ChevronDown } from 'lucide-react'
import { useMarkPrefixesWithCount } from '../../hooks/useMo'
import type { MarkPrefixWithCount } from '../../api/mo'

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  main_structure:      { label: 'Main Structure',      color: '#991B1B' },
  secondary_structure: { label: 'Secondary Structure', color: '#185FA5' },
  accessory:           { label: 'Accessory',           color: '#555555' },
  building_component:  { label: 'Building Component',  color: '#1E6B36' },
}
const catMeta = (c: string) => CATEGORY_META[c] ?? { label: c, color: '#555555' }

/**
 * Section 1 · left-rail list. Mark prefixes are grouped by category (accordion);
 * a category must be expanded before its prefixes show. 1 prefix selectable (P12).
 */
export function MarkPrefixGrid({
  value,
  onChange,
}: {
  value: string | null
  onChange: (code: string) => void
}) {
  const { data, isLoading } = useMarkPrefixesWithCount()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())

  if (isLoading) {
    return <div className="flex items-center" style={{ height: 80, color: '#C2C2C2' }}><Loader2 size={18} className="animate-spin" /></div>
  }

  const prefixes = (data ?? []).filter((p) => p.active)
  const q = search.trim().toLowerCase()
  const filtered = q
    ? prefixes.filter((p) => p.code.toLowerCase().includes(q) || p.label.toLowerCase().includes(q))
    : prefixes

  // group by category
  const groups = new Map<string, MarkPrefixWithCount[]>()
  for (const p of filtered) {
    const arr = groups.get(p.category) ?? []
    arr.push(p)
    groups.set(p.category, arr)
  }
  const cats = [...groups.keys()].sort()

  const toggle = (c: string) =>
    setOpen((prev) => {
      const n = new Set(prev)
      n.has(c) ? n.delete(c) : n.add(c)
      return n
    })
  const isOpen = (c: string) => (q ? true : open.has(c)) // searching → expand all matches

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, border: '1px solid #E0E0E0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      {/* Search */}
      <div style={{ padding: 10, borderBottom: '1px solid #EEE', background: '#FAFAFA', flexShrink: 0 }}>
        <div className="relative">
          <Search size={14} className="absolute pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)', color: '#AAA' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search mark prefix…"
            style={{ width: '100%', paddingLeft: 32, paddingRight: 12, height: 34, fontSize: 13, border: '1px solid #D8D8D8', borderRadius: 6, background: '#fff' }}
          />
        </div>
      </div>

      {/* Category accordion */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {cats.length === 0 && (
          <div style={{ padding: 16, fontSize: 13, color: '#999' }}>No mark prefix found</div>
        )}
        {cats.map((c) => {
          const meta = catMeta(c)
          const list = groups.get(c)!.slice().sort((a, b) => b.pending_bom_count - a.pending_bom_count)
          const opened = isOpen(c)
          return (
            <div key={c} style={{ borderBottom: '1px solid #F0F0F0' }}>
              {/* Category header */}
              <button
                onClick={() => toggle(c)}
                className="flex items-center"
                style={{ width: '100%', gap: 8, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <span style={{ width: 9, height: 9, borderRadius: 999, background: meta.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#444' }}>{meta.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#888', background: '#F0F0F0', borderRadius: 999, padding: '1px 8px' }}>{list.length}</span>
                <ChevronDown size={15} style={{ color: '#BBB', transform: opened ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
              </button>

              {/* Prefix rows */}
              {opened && (
                <div style={{ padding: '0 8px 8px' }}>
                  {list.map((p) => {
                    const disabled = p.pending_bom_count === 0
                    const selected = value === p.code
                    return (
                      <button
                        key={p.code}
                        disabled={disabled}
                        onClick={() => onChange(p.code)}
                        className="flex items-center"
                        style={{
                          width: '100%', gap: 10, textAlign: 'left', marginTop: 4, padding: '9px 12px',
                          borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
                          border: `1px solid ${selected ? '#C8202A' : '#E8E8E8'}`,
                          borderLeftWidth: 3, borderLeftColor: selected ? '#C8202A' : meta.color,
                          background: selected ? '#FCEBEB' : disabled ? '#FAFAFA' : '#fff',
                          opacity: disabled ? 0.55 : 1,
                        }}
                      >
                        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: selected ? '#C8202A' : meta.color, minWidth: 56 }}>{p.code}</span>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 8px', background: disabled ? '#EEE' : '#E3EEF8', color: disabled ? '#999' : '#0C447C' }}>{p.pending_bom_count}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
