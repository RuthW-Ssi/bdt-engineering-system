import type { ProgressStatus, ProgressShade, PhaseKey, ProgressZoneRow } from '../../api/projectProgress'

// Order matters — rendered left→right as the isolate button strip,
// following the real workflow: Fabrication → Transport → Erection.
// Still used for the baseline/default (no-pill-active) 3D coloring only —
// notstart/done have no dedicated filter pill anymore (see PHASE_ORDER).
export const STATUS_ORDER: ProgressStatus[] = ['notstart', 'fabrication', 'load', 'erection', 'done']

// Two shades per phase: light = in progress, dark = phase complete and
// waiting for the next one. Single-shade statuses repeat the same hex in
// both slots so lookup code never branches.
//
// Light hexes are TUNABLE — pixel-verified during E2E against the real
// model so they stay clearly distinguishable from notstart's #C7CBD1 and
// the isolate dim-gray #4A4A4A (the Sprint 24 color-collision lesson).
export const STATUS_META: Record<ProgressStatus, { label: string; light: string; dark: string }> = {
  notstart: { label: 'Not Start', light: '#C7CBD1', dark: '#C7CBD1' },
  fabrication: { label: 'Fabrication', light: '#F2C14E', dark: '#D48A0F' },
  // Label is "Transportation" per the 4-phase rework — internal key stays
  // `load` everywhere (fields, types, API) since this is a display-only rename.
  load: { label: 'Transportation', light: '#85B4E6', dark: '#2F6DB5' },
  // computeStatus()'s ladder never assigns erection a 'dark' shade (full
  // erection becomes 'done' instead), so these two were never
  // distinguished before. computePhases() DOES use erection-dark (full
  // erection, independent of the other phases) — give it a real dark value.
  erection: { label: 'Erection', light: '#9C8CE0', dark: '#6A4FC7' },
  done: { label: 'Done', light: '#2E9E5F', dark: '#2E9E5F' },
}

export const statusHex = (status: ProgressStatus, shade: ProgressShade) => STATUS_META[status][shade]

// The 4 independent, clickable phase pills, in confirmed order. Reuses
// STATUS_META's hexes for fabrication/load/erection (single color source of
// truth) — only Payment is new. Payment is single-shade: a boolean phase has
// no partial state, so `light` is unused but kept for a uniform shape.
export const PHASE_ORDER: PhaseKey[] = ['fabrication', 'payment', 'load', 'erection']
export const PHASE_META: Record<PhaseKey, { label: string; light: string; dark: string }> = {
  fabrication: STATUS_META.fabrication,
  payment: { label: 'Material Payment', light: '#2E9E9E', dark: '#2E9E9E' },
  load: STATUS_META.load,
  erection: STATUS_META.erection,
}

// Which aggregate rollup percent backs each pill's dark/light badge. Typed
// to only the 4 numeric percent keys (not the full ProgressRollupTotals
// keyof union, which also includes non-numeric `buckets`). Shared between
// desktop (ProjectProgress.tsx) and mobile (MobileBimCard.tsx) — same
// dark-once-100%-else-light rule for both.
export const PHASE_PCT_KEY: Record<PhaseKey, 'fab_pct' | 'payment_pct' | 'load_pct' | 'erect_pct'> = {
  fabrication: 'fab_pct', payment: 'payment_pct', load: 'load_pct', erection: 'erect_pct',
}

// Single baseline color for a row when no pill filter is active — one
// assembly can have several phases passed at once (Payment is parallel, not
// sequential: a piece can be paid mid-fabrication), so this picks the
// FURTHEST phase in pill order (F→M→T→E) that's passed, using that phase's
// own dark/light shade. Not a "real" physical sequence (Payment has no
// natural position in one) — this is a deliberate, simpler stand-in the
// user chose over folding Payment out of the baseline color entirely.
// Shared between desktop (ProjectProgress.tsx) and mobile (MobileBimCard) —
// moved here so the two never drift on how a row's color is derived.
export function defaultPhaseColor(r: ProgressZoneRow): string {
  for (let i = PHASE_ORDER.length - 1; i >= 0; i--) {
    const p = PHASE_ORDER[i]
    const phase = r.phases[p]
    if (phase.passed) return PHASE_META[p][phase.shade]
  }
  return STATUS_META.notstart.light
}
