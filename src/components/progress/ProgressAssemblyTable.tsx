import { Fragment, useState } from 'react'
import { Search, Pencil, ChevronUp } from 'lucide-react'
import type { ProgressZoneRow, ProgressStatus, UpdateAssemblyProgressPayload } from '../../api/projectProgress'
import { STATUS_META } from './statusMeta'

interface Props {
  rows: ProgressZoneRow[]
  matchedAssemblyIds: Set<number>
  selectedAssemblyId: number | null
  activeStatus: ProgressStatus | null
  onSelectRow: (assemblyId: number) => void
  onViewIn3D: (assemblyId: number) => void
  onUpdate: (assemblyId: number, payload: UpdateAssemblyProgressPayload) => void
  saving: boolean
}

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.04em', color: '#ABABAB', padding: '9px 12px',
  borderBottom: '1px solid #E0E0E0', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'white',
}
const td: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid #EDEFF2', verticalAlign: 'middle', whiteSpace: 'nowrap' }
const dateInput: React.CSSProperties = {
  font: 'inherit', fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 11.5,
  color: '#1A1A1A', background: 'white', border: '1px solid #E0E0E0', borderRadius: 6,
  padding: '5px 7px', width: 132,
}

// Backend @db.Date values arrive as ISO datetimes — <input type="date"> wants YYYY-MM-DD.
const toInputDate = (v: string | null) => (v ? v.slice(0, 10) : '')

const FIELD_LABEL: Record<'actual_load_date' | 'install_date' | 'qc_install_date', string> = {
  actual_load_date: 'Actual Load',
  install_date: 'Install',
  qc_install_date: 'QC Install',
}

