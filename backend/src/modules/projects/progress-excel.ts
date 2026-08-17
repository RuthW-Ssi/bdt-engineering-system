// The Excel export/import contract for Project Progress — one shared
// column spec + sheet-naming rule consumed by BOTH progress-export.service.ts
// (writes it) and progress-import.service.ts (validates against it exactly,
// per the design's strict-reject-on-any-drift rule). Never define this list
// twice — import's whole-file structural validation only means anything if
// it's checked against the exact same contract export produced.
//
// Header shape deliberately mirrors the site team's own legacy tracking
// sheet: a merged group header (Fabrication/Transport/การเบิกเงินค่าสินค้า/
// Erection) over its sub-columns, plus a handful of display-only computed
// columns (row progress %, zone-weighted contribution %) that exist in their
// sheet purely for at-a-glance reading — never stored, never re-imported.
import type { AuditableField } from './progress-change-log.service'

export const META_SHEET_NAME = '_meta'

export type ProgressColumnKind =
  | 'index' // row number, not sourced from any field
  | 'zone' // zone label, redundant with the sheet name itself
  | 'mark' // assembly_mark — the row's match key
  | 'readonly' // reference-only bom_assembly field, never written back
  | 'fab_stage' // 0-100 editable percent
  | 'date' // editable date
  | 'pcs' // editable 0..qty count
  | 'weight' // editable non-negative decimal
  | 'status' // editable, fixed 3-value dropdown (PAYMENT_STATUSES)
  | 'computed' // display-only, recalculated fresh on every export, never read on import

export type ProgressColumnGroup = 'fabrication' | 'transport' | 'payment' | 'erection'

export const GROUP_LABELS: Record<ProgressColumnGroup, string> = {
  fabrication: 'Fabrication',
  transport: 'Transport',
  payment: 'การเบิกเงินค่าสินค้า',
  erection: 'Erection',
}

// The legacy sheet's own row-3 "ผู้รับผิดชอบ" text, verbatim — this system
// has no per-zone responsible-person data of its own, so every export
// reuses these same names rather than showing a blank/fabricated one.
export const GROUP_RESPONSIBLE_LABELS: Record<ProgressColumnGroup, string> = {
  fabrication: 'ผู้รับผิดชอบ : Kirati BDP',
  transport: 'ผู้รับผิดชอบ : samroeng BSC',
  payment: 'ผู้รับผิดชอบ : Tedasak BCD',
  erection: 'ผู้รับผิดชอบ : Witthaya BTC',
}

// Verified against the legacy file's actual cell fills (not guessed) — a
// light green consistently marks "the site team hand-tracks this" columns.
// Everything else (readonly BOM reference columns, computed/formula
// columns) is left unfilled there too. Payment status gets no static fill
// of its own — the legacy sheet colors it via real Excel conditional
// formatting (green/yellow/red by value), not a flat fill; see
// PAYMENT_STATUS_CF_STYLES in progress-export.service.ts.
export const FAB_TRACKED_FILL = 'FFF4FCA6'

// Which formula progress-export.service.ts uses to fill a 'computed' column.
export type ProgressComputedKind =
  | 'fab_overall_pct' // this row's own weighted average across the 10 fab stages
  | 'zone_fab_contribution_pct' // this row's weighted share of the zone's total fab progress
  | 'load_pct' // loaded_pcs / qty
  | 'erection_weight_kg' // weight_kg * erected_pcs / qty
  | 'erection_pcs_pct' // erected_pcs / qty
  | 'zone_erection_contribution_pct' // this row's weighted share of the zone's total erection progress

export interface ProgressColumnSpec {
  header: string
  kind: ProgressColumnKind
  // AuditableField for anything that round-trips through
  // ProgressChangeLogService; a literal bom_assembly field name for the
  // read-only reference columns; undefined for index/zone/mark/computed
  // (positional, not looked up by field name).
  field?: AuditableField | 'name' | 'weight_kg' | 'qty' | 'surface_area_m2' | 'length_mm' | 'width_mm' | 'height_mm'
  // Present only on columns that sit under a merged group header.
  group?: ProgressColumnGroup
  // computed only — which formula fills this column.
  computed?: ProgressComputedKind
  // ARGB fill applied to this column's DATA cells (not header) — verified
  // against the legacy sheet, present only on the columns it actually
  // colors. Undefined means no fill, matching every other column there.
  dataFillArgb?: string
}

