import { Fragment, useEffect, useRef, useState } from 'react'
import { Search, Pencil, ChevronUp, X } from 'lucide-react'
import type { ProgressZoneRow, UpdateAssemblyProgressPayload, BulkUpdateAssemblyProgressPayload, FabStage, PaymentStatus } from '../../api/projectProgress'
import { FAB_STAGES, PAYMENT_STATUSES } from '../../api/projectProgress'
import { STATUS_META, PHASE_META } from './statusMeta'
import { usePermission } from '../../hooks/usePermission'

interface Props {
  rows: ProgressZoneRow[]
  matchedAssemblyIds: Set<number>
  selectedAssemblyId: number | null
  onSelectRow: (assemblyId: number) => void
  onViewIn3D: (assemblyId: number) => void
  onUpdate: (assemblyId: number, payload: UpdateAssemblyProgressPayload) => void
  onBulkUpdate: (assemblyIds: number[], payload: BulkUpdateAssemblyProgressPayload) => void
  saving: boolean
}

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.04em', color: '#ABABAB', padding: '9px 12px',
  borderBottom: '1px solid #E0E0E0', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'white',
}
const td: React.CSSProperties = { padding: '11px 12px', borderBottom: '1px solid #EDEFF2', verticalAlign: 'middle', whiteSpace: 'nowrap' }
const dateInput: React.CSSProperties = {
  font: 'inherit', fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 11.5,
  color: '#1A1A1A', background: 'white', border: '1px solid #E0E0E0', borderRadius: 6,
  padding: '5px 7px', boxSizing: 'border-box',
}
const numInput: React.CSSProperties = {
  ...dateInput, width: '100%', textAlign: 'right',
}

// Fabrication stage inputs are the only plain numbers on this page that
// aren't self-evidently a unit (dates/pcs read as counts) — a fixed "%"
// suffix makes clear what's being typed without relying on the field label.
function PctInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div style={{ position: 'relative' }}>
      <input type="number" min={0} max={100} {...props} style={{ ...numInput, paddingRight: 22, ...props.style }} />
      <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#ABABAB', pointerEvents: 'none' }}>
        %
      </span>
    </div>
  )
}
const checkboxRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#1A1A1A', cursor: 'pointer',
}
const mono: React.CSSProperties = { fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }

// Backend @db.Date values arrive as ISO datetimes — <input type="date"> wants YYYY-MM-DD.
const toInputDate = (v: string | null) => (v ? v.slice(0, 10) : '')

const STAGE_LABEL: Record<FabStage, string> = {
  cut: 'Cut',
  buildup: 'Build-Up',
  weld1: 'Weld',
  fitup_drill: 'Fitup/Drill',
  weld2: 'Weld (2)',
  qc_inspection: 'QC Insp',
  primer: 'Primer',
  fireproof: 'Fireproof',
  top_coat: 'TOP',
  qc_final: 'QC Final',
}

const DATE_FIELDS = ['plan_load_date', 'actual_load_date'] as const
type DateField = (typeof DATE_FIELDS)[number]
const DATE_LABEL: Record<DateField, string> = {
  plan_load_date: 'Plan Load',
  actual_load_date: 'Actual Load',
}

const PCS_FIELDS = ['loaded_pcs', 'erected_pcs'] as const
type PcsField = (typeof PCS_FIELDS)[number]
const PCS_LABEL: Record<PcsField, string> = {
  loaded_pcs: 'Loaded',
  erected_pcs: 'Erected',
}

const EDIT_FIELDS = [
  ...FAB_STAGES, ...DATE_FIELDS, ...PCS_FIELDS,
  'payment_status', 'claimed_weight_kg', 'delivered_weight_kg', 'erection_actual_finish_date',
] as const

// Mirrors the server's clamps so what you see staged is what gets stored —
// the real sheet has "50"-for-0.5 typo entries, clamping is the design.
const clampPct = (v: number) => Math.min(100, Math.max(0, Math.round(v)))
const clampPcs = (v: number, qty: number | null) =>
  Math.min(Math.max(1, Math.round(qty ?? 1)), Math.max(0, Math.round(v)))
const nonNegDecimal = (v: number) => Math.max(0, v)

