import { Fragment, useMemo, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { AlertTriangle, ChevronUp, History, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { BomVersionStatus, MarkProgressExpected, MarkProgressValues, WoEvent, WoMark } from '../../api/wo'
import { getErrorMessage } from '../../lib/getErrorMessage'
import { QcBreakdownFields, qcBreakdownValid, EMPTY_QC_BREAKDOWN, type QcBreakdown } from './QcBreakdownFields'
import { isProgressNoise } from './progressChanges'

type QtyField = keyof MarkProgressValues
const QTY_FIELDS: QtyField[] = ['qty_not_started', 'qty_in_progress', 'qty_done', 'qty_qc_passed', 'qty_rework', 'qty_renew']
/** { qty_not_started: get('qty_not_started'), … } over the six progress fields. */
const byQtyField = <T,>(get: (f: QtyField) => T) =>
  Object.fromEntries(QTY_FIELDS.map(f => [f, get(f)])) as { [K in QtyField]: T }

interface Props {
  // Full marks array (removed included) — the table itself scopes to
  // non-removed rows, same as the backend's own bom-version-status/done/
  // cancel endpoints only ever act on non-removed marks.
  marks: WoMark[]
  bomVersionStatus: BomVersionStatus[]
  // Saves ONE mark's progress (PATCH /wo/:id/marks/:markId/progress) —
  // markId = work_order_mark.id. Rejects with a 409 STALE_PROGRESS when the
  // row changed since `expected` was loaded.
  onSaveProgress: (markId: number, body: MarkProgressValues & { expected: MarkProgressExpected }) => Promise<unknown>
  // Refetches the WO and resolves to its fresh marks — ✎ seeds from these.
  onReloadMarks: () => Promise<WoMark[] | undefined>
  // The WO's events — the open edit panel lists the mark's own history from them.
  events: WoEvent[]
  eventsLoading?: boolean
  savePending: boolean
  canEditQty: boolean
  canModify: boolean
  onRemove: (bomAssemblyId: number, body: { reason: string; qty_qc_passed?: number; qty_rework?: number; qty_renew?: number }) => Promise<unknown>
  onAcceptVersion: (bomAssemblyId: number, body: { note?: string; qty_qc_passed?: number; qty_rework?: number; qty_renew?: number; apply_to_other_wos?: boolean }) => Promise<unknown>
  removePending: boolean
  acceptPending: boolean
}

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.04em', color: '#999', padding: '8px 10px', borderBottom: '1px solid #E0E0E0', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid #F0F0F0', verticalAlign: 'middle' }
const mono: React.CSSProperties = { fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }

function serverValue(mark: WoMark, field: QtyField): string {
  const raw = mark[field]
  return raw != null ? String(raw) : ''
}

function num(v: string): number {
  const n = Number(v)
  return v !== '' && Number.isFinite(n) ? n : 0
}

const isStaleProgress = (err: unknown) =>
  isAxiosError(err) && err.response?.status === 409 && err.response.data?.code === 'STALE_PROGRESS'

/** Clamps a qty field's value to [0, max] — the expand-row draft's live clamp. */
function clampQty(value: string, max: number): string {
  if (value === '') return value
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  if (n < 0) return '0'
  return n > max ? String(max) : value
}

function dispatchLabel(d: WoMark['snapshot_dispatch']): string {
  if (!d) return ''
  return [d.project?.name, d.zone?.label, d.sub_zone?.name].filter(Boolean).join(' · ')
}

/**
 * Marks table for WoDetail's Overview tab (multi-mark redesign, 2026-09-17)
 * — replaces the old single bom_assembly + Qty Done/Scrapped fields. Follows
 * ProgressAssemblyTable.tsx's shape: accordion inline-edit, footer aggregate
 * row.
 *
 * Quantity/Done/QC Passed/Rework/Renew (2026-09-23, was Planned/Done/
 * Scrapped/Reusable) — user: "เปลี่ยนจาก Planned เป็น quantity แล้วก็ Done
 * เอาไว้แบบเดิม เอา Scrapped Reusable เปลี่ยนเป็น Qc passed, Rework, Renew".
 * QC Passed/Rework/Renew are edited the SAME way Done always was (inline
 * pencil, only while canEditQty) — they replace both the old editable
 * Scrapped column AND the old read-only Reusable display column,
 * since a disruption action (remove-mark/accept-version/cancel) now writes
 * into these same three fields instead of a separate qty_reusable.
 *
 * Not Started/In Progress (2026-09-23) — first shipped as a read-only Status
 * column mirroring the WO's own WoStatusPill, then rejected the same day
 * ("ไม่ใช่ status แบบนี้สิ เอามาเพิ่มให้เหมือน Done QC Passed Rework Renew"):
 * these are per-mark EDITABLE qty fields, same mechanism as Done/QC Passed/
 * Rework/Renew (inline pencil, only while canEditQty), not a shared
 * read-only copy of the WO's status. Entered through the progress save only —
 * unlike the QC fields, NOT part of remove-mark/accept-version/cancel, since
 * those dispose of qty_done, not the not-yet-done remainder.
 *
 * Expand-row Confirm/Cancel (2026-09-23, user: "ต้องมีปุ่มกด cancel และ
 * confirm ด้วย" — there must be Cancel and Confirm buttons too). The
 * expand-row inputs bind to a LOCAL `draft`, clamped to [0, qty_planned] as
 * you type. Cancel (or the row's own top-right icon, which discards-and-
 * closes the same way while expanded) discards the draft untouched.
 *
 * Confirm validates + toasts (2026-09-23, user: "หลัง confirm ต้องแสดง toast
 * ด้วยว่า success หรือ เกิด error" — after Confirm there must be a toast for
 * either success or error). The two checks mirror the server-side rules
 * (not_started+in_progress+done ≤ qty_planned; qc_passed+rework+renew ≤
 * qty_done); a failing check toasts an error and leaves the row open.
 *
 * Saved per mark, with history (2026-10-05, wiki features/wo-progress-
 * history-plan.md). Rows show server values only — there is no draft layer
 * above them any more. ✎ refetches the WO first (onReloadMarks) and seeds
 * the draft from the FRESH mark, remembering those values as `expected`;
 * Confirm saves the six totals via onSaveProgress (a real, audited write).
 * A 409 STALE_PROGRESS (someone saved this mark since it was loaded) reloads
 * and re-seeds the open row; any other error toasts the server message and
 * keeps the draft. While a reload is in flight the ✎/close toggles and Confirm
 * are disabled; a failed reload toasts and leaves the row closed.
 *
 * History inside the edit panel (D2 amended 2026-10-05, user: "ไม่ต้องมีปุ่มดู
 * history แยก เวลากดแก้ไขแล้วแสดง history ด้านล่างเลย" — no separate history
 * button; pressing Edit shows the history right below). The open panel lists
 * this mark's events from `events`, newest first, under the inputs.
 */
export function WoMarksTable({
  marks, bomVersionStatus, onSaveProgress, onReloadMarks, events, eventsLoading = false, savePending, canEditQty, canModify,
  onRemove, onAcceptVersion, removePending, acceptPending,
}: Props) {
  const activeMarks = useMemo(() => marks.filter(m => !m.removed_at), [marks])
  const removedCount = marks.length - activeMarks.length
  const bomByAssembly = useMemo(() => new Map(bomVersionStatus.map(b => [b.bom_assembly_id, b])), [bomVersionStatus])
  const canRemoveAny = canModify && activeMarks.length > 1

  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Partial<Record<QtyField, string>>>({})
  const [loaded, setLoaded] = useState<MarkProgressExpected | null>(null)
  const [reloading, setReloading] = useState(false)
  // Show/hide the open panel's history (user: a toggle beside the outdated
  // note, hidden until asked for). The choice carries over between marks.
  const [historyOpen, setHistoryOpen] = useState(false)
  // Bumped by every open/close: a reload that lands after the user moved on
  // (Cancel, or another ✎) is ignored instead of re-opening the row.
  const reloadSeq = useRef(0)
  const [removeTarget, setRemoveTarget] = useState<WoMark | null>(null)
  const [acceptTarget, setAcceptTarget] = useState<{ mark: WoMark; bom: BomVersionStatus } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  /** Reloads the WO, then seeds the row from the FRESH mark. Resolves false
   *  when the reload failed (toasted, row closed) or was superseded. */
  async function openEdit(m: WoMark): Promise<boolean> {
    const seq = ++reloadSeq.current
    setReloading(true)
    let fresh: WoMark
    try {
      fresh = (await onReloadMarks())?.find(x => x.id === m.id) ?? m
    } catch {
      if (seq === reloadSeq.current) {
        cancelEdit()
        toast.error("Couldn't load the latest values — try again")
      }
      return false
    }
    if (seq !== reloadSeq.current) return false
    setReloading(false)
    setExpandedId(m.id)
    setDraft(byQtyField(f => serverValue(fresh, f)))
    setLoaded(byQtyField(f => (fresh[f] != null ? Number(fresh[f]) : null)))
    return true
  }
  function cancelEdit() {
    reloadSeq.current++
    setReloading(false)
    setExpandedId(null)
    setDraft({})
    setLoaded(null)
  }
  async function confirmEdit(m: WoMark) {
    const values: MarkProgressValues = byQtyField(f => num(draft[f] ?? ''))
    const planned = Number(m.qty_planned)

    if (values.qty_not_started + values.qty_in_progress + values.qty_done > planned) {
      toast.error(`Not Started + In Progress + Done exceeds Quantity (${planned}) for ${m.bom_assembly.assembly_mark}`)
      return
    }
    if (values.qty_qc_passed + values.qty_rework + values.qty_renew > values.qty_done) {
      toast.error(`QC Passed + Rework + Renew exceeds Qty Done (${values.qty_done}) for ${m.bom_assembly.assembly_mark}`)
      return
    }

    try {
      await onSaveProgress(m.id, { ...values, expected: loaded! })
    } catch (err) {
      if (isStaleProgress(err)) {
        if (await openEdit(m)) toast.error('This mark was updated by someone else. Latest values loaded.')
      } else {
        toast.error(getErrorMessage(err, `Failed to save ${m.bom_assembly.assembly_mark}.`))
      }
      return
    }
    cancelEdit()
    toast.success(`${m.bom_assembly.assembly_mark} saved`)
  }
  const setDraftField = (m: WoMark, field: QtyField, value: string) =>
    setDraft(d => ({ ...d, [field]: clampQty(value, Number(m.qty_planned)) }))

  const totalPlanned = activeMarks.reduce((s, m) => s + Number(m.qty_planned), 0)
  const totalNotStarted = activeMarks.reduce((s, m) => s + num(serverValue(m, 'qty_not_started')), 0)
  const totalInProgress = activeMarks.reduce((s, m) => s + num(serverValue(m, 'qty_in_progress')), 0)
  const totalDone = activeMarks.reduce((s, m) => s + num(serverValue(m, 'qty_done')), 0)
  const totalQcPassed = activeMarks.reduce((s, m) => s + num(serverValue(m, 'qty_qc_passed')), 0)
  const totalRework = activeMarks.reduce((s, m) => s + num(serverValue(m, 'qty_rework')), 0)
  const totalRenew = activeMarks.reduce((s, m) => s + num(serverValue(m, 'qty_renew')), 0)
  const outdatedCount = activeMarks.filter(m => bomByAssembly.get(m.bom_assembly_id)?.is_outdated).length

  async function handleRemoveSubmit(body: { reason: string; qty_qc_passed?: number; qty_rework?: number; qty_renew?: number }) {
    if (!removeTarget) return
    setActionError(null)
    try {
      await onRemove(removeTarget.bom_assembly_id, body)
      setRemoveTarget(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove mark.')
    }
  }

  async function handleAcceptSubmit(body: { note?: string; qty_qc_passed?: number; qty_rework?: number; qty_renew?: number; apply_to_other_wos?: boolean }) {
    if (!acceptTarget) return
    setActionError(null)
    try {
      await onAcceptVersion(acceptTarget.mark.bom_assembly_id, body)
      setAcceptTarget(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to accept the new version.')
    }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E0E0E0', borderRadius: 10, overflow: 'hidden' }}>
      {actionError && (
        <div style={{ background: '#FCEBEB', color: '#C8202A', fontSize: 12, padding: '8px 12px', borderBottom: '1px solid #F3C6C6' }}>{actionError}</div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={th}>Mark</th>
            <th style={{ ...th, textAlign: 'right' }}>Quantity</th>
            <th style={{ ...th, textAlign: 'right' }}>Not Started</th>
            <th style={{ ...th, textAlign: 'right' }}>In Progress</th>
            <th style={{ ...th, textAlign: 'right' }}>Done</th>
            <th style={{ ...th, textAlign: 'right' }}>QC Passed</th>
            <th style={{ ...th, textAlign: 'right' }}>Rework</th>
            <th style={{ ...th, textAlign: 'right' }}>Renew</th>
            <th style={{ ...th, textAlign: 'center' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {activeMarks.map(m => {
            const bom = bomByAssembly.get(m.bom_assembly_id)
            const outdated = !!bom?.is_outdated
            const removedIrreversibly = bom?.delta_types.includes('REMOVED')
            const expanded = expandedId === m.id
            const historyRows = expanded ? markHistoryRows(events, m.id) : []
            const dispatchText = dispatchLabel(m.snapshot_dispatch ?? { id: 0, project_id: m.bom_assembly.dispatch.project_id, project: m.bom_assembly.dispatch.project, zone: m.bom_assembly.dispatch.zone, sub_zone: m.bom_assembly.dispatch.sub_zone })
            return (
              <Fragment key={m.id}>
                <tr style={{ background: expanded ? '#FAFAFA' : undefined }}>
                  <td style={td}>
                    <span style={{ ...mono, fontWeight: 700, color: '#1A1A1A' }}>{m.bom_assembly.assembly_mark}</span>
                    {m.bom_assembly.name && <span style={{ fontSize: 11, color: '#999', marginLeft: 6 }}>{m.bom_assembly.name}</span>}
                    {outdated && (
                      <span title={`Newer BOM version: ${bom!.delta_types.join(' · ') || 'change'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: '#C62828' }}>
                        <AlertTriangle size={11} /> outdated
                      </span>
                    )}
                    {dispatchText && <div style={{ fontSize: 10.5, color: '#ABABAB', marginTop: 1 }}>{dispatchText}</div>}
                  </td>
                  <td style={{ ...td, textAlign: 'right', ...mono }}>{Number(m.qty_planned)}</td>
                  <td style={{ ...td, textAlign: 'right', ...mono, color: '#555555' }}>{serverValue(m, 'qty_not_started') || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', ...mono, color: '#854F0B' }}>{serverValue(m, 'qty_in_progress') || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', ...mono, fontWeight: 600 }}>{serverValue(m, 'qty_done') || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', ...mono, color: '#1E6B36' }}>{serverValue(m, 'qty_qc_passed') || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', ...mono, color: '#946200' }}>{serverValue(m, 'qty_rework') || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', ...mono, color: '#888' }}>{serverValue(m, 'qty_renew') || '—'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      {canEditQty && (
                        <IconButton title={expanded ? 'Close (discards unconfirmed changes)' : 'Edit qty'} active={expanded} disabled={reloading} onClick={() => (expanded ? cancelEdit() : openEdit(m))}>
                          {expanded ? <ChevronUp size={13} /> : <Pencil size={12} />}
                        </IconButton>
                      )}
                      {outdated && canModify && !removedIrreversibly && (
                        <IconButton title="Accept new BOM version" color="#1E6B36" onClick={() => setAcceptTarget({ mark: m, bom: bom! })}>
                          <AlertTriangle size={12} />
                        </IconButton>
                      )}
                      {canModify && (
                        canRemoveAny ? (
                          <IconButton title="Remove this mark" color="#C8202A" onClick={() => setRemoveTarget(m)}>
                            <Trash2 size={12} />
                          </IconButton>
                        ) : (
                          <span title="Last mark on this WO — cancel the whole work order instead" style={{ fontSize: 10, color: '#BBB', display: 'inline-flex', alignItems: 'center' }}>only mark</span>
                        )
                      )}
                    </div>
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={9} style={{ padding: '10px 14px 16px', background: '#FAFAFA', borderBottom: '1px solid #EEE' }}>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <FieldGroup label="Not Started">
                          <input
                            type="number" min={0} max={Number(m.qty_planned)}
                            value={draft.qty_not_started ?? ''}
                            onChange={e => setDraftField(m, 'qty_not_started', e.target.value)}
                            style={{ width: 110, padding: '6px 8px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }}
                          />
                        </FieldGroup>
                        <FieldGroup label="In Progress">
                          <input
                            type="number" min={0} max={Number(m.qty_planned)}
                            value={draft.qty_in_progress ?? ''}
                            onChange={e => setDraftField(m, 'qty_in_progress', e.target.value)}
                            style={{ width: 110, padding: '6px 8px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }}
                          />
                        </FieldGroup>
                        <FieldGroup label="Qty Done">
                          <input
                            type="number" min={0} max={Number(m.qty_planned)}
                            value={draft.qty_done ?? ''}
                            onChange={e => setDraftField(m, 'qty_done', e.target.value)}
                            style={{ width: 110, padding: '6px 8px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }}
                          />
                        </FieldGroup>
                        <FieldGroup label="QC Passed">
                          <input
                            type="number" min={0} max={Number(m.qty_planned)}
                            value={draft.qty_qc_passed ?? ''}
                            onChange={e => setDraftField(m, 'qty_qc_passed', e.target.value)}
                            style={{ width: 110, padding: '6px 8px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }}
                          />
                        </FieldGroup>
                        <FieldGroup label="Rework">
                          <input
                            type="number" min={0} max={Number(m.qty_planned)}
                            value={draft.qty_rework ?? ''}
                            onChange={e => setDraftField(m, 'qty_rework', e.target.value)}
                            style={{ width: 110, padding: '6px 8px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }}
                          />
                        </FieldGroup>
                        <FieldGroup label="Renew">
                          <input
                            type="number" min={0} max={Number(m.qty_planned)}
                            value={draft.qty_renew ?? ''}
                            onChange={e => setDraftField(m, 'qty_renew', e.target.value)}
                            style={{ width: 110, padding: '6px 8px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }}
                          />
                        </FieldGroup>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => confirmEdit(m)}
                            disabled={savePending || reloading}
                            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 'none', background: '#C8202A', color: '#fff', cursor: 'pointer', opacity: savePending || reloading ? 0.6 : 1 }}
                          >
                            Confirm
                          </button>
                          <button
                            onClick={cancelEdit}
                            style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                          <HistoryToggle open={historyOpen} count={historyRows.length} onToggle={() => setHistoryOpen(open => !open)} />
                        </div>
                      </div>
                      {outdated && (
                        <div style={{ marginTop: 10, fontSize: 11.5, color: '#8A2A0D' }}>
                          Dispatch #{bom!.latest_dispatch_id} changed this mark: {bom!.delta_types.join(' · ') || 'unspecified change'}.
                          {removedIrreversibly && ' The assembly was removed from the latest BOM version — remove this mark (or cancel the whole WO) instead of accepting.'}
                        </div>
                      )}
                      {historyOpen && <MarkHistory rows={historyRows} loading={eventsLoading} />}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
          {!activeMarks.length && (
            <tr>
              <td colSpan={9} style={{ ...td, textAlign: 'center', color: '#AAA', padding: 20 }}>No marks on this work order.</td>
            </tr>
          )}
        </tbody>
        {activeMarks.length > 0 && (
          <tfoot>
            <tr>
              <td style={{ padding: '8px 10px', fontSize: 11, color: '#888', borderTop: '1px solid #E0E0E0' }}>
                {activeMarks.length} mark{activeMarks.length > 1 ? 's' : ''}
                {removedCount > 0 ? ` · ${removedCount} removed` : ''}
                {outdatedCount > 0 ? ` · ${outdatedCount} outdated` : ''}
              </td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, ...mono, borderTop: '1px solid #E0E0E0' }}>{totalPlanned}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, ...mono, borderTop: '1px solid #E0E0E0' }}>{totalNotStarted}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, ...mono, borderTop: '1px solid #E0E0E0' }}>{totalInProgress}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, ...mono, borderTop: '1px solid #E0E0E0' }}>{totalDone}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, ...mono, borderTop: '1px solid #E0E0E0' }}>{totalQcPassed}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, ...mono, borderTop: '1px solid #E0E0E0' }}>{totalRework}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, ...mono, borderTop: '1px solid #E0E0E0' }}>{totalRenew}</td>
              <td style={{ borderTop: '1px solid #E0E0E0' }} />
            </tr>
          </tfoot>
        )}
      </table>

      {removeTarget && (
        <RemoveMarkModal
          mark={removeTarget}
          isPending={removePending}
          onClose={() => setRemoveTarget(null)}
          onSubmit={handleRemoveSubmit}
        />
      )}
      {acceptTarget && (
        <AcceptVersionModal
          mark={acceptTarget.mark}
          bom={acceptTarget.bom}
          isPending={acceptPending}
          onClose={() => setAcceptTarget(null)}
          onSubmit={handleAcceptSubmit}
        />
      )}
    </div>
  )
}

function IconButton({ title, children, onClick, active, color, disabled }: { title: string; children: React.ReactNode; onClick: () => void; active?: boolean; color?: string; disabled?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
        border: `1px solid ${active ? '#C8202A' : '#E0E0E0'}`,
        background: active ? '#C8202A' : '#fff',
        color: active ? '#fff' : (color ?? '#8E8E8E'),
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 10.5, color: '#888', display: 'block', marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  )
}

// Labels for the per-mark event types in the panel's history (2026-10-05).
const MARK_EVENT_LABEL: Record<string, string> = {
  PROGRESS_UPDATE: 'Progress updated',
  MARK_REMOVED: 'Mark removed',
  ACCEPT_VERSION: 'BOM version accepted',
}

function fmtShort(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// History columns, in the same order and width as the edit panel's inputs
// above (110px each, 16px gap) so each change sits right under its own field —
// the inputs' own labels head the columns, so the header row is screen-reader only.
const HISTORY_FIELDS: { field: string; label: string }[] = [
  { field: 'qty_not_started', label: 'Not Started' },
  { field: 'qty_in_progress', label: 'In Progress' },
  { field: 'qty_done', label: 'Qty Done' },
  { field: 'qty_qc_passed', label: 'QC Passed' },
  { field: 'qty_rework', label: 'Rework' },
  { field: 'qty_renew', label: 'Renew' },
]
const HISTORY_GRID: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(6, 110px) minmax(110px, auto) minmax(120px, 1fr)', columnGap: 16, alignItems: 'center',
}
const SR_ONLY: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
}

const fmtQty = (v: number | null) => (v == null ? '–' : String(v))

/** What the row was, when it wasn't a plain save: "Start", "Cancel disposition",
 *  "BOM version accepted · Quantity 10 → 8", "Mark removed". */
function historyNote(e: WoEvent): string {
  const label = e.event_type === 'PROGRESS_UPDATE' ? e.notes ?? '' : MARK_EVENT_LABEL[e.event_type] ?? e.event_type
  const planned = e.changes?.find(c => c.field === 'qty_planned')
  return [label, planned && `Quantity ${fmtQty(planned.old)} → ${fmtQty(planned.new)}`].filter(Boolean).join(' · ')
}

// Note tag tone by what happened: the app's red tint for take-backs (cancel,
// remove), amber for BOM changes (same family as the outdated note), slate
// for the Start seed, plain grey for anything else.
function noteTone(e: WoEvent): { bg: string; fg: string } {
  if (e.event_type === 'MARK_REMOVED' || e.notes === 'Cancel disposition') return { bg: '#FCEBEB', fg: '#C8202A' }
  if (e.event_type === 'ACCEPT_VERSION') return { bg: '#FFF3E0', fg: '#8A4B0D' }
  if (e.notes === 'Start') return { bg: '#EEF2F6', fg: '#41566F' }
  return { bg: '#F1F1F1', fg: '#555' }
}

/** Icon-only show/hide for the panel's history (user: "เอาให้เหลือ icon อย่างเดียวพอ"),
 *  sitting right after Cancel and stretched to its height, with Cancel's own
 *  border; red when open, like the row's active ✎. The count rides in the tooltip. */
function HistoryToggle({ open, count, onToggle }: { open: boolean; count: number; onToggle: () => void }) {
  const label = open ? 'Hide history' : `Show history (${count})`
  return (
    <button
      type="button"
      title={label}
      aria-expanded={open}
      onClick={onToggle}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px',
        borderRadius: 6, cursor: 'pointer',
        border: `1px solid ${open ? '#C8202A' : '#C2C2C2'}`,
        background: open ? '#C8202A' : '#fff',
        color: open ? '#fff' : '#555',
      }}
    >
      <History size={15} aria-hidden />
    </button>
  )
}

function ChangeChip({ from, to }: { from: number | null; to: number | null }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, padding: '2px 8px', borderRadius: 4, background: '#fff', border: '1px solid #E6E6E6', ...mono, fontSize: 12 }}>
      <span style={{ color: '#A6A6A6' }}>{fmtQty(from)}</span>
      <span style={{ color: '#C4C4C4', fontSize: 11 }}> → </span>
      <span style={{ color: '#1A1A1A', fontWeight: 700 }}>{fmtQty(to)}</span>
    </span>
  )
}

interface MarkHistoryRow { e: WoEvent; changes: WoEvent['changes'] & object; note: string }

/** This mark's events newest first, blank→0 noise dropped, rows with nothing
 *  left to show (no visible change, no note) skipped. */
function markHistoryRows(events: WoEvent[], markId: number): MarkHistoryRow[] {
  return events
    .filter(e => e.work_order_mark_id === markId)
    .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at) || b.id - a.id)
    .map(e => ({ e, changes: (e.changes ?? []).filter(c => !isProgressNoise(c)), note: historyNote(e) }))
    .filter(r => r.changes.some(c => c.field !== 'qty_planned') || r.note)
}

/** The mark's history inside its open edit panel (amended D2, 2026-10-05):
 *  one row per change, each value in a chip right under its own input. */
function MarkHistory({ rows, loading }: { rows: MarkHistoryRow[]; loading: boolean }) {
  const muted: React.CSSProperties = { fontSize: 12, color: '#8E8E8E', padding: '10px 0 2px' }

  return (
    <section aria-label="History" style={{ marginTop: 10 }}>
      {loading ? (
        <div style={muted}>Loading history…</div>
      ) : rows.length === 0 ? (
        <div style={muted}>No progress recorded yet</div>
      ) : (
        <div role="table" style={{ position: 'relative', maxHeight: 196, overflowY: 'auto', overflowX: 'auto', borderTop: '1px solid #EBEBEB' }}>
          <div role="row" style={SR_ONLY}>
            {HISTORY_FIELDS.map(f => <span key={f.field} role="columnheader">{f.label}</span>)}
            <span role="columnheader">When · By</span>
            <span role="columnheader">Note</span>
          </div>
          {rows.map(({ e, changes, note }) => {
            const tone = noteTone(e)
            return (
              <div key={e.id} role="row" style={{ ...HISTORY_GRID, minHeight: 38, padding: '6px 0', borderBottom: '1px solid #EFEFEF' }}>
                {HISTORY_FIELDS.map(f => {
                  const c = changes.find(x => x.field === f.field)
                  return <span key={f.field} role="cell">{c && <ChangeChip from={c.old} to={c.new} />}</span>
                })}
                <span role="cell" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                  <span style={{ fontSize: 12, color: '#3A3A3A', ...mono }}>{fmtShort(e.recorded_at)}</span>
                  <span style={{ fontSize: 11, color: '#999' }}>{e.recorded_by}</span>
                </span>
                <span role="cell">
                  {note && (
                    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 11, fontWeight: 600 }}>
                      {note}
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function RemoveMarkModal({
  mark, isPending, onClose, onSubmit,
}: {
  mark: WoMark
  isPending: boolean
  onClose: () => void
  onSubmit: (body: { reason: string; qty_qc_passed?: number; qty_rework?: number; qty_renew?: number }) => void
}) {
  const [reason, setReason] = useState('')
  const [breakdown, setBreakdown] = useState<QcBreakdown>(EMPTY_QC_BREAKDOWN)
  const qtyDone = mark.qty_done != null ? Number(mark.qty_done) : 0
  const needsBreakdown = qtyDone > 0
  const canSubmit = reason.trim().length > 0 && (!needsBreakdown || qcBreakdownValid(breakdown, qtyDone))

  function handleSubmit() {
    if (!canSubmit) return
    onSubmit({
      reason: reason.trim(),
      qty_qc_passed: needsBreakdown && breakdown.qty_qc_passed !== '' ? Number(breakdown.qty_qc_passed) : undefined,
      qty_rework: needsBreakdown && breakdown.qty_rework !== '' ? Number(breakdown.qty_rework) : undefined,
      qty_renew: needsBreakdown && breakdown.qty_renew !== '' ? Number(breakdown.qty_renew) : undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', width: 460 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Remove mark · {mark.bom_assembly.assembly_mark}</h2>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Removes this mark from the work order. A reason is required.</p>
        <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Reason *</label>
        <textarea
          value={reason} onChange={e => setReason(e.target.value)} autoFocus rows={3} placeholder="Reason…"
          style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, resize: 'vertical' }}
        />
        {needsBreakdown && <QcBreakdownFields value={breakdown} onChange={setBreakdown} max={qtyDone} />}
        <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>Close</button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !canSubmit}
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: '#C8202A', color: '#fff', cursor: 'pointer', opacity: isPending || !canSubmit ? 0.6 : 1 }}
          >
            {isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AcceptVersionModal({
  mark, bom, isPending, onClose, onSubmit,
}: {
  mark: WoMark
  bom: BomVersionStatus
  isPending: boolean
  onClose: () => void
  onSubmit: (body: { note?: string; qty_qc_passed?: number; qty_rework?: number; qty_renew?: number; apply_to_other_wos?: boolean }) => void
}) {
  const [note, setNote] = useState('')
  const [breakdown, setBreakdown] = useState<QcBreakdown>(EMPTY_QC_BREAKDOWN)
  const [applyToOthers, setApplyToOthers] = useState(false)

  const qtyDone = mark.qty_done != null ? Number(mark.qty_done) : 0
  const qtyDelta = bom.delta_types.includes('QTY_CHANGED')
    ? (bom.delta_details as { qty?: { from: number; to: number } } | null)?.qty
    : undefined
  const needsBreakdown = qtyDelta != null && qtyDone > qtyDelta.to
  const canSubmit = !needsBreakdown || qcBreakdownValid(breakdown, qtyDone)

  function handleSubmit() {
    if (!canSubmit) return
    onSubmit({
      note: note.trim() || undefined,
      qty_qc_passed: needsBreakdown && breakdown.qty_qc_passed !== '' ? Number(breakdown.qty_qc_passed) : undefined,
      qty_rework: needsBreakdown && breakdown.qty_rework !== '' ? Number(breakdown.qty_rework) : undefined,
      qty_renew: needsBreakdown && breakdown.qty_renew !== '' ? Number(breakdown.qty_renew) : undefined,
      apply_to_other_wos: applyToOthers,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', width: 480 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Accept new BOM version · {mark.bom_assembly.assembly_mark}</h2>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
          Adopts dispatch #{bom.latest_dispatch_id} ({bom.delta_types.join(' · ') || 'change'}) for this mark only, unless applied below.
        </p>
        <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Note</label>
        <textarea
          value={note} onChange={e => setNote(e.target.value)} autoFocus rows={2} placeholder="Optional note…"
          style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, resize: 'vertical' }}
        />
        {needsBreakdown && <QcBreakdownFields value={breakdown} onChange={setBreakdown} max={qtyDone} />}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12, color: '#444', cursor: 'pointer' }}>
          <input type="checkbox" checked={applyToOthers} onChange={e => setApplyToOthers(e.target.checked)} style={{ width: 14, height: 14 }} />
          Also apply to other work orders holding this mark
        </label>
        <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>Close</button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !canSubmit}
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: '#1E6B36', color: '#fff', cursor: 'pointer', opacity: isPending || !canSubmit ? 0.6 : 1 }}
          >
            {isPending ? 'Accepting…' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}
