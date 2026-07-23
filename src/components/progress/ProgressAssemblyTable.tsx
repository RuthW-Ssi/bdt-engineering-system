import { Fragment, useState } from 'react'
import { Search, Pencil, ChevronUp, X } from 'lucide-react'
import type { ProgressZoneRow, UpdateAssemblyProgressPayload } from '../../api/projectProgress'
import { STATUS_META } from './statusMeta'

interface Props {
  rows: ProgressZoneRow[]
  matchedAssemblyIds: Set<number>
  selectedAssemblyId: number | null
  onSelectRow: (assemblyId: number) => void
  onViewIn3D: (assemblyId: number) => void
  onUpdate: (assemblyId: number, payload: UpdateAssemblyProgressPayload) => void
  onBulkUpdate: (assemblyIds: number[], payload: UpdateAssemblyProgressPayload) => void
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
  padding: '5px 7px', boxSizing: 'border-box',
}
const checkboxRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#1A1A1A', cursor: 'pointer',
}

// Backend @db.Date values arrive as ISO datetimes — <input type="date"> wants YYYY-MM-DD.
const toInputDate = (v: string | null) => (v ? v.slice(0, 10) : '')

const DATE_FIELDS = ['actual_load_date', 'install_date', 'qc_install_date'] as const
type DateField = (typeof DATE_FIELDS)[number]
const FIELD_LABEL: Record<DateField, string> = {
  actual_load_date: 'Actual Load',
  install_date: 'Install',
  qc_install_date: 'QC Install',
}

const EDIT_FIELDS = ['qc_inspection_pass', 'qc_final_pass', ...DATE_FIELDS] as const

function rowToDraft(r: ProgressZoneRow): UpdateAssemblyProgressPayload {
  return {
    qc_inspection_pass: r.qc_inspection_pass,
    qc_final_pass: r.qc_final_pass,
    actual_load_date: r.actual_load_date,
    install_date: r.install_date,
    qc_install_date: r.qc_install_date,
  }
}

// Only send fields that actually changed vs. the row as loaded — keeps the
// partial-update semantics (omitted = unchanged) instead of re-writing all 5.
function diffDraft(draft: UpdateAssemblyProgressPayload, original: ProgressZoneRow): UpdateAssemblyProgressPayload {
  const payload: UpdateAssemblyProgressPayload = {}
  for (const f of EDIT_FIELDS) if (draft[f] !== original[f]) (payload as Record<string, unknown>)[f] = draft[f]
  return payload
}