export function ProgressAssemblyTable({
  rows, matchedAssemblyIds, selectedAssemblyId, activeStatus, onSelectRow, onViewIn3D, onUpdate, saving,
}: Props) {
  const [search, setSearch] = useState('')
  // Accordion — one row's edit panel open at a time, keeps the list compact
  // (the whole point: more of the width goes to the 3D panel next to it).
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const q = search.trim().toLowerCase()
  const visible = q ? rows.filter(r => r.mark.toLowerCase().includes(q)) : rows

  const totalWeight = rows.reduce((s, r) => s + (r.weight_kg ?? 0), 0)
  const zonePct = totalWeight > 0
    ? rows.reduce((s, r) => s + (r.weight_kg ?? 0) * r.pct, 0) / totalWeight
    : 0

  return (
    <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', borderBottom: '1px solid #EDEFF2' }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8E8E8E' }}>
          Assemblies
        </div>
        <div style={{ position: 'relative', width: 200 }}>
          <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#ABABAB' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search mark..."
            style={{ width: '100%', font: 'inherit', fontSize: 12.5, color: '#1A1A1A', background: '#F7F7F7', border: '1px solid #E0E0E0', borderRadius: 8, padding: '6px 10px 6px 28px' }}
          />
        </div>
      </div>

      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={th}>Mark</th>
              <th style={{ ...th, textAlign: 'right' }}>Weight</th>
              <th style={th}>Progress</th>
              <th style={{ ...th, textAlign: 'center' }}>3D</th>
              <th style={{ ...th, textAlign: 'center' }}>Edit</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => {
              const meta = STATUS_META[r.status]
              const matched = matchedAssemblyIds.has(r.assembly_id)
              const dimmed = activeStatus != null && r.status !== activeStatus
              const expanded = expandedId === r.assembly_id
              return (
                <Fragment key={r.assembly_id}>
                  <tr
                    onClick={() => onSelectRow(r.assembly_id)}
                    style={{
                      cursor: 'pointer',
                      opacity: dimmed ? 0.35 : 1,
                      background: expanded ? '#FAFAFA' : selectedAssemblyId === r.assembly_id ? '#FEF6F6' : undefined,
                    }}
                  >
                    <td style={{ ...td, fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontWeight: 600 }}>{r.mark}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'IBM Plex Mono, ui-monospace, monospace', color: '#8E8E8E' }}>
                      {r.weight_kg != null ? `${r.weight_kg.toFixed(1)} kg` : '—'}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 84 }}>
                        <div style={{ width: 46, height: 5, borderRadius: 99, background: '#EDEFF2', overflow: 'hidden', flexShrink: 0 }}>
                          <div style={{ width: `${r.pct}%`, height: '100%', background: meta.color }} />
                        </div>
                        <span style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 11.5, fontWeight: 700, width: 32, textAlign: 'right' }}>{r.pct}%</span>
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {matched ? (
                        <button
                          onClick={e => { e.stopPropagation(); onViewIn3D(r.assembly_id) }}
                          title="Zoom to this mark in the 3D view"
                          style={{ border: '1px solid #4A85C4', background: 'white', color: '#4A85C4', font: 'inherit', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          View
                        </button>
                      ) : (
                        <span title="No matching BIM element found for this mark" style={{ color: '#C2C2C2', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button
                        onClick={e => { e.stopPropagation(); setExpandedId(expanded ? null : r.assembly_id) }}
                        title={expanded ? 'Close' : 'Edit progress'}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 26, height: 26, borderRadius: 7, cursor: 'pointer',
                          border: `1px solid ${expanded ? '#C8202A' : '#E0E0E0'}`,
                          background: expanded ? '#C8202A' : 'white',
                          color: expanded ? 'white' : '#8E8E8E',
                        }}
                      >
                        {expanded ? <ChevronUp size={13} /> : <Pencil size={12} />}
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr style={{ background: '#FAFAFA' }}>
                      <td colSpan={5} style={{ padding: '14px 16px 16px', borderBottom: '1px solid #EDEFF2' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 20 }}>
                          <FieldGroup label="QC Inspection">
                            <input
                              type="checkbox"
                              checked={r.qc_inspection_pass}
                              disabled={saving}
                              onChange={e => onUpdate(r.assembly_id, { qc_inspection_pass: e.target.checked })}
                              style={{ width: 18, height: 18, accentColor: '#C8202A', cursor: 'pointer' }}
                            />
                          </FieldGroup>
                          <FieldGroup label="QC Final">
                            <input
                              type="checkbox"
                              checked={r.qc_final_pass}
                              disabled={saving}
                              onChange={e => onUpdate(r.assembly_id, { qc_final_pass: e.target.checked })}
                              style={{ width: 18, height: 18, accentColor: '#C8202A', cursor: 'pointer' }}
                            />
                          </FieldGroup>
                          {(['actual_load_date', 'install_date', 'qc_install_date'] as const).map(field => (
                            <FieldGroup key={field} label={FIELD_LABEL[field]}>
                              <input
                                type="date"
                                value={toInputDate(r[field])}
                                disabled={saving}
                                onChange={e => onUpdate(r.assembly_id, { [field]: e.target.value || null })}
                                style={{ ...dateInput, color: r[field] ? '#1A1A1A' : '#ABABAB' }}
                              />
                            </FieldGroup>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {!visible.length && (
              <tr>
                <td colSpan={5} style={{ ...td, textAlign: 'center', color: '#8E8E8E', padding: 24 }}>
                  {rows.length ? 'No marks match the search' : 'No BOM assemblies uploaded for this zone yet'}
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={5} style={{ padding: '10px 12px', fontSize: 11.5, color: '#8E8E8E', borderTop: '1px solid #E0E0E0' }}>
                  {rows.length} assemblies · <b style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', color: '#1A1A1A' }}>{(totalWeight / 1000).toFixed(1)} t</b> total · zone progress{' '}
                  <b style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', color: '#1A1A1A' }}>{zonePct.toFixed(1)}%</b>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8E8E8E' }}>{label}</span>
      {children}
    </div>
  )
}
