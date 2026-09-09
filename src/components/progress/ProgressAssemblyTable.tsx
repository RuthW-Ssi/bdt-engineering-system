import { Fragment, useEffect, useRef, useState } from 'react'
import { Search, Pencil, ChevronUp, ChevronDown, X, Trash2, RotateCcw } from 'lucide-react'
import type { ProgressZoneRow, UpdateAssemblyProgressPayload, BulkUpdateAssemblyProgressPayload, DeletedPlaceholderAssembly, PaymentStatus } from '../../api/projectProgress'
import { FAB_STAGES, PAYMENT_STATUSES } from '../../api/projectProgress'
import { STATUS_META, PHASE_META } from './statusMeta'
import { usePermission } from '../../hooks/usePermission'
import { useConfirm } from '../ui/ConfirmDialog'
import { PctInput, FieldGroup, ProgressEditFields } from './ProgressEditForm'
import {
  dateInput, numInput, toInputDate, STAGE_LABEL,
  DATE_FIELDS, DATE_LABEL, FAB_DATE_FIELDS, FAB_DATE_LABEL, ERECTION_DATE_FIELDS, ERECTION_DATE_LABEL,
  clampPct, rowToDraft, diffDraft, groupHeader,
} from './progressEditShared'

interface Props {
  rows: ProgressZoneRow[]
  selectedAssemblyId: number | null
  // Clicking a row both selects it (for the Drawing panel) and, in 3D mode,
  // zooms/isolates it in the viewport — a single click now does both, so
  // there's no separate "View" button to trigger the 3D-only half.
  onViewIn3D: (assemblyId: number) => void
  // Set by the parent when an element is clicked directly in the 3D
  // viewport — opens that row's edit panel here too, not just selects it.
  // A fresh object each time (not a bare id) so re-clicking the SAME
  // element still re-triggers the effect below.
  autoExpandRequest: { assemblyId: number } | null
  onUpdate: (assemblyId: number, payload: UpdateAssemblyProgressPayload) => void
  onBulkUpdate: (assemblyIds: number[], payload: BulkUpdateAssemblyProgressPayload) => void
  // Only ever called for placeholder-zone rows — the delete button itself
  // is only rendered when isPlaceholderZone (see below).
  onDelete: (assemblyId: number) => void
  // Deleted-assemblies collapsible section — only ever rendered for the
  // placeholder zone. Data/toggle state lives in the parent (matches this
  // component's existing "dumb, parent owns data-fetching" pattern) since
  // the underlying query is lazy (only fetched once expanded).
  showDeleted: boolean
  onToggleShowDeleted: () => void
  deletedAssemblies: DeletedPlaceholderAssembly[] | undefined
  deletedLoading: boolean
  onRestore: (assemblyId: number) => void
  restoring: boolean
  saving: boolean
  // Controls the right-column panel (3D viewport vs Drawing quick-look) —
  // lives here, next to the search box, instead of its own row above the
  // 3D panel on the other side of the grid.
  rightPanelView: '3d' | 'drawing'
  onSetRightPanelView: (view: '3d' | 'drawing') => void
}

