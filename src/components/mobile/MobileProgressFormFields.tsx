import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useUpdateAssemblyProgress } from '../../hooks/useProjectProgress'
import { usePermission } from '../../hooks/usePermission'
import { FAB_STAGES, PAYMENT_STATUSES } from '../../api/projectProgress'
import type { ProgressZoneRow, UpdateAssemblyProgressPayload, FabStage, PaymentStatus } from '../../api/projectProgress'
import { MobileDateWheelPicker } from './MobileDateWheelPicker'

const STAGE_LABEL: Record<FabStage, string> = {
  cut: 'Cut', buildup: 'Build-Up', weld1: 'Weld', fitup_drill: 'Fitup/Drill', weld2: 'Weld (2)',
  qc_inspection: 'QC Inspection', primer: 'Primer', fireproof: 'Fireproof', top_coat: 'TOP', qc_final: 'QC Final',
}

// Same clamp semantics as the desktop table (ProgressAssemblyTable.tsx) —
// kept as a small local copy rather than exporting from that file, since
// this is the only other consumer and the two forms otherwise share nothing.
const clampPct = (v: number) => Math.min(100, Math.max(0, Math.round(v)))
const clampPcs = (v: number, qty: number | null) => Math.min(Math.max(1, Math.round(qty ?? 1)), Math.max(0, Math.round(v)))
const nonNegDecimal = (v: number) => Math.max(0, v)
const toInputDate = (v: string | null) => (v ? v.slice(0, 10) : '')

function rowToDraft(r: ProgressZoneRow): UpdateAssemblyProgressPayload {
  return {
    ...Object.fromEntries(FAB_STAGES.map(s => [s, r[s]])),
    fab_plan_finish_date: r.fab_plan_finish_date,
    fab_actual_finish_date: r.fab_actual_finish_date,
    plan_load_date: r.plan_load_date,
    actual_load_date: r.actual_load_date,
    loaded_pcs: r.loaded_pcs,
    erected_pcs: r.erected_pcs,
    payment_status: r.payment_status,
    claimed_weight_kg: r.claimed_weight_kg ?? undefined,
    delivered_weight_kg: r.delivered_weight_kg ?? undefined,
    erection_plan_finish_date: r.erection_plan_finish_date,
    erection_actual_finish_date: r.erection_actual_finish_date,
  }
}

const EDIT_FIELDS = [
  ...FAB_STAGES, 'fab_plan_finish_date', 'fab_actual_finish_date',
  'plan_load_date', 'actual_load_date', 'loaded_pcs', 'erected_pcs',
  'payment_status', 'claimed_weight_kg', 'delivered_weight_kg',
  'erection_plan_finish_date', 'erection_actual_finish_date',
] as const

function diffDraft(draft: UpdateAssemblyProgressPayload, original: ProgressZoneRow): UpdateAssemblyProgressPayload {
  const payload: UpdateAssemblyProgressPayload = {}
  for (const f of EDIT_FIELDS) if (draft[f as keyof typeof draft] !== original[f as keyof ProgressZoneRow]) {
    (payload as Record<string, unknown>)[f] = draft[f as keyof typeof draft]
  }
  return payload
}

const section = 'text-[11px] font-bold uppercase tracking-wide text-ssi-600 mt-5 mb-2 first:mt-0'
const label = 'block text-xs font-medium text-chrome-600 mb-1'
const input = 'w-full bg-white border border-chrome-200 rounded-lg px-3 py-3 text-[15px] focus:outline-none focus:border-ssi-600'

interface Props {
  code: string
  row: ProgressZoneRow
  onSaved?: () => void
  // 'page' pins Save to the full viewport bottom (MobileProgressForm's own
  // shell handles the safe-area padding that requires). 'sheet' pins it to
  // the bottom of its own scroll container instead — MobileProgressSheet's
  // sheet body, not the viewport, since the sheet doesn't span full height.
  variant: 'page' | 'sheet'
}

