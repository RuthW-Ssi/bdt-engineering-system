import type { ProgressZoneRow, UpdateAssemblyProgressPayload, FabStage } from '../../api/projectProgress'
import { FAB_STAGES } from '../../api/projectProgress'

// Field lists/labels/helpers shared between ProgressAssemblyTable's inline
// accordion + bulk-edit panel and ProgressEditForm.tsx's ProgressEditFields
// (used inline there, and inside ProgressEditModal from the Overview tab's
// 3D-click flow) — one set of definitions instead of copies drifting apart.
// Plain constants/functions only, no components — react-refresh/only-
// export-components requires a components-only file for Fast Refresh to
// work, hence the split from ProgressEditForm.tsx.

export const dateInput: React.CSSProperties = {
  font: 'inherit', fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 11.5,
  color: '#1A1A1A', background: 'white', border: '1px solid #E0E0E0', borderRadius: 6,
  padding: '5px 7px', boxSizing: 'border-box',
}
export const numInput: React.CSSProperties = {
  ...dateInput, width: '100%', textAlign: 'right',
}

// Backend @db.Date values arrive as ISO datetimes — <input type="date"> wants YYYY-MM-DD.
export const toInputDate = (v: string | null) => (v ? v.slice(0, 10) : '')

export const STAGE_LABEL: Record<FabStage, string> = {
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

export const DATE_FIELDS = ['plan_load_date', 'actual_load_date'] as const
type DateField = (typeof DATE_FIELDS)[number]
export const DATE_LABEL: Record<DateField, string> = {
  plan_load_date: 'Plan Load',
  actual_load_date: 'Actual Load',
}

// Phase-level Plan/Actual Finish — Fabrication has no per-stage date (the
// 10 stages above are percent-only); Erection pairs this with its existing
// Actual Finish. Both mirror Transport's Plan→Actual ordering convention.
export const FAB_DATE_FIELDS = ['fab_plan_finish_date', 'fab_actual_finish_date'] as const
type FabDateField = (typeof FAB_DATE_FIELDS)[number]
export const FAB_DATE_LABEL: Record<FabDateField, string> = {
  fab_plan_finish_date: 'Plan Finish',
  fab_actual_finish_date: 'Actual Finish',
}

export const ERECTION_DATE_FIELDS = ['erection_plan_finish_date', 'erection_actual_finish_date'] as const
type ErectionDateField = (typeof ERECTION_DATE_FIELDS)[number]
export const ERECTION_DATE_LABEL: Record<ErectionDateField, string> = {
  erection_plan_finish_date: 'Plan Finish',
  erection_actual_finish_date: 'Actual Finish',
}

const PCS_FIELDS = ['loaded_pcs', 'erected_pcs'] as const
type PcsField = (typeof PCS_FIELDS)[number]
export const PCS_LABEL: Record<PcsField, string> = {
  loaded_pcs: 'Loaded',
  erected_pcs: 'Erected',
}

export const EDIT_FIELDS = [
  ...FAB_STAGES, ...FAB_DATE_FIELDS, ...DATE_FIELDS, ...PCS_FIELDS,
  'payment_status', ...ERECTION_DATE_FIELDS,
] as const

// Mirrors the server's clamps so what you see staged is what gets stored —
// the real sheet has "50"-for-0.5 typo entries, clamping is the design.
export const clampPct = (v: number) => Math.min(100, Math.max(0, Math.round(v)))
export const clampPcs = (v: number, qty: number | null) =>
  Math.min(Math.max(1, Math.round(qty ?? 1)), Math.max(0, Math.round(v)))

export function rowToDraft(r: ProgressZoneRow): UpdateAssemblyProgressPayload {
  return {
    ...Object.fromEntries(FAB_STAGES.map(s => [s, r[s]])),
    fab_plan_finish_date: r.fab_plan_finish_date,
    fab_actual_finish_date: r.fab_actual_finish_date,
    plan_load_date: r.plan_load_date,
    actual_load_date: r.actual_load_date,
    loaded_pcs: r.loaded_pcs,
    erected_pcs: r.erected_pcs,
    payment_status: r.payment_status,
    erection_plan_finish_date: r.erection_plan_finish_date,
    erection_actual_finish_date: r.erection_actual_finish_date,
  }
}

// Only send fields that actually changed vs. the row as loaded — keeps the
// partial-update semantics (omitted = unchanged) instead of re-writing all 14.
export function diffDraft(draft: UpdateAssemblyProgressPayload, original: ProgressZoneRow): UpdateAssemblyProgressPayload {
  const payload: UpdateAssemblyProgressPayload = {}
  for (const f of EDIT_FIELDS) if (draft[f] !== original[f]) (payload as Record<string, unknown>)[f] = draft[f]
  return payload
}

export const groupHeader: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
  color: '#C8202A', borderBottom: '1px solid #F3C9CB', paddingBottom: 4, marginBottom: 10,
}
