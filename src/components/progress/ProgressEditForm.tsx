import type { ProgressZoneRow, UpdateAssemblyProgressPayload, PaymentStatus } from '../../api/projectProgress'
import { FAB_STAGES, PAYMENT_STATUSES } from '../../api/projectProgress'
import {
  dateInput, numInput, toInputDate, STAGE_LABEL, DATE_FIELDS, DATE_LABEL, FAB_DATE_FIELDS, FAB_DATE_LABEL,
  ERECTION_DATE_FIELDS, ERECTION_DATE_LABEL, PCS_LABEL, EDIT_FIELDS, clampPct, clampPcs, groupHeader,
} from './progressEditShared'
import { useAuth } from '../../context/AuthContext'
import { editableSections, lockedNote, type ProgressSectionKey } from '../../lib/progressDepartments'

// Components only in this file (react-refresh/only-export-components wants
// a components-only file for Fast Refresh — the constants/helpers these use
// live in progressEditShared.ts).

// Fabrication stage inputs are the only plain numbers on this page that
// aren't self-evidently a unit (dates/pcs read as counts) — a fixed "%"
// suffix makes clear what's being typed without relying on the field label.
export function PctInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div style={{ position: 'relative' }}>
      <input type="number" min={0} max={100} {...props} style={{ ...numInput, paddingRight: 22, ...props.style }} />
      <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#ABABAB', pointerEvents: 'none' }}>
        %
      </span>
    </div>
  )
}

// Section title; a section the user's department doesn't own shows a lock
// note instead of being hidden, so everyone still sees the whole picture.
export function SectionHeader({ label, locked, section }: { label: string; locked: boolean; section: ProgressSectionKey }) {
  return (
    <div style={{ ...groupHeader, display: 'flex', alignItems: 'baseline', gap: 10, color: locked ? '#ABABAB' : groupHeader.color }}>
      {label}
      {locked && <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0, textTransform: 'none', color: '#8E8E8E' }}>{lockedNote(section)} <span style={{ color: '#C8202A' }}>*</span></span>}
    </div>
  )
}

export function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8E8E8E' }}>{label}</span>
      {children}
    </div>
  )
}