export function MobileProgressFormFields({ code, row, onSaved, variant }: Props) {
  const canUpdate = usePermission('project-tracking', 'update')
  const updateMutation = useUpdateAssemblyProgress(code)

  const [draft, setDraft] = useState<UpdateAssemblyProgressPayload>(() => rowToDraft(row))
  // Resync only when switching assemblies, not on every local edit.
  useEffect(() => { setDraft(rowToDraft(row)) }, [row.assembly_id])

  const qty = row.qty ?? 1
  const set = <K extends keyof UpdateAssemblyProgressPayload>(k: K, v: UpdateAssemblyProgressPayload[K]) =>
    setDraft(d => ({ ...d, [k]: v }))

  const handleSave = () => {
    const payload = diffDraft(draft, row)
    if (!Object.keys(payload).length) { toast.info('No changes to save'); return }
    updateMutation.mutate(
      { assemblyId: row.assembly_id, payload },
      {
        onSuccess: () => { toast.success(`${row.mark} saved`); onSaved?.() },
        onError: () => toast.error('Save failed — check connection and try again'),
      },
    )
  }

  return (
    <>
      <div className="p-4">
        {!canUpdate && (
          <div className="mb-4 bg-molten-50 border border-molten-100 text-molten-600 text-sm rounded-lg p-3">
            You don't have permission to edit progress — view only.
          </div>
        )}

        <div className={section}>Fabrication</div>
        <div className="grid grid-cols-2 gap-3">
          {FAB_STAGES.map(stage => (
            <div key={stage} className="min-w-0">
              <label className={label}>{STAGE_LABEL[stage]}</label>
              <div className="relative">
                <input
                  type="number" min={0} max={100} inputMode="numeric"
                  value={draft[stage] ?? 0}
                  disabled={!canUpdate}
                  onChange={e => set(stage, clampPct(Number(e.target.value)))}
                  className={`${input} pr-8 disabled:bg-chrome-50 disabled:text-chrome-400`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-chrome-400">%</span>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="min-w-0">
            <label className={label}>Plan Finish</label>
            <MobileDateWheelPicker
              label="Plan Finish"
              value={toInputDate(draft.fab_plan_finish_date ?? null)}
              onChange={v => set('fab_plan_finish_date', v)}
              disabled={!canUpdate}
            />
          </div>
          <div className="min-w-0">
            <label className={label}>Actual Finish</label>
            <MobileDateWheelPicker
              label="Actual Finish"
              value={toInputDate(draft.fab_actual_finish_date ?? null)}
              onChange={v => set('fab_actual_finish_date', v)}
              disabled={!canUpdate}
            />
          </div>
        </div>

        <div className={section}>Transport</div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className={label}>Plan Load</label>
              <MobileDateWheelPicker
                label="Plan Load"
                value={toInputDate(draft.plan_load_date ?? null)}
                onChange={v => set('plan_load_date', v)}
                disabled={!canUpdate}
              />
            </div>
            <div className="min-w-0">
              <label className={label}>Actual Load</label>
              <MobileDateWheelPicker
                label="Actual Load"
                value={toInputDate(draft.actual_load_date ?? null)}
                onChange={v => set('actual_load_date', v)}
                disabled={!canUpdate}
              />
            </div>
          </div>
          <div className="min-w-0">
            <label className={label}>Loaded (pcs, max {qty})</label>
            <input type="number" min={0} max={qty} inputMode="numeric" disabled={!canUpdate}
              value={draft.loaded_pcs ?? 0}
              onChange={e => set('loaded_pcs', clampPcs(Number(e.target.value), qty))}
              className={`${input} disabled:bg-chrome-50`} />
          </div>
        </div>

        <div className={section}>Material Payment</div>
        <div className="flex flex-col gap-3">
          <div className="min-w-0">
            <label className={label}>Status</label>
            <select
              disabled={!canUpdate}
              value={draft.payment_status ?? 'Not Disbursed'}
              onChange={e => set('payment_status', e.target.value as PaymentStatus)}
              className={`${input} disabled:bg-chrome-50`}
            >
              {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className={label}>Claimed (kg)</label>
              <input type="number" min={0} inputMode="decimal" disabled={!canUpdate}
                value={draft.claimed_weight_kg ?? ''}
                onChange={e => set('claimed_weight_kg', e.target.value === '' ? undefined : nonNegDecimal(Number(e.target.value)))}
                className={`${input} disabled:bg-chrome-50`} />
            </div>
            <div className="min-w-0">
              <label className={label}>Delivered (kg)</label>
              <input type="number" min={0} inputMode="decimal" disabled={!canUpdate}
                value={draft.delivered_weight_kg ?? ''}
                onChange={e => set('delivered_weight_kg', e.target.value === '' ? undefined : nonNegDecimal(Number(e.target.value)))}
                className={`${input} disabled:bg-chrome-50`} />
            </div>
          </div>
        </div>

        <div className={section}>Erection</div>
        <div className="flex flex-col gap-3">
          <div className="min-w-0">
            <label className={label}>Erected (pcs, max {qty})</label>
            <input type="number" min={0} max={qty} inputMode="numeric" disabled={!canUpdate}
              value={draft.erected_pcs ?? 0}
              onChange={e => set('erected_pcs', clampPcs(Number(e.target.value), qty))}
              className={`${input} disabled:bg-chrome-50`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className={label}>Plan Finish</label>
              <MobileDateWheelPicker
                label="Plan Finish"
                value={toInputDate(draft.erection_plan_finish_date ?? null)}
                onChange={v => set('erection_plan_finish_date', v)}
                disabled={!canUpdate}
              />
            </div>
            <div className="min-w-0">
              <label className={label}>Actual Finish</label>
              <MobileDateWheelPicker
                label="Actual Finish"
                value={toInputDate(draft.erection_actual_finish_date ?? null)}
                onChange={v => set('erection_actual_finish_date', v)}
                disabled={!canUpdate}
              />
            </div>
          </div>
        </div>
      </div>

      {canUpdate && (
        <div
          className={
            variant === 'page'
              ? 'fixed bottom-0 left-0 right-0 bg-white border-t border-chrome-100 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]'
              : 'sticky bottom-0 bg-white border-t border-chrome-100 p-3'
          }
        >
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="w-full py-3.5 rounded-lg bg-ssi-600 text-white font-semibold text-[15px] active:bg-ssi-800 disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Saving…' : 'Save Progress'}
          </button>
        </div>
      )}
    </>
  )
}
