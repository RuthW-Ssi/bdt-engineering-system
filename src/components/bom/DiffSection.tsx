import { useState } from 'react'
import type { DiffRowDto, DiffStatus } from '../../api/dispatches'

export interface ColumnDef<T> {
  label: string
  key: keyof T
  format?: (v: unknown) => string
  width?: number
}

interface Props<T> {
  title: string
  rows: DiffRowDto<T>[]
  columns: ColumnDef<T>[]
}

const STATUS_BADGE: Record<DiffStatus, { label: string; color: string; bg: string }> = {
  added:     { label: '+', color: '#065F46', bg: '#D1F2E0' },
  removed:   { label: '-', color: '#991B1B', bg: '#FEE2E2' },
  changed:   { label: '~', color: '#92400E', bg: '#FEF3C7' },
  unchanged: { label: '=', color: '#6B7280', bg: '#F3F4F6' },
}

const ROW_BG: Record<DiffStatus, string> = {
  added:     '#F0FDF4',
  removed:   '#FFF1F1',
  changed:   '#FFFBEB',
  unchanged: 'white',
}

function cellVal<T>(row: DiffRowDto<T>, col: ColumnDef<T>): string {
  const obj = row.curr ?? row.prev
  if (!obj) return ''
  const v = obj[col.key]
  if (v == null) return ''
  if (col.format) return col.format(v)
  if (typeof v === 'number') return String(v)
  return String(v)
}

export function DiffSection<T>({ title, rows, columns }: Props<T>) {
  const [showUnchanged, setShowUnchanged] = useState(false)

  const visible = showUnchanged ? rows : rows.filter(r => r.status !== 'unchanged')
  const changedCount = rows.filter(r => r.status !== 'unchanged').length

  if (rows.length === 0) return null

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </span>
        <span style={{ fontSize: 10, color: '#6B7280' }}>
          {changedCount} changed · {rows.length} total
        </span>
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6B7280', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showUnchanged}
            onChange={e => setShowUnchanged(e.target.checked)}
            style={{ width: 12, height: 12 }}
          />
          Show unchanged
        </label>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
              <th style={{ width: 28, padding: '5px 8px', textAlign: 'center', color: '#9CA3AF', fontWeight: 600, fontSize: 10 }}>
                ±
              </th>
              {columns.map(col => (
                <th key={String(col.key)} style={{
                  padding: '5px 8px', textAlign: 'left', color: '#6B7280',
                  fontWeight: 600, fontSize: 10, textTransform: 'uppercase',
                  letterSpacing: '0.04em', whiteSpace: 'nowrap',
                  minWidth: col.width,
                }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => {
              const badge = STATUS_BADGE[row.status]
              return (
                <tr key={i} style={{ background: ROW_BG[row.status], borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 16, height: 16, borderRadius: 4,
                      fontSize: 11, fontWeight: 700, color: badge.color, background: badge.bg,
                    }}>
                      {badge.label}
                    </span>
                  </td>
                  {columns.map(col => (
                    <td key={String(col.key)} style={{
                      padding: '5px 8px', fontFamily: 'monospace', color: '#1F2937',
                      maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {cellVal(row, col)}
                    </td>
                  ))}
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} style={{ padding: '16px 8px', textAlign: 'center', color: '#9CA3AF', fontStyle: 'italic', fontSize: 12 }}>
                  No changes
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