export function ProgressAssemblyTable({
  rows, matchedAssemblyIds, selectedAssemblyId, onSelectRow, onViewIn3D, onUpdate, onBulkUpdate, saving,
}: Props) {
  const [search, setSearch] = useState('')
  // Accordion — one row's edit panel open at a time, keeps the list compact
  // (the whole point: more of the width goes to the 3D panel next to it).
  // Edits are staged in `editDraft` and only PATCHed on explicit Save —
  // toggling a checkbox or picking a date must NOT write immediately.
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<UpdateAssemblyProgressPayload>({})

  const openEdit = (r: ProgressZoneRow) => {
    setExpandedId(r.assembly_id)
    setEditDraft(rowToDraft(r))
  }
  const closeEdit = () => setExpandedId(null)

  // Bulk-select — set the same fields across many rows in one request
  // instead of opening each row's edit panel one at a time.
  const [bulkIds, setBulkIds] = useState<Set<number>>(new Set())
  const [bulkDraft, setBulkDraft] = useState<UpdateAssemblyProgressPayload>({})
  const [bulkTouched, setBulkTouched] = useState<Set<keyof UpdateAssemblyProgressPayload>>(new Set())

  const q = search.trim().toLowerCase()
  const visible = q ? rows.filter(r => r.mark.toLowerCase().includes(q)) : rows

  const totalWeight = rows.reduce((s, r) => s + (r.weight_kg ?? 0), 0)
  const zonePct = totalWeight > 0
    ? rows.reduce((s, r) => s + (r.weight_kg ?? 0) * r.pct, 0) / totalWeight
    : 0

  const setBulkField = <K extends keyof UpdateAssemblyProgressPayload>(field: K, value: UpdateAssemblyProgressPayload[K]) => {
    setBulkDraft(d => ({ ...d, [field]: value }))
    setBulkTouched(t => new Set(t).add(field))
  }

  const clearBulkSelection = () => {
    setBulkIds(new Set())
    setBulkDraft({})
    setBulkTouched(new Set())
  }

  const applyBulk = () => {
    if (!bulkTouched.size || !bulkIds.size) return
    const payload: UpdateAssemblyProgressPayload = {}
    for (const field of bulkTouched) (payload as Record<string, unknown>)[field] = bulkDraft[field]
    onBulkUpdate([...bulkIds], payload)
    clearBulkSelection()
  }

  const allVisibleSelected = visible.length > 0 && visible.every(r => bulkIds.has(r.assembly_id))
  const toggleSelectAllVisible = () => {
    setBulkIds(prev => {
      const next = new Set(prev)
      if (allVisibleSelected) visible.forEach(r => next.delete(r.assembly_id))
      else visible.forEach(r => next.add(r.assembly_id))
      return next
    })
  }

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

      {bulkIds.size > 0 && (
        <div style={{ background: '#FCEBEB', borderBottom: '1px solid #F3C9CB', padding: '12px 14px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#C8202A' }}>{bulkIds.size} selected</span>
            <span style={{ fontSize: 11.5, color: '#8E8E8E' }}>— set fields below, only the ones you touch get applied</span>
            <button
              onClick={clearBulkSelection}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, font: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#8E8E8E', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X size={13} /> Clear
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16 }}>
            <FieldGroup label="QC Inspection">
              <label style={checkboxRow}>
                <input
                  type="checkbox"
                  checked={bulkDraft.qc_inspection_pass ?? false}
                  onChange={e => setBulkField('qc_inspection_pass', e.target.checked)}
                  style={{ width: 17, height: 17, accentColor: '#C8202A', cursor: 'pointer' }}
                />
                <span>{bulkTouched.has('qc_inspection_pass') ? (bulkDraft.qc_inspection_pass ? 'Set: Passed' : 'Set: Not yet') : 'No change'}</span>
              </label>
            </FieldGroup>
            <FieldGroup label="QC Final">
              <label style={checkboxRow}>
                <input
                  type="checkbox"
                  checked={bulkDraft.qc_final_pass ?? false}
                  onChange={e => setBulkField('qc_final_pass', e.target.checked)}
                  style={{ width: 17, height: 17, accentColor: '#C8202A', cursor: 'pointer' }}
                />
                <span>{bulkTouched.has('qc_final_pass') ? (bulkDraft.qc_final_pass ? 'Set: Passed' : 'Set: Not yet') : 'No change'}</span>
              </label>
            </FieldGroup>
            {DATE_FIELDS.map(field => (
              <FieldGroup key={field} label={FIELD_LABEL[field]}>
                <input
                  type="date"
                  value={bulkDraft[field] ? toInputDate(bulkDraft[field] as string) : ''}
                  onChange={e => setBulkField(field, e.target.value || null)}
                  style={{ ...dateInput, width: 140, color: bulkTouched.has(field) ? '#1A1A1A' : '#ABABAB' }}
                />
              </FieldGroup>
            ))}
            <button
              onClick={applyBulk}
              disabled={saving || !bulkTouched.size}
              style={{
                font: 'inherit', fontSize: 12.5, fontWeight: 700, color: 'white',
                background: bulkTouched.size ? '#C8202A' : '#E0A6AA', border: 'none', borderRadius: 8,
                padding: '8px 18px', cursor: bulkTouched.size ? 'pointer' : 'default', whiteSpace: 'nowrap',
              }}
            >
              Apply to {bulkIds.size}
            </button>
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'center', width: 36 }}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  title="Select all visible"
                  style={{ width: 15, height: 15, accentColor: '#C8202A', cursor: 'pointer' }}
                />
              </th>
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
              const expanded = expandedId === r.assembly_id
              const checked = bulkIds.has(r.assembly_id)
              return (
                <Fragment key={r.assembly_id}>
                  <tr
                    onClick={() => onSelectRow(r.assembly_id)}
                    style={{
                      cursor: 'pointer',
                      background: expanded ? '#FAFAFA' : checked ? '#FEF6F6' : selectedAssemblyId === r.assembly_id ? '#FEF6F6' : undefined,
                    }}
                  >
                    <td style={{ ...td, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setBulkIds(prev => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(r.assembly_id)
                          else next.delete(r.assembly_id)
                          return next
                        })}
                        style={{ width: 15, height: 15, accentColor: '#C8202A', cursor: 'pointer' }}
                      />
                    </td>
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
                        onClick={e => { e.stopPropagation(); if (expanded) closeEdit(); else openEdit(r) }}
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
                  {expanded && (() => {
                    const dirty = EDIT_FIELDS.some(f => editDraft[f] !== r[f])
                    const save = () => {
                      const payload = diffDraft(editDraft, r)
                      if (Object.keys(payload).length) onUpdate(r.assembly_id, payload)
                      closeEdit()
                    }
                    return (
                      <tr style={{ background: '#FAFAFA' }}>
                        <td colSpan={6} style={{ padding: '14px 16px 16px', borderBottom: '1px solid #EDEFF2' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 20, rowGap: 14 }}>
                            <FieldGroup label="QC Inspection">
                              <label style={checkboxRow}>
                                <input
                                  type="checkbox"
                                  checked={editDraft.qc_inspection_pass ?? false}
                                  disabled={saving}
                                  onChange={e => setEditDraft(d => ({ ...d, qc_inspection_pass: e.target.checked }))}
                                  style={{ width: 18, height: 18, accentColor: '#C8202A', cursor: 'pointer' }}
                                />
                                <span>{editDraft.qc_inspection_pass ? 'Passed' : 'Not yet'}</span>
                              </label>
                            </FieldGroup>
                            <FieldGroup label="QC Final">
                              <label style={checkboxRow}>
                                <input
                                  type="checkbox"
                                  checked={editDraft.qc_final_pass ?? false}
                                  disabled={saving}
                                  onChange={e => setEditDraft(d => ({ ...d, qc_final_pass: e.target.checked }))}
                                  style={{ width: 18, height: 18, accentColor: '#C8202A', cursor: 'pointer' }}
                                />
                                <span>{editDraft.qc_final_pass ? 'Passed' : 'Not yet'}</span>
                              </label>
                            </FieldGroup>
                            {DATE_FIELDS.map(field => (
                              <FieldGroup key={field} label={FIELD_LABEL[field]}>
                                <input
                                  type="date"
                                  value={toInputDate((editDraft[field] as string | null) ?? null)}
                                  disabled={saving}
                                  onChange={e => setEditDraft(d => ({ ...d, [field]: e.target.value || null }))}
                                  style={{ ...dateInput, width: '100%', color: editDraft[field] ? '#1A1A1A' : '#ABABAB' }}
                                />
                              </FieldGroup>
                            ))}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
                            <button
                              onClick={save}
                              disabled={saving || !dirty}
                              style={{
                                font: 'inherit', fontSize: 12.5, fontWeight: 700, color: 'white',
                                background: dirty ? '#C8202A' : '#E0A6AA', border: 'none', borderRadius: 8,
                                padding: '7px 18px', cursor: dirty ? 'pointer' : 'default',
                              }}
                            >
                              Save
                            </button>
                            <button
                              onClick={closeEdit}
                              disabled={saving}
                              style={{ font: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#8E8E8E', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                            {dirty && <span style={{ fontSize: 11, color: '#ABABAB' }}>Unsaved changes</span>}
                          </div>
                        </td>
                      </tr>
                    )
                  })()}
                </Fragment>
              )
            })}
            {!visible.length && (
              <tr>
                <td colSpan={6} style={{ ...td, textAlign: 'center', color: '#8E8E8E', padding: 24 }}>
                  {rows.length ? 'No marks match the search' : 'No BOM assemblies uploaded for this zone yet'}
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6} style={{ padding: '10px 12px', fontSize: 11.5, color: '#8E8E8E', borderTop: '1px solid #E0E0E0' }}>
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