// iOS-style on/off switch with the two states labeled on either side,
// rather than a segmented pill pair — each label is independently
// clickable (not just the knob), so there's no ambiguity about which
// state a click lands on.
function ViewToggleSwitch({ value, onChange }: { value: '3d' | 'drawing'; onChange: (v: '3d' | 'drawing') => void }) {
  const isDrawing = value === 'drawing'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <button
        onClick={() => onChange('3d')}
        style={{ font: 'inherit', fontSize: 11.5, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', color: isDrawing ? '#ABABAB' : '#1A1A1A', padding: 0 }}
      >
        3D
      </button>
      <button
        onClick={() => onChange(isDrawing ? '3d' : 'drawing')}
        aria-pressed={isDrawing}
        title={isDrawing ? 'Switch to 3D Model' : 'Switch to Drawing'}
        style={{
          position: 'relative', width: 34, height: 19, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
          background: isDrawing ? '#C8202A' : '#D5D5D5', transition: 'background 0.15s',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: isDrawing ? 17 : 2, width: 15, height: 15, borderRadius: '50%', background: 'white',
          transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
        }} />
      </button>
      <button
        onClick={() => onChange('drawing')}
        style={{ font: 'inherit', fontSize: 11.5, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', color: isDrawing ? '#1A1A1A' : '#ABABAB', padding: 0 }}
      >
        Drawing
      </button>
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.04em', color: '#ABABAB', padding: '9px 12px',
  borderBottom: '1px solid #E0E0E0', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'white',
}
const td: React.CSSProperties = { padding: '11px 12px', borderBottom: '1px solid #EDEFF2', verticalAlign: 'middle', whiteSpace: 'nowrap' }
const mono: React.CSSProperties = { fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }

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

export function ProgressAssemblyTable({
  rows, selectedAssemblyId, autoExpandRequest, onViewIn3D, onUpdate, onBulkUpdate, onDelete, saving,
  showDeleted, onToggleShowDeleted, deletedAssemblies, deletedLoading, onRestore, restoring,
  rightPanelView, onSetRightPanelView,
}: Props) {
  const canUpdate = usePermission('project-tracking', 'update')
  // Delete/restore of a placeholder assembly is gated on its own permission
  // tier, separate from ordinary progress-entry 'update' — see the design
  // note on projects.controller.ts's deletePlaceholderAssembly endpoint.
  const canDelete = usePermission('project-tracking', 'delete')
  const confirm = useConfirm()
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

  // Clicking an element directly in the 3D viewport opens its edit panel
  // here too, not just selects it — the request object is fresh on every
  // click (even for the same element), so this always fires. Same
  // sync-setState-in-effect shape as the scroll-into-view effect below
  // (pre-existing in this file) — reacting to a value that only ever
  // changes on an external click, not a local render loop.
  useEffect(() => {
    if (!autoExpandRequest) return
    const row = rows.find(r => r.assembly_id === autoExpandRequest.assemblyId)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (row) openEdit(row)
    // Deliberately depends only on the click signal, not `rows`/`openEdit`
    // (recreated every render) — re-running on every unrelated re-render
    // would fight the accordion's own open/close state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExpandRequest])

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
    // 'start' (not 'center') — a 3D click auto-expands the row's edit panel
    // (see the autoExpandRequest effect below), which is tall; anchoring the
    // row itself to the top keeps the newly-revealed fields visible below it
    // instead of the panel spilling past the bottom of a centered row.
    rowRefs.current.get(selectedAssemblyId)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
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

  // BIM-first progress entry (2026-09) — one zone's table is either all
  // placeholder rows or all real rows (rows come from a single getZoneRows
  // call), so the first row is a safe representative check.
  const isPlaceholderZone = rows.length > 0 && rows[0].is_placeholder

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative', width: 200 }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#ABABAB' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search mark..."
              style={{ width: '100%', font: 'inherit', fontSize: 12.5, color: '#1A1A1A', background: '#F7F7F7', border: '1px solid #E0E0E0', borderRadius: 8, padding: '6px 10px 6px 28px' }}
            />
          </div>
          <ViewToggleSwitch value={rightPanelView} onChange={onSetRightPanelView} />
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
          {/* Grouped to match the single-row edit panel below (Fabrication /
              Material Payment / Transport / Erection, same group headers and
              grid layout) — this used to be one undifferentiated flex-wrap
              of every field, which drifted from that panel's structure. */}
          <div style={groupHeader}>Fabrication</div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 14px', marginBottom: 16 }}>
            {FAB_DATE_FIELDS.map(field => (
              <FieldGroup key={field} label={FAB_DATE_LABEL[field]}>
                <input
                  type="date"
                  value={bulkDraft[field] ? toInputDate(bulkDraft[field] as string) : ''}
                  onChange={e => setBulkField(field, e.target.value || null)}
                  style={{ ...dateInput, width: '100%', color: bulkTouched.has(field) ? '#1A1A1A' : '#ABABAB' }}
                />
              </FieldGroup>
            ))}
          </div>

          <div style={groupHeader}>Material Payment</div>
          <div style={{ display: 'flex', marginBottom: 16 }}>
            <FieldGroup label="Status">
              <select
                value={bulkTouched.has('payment_status') ? bulkDraft.payment_status ?? '' : ''}
                onChange={e => setBulkField('payment_status', e.target.value as PaymentStatus)}
                style={{ ...dateInput, width: 140, color: bulkTouched.has('payment_status') ? '#1A1A1A' : '#ABABAB' }}
              >
                <option value="" disabled>No change</option>
                {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FieldGroup>
          </div>

          {/* Transport — load dates + pieces loaded (as a "set full" flag;
              see the comment on the field below for why). */}
          <div style={groupHeader}>Transport</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 14px', marginBottom: 16 }}>
            {DATE_FIELDS.map(field => (
              <FieldGroup key={field} label={DATE_LABEL[field]}>
                <input
                  type="date"
                  value={bulkDraft[field] ? toInputDate(bulkDraft[field] as string) : ''}
                  onChange={e => setBulkField(field, e.target.value || null)}
                  style={{ ...dateInput, width: '100%', color: bulkTouched.has(field) ? '#1A1A1A' : '#ABABAB' }}
                />
              </FieldGroup>
            ))}
            {/* Same raw pcs count as the single-row form — selected rows can
                have different qty, so the backend clamps each row
                independently to its own qty rather than sharing one cap. */}
            <FieldGroup label="Loaded (pcs)">
              <input
                type="number" min={0} placeholder="—"
                value={bulkTouched.has('loaded_pcs') ? bulkDraft.loaded_pcs ?? '' : ''}
                onChange={e => setBulkField('loaded_pcs', e.target.value === '' ? 0 : Math.max(0, Math.round(Number(e.target.value))))}
                style={{ ...numInput, color: bulkTouched.has('loaded_pcs') ? '#1A1A1A' : '#ABABAB' }}
              />
            </FieldGroup>
          </div>

          {/* Erection — Plan/Actual Finish first (Transport's Plan→Actual
              order), then pieces erected (full = done). */}
          <div style={groupHeader}>Erection</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 14px' }}>
            {ERECTION_DATE_FIELDS.map(field => (
              <FieldGroup key={field} label={ERECTION_DATE_LABEL[field]}>
                <input
                  type="date"
                  value={bulkDraft[field] ? toInputDate(bulkDraft[field] as string) : ''}
                  onChange={e => setBulkField(field, e.target.value || null)}
                  style={{ ...dateInput, width: '100%', color: bulkTouched.has(field) ? '#1A1A1A' : '#ABABAB' }}
                />
              </FieldGroup>
            ))}
            <FieldGroup label="Erected (pcs)">
              <input
                type="number" min={0} placeholder="—"
                value={bulkTouched.has('erected_pcs') ? bulkDraft.erected_pcs ?? '' : ''}
                onChange={e => setBulkField('erected_pcs', e.target.value === '' ? 0 : Math.max(0, Math.round(Number(e.target.value))))}
                style={{ ...numInput, color: bulkTouched.has('erected_pcs') ? '#1A1A1A' : '#ABABAB' }}
              />
            </FieldGroup>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
            {canUpdate && (
              <button
                onClick={applyBulk}
                disabled={saving || !bulkTouched.size}
                style={{
                  font: 'inherit', fontSize: 12.5, fontWeight: 700, color: 'white',
                  background: bulkTouched.size ? '#C8202A' : '#E0A6AA', border: 'none', borderRadius: 8,
                  padding: '7px 18px', cursor: bulkTouched.size ? 'pointer' : 'default',
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
              {!isPlaceholderZone && <th style={{ ...th, textAlign: 'right' }}>Weight</th>}
              <th style={th}>Progress</th>
              <th style={{ ...th, textAlign: 'center' }}>Edit</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => {
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
                    onClick={() => onViewIn3D(r.assembly_id)}
                    style={{
                      cursor: 'pointer',
                      background: expanded || checked || selectedAssemblyId === r.assembly_id ? '#FEF6F6' : undefined,
                      boxShadow: expanded || selectedAssemblyId === r.assembly_id ? '0 2px 6px rgba(0,0,0,0.15)' : undefined,
                      position: expanded || selectedAssemblyId === r.assembly_id ? 'relative' : undefined,
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
                    <td style={{ ...td, ...mono, fontWeight: 600 }}>
                      {r.mark}
                      {r.stale && (
                        <span
                          title="Not found in the latest 3D model version — needs manual review"
                          style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#B8860B', background: '#FFF6E0', padding: '1px 6px', borderRadius: 4 }}
                        >
                          ⚠ stale
                        </span>
                      )}
                    </td>
                    {!isPlaceholderZone && (
                      <td style={{ ...td, textAlign: 'right', ...mono, color: '#8E8E8E' }}>
                        {r.weight_kg != null ? `${r.weight_kg.toFixed(1)} kg` : '—'}
                      </td>
                    )}
                    <td style={td} title={STATUS_META[r.status].label}>
                      {/* Each chip's color is its own metric's completeness —
                          not the row's single derived status — so all four
                          phases stay independently scannable at a glance. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <ProgressChip
                          label="F" value={`${r.fab_pct.toFixed(0)}%`}
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
                      <div style={{ display: 'inline-flex', gap: 6 }}>
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
                      {/* Delete only ever applies to placeholder (Pending BOM)
                          assemblies — a real BOM assembly is managed by BOM
                          upload/re-upload, never manually removable here. */}
                      {canDelete && isPlaceholderZone && (
                      <button
                        onClick={async e => {
                          e.stopPropagation()
                          const ok = await confirm({
                            title: `Delete ${r.mark}?`,
                            message: 'Removes this assembly from Pending BOM. Any progress entered for it is discarded and cannot be recovered.',
                            variant: 'danger',
                            confirmLabel: 'Delete',
                          })
                          if (ok) onDelete(r.assembly_id)
                        }}
                        title="Delete this placeholder assembly"
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 26, height: 26, borderRadius: 7, cursor: 'pointer',
                          border: '1px solid #E0E0E0', background: 'white', color: '#C8202A',
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                      )}
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr style={{ background: '#FAFAFA' }}>
                      <td colSpan={isPlaceholderZone ? 4 : 5} style={{ padding: '14px 16px 16px', borderBottom: '1px solid #EDEFF2' }}>
                        <ProgressEditFields
                          row={r}
                          draft={editDraft}
                          onChange={setEditDraft}
                          saving={saving}
                          onSave={() => {
                            const payload = diffDraft(editDraft, r)
                            if (Object.keys(payload).length) onUpdate(r.assembly_id, payload)
                            closeEdit()
                          }}
                          onCancel={closeEdit}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {!visible.length && (
              <tr>
                <td colSpan={isPlaceholderZone ? 4 : 5} style={{ ...td, textAlign: 'center', color: '#8E8E8E', padding: 24 }}>
                  {rows.length ? 'No marks match the search' : 'No BOM assemblies uploaded for this zone yet'}
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={isPlaceholderZone ? 4 : 5} style={{ padding: '10px 12px', fontSize: 11.5, color: '#8E8E8E', borderTop: '1px solid #E0E0E0' }}>
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
      {/* Deleted-assemblies archive — placeholder zone only. A reconciled
          (deleted_by_user=false) assembly never appears here — the backend
          list endpoint already excludes it, since restoring it would
          recreate a mark colliding with the real BOM data it superseded. */}
      {isPlaceholderZone && (
        <div style={{ borderTop: '1px solid #E0E0E0', flexShrink: 0 }}>
          <button
            onClick={onToggleShowDeleted}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '10px 14px',
              background: 'none', border: 'none', cursor: 'pointer', font: 'inherit',
              fontSize: 11.5, color: '#8E8E8E', fontWeight: 600,
            }}
          >
            {showDeleted ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Deleted{deletedAssemblies?.length ? ` (${deletedAssemblies.length})` : ''}
          </button>
          {showDeleted && (
            <div style={{ padding: '0 14px 12px', maxHeight: 180, overflowY: 'auto' }}>
              {deletedLoading && <div style={{ fontSize: 11.5, color: '#ABABAB', padding: '6px 0' }}>Loading…</div>}
              {!deletedLoading && !deletedAssemblies?.length && (
                <div style={{ fontSize: 11.5, color: '#ABABAB', padding: '6px 0' }}>No deleted assemblies</div>
              )}
              {deletedAssemblies?.map(d => (
                <div
                  key={d.assembly_id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F3F3F3', fontSize: 12 }}
                >
                  <div>
                    <span style={{ ...mono, fontWeight: 600, color: '#8E8E8E' }}>{d.mark}</span>
                    <span style={{ color: '#C2C2C2', marginLeft: 8 }}>
                      {new Date(d.deleted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </span>
                  </div>
                  {canDelete && (
                    <button
                      onClick={() => onRestore(d.assembly_id)}
                      disabled={restoring}
                      title="Restore this assembly"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                        color: '#1A7A3D', background: 'none', border: '1px solid #CDEAD9', borderRadius: 6,
                        padding: '4px 8px', cursor: restoring ? 'default' : 'pointer', opacity: restoring ? 0.6 : 1,
                      }}
                    >
                      <RotateCcw size={11} /> Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