// The single-row edit fields (Fabrication → Material Payment → Transport →
// Erection, then Save/Cancel) — used both inline (ProgressAssemblyTable's
// accordion) and inside a popup (ProgressEditModal, from the Overview tab's
// 3D-click flow). The caller owns the draft state; this is a pure
// controlled form plus the save/cancel footer, so both call sites share
// one implementation instead of two copies drifting apart.
export function ProgressEditFields({
  row, draft, onChange, saving, onSave, onCancel,
}: {
  row: ProgressZoneRow
  draft: UpdateAssemblyProgressPayload
  onChange: (updater: (d: UpdateAssemblyProgressPayload) => UpdateAssemblyProgressPayload) => void
  saving: boolean
  onSave: () => void
  onCancel: () => void
}) {
  const qty = Math.max(1, Math.round(row.qty ?? 1))
  // Each section is editable by one department only (2026-09-29) — the
  // backend enforces it; this just locks the inputs so it's obvious why.
  const { user } = useAuth()
  const can = editableSections(user?.role)
  const off = (section: ProgressSectionKey) => saving || !can.has(section)
  const dirty = EDIT_FIELDS.some(f => draft[f] !== row[f])

  return (
    <>
      {/* Fabrication — 10 weighted stages (percent each) first, then phase-level Plan/Actual Finish */}
      <SectionHeader label="Fabrication" section="fabrication" locked={!can.has('fabrication')} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px 14px', marginBottom: 12 }}>
        {FAB_STAGES.map(stage => (
          <FieldGroup key={stage} label={STAGE_LABEL[stage]}>
            <PctInput
              value={draft[stage] ?? 0}
              disabled={off('fabrication')}
              onChange={e => onChange(d => ({ ...d, [stage]: e.target.value === '' ? 0 : clampPct(Number(e.target.value)) }))}
            />
          </FieldGroup>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 14px', marginBottom: 16 }}>
        {FAB_DATE_FIELDS.map(field => (
          <FieldGroup key={field} label={FAB_DATE_LABEL[field]}>
            <input
              type="date"
              value={toInputDate((draft[field] as string | null) ?? null)}
              disabled={off('fabrication')}
              onChange={e => onChange(d => ({ ...d, [field]: e.target.value || null }))}
              style={{ ...dateInput, width: '100%', color: draft[field] ? '#1A1A1A' : '#ABABAB' }}
            />
          </FieldGroup>
        ))}
      </div>

      {/* Material Payment — parallel to Fab/Transport/Erection, 3-state status */}
      <SectionHeader label="Material Payment" section="payment_transport" locked={!can.has('payment_transport')} />
      <div style={{ display: 'flex', marginBottom: 16 }}>
        <FieldGroup label="Status">
          <select
            value={draft.payment_status ?? 'Not Disbursed'}
            disabled={off('payment_transport')}
            onChange={e => onChange(d => ({ ...d, payment_status: e.target.value as PaymentStatus }))}
            style={{ ...dateInput, width: 200 }}
          >
            {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </FieldGroup>
      </div>

      {/* Transport — load dates + pieces loaded */}
      <SectionHeader label="Transport" section="payment_transport" locked={!can.has('payment_transport')} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 14px', marginBottom: 16 }}>
        {DATE_FIELDS.map(field => (
          <FieldGroup key={field} label={DATE_LABEL[field]}>
            <input
              type="date"
              value={toInputDate((draft[field] as string | null) ?? null)}
              disabled={off('payment_transport')}
              onChange={e => onChange(d => ({ ...d, [field]: e.target.value || null }))}
              style={{ ...dateInput, width: '100%', color: draft[field] ? '#1A1A1A' : '#ABABAB' }}
            />
          </FieldGroup>
        ))}
        <FieldGroup label={`${PCS_LABEL.loaded_pcs} / ${qty} pcs`}>
          <input
            type="number" min={0} max={qty}
            value={draft.loaded_pcs ?? 0}
            disabled={off('payment_transport')}
            onChange={e => onChange(d => ({ ...d, loaded_pcs: e.target.value === '' ? 0 : clampPcs(Number(e.target.value), row.qty) }))}
            style={numInput}
          />
        </FieldGroup>
      </div>

      {/* Erection — Plan/Actual Finish first (Transport's Plan→Actual→count order), then pieces erected (full = done) */}
      <SectionHeader label="Erection" section="erection" locked={!can.has('erection')} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 14px' }}>
        {ERECTION_DATE_FIELDS.map(field => (
          <FieldGroup key={field} label={ERECTION_DATE_LABEL[field]}>
            <input
              type="date"
              value={toInputDate((draft[field] as string | null) ?? null)}
              disabled={off('erection')}
              onChange={e => onChange(d => ({ ...d, [field]: e.target.value || null }))}
              style={{ ...dateInput, width: '100%', color: draft[field] ? '#1A1A1A' : '#ABABAB' }}
            />
          </FieldGroup>
        ))}
        <FieldGroup label={`${PCS_LABEL.erected_pcs} / ${qty} pcs`}>
          <input
            type="number" min={0} max={qty}
            value={draft.erected_pcs ?? 0}
            disabled={off('erection')}
            onChange={e => onChange(d => ({ ...d, erected_pcs: e.target.value === '' ? 0 : clampPcs(Number(e.target.value), row.qty) }))}
            style={numInput}
          />
        </FieldGroup>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        {can.size > 0 && <button
          onClick={onSave}
          disabled={saving || !dirty}
          style={{
            font: 'inherit', fontSize: 12.5, fontWeight: 700, color: 'white',
            background: dirty ? '#C8202A' : '#E0A6AA', border: 'none', borderRadius: 8,
            padding: '7px 18px', cursor: dirty ? 'pointer' : 'default',
          }}
        >
          Save
        </button>}
        <button
          onClick={onCancel}
          disabled={saving}
          style={{ font: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#8E8E8E', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Cancel
        </button>
        {dirty && <span style={{ fontSize: 11, color: '#ABABAB' }}>Unsaved changes</span>}
      </div>
    </>
  )
}