// Column order IS the contract — import validates both header text AND
// position against this array exactly (spec: reject the whole file on any
// drift, no fuzzy/alias matching).
export const PROGRESS_EXPORT_COLUMNS: readonly ProgressColumnSpec[] = [
  { header: 'ลำดับ', kind: 'index' },
  { header: 'Zone', kind: 'zone' },
  { header: 'ประเภทชิ้นงาน', kind: 'readonly', field: 'name' },
  { header: 'Number', kind: 'mark' },
  { header: 'จำนวน (Pcs.)', kind: 'readonly', field: 'qty' },
  { header: 'Weight (Kg.)', kind: 'readonly', field: 'weight_kg' },
  { header: 'Paint Area (m2)', kind: 'readonly', field: 'surface_area_m2' },
  { header: 'LENGTH (mm)', kind: 'readonly', field: 'length_mm' },
  { header: 'WIDTH (mm)', kind: 'readonly', field: 'width_mm' },
  { header: 'HEIGHT (mm)', kind: 'readonly', field: 'height_mm' },
  { header: 'Cut', kind: 'fab_stage', field: 'cut', group: 'fabrication', dataFillArgb: FAB_TRACKED_FILL },
  { header: 'Build-Up', kind: 'fab_stage', field: 'buildup', group: 'fabrication', dataFillArgb: FAB_TRACKED_FILL },
  { header: 'Weld', kind: 'fab_stage', field: 'weld1', group: 'fabrication', dataFillArgb: FAB_TRACKED_FILL },
  { header: 'Fitup/Drill', kind: 'fab_stage', field: 'fitup_drill', group: 'fabrication', dataFillArgb: FAB_TRACKED_FILL },
  { header: 'Weld (2)', kind: 'fab_stage', field: 'weld2', group: 'fabrication', dataFillArgb: FAB_TRACKED_FILL },
  { header: 'QC Inspection', kind: 'fab_stage', field: 'qc_inspection', group: 'fabrication', dataFillArgb: FAB_TRACKED_FILL },
  { header: 'Primer', kind: 'fab_stage', field: 'primer', group: 'fabrication', dataFillArgb: FAB_TRACKED_FILL },
  { header: 'Fireproof', kind: 'fab_stage', field: 'fireproof', group: 'fabrication', dataFillArgb: FAB_TRACKED_FILL },
  { header: 'TOP', kind: 'fab_stage', field: 'top_coat', group: 'fabrication', dataFillArgb: FAB_TRACKED_FILL },
  { header: 'QC Final Inspection', kind: 'fab_stage', field: 'qc_final', group: 'fabrication', dataFillArgb: FAB_TRACKED_FILL },
  { header: 'SUM Progress By PCS.', kind: 'computed', computed: 'fab_overall_pct' },
  { header: 'Progress Overall (%)', kind: 'computed', computed: 'zone_fab_contribution_pct' },
  { header: 'PlanLoad', kind: 'date', field: 'plan_load_date', group: 'transport' },
  { header: 'Actual Load', kind: 'date', field: 'actual_load_date', group: 'transport', dataFillArgb: FAB_TRACKED_FILL },
  { header: 'จำนวนที่โหลด (Pcs.)', kind: 'pcs', field: 'loaded_pcs', group: 'transport', dataFillArgb: FAB_TRACKED_FILL },
  { header: 'Progress %', kind: 'computed', computed: 'load_pct', group: 'transport' },
  { header: 'น้ำหนักที่เบิกแล้ว', kind: 'weight', field: 'claimed_weight_kg', group: 'payment' },
  { header: 'น้ำหนักที่ส่งแล้ว', kind: 'weight', field: 'delivered_weight_kg', group: 'payment' },
  { header: 'สถานะการเบิกเงิน', kind: 'status', field: 'payment_status', group: 'payment' },
  { header: 'Erection by Pcs.', kind: 'pcs', field: 'erected_pcs', group: 'erection', dataFillArgb: FAB_TRACKED_FILL },
  { header: 'Actual Erection', kind: 'date', field: 'erection_actual_finish_date', group: 'erection', dataFillArgb: FAB_TRACKED_FILL },
  { header: 'Erection by Weight (kg.)', kind: 'computed', computed: 'erection_weight_kg', group: 'erection' },
  { header: 'Progress % by Pcs', kind: 'computed', computed: 'erection_pcs_pct', group: 'erection' },
  { header: 'Progress % by Zone', kind: 'computed', computed: 'zone_erection_contribution_pct', group: 'erection' },
] as const

// Fixed header block depth: row 1 title, row 2 group/standalone labels,
// row 3 "ผู้รับผิดชอบ" (GROUP_RESPONSIBLE_LABELS — the legacy sheet's own
// text, this system tracks no such data of its own), row 4 sub-headers.
// Data starts right after.
export const HEADER_ROWS = 4
export const DATA_START_ROW = HEADER_ROWS + 1

export interface ColumnGroupRange {
  group: ProgressColumnGroup
  label: string
  startCol: number // 1-indexed
  endCol: number // 1-indexed, inclusive
}

// Groups are contiguous blocks in PROGRESS_EXPORT_COLUMNS — this walks the
// list once to find each block's 1-indexed column span, so export (merged
// header cells) and import (structural validation) derive the same ranges
// from the same source instead of hardcoding column numbers twice.
export function computeColumnGroups(): ColumnGroupRange[] {
  const ranges: ColumnGroupRange[] = []
  PROGRESS_EXPORT_COLUMNS.forEach((col, i) => {
    const colNum = i + 1
    if (!col.group) return
    const last = ranges[ranges.length - 1]
    if (last && last.group === col.group && last.endCol === colNum - 1) {
      last.endCol = colNum
    } else {
      ranges.push({ group: col.group, label: GROUP_LABELS[col.group], startCol: colNum, endCol: colNum })
    }
  })
  return ranges
}

// Excel sheet names: max 31 chars, no : \ / ? * [ ]. project_zone.label is
// only unique per-project via (project_id, code), not guaranteed unique on
// label alone — export must sanitize/truncate/dedupe, and import computes
// this SAME transform over the project's current zones to know which
// uploaded sheet belongs to which zone (never the reverse — there's no way
// to "un-sanitize" a name, so both directions always derive from the live
// zone list, not from parsing the uploaded sheet name itself).
export function sanitizeSheetNames(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map(raw => {
    const stripped = raw.replace(/[:\\/?*[\]]/g, '').trim() || 'Zone'
    const base = stripped.slice(0, 31)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    if (n === 0) return base
    const suffix = `~${n}`
    return base.slice(0, 31 - suffix.length) + suffix
  })
}
