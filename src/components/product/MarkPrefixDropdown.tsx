import { useState, useRef, useEffect } from 'react'
import { useMarkPrefixes } from '../../hooks/useMarkPrefixes'

interface Props {
  value: string
  onChange: (code: string) => void
  onAddNew?: () => void
  error?: string
}

export function MarkPrefixDropdown({ value, onChange, onAddNew, error }: Props) {
  const { data: prefixes = [], isLoading } = useMarkPrefixes()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const active = prefixes.filter(p => p.active)
  const q = query.trim().toLowerCase()
  const filtered = q ? active.filter(p => `${p.code} ${p.label}`.toLowerCase().includes(q)) : active
  const selectedLabel = prefixes.find(p => p.code === value)?.label ?? ''

  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>
        Mark Prefix *
      </label>
      <div ref={containerRef} style={{ position: 'relative' }}>
        <input
          className="w-full border rounded-md focus:outline-none"
          style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: error ? '#C8202A' : open ? '#0C447C' : '#E0E0E0' }}
          value={open ? query : value ? `${value} · ${selectedLabel}` : ''}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setQuery(''); setOpen(true) }}
          placeholder={isLoading ? 'Loading…' : '— ค้นหา Mark Prefix —'}
          readOnly={isLoading}
        />
        {open && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60,
            background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto', marginTop: 2,
          }}>
            {value && (
              <div
                onMouseDown={() => { onChange(''); setQuery(''); setOpen(false) }}
                style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', color: '#888', borderBottom: '1px solid #F0F0F0' }}
                className="hover:bg-chrome-50"
              >
                ✕ ล้างค่า
              </div>
            )}
            {filtered.map(p => (
              <div
                key={p.code}
                onMouseDown={() => { onChange(p.code); setQuery(''); setOpen(false) }}
                style={{
                  padding: '7px 10px', fontSize: 13, cursor: 'pointer',
                  background: p.code === value ? '#F0F7FF' : undefined,
                  display: 'flex', gap: 8, alignItems: 'center',
                }}
                className="hover:bg-chrome-50"
              >
                <span className="font-mono" style={{ fontWeight: 600, color: '#333', minWidth: 40 }}>{p.code}</span>
                <span style={{ color: '#8E8E8E' }}>{p.label}</span>
              </div>
            ))}
            {filtered.length === 0 && q && (
              <div style={{ padding: '7px 10px', fontSize: 12, color: '#9CA3AF' }}>ไม่พบ prefix ที่ตรงกัน</div>
            )}
            {onAddNew && (
              <div
                onMouseDown={e => { e.preventDefault(); setOpen(false); onAddNew() }}
                style={{
                  padding: '7px 10px', fontSize: 13, cursor: 'pointer',
                  color: '#0C447C', borderTop: '1px solid #F0F0F0',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                className="hover:bg-chrome-50"
              >
                <span style={{ fontSize: 15, lineHeight: 1 }}>＋</span> สร้าง prefix ใหม่…
              </div>
            )}
          </div>
        )}
      </div>
      {error && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{error}</div>}
    </div>
  )
}