function rowToDraft(r: ProgressZoneRow): UpdateAssemblyProgressPayload {
  return {
    ...Object.fromEntries(FAB_STAGES.map(s => [s, r[s]])),
    plan_load_date: r.plan_load_date,
    actual_load_date: r.actual_load_date,
    loaded_pcs: r.loaded_pcs,
    erected_pcs: r.erected_pcs,
    payment_status: r.payment_status,
    claimed_weight_kg: r.claimed_weight_kg ?? undefined,
    delivered_weight_kg: r.delivered_weight_kg ?? undefined,
    erection_actual_finish_date: r.erection_actual_finish_date,
  }
}

// Only send fields that actually changed vs. the row as loaded — keeps the
// partial-update semantics (omitted = unchanged) instead of re-writing all 14.
function diffDraft(draft: UpdateAssemblyProgressPayload, original: ProgressZoneRow): UpdateAssemblyProgressPayload {
  const payload: UpdateAssemblyProgressPayload = {}
  for (const f of EDIT_FIELDS) if (draft[f] !== original[f]) (payload as Record<string, unknown>)[f] = draft[f]
  return payload
}

const NEUTRAL_METRIC = '#C2C2C2'

// Each metric gets its own color independent of the row's overall status —
// a row can legally be out-of-order (e.g. erected before fab hits 100%), so
// the chip reflects that metric's own completeness, not the derived status.
function metricColor(done: boolean, active: boolean, doneColor: string, activeColor: string) {
  if (done) return doneColor
  if (active) return activeColor
  return NEUTRAL_METRIC
}

function ProgressChip({ label, value, color, title }: { label: string; value: string; color: string; title?: string }) {
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 4, lineHeight: 1,
      background: '#F7F7F7', border: '1px solid #ECECEC', borderRadius: 5,
      padding: '4px 7px', fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 10.5,
    }}>
      <span style={{ fontWeight: 700, color }}>{label}</span>
      <span style={{ color: '#4A4A4A' }}>{value}</span>
    </span>
  )
}

const groupHeader: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
  color: '#C8202A', borderBottom: '1px solid #F3C9CB', paddingBottom: 4, marginBottom: 10,
}

