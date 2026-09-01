// Primitives shared across every progress-related service
// (project-progress.service.ts, progress-change-log.service.ts, and the
// export/import/history services) — split out from project-progress.service.ts
// specifically to avoid a circular import: progress-change-log.service.ts
// needs these, and project-progress.service.ts needs
// ProgressChangeLogService, so neither can import the other directly.

// Fabrication stage weights — the site team's own Excel weight row (REV1,
// row 5) verbatim: sums to exactly 100. Fab% = Σ(stage% × weight) / 100.
export const STAGE_WEIGHTS = {
  cut: 10,
  buildup: 10,
  weld1: 15,
  fitup_drill: 10,
  weld2: 15,
  qc_inspection: 10,
  primer: 10,
  fireproof: 5,
  top_coat: 10,
  qc_final: 5,
} as const

export type FabStage = keyof typeof STAGE_WEIGHTS
export const FAB_STAGES = Object.keys(STAGE_WEIGHTS) as FabStage[]

// An assembly is at least one physical piece — this single helper feeds
// pcs clamping, the status ladder, load/erect percents AND mirrors the
// migration SQL's GREATEST(1, COALESCE(ROUND(qty)::int, 1)), so all four
// places agree on what "full quantity" means for null/zero/decimal qty.
export function effectiveQty(qty: unknown): number {
  if (qty == null) return 1
  return Math.max(1, Math.round(Number(qty)))
}

export const clampPct = (v: number) => Math.min(100, Math.max(0, Math.round(v)))
export const clampPcs = (v: number, q: number) => Math.min(q, Math.max(0, Math.round(v)))
// Claimed/delivered weight — spec gives no upper bound, only floor at zero
// (parity with clampPcs's floor; unlike pcs there's no qty-derived ceiling).
export const nonNegDecimal = (v: number) => Math.max(0, v)

// Fixed 3-value status matching the site team's own tracking sheet wording
// — only "Paid" counts as the Payment phase "passed".
export const PAYMENT_STATUSES = ['Not Disbursed', 'Disbursed', 'Paid'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

// The bom_assembly_progress upsert's `create` branch needs every column
// defaulted (no row exists yet to fall back on, unlike `update` which can
// just spread partial `fields`) — this exact shape was duplicated 3x
// (updateAssemblyProgress, bulkUpdateAssemblyProgress, progress-import's
// confirm) before being pulled out here; rollback is the 4th call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildProgressCreateDefaults(fields: Record<string, any>, writeUid: number) {
  return {
    ...Object.fromEntries(FAB_STAGES.map(s => [s, (fields as Record<string, number | undefined>)[s] ?? 0])),
    fab_plan_finish_date: fields.fab_plan_finish_date ?? null,
    fab_actual_finish_date: fields.fab_actual_finish_date ?? null,
    plan_load_date: fields.plan_load_date ?? null,
    actual_load_date: fields.actual_load_date ?? null,
    loaded_pcs: fields.loaded_pcs ?? 0,
    erected_pcs: fields.erected_pcs ?? 0,
    erection_plan_finish_date: fields.erection_plan_finish_date ?? null,
    erection_actual_finish_date: fields.erection_actual_finish_date ?? null,
    payment_status: fields.payment_status ?? 'Not Disbursed',
    claimed_weight_kg: fields.claimed_weight_kg ?? null,
    delivered_weight_kg: fields.delivered_weight_kg ?? null,
    write_uid: writeUid,
  }
}
