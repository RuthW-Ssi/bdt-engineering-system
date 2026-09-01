import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { FAB_STAGES, clampPct, nonNegDecimal } from './progress-shared'

// Every bom_assembly_progress field this app lets a user change — the
// single list driving what gets diffed/logged on every write path (manual
// edit, bulk edit, import, rollback), so none of them can silently diverge
// on which fields are auditable.
export const AUDITABLE_FIELDS = [
  ...FAB_STAGES,
  'fab_plan_finish_date', 'fab_actual_finish_date',
  'plan_load_date', 'actual_load_date', 'loaded_pcs', 'erected_pcs',
  'erection_plan_finish_date', 'erection_actual_finish_date', 'payment_status', 'claimed_weight_kg', 'delivered_weight_kg',
] as const
export type AuditableField = (typeof AUDITABLE_FIELDS)[number]

export interface DiffEntry { field: AuditableField; old: string | number | null; new: string | number | null }

const DATE_FIELDS = new Set([
  'fab_plan_finish_date', 'fab_actual_finish_date',
  'plan_load_date', 'actual_load_date',
  'erection_plan_finish_date', 'erection_actual_finish_date',
])
const DECIMAL_FIELDS = new Set(['claimed_weight_kg', 'delivered_weight_kg'])

// "No row" defaults — mirrors bom_assembly_progress's own column defaults,
// so diffing against a not-yet-created row compares against the same
// baseline computeStatus()/mapAssemblyRow already treat as "not started".
function defaultFor(field: AuditableField): unknown {
  if (field === 'payment_status') return 'Not Disbursed'
  if (DATE_FIELDS.has(field) || DECIMAL_FIELDS.has(field)) return null
  return 0 // fab stages, loaded_pcs, erected_pcs
}

// Normalizes any of the mixed runtime shapes a field can arrive in (Prisma
// Decimal, Date, plain number/string, null/undefined) to one comparable
// primitive — this is the ONLY place old-vs-new equality is decided, so
// computeDiff and the stored old_value/new_value always agree on what
// "changed" means.
function normalize(field: AuditableField, value: unknown): string | number | null {
  if (value === undefined || value === null) return null
  if (DATE_FIELDS.has(field)) {
    const d = value instanceof Date ? value : new Date(value as string)
    return d.toISOString().slice(0, 10)
  }
  if (field === 'payment_status') return String(value)
  return Number(value)
}

@Injectable()
export class ProgressChangeLogService {
  constructor(private readonly prisma: PrismaService) {}

  // `current` is the pre-write bom_assembly_progress row (or null — no row
  // yet). `fields` is the exact partial-update object a write path already
  // builds for its Prisma upsert (omitted = undefined = no-op, explicit
  // null = a real clearing change). Only keys present and non-undefined in
  // `fields` are considered; a value equal to its current one produces no
  // entry — this is what keeps an unchanged import row invisible in the diff.
  computeDiff(
    current: Partial<Record<AuditableField, unknown>> | null,
    fields: Partial<Record<AuditableField, unknown>>,
  ): DiffEntry[] {
    const entries: DiffEntry[] = []
    for (const field of AUDITABLE_FIELDS) {
      const incoming = fields[field]
      if (incoming === undefined) continue
      const oldRaw = current ? current[field] : defaultFor(field)
      const oldNorm = normalize(field, oldRaw)
      const newNorm = normalize(field, incoming)
      if (oldNorm === newNorm) continue
      entries.push({ field, old: oldNorm, new: newNorm })
    }
    return entries
  }

  // Must run inside an existing transaction — same idiom as
  // WorkOrderAutoCreateService.createForMo(tx, ...): the caller writes
  // bom_assembly_progress itself via the same `tx`, this only persists the
  // batch + entries. Skips creating a batch entirely if every row's diff is
  // empty (e.g. an import round-tripping its own unmodified export) — UNLESS
  // alwaysCreateBatch is set, which rollback always passes: rollback's batch
  // row IS the "this was rolled back" record itself (rolled_back_batch_id
  // points at the original), independent of whether the resulting write
  // happened to be a no-op (e.g. someone else already reverted those exact
  // fields manually in the meantime) — without this, a no-op rollback would
  // leave no trace, so "already rolled back" could never be answered and the
  // same conflict warning would resurface forever on retry.
  async logBatch(
    tx: Prisma.TransactionClient,
    params: {
      projectId: number
      source: 'manual_edit' | 'bulk_edit' | 'import' | 'rollback'
      fileName?: string | null
      rolledBackBatchId?: number | null
      userId: number
      rows: { assemblyId: number; diff: DiffEntry[] }[]
      alwaysCreateBatch?: boolean
    },
  ): Promise<{ batchId: number | null }> {
    const touched = params.rows.filter(r => r.diff.length > 0)
    if (!touched.length && !params.alwaysCreateBatch) return { batchId: null }

    const batch = await tx.progress_change_batch.create({
      data: {
        project_id: params.projectId,
        source: params.source,
        file_name: params.fileName ?? null,
        rolled_back_batch_id: params.rolledBackBatchId ?? null,
        create_uid: params.userId,
      },
    })
    if (touched.length) await tx.progress_change_entry.createMany({
      data: touched.flatMap(r =>
        r.diff.map(d => ({
          batch_id: batch.id,
          assembly_id: r.assemblyId,
          field: d.field,
          old_value: d.old == null ? null : String(d.old),
          new_value: d.new == null ? null : String(d.new),
        })),
      ),
    })
    return { batchId: batch.id }
  }

  // Parses a stored old_value/new_value string back to the typed value for
  // a rollback write — type coercion only, no domain clamping (callers
  // apply the same clampPct/clampPcs/nonNegDecimal any other write path
  // uses, since pcs clamping needs the assembly's current qty which this
  // function has no access to).
  coerceForWrite(field: AuditableField, stringValue: string | null): unknown {
    if (stringValue == null) return null
    if (DATE_FIELDS.has(field)) return new Date(stringValue)
    if (DECIMAL_FIELDS.has(field)) return nonNegDecimal(Number(stringValue))
    if (field === 'payment_status') return stringValue
    if (field === 'loaded_pcs' || field === 'erected_pcs') return Math.max(0, Math.round(Number(stringValue)))
    return clampPct(Number(stringValue))
  }
}