export function ProgressAssemblyTable({
  rows, matchedAssemblyIds, selectedAssemblyId, onSelectRow, onViewIn3D, onUpdate, onBulkUpdate, saving,
}: Props) {
  const canUpdate = usePermission('project-tracking', 'update')
  const [search, setSearch] = useState('')
  // Accordion — one row's edit panel open at a time, keeps the list compact
  // (the whole point: more of the width goes to the 3D panel next to it).
  // Edits are staged in `editDraft` and only PATCHed on explicit Save —
  // typing a percent or picking a date must NOT write immediately.
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<UpdateAssemblyProgressPayload>({})

  const openEdit = (r: ProgressZoneRow) => {
    setExpandedId(r.assembly_id)
    setEditDraft(rowToDraft(r))
  }
  const closeEdit = () => setExpandedId(null)

  // Bulk-select — set the same fields across many rows in one request.
  // Pcs can't share one absolute count across rows with different qty, so
  // bulk offers set-full flags the backend resolves per-row instead.
  const [bulkIds, setBulkIds] = useState<Set<number>>(new Set())
  const [bulkDraft, setBulkDraft] = useState<BulkUpdateAssemblyProgressPayload>({})
  const [bulkTouched, setBulkTouched] = useState<Set<keyof BulkUpdateAssemblyProgressPayload>>(new Set())

  const q = search.trim().toLowerCase()
  const visible = q ? rows.filter(r => r.mark.toLowerCase().includes(q)) : rows

  // Clicking a piece in the 3D viewer sets selectedAssemblyId — scroll that
  // row into view here so the table follows the 3D selection. If an active
  // search hides the row, clear it first so the row exists to scroll to.
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>())
  useEffect(() => {
    if (selectedAssemblyId == null) return
    if (q && !rows.some(r => r.assembly_id === selectedAssemblyId && r.mark.toLowerCase().includes(q))) {
      setSearch('')
      return
    }
    rowRefs.current.get(selectedAssemblyId)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selectedAssemblyId, rows, q])

  // Three separate footer numbers matching the backend rollup exactly:
  // fab weighted by weight_kg, load/erection by pieces (Σ/Σ).
  const totalWeight = rows.reduce((s, r) => s + (r.weight_kg ?? 0), 0)
  const fabPct = totalWeight > 0
    ? rows.reduce((s, r) => s + (r.weight_kg ?? 0) * r.fab_pct, 0) / totalWeight
    : 0
  const effQty = (r: ProgressZoneRow) => Math.max(1, Math.round(r.qty ?? 1))
  const totalQty = rows.reduce((s, r) => s + effQty(r), 0)
  const loadedPcs = rows.reduce((s, r) => s + Math.min(effQty(r), r.loaded_pcs), 0)
  const erectedPcs = rows.reduce((s, r) => s + Math.min(effQty(r), r.erected_pcs), 0)

  const setBulkField = <K extends keyof BulkUpdateAssemblyProgressPayload>(field: K, value: BulkUpdateAssemblyProgressPayload[K]) => {
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
    const payload: BulkUpdateAssemblyProgressPayload = {}
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
        <div style={{ background: '#FCEBEB', borderBottom: '1px solid #F3C9CB', padding: '12px 14px', flexShrink: 0, overflowY: 'auto', maxHeight: 280 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px 12px', marginBottom: 12 }}>
            {FAB_STAGES.map(stage => (
              <FieldGroup key={stage} label={STAGE_LABEL[stage]}>
                <PctInput
                  placeholder="—"
                  value={bulkTouched.has(stage) ? bulkDraft[stage] ?? '' : ''}
                  onChange={e => setBulkField(stage, e.target.value === '' ? 0 : clampPct(Number(e.target.value)))}
                  style={{ color: bulkTouched.has(stage) ? '#1A1A1A' : '#ABABAB' }}
                />
              </FieldGroup>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16 }}>
            {DATE_FIELDS.map(field => (
              <FieldGroup key={field} label={DATE_LABEL[field]}>
                <input
                  type="date"
                  value={bulkDraft[field] ? toInputDate(bulkDraft[field] as string) : ''}
                  onChange={e => setBulkField(field, e.target.value || null)}
                  style={{ ...dateInput, width: 140, color: bulkTouched.has(field) ? '#1A1A1A' : '#ABABAB' }}
                />
              </FieldGroup>
            ))}
            {/* One absolute pcs count can't apply across rows with different
                qty — bulk offers "full" only, resolved per-row server-side. */}
            <FieldGroup label="Loaded">
              <label style={checkboxRow}>
                <input
                  type="checkbox"
                  checked={bulkDraft.set_loaded_full ?? false}
                  onChange={e => setBulkField('set_loaded_full', e.target.checked)}
                  style={{ width: 17, height: 17, accentColor: '#C8202A', cursor: 'pointer' }}
                />
                <span>{bulkTouched.has('set_loaded_full') && bulkDraft.set_loaded_full ? 'Set: full qty' : 'No change'}</span>
              </label>
            </FieldGroup>
            <FieldGroup label="Erected">
              <label style={checkboxRow}>
                <input
                  type="checkbox"
                  checked={bulkDraft.set_erected_full ?? false}
                  onChange={e => setBulkField('set_erected_full', e.target.checked)}
                  style={{ width: 17, height: 17, accentColor: '#C8202A', cursor: 'pointer' }}
                />
                <span>{bulkTouched.has('set_erected_full') && bulkDraft.set_erected_full ? 'Set: full qty' : 'No change'}</span>
              </label>
            </FieldGroup>
            <FieldGroup label="Material Payment">
              <select
                value={bulkTouched.has('payment_status') ? bulkDraft.payment_status ?? '' : ''}
                onChange={e => setBulkField('payment_status', e.target.value as PaymentStatus)}
                style={{ ...dateInput, width: 140, color: bulkTouched.has('payment_status') ? '#1A1A1A' : '#ABABAB' }}
              >
                <option value="" disabled>No change</option>
                {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FieldGroup>
            <FieldGroup label="Claimed (kg)">
              <input
                type="number" min={0} placeholder="—"
                value={bulkTouched.has('claimed_weight_kg') ? bulkDraft.claimed_weight_kg ?? '' : ''}
                onChange={e => setBulkField('claimed_weight_kg', e.target.value === '' ? undefined : nonNegDecimal(Number(e.target.value)))}
                style={{ ...numInput, width: 110, color: bulkTouched.has('claimed_weight_kg') ? '#1A1A1A' : '#ABABAB' }}
              />
            </FieldGroup>
            <FieldGroup label="Delivered (kg)">
              <input
                type="number" min={0} placeholder="—"
                value={bulkTouched.has('delivered_weight_kg') ? bulkDraft.delivered_weight_kg ?? '' : ''}
                onChange={e => setBulkField('delivered_weight_kg', e.target.value === '' ? undefined : nonNegDecimal(Number(e.target.value)))}
                style={{ ...numInput, width: 110, color: bulkTouched.has('delivered_weight_kg') ? '#1A1A1A' : '#ABABAB' }}
              />
            </FieldGroup>
            <FieldGroup label="Erection Finish">
              <input
                type="date"
                value={bulkDraft.erection_actual_finish_date ? toInputDate(bulkDraft.erection_actual_finish_date as string) : ''}
                onChange={e => setBulkField('erection_actual_finish_date', e.target.value || null)}
                style={{ ...dateInput, width: 140, color: bulkTouched.has('erection_actual_finish_date') ? '#1A1A1A' : '#ABABAB' }}
              />
            </FieldGroup>
            {canUpdate && (
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
            )}
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <table style={{ width: 'calc(100% - 10px)', borderCollapse: 'collapse', fontSize: 12.5 }}>
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
              const matched = matchedAssemblyIds.has(r.assembly_id)
              const expanded = expandedId === r.assembly_id
              const checked = bulkIds.has(r.assembly_id)
              const qty = effQty(r)
              return (
                <Fragment key={r.assembly_id}>
                  <tr
                    ref={el => {
                      if (el) rowRefs.current.set(r.assembly_id, el)
                      else rowRefs.current.delete(r.assembly_id)
                    }}
                    onClick={() => onSelectRow(r.assembly_id)}
                    style={{
                      cursor: 'pointer',
                      background: expanded ? '#FAFAFA' : checked ? '#FEF6F6' : selectedAssemblyId === r.assembly_id ? '#FEF6F6' : undefined,
                      boxShadow: selectedAssemblyId === r.assembly_id ? '0 2px 6px rgba(0,0,0,0.15)' : undefined,
                      position: selectedAssemblyId === r.assembly_id ? 'relative' : undefined,
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
                    <td style={{ ...td, ...mono, fontWeight: 600 }}>{r.mark}</td>
                    <td style={{ ...td, textAlign: 'right', ...mono, color: '#8E8E8E' }}>
                      {r.weight_kg != null ? `${r.weight_kg.toFixed(1)} kg` : '—'}
                    </td>
                    <td style={td} title={STATUS_META[r.status].label}>
                      {/* Each chip's color is its own metric's completeness —
                          not the row's single derived status — so all four
                          phases stay independently scannable at a glance. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <ProgressChip
                          label="F" value={`${r.fab_pct}%`}
                          color={metricColor(r.fab_pct >= 100, r.fab_pct > 0, PHASE_META.fabrication.dark, PHASE_META.fabrication.light)}
                        />
                        <ProgressChip
                          label="M" value={`${r.payment_pct}%`} title={r.payment_status}
                          color={metricColor(r.payment_status === 'Paid', false, PHASE_META.payment.dark, PHASE_META.payment.light)}
                        />
                        <ProgressChip
                          label="T" value={`${r.load_pct}%`} title={`${r.loaded_pcs}/${qty} pcs loaded`}
                          color={metricColor(r.loaded_pcs >= qty, r.loaded_pcs > 0, PHASE_META.load.dark, PHASE_META.load.light)}
                        />
                        <ProgressChip
                          label="E" value={`${r.erect_pct}%`} title={`${r.erected_pcs}/${qty} pcs erected`}
                          color={metricColor(r.erected_pcs >= qty, r.erected_pcs > 0, PHASE_META.erection.dark, PHASE_META.erection.light)}
                        />
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
                      {canUpdate && (
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
                      )}
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
                          {/* Fabrication — 10 weighted stages, percent each */}
                          <div style={groupHeader}>Fabrication</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px 14px', marginBottom: 16 }}>
                            {FAB_STAGES.map(stage => (
                              <FieldGroup key={stage} label={STAGE_LABEL[stage]}>
                                <PctInput
                                  value={editDraft[stage] ?? 0}
                                  disabled={saving}
                                  onChange={e => setEditDraft(d => ({ ...d, [stage]: e.target.value === '' ? 0 : clampPct(Number(e.target.value)) }))}
                                />
                              </FieldGroup>
                            ))}
                          </div>

                          {/* Material Payment — parallel to Fab/Transport/Erection, 3-state status */}
                          <div style={groupHeader}>Material Payment</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 14px', marginBottom: 16 }}>
                            <FieldGroup label="Status">
                              <select
                                value={editDraft.payment_status ?? 'Not Disbursed'}
                                disabled={saving}
                                onChange={e => setEditDraft(d => ({ ...d, payment_status: e.target.value as PaymentStatus }))}
                                style={{ ...dateInput, width: '100%' }}
                              >
                                {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </FieldGroup>
                            <FieldGroup label="Claimed (kg)">
                              <input
                                type="number" min={0}
                                value={editDraft.claimed_weight_kg ?? ''}
                                disabled={saving}
                                onChange={e => setEditDraft(d => ({ ...d, claimed_weight_kg: e.target.value === '' ? undefined : nonNegDecimal(Number(e.target.value)) }))}
                                style={numInput}
                              />
                            </FieldGroup>
                            <FieldGroup label="Delivered (kg)">
                              <input
                                type="number" min={0}
                                value={editDraft.delivered_weight_kg ?? ''}
                                disabled={saving}
                                onChange={e => setEditDraft(d => ({ ...d, delivered_weight_kg: e.target.value === '' ? undefined : nonNegDecimal(Number(e.target.value)) }))}
                                style={numInput}
                              />
                            </FieldGroup>
                          </div>

                          {/* Transport — load dates + pieces loaded */}
                          <div style={groupHeader}>Transport</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 14px', marginBottom: 16 }}>
                            {DATE_FIELDS.map(field => (
                              <FieldGroup key={field} label={DATE_LABEL[field]}>
                                <input
                                  type="date"
                                  value={toInputDate((editDraft[field] as string | null) ?? null)}
                                  disabled={saving}
                                  onChange={e => setEditDraft(d => ({ ...d, [field]: e.target.value || null }))}
                                  style={{ ...dateInput, width: '100%', color: editDraft[field] ? '#1A1A1A' : '#ABABAB' }}
                                />
                              </FieldGroup>
                            ))}
                            <FieldGroup label={`${PCS_LABEL.loaded_pcs} / ${qty} pcs`}>
                              <input
                                type="number" min={0} max={qty}
                                value={editDraft.loaded_pcs ?? 0}
                                disabled={saving}
                                onChange={e => setEditDraft(d => ({ ...d, loaded_pcs: e.target.value === '' ? 0 : clampPcs(Number(e.target.value), r.qty) }))}
                                style={numInput}
                              />
                            </FieldGroup>
                          </div>

                          {/* Erection — pieces erected (full = done) + actual finish date */}
                          <div style={groupHeader}>Erection</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 14px' }}>
                            <FieldGroup label={`${PCS_LABEL.erected_pcs} / ${qty} pcs`}>
                              <input
                                type="number" min={0} max={qty}
                                value={editDraft.erected_pcs ?? 0}
                                disabled={saving}
                                onChange={e => setEditDraft(d => ({ ...d, erected_pcs: e.target.value === '' ? 0 : clampPcs(Number(e.target.value), r.qty) }))}
                                style={numInput}
                              />
                            </FieldGroup>
                            <FieldGroup label="Actual Finish">
                              <input
                                type="date"
                                value={toInputDate((editDraft.erection_actual_finish_date as string | null) ?? null)}
                                disabled={saving}
                                onChange={e => setEditDraft(d => ({ ...d, erection_actual_finish_date: e.target.value || null }))}
                                style={{ ...dateInput, width: '100%', color: editDraft.erection_actual_finish_date ? '#1A1A1A' : '#ABABAB' }}
                              />
                            </FieldGroup>
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
                  {rows.length} assemblies · <b style={{ ...mono, color: '#1A1A1A' }}>{(totalWeight / 1000).toFixed(1)} t</b> total
                  {' · '}fab <b style={{ ...mono, color: '#1A1A1A' }}>{fabPct.toFixed(1)}%</b>
                  {' · '}load <b style={{ ...mono, color: '#1A1A1A' }} title={`${loadedPcs}/${totalQty} pcs`}>{totalQty > 0 ? Math.round((loadedPcs / totalQty) * 100) : 0}%</b>
                  {' · '}erect <b style={{ ...mono, color: '#1A1A1A' }} title={`${erectedPcs}/${totalQty} pcs`}>{totalQty > 0 ? Math.round((erectedPcs / totalQty) * 100) : 0}%</b>
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
