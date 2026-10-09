import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { WoHistoryTimeline } from '../components/wo/WoHistoryTimeline'
import { AlertTriangle, ArrowLeft, Loader2, Cpu, Wrench, FlaskConical, Users } from 'lucide-react'
import { toast } from 'sonner'
import {
  useWo, useWoEvents, useWoSchedule, useBomVersionStatus,
  useWoTransition, useWoDone, useWoCancel, useRemoveWoMark, useAcceptNewVersion, useWoCancelSiblings, useUpdateWoActuals,
  useUpdateMarkProgress,
} from '../hooks/useWo'
import { WoStatusPill } from '../components/wo/WoStatusPill'
import { WoMarksTable } from '../components/wo/WoMarksTable'
import { QcBreakdownFields, qcBreakdownValid, EMPTY_QC_BREAKDOWN, type QcBreakdown } from '../components/wo/QcBreakdownFields'
import { WoVisualTab } from '../components/wo/WoVisualTab'
import type {
  WoAction, WoStatus, WoDetail as WoDetailT, WoMark, WoEvent, SourceRoutingOp,
  MarkDispositionInput, MarkProgressValues, MarkProgressExpected,
} from '../api/wo'
import { siblingQtyDone } from '../api/wo'
import { usePermission } from '../hooks/usePermission'
import { getErrorMessage } from '../lib/getErrorMessage'
import DaysRemainingBadge from '../components/DaysRemainingBadge'
import { ActualDatesModal, EditActualDatesButton, type ActualDatesValue } from '../components/ActualDatesModal'

const TABS = ['Overview', 'Schedule', 'History', 'Visual'] as const // Events → History (2026-10-09)
type Tab = (typeof TABS)[number]

type ActionDef = { action: WoAction; label: string; needs?: 'reason' }
type ReasonModalAction = 'pause' | 'hold' | 'cancel'

// Context-aware actions per status (T-WO.05 mirror · sticky header buttons).
// 'hold' (multi-mark redesign, 2026-09-17) is a new manual action, offered
// from any non-terminal, non-ON_HOLD status. 'resume' now covers BOTH
// PAUSED→IN_PROGRESS and ON_HOLD→unhold — same button either way, the
// backend branches on current status. Done/Cancel are rendered separately
// below (their bodies are per-mark arrays, not a simple {reason} shape).
const ACTIONS: Record<WoStatus, ActionDef[]> = {
  NOT_STARTED: [{ action: 'release', label: 'Release' }, { action: 'hold', label: 'Hold', needs: 'reason' }],
  RELEASED: [{ action: 'start', label: 'Start' }, { action: 'hold', label: 'Hold', needs: 'reason' }],
  IN_PROGRESS: [{ action: 'pause', label: 'Pause', needs: 'reason' }, { action: 'hold', label: 'Hold', needs: 'reason' }],
  PAUSED: [{ action: 'resume', label: 'Resume' }, { action: 'hold', label: 'Hold', needs: 'reason' }],
  ON_HOLD: [{ action: 'resume', label: 'Resume' }],
  DONE: [],
  CANCELLED: [],
}
const DONEABLE: WoStatus[] = ['IN_PROGRESS', 'PAUSED']
const CANCELLABLE: WoStatus[] = ['NOT_STARTED', 'RELEASED', 'IN_PROGRESS', 'PAUSED', 'ON_HOLD']
const REASON_MODAL_LABEL: Record<ReasonModalAction, string> = { pause: 'Pause', hold: 'Hold', cancel: 'Cancel' }

function fmtDateTime(d: string | null) {
  return d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}

/**
 * Builds the POST /wo/:id/cancel payload — reason plus one QC breakdown
 * (2026-09-23, was a single qty_reusable scalar) per non-removed mark that
 * already has qty_done > 0. Exported (pure) for unit testing.
 */
export function buildCancelPayload(
  marks: Pick<WoMark, 'bom_assembly_id' | 'removed_at' | 'qty_done' | 'bom_assembly'>[],
  reason: string,
  breakdownDraft: Record<number, QcBreakdown>,
): { reason: string; mark_disposition?: MarkDispositionInput[] } | { error: string } {
  if (!reason.trim()) return { error: 'A reason is required.' }
  const withOutput = marks.filter(m => !m.removed_at && m.qty_done != null && Number(m.qty_done) > 0)
  const mark_disposition: MarkDispositionInput[] = []
  for (const m of withOutput) {
    const draft = breakdownDraft[m.bom_assembly_id] ?? EMPTY_QC_BREAKDOWN
    if (!qcBreakdownValid(draft, Number(m.qty_done))) {
      return { error: `Enter a valid QC breakdown for mark ${m.bom_assembly.assembly_mark}.` }
    }
    mark_disposition.push({
      bom_assembly_id: m.bom_assembly_id,
      qty_qc_passed: draft.qty_qc_passed !== '' ? Number(draft.qty_qc_passed) : undefined,
      qty_rework: draft.qty_rework !== '' ? Number(draft.qty_rework) : undefined,
      qty_renew: draft.qty_renew !== '' ? Number(draft.qty_renew) : undefined,
    })
  }
  return { reason: reason.trim(), mark_disposition: mark_disposition.length ? mark_disposition : undefined }
}

/**
 * Gates the Complete button's visibility (2026-09-23, user: "ปุ่ม complete
 * จะแสดงก็ต่อเมื่อ qc passed ทุก mark = quantity ของทุก mark" — the Complete
 * button only shows once every non-removed mark's QC Passed reaches its full
 * planned qty). Reads saved server values only (2026-10-05): progress is
 * saved per mark on Confirm, and POST /wo/:id/done without marks re-checks
 * this same gate server-side. Exported (pure) for unit testing, same pattern
 * as buildCancelPayload.
 */
export function allMarksQcPassed(
  marks: Pick<WoMark, 'removed_at' | 'qty_planned' | 'qty_qc_passed'>[],
): boolean {
  const activeMarks = marks.filter(m => !m.removed_at)
  if (!activeMarks.length) return false
  // null never passes (fix wave 2026-10-05) — the server's rule is
  // toNum(qc) === Number(planned), and toNum(null) is null.
  return activeMarks.every(m => m.qty_qc_passed != null && Number(m.qty_qc_passed) === Number(m.qty_planned))
}

export function WoDetail() {
  const { id } = useParams<{ id: string }>()
  const woId = Number(id)
  const navigate = useNavigate()
  // ?rev= comes from the traveler's QR (2026-10-09): the MO Rev that paper was printed at
  const printedRev = useSearchParams()[0].get('rev')
  const [tab, setTab] = useState<Tab>('Overview')

  const [reasonModal, setReasonModal] = useState<{ action: ReasonModalAction } | null>(null)
  const [reason, setReason] = useState('')
  const [cancelBreakdown, setCancelBreakdown] = useState<Record<number, QcBreakdown>>({})
  const [modalError, setModalError] = useState<string | null>(null)

  const [actionError, setActionError] = useState<string | null>(null)
  // Actual dates + On Plan/Delayed are typed by the user, never auto-filled
  // (2026-10-01): nothing is sent until the modal's Confirm; 'complete'
  // sends no marks (progress is already saved per mark, 2026-10-05);
  // 'edit' = DONE-only fix.
  const [datesModal, setDatesModal] = useState<{ mode: 'complete' | 'edit' } | null>(null)
  const [datesError, setDatesError] = useState<string | null>(null)

  const { data: wo, isLoading, refetch } = useWo(woId)
  const { data: events, isLoading: eventsLoading } = useWoEvents(woId)
  const { data: bomList } = useBomVersionStatus(woId)
  const simpleTransition = useWoTransition(woId)
  const done = useWoDone(woId)
  const cancel = useWoCancel(woId)
  const removeMark = useRemoveWoMark(woId)
  const acceptVersion = useAcceptNewVersion(woId)
  const updateActuals = useUpdateWoActuals(woId)
  const updateProgress = useUpdateMarkProgress(woId)
  const canWrite = usePermission('orders', 'update')

  // Cascade-cancel preview (Task 10, Sprint 20) — only fetches while the
  // cancel modal is open, not on every page load.
  const cancelModalOpen = reasonModal?.action === 'cancel'
  const { data: cancelSiblings } = useWoCancelSiblings(woId, cancelModalOpen)

  if (isLoading || !wo) {
    return <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 56px)' }}><Loader2 size={22} className="animate-spin" style={{ color: '#C2C2C2' }} /></div>
  }

  const marksWithOutput = wo.marks.filter(m => !m.removed_at && m.qty_done != null && Number(m.qty_done) > 0)
  const toCancelSiblings = cancelSiblings?.to_cancel ?? []
  const needsDispositionSiblings = cancelSiblings?.needs_disposition ?? []
  const hasCancelSiblings = toCancelSiblings.length > 0 || needsDispositionSiblings.length > 0

  const canSubmitReasonModal = !!reasonModal && reason.trim().length > 0 && (
    reasonModal.action !== 'cancel' || marksWithOutput.every(m => qcBreakdownValid(cancelBreakdown[m.bom_assembly_id] ?? EMPTY_QC_BREAKDOWN, Number(m.qty_done)))
  )

  function openReasonModal(action: ReasonModalAction) {
    setReason(''); setCancelBreakdown({}); setModalError(null); setReasonModal({ action })
  }
  function closeReasonModal() {
    setReasonModal(null); setReason(''); setCancelBreakdown({}); setModalError(null)
  }

  function runSimpleAction(a: ActionDef) {
    if (a.needs === 'reason') {
      openReasonModal(a.action as 'pause' | 'hold')
      return
    }
    setActionError(null)
    simpleTransition.mutate(
      { action: a.action },
      { onError: err => setActionError(getErrorMessage(err, 'Failed to update the work order.')) },
    )
  }

  function submitReasonModal() {
    if (!reasonModal) return
    if (reasonModal.action === 'cancel') {
      const result = buildCancelPayload(wo!.marks, reason, cancelBreakdown)
      if ('error' in result) { setModalError(result.error); return }
      setModalError(null)
      cancel.mutate(result, {
        onSuccess: closeReasonModal,
        onError: err => setModalError(getErrorMessage(err, 'Failed to cancel the work order.')),
      })
    } else {
      if (!reason.trim()) { setModalError('A reason is required.'); return }
      setModalError(null)
      simpleTransition.mutate(
        { action: reasonModal.action, body: { reason: reason.trim() } },
        { onSuccess: closeReasonModal, onError: err => setModalError(getErrorMessage(err, 'Failed to update the work order.')) },
      )
    }
  }

  function handleDone() {
    setActionError(null)
    setDatesError(null)
    setDatesModal({ mode: 'complete' })
  }

  function submitDates(v: ActualDatesValue) {
    if (!datesModal) return
    setDatesError(null)
    const actuals = { actual_start: v.actual_start, actual_finish: v.actual_finish, timeliness: v.timeliness!, delay_note: v.delay_note }
    if (datesModal.mode === 'complete') {
      done.mutate(
        actuals,
        {
          onSuccess: () => { setDatesModal(null); toast.success('Work order completed') },
          onError: err => setDatesError(getErrorMessage(err, 'Failed to complete the work order.')),
        },
      )
    } else {
      updateActuals.mutate(actuals, {
        onSuccess: () => { setDatesModal(null); toast.success('Actual dates updated') },
        onError: err => setDatesError(getErrorMessage(err, 'Failed to update the actual dates.')),
      })
    }
  }

  const headerActions = ACTIONS[wo.status]

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Sticky header */}
      <div className="bg-white flex items-center gap-3 border-b border-chrome-100 px-6" style={{ minHeight: 56, flexShrink: 0 }}>
        <button onClick={() => navigate('/order?tab=wo')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', display: 'flex' }}><ArrowLeft size={18} /></button>
        <span style={{ fontFamily: 'monospace', fontSize: 17, fontWeight: 700, color: '#1A1A1A' }}>{wo.wo_code}</span>
        {/* MOs no longer carry a prefix since the MO type (2026-10-07) — no empty chip */}
        {wo.mark_prefix?.code && <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#C8202A', background: '#FCEBEB', borderRadius: 4, padding: '1px 7px' }}>{wo.mark_prefix.code}</span>}
        <WoStatusPill status={wo.status} />
        <div style={{ flex: 1 }} />
        <div className="flex items-center gap-2">
          {canWrite && headerActions.map(a => (
            <button
              key={a.action}
              onClick={() => runSimpleAction(a)}
              disabled={simpleTransition.isPending}
              style={{ height: 34, padding: '0 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: 'none', background: '#C8202A', color: '#fff' }}
            >
              {a.label}
            </button>
          ))}
          {canWrite && DONEABLE.includes(wo.status) && allMarksQcPassed(wo.marks) && (
            <button
              onClick={handleDone}
              disabled={done.isPending}
              style={{ height: 34, padding: '0 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: 'none', background: '#1E6B36', color: '#fff' }}
            >
              {done.isPending ? 'Completing…' : 'Complete'}
            </button>
          )}
          {canWrite && CANCELLABLE.includes(wo.status) && (
            <button
              onClick={() => openReasonModal('cancel')}
              style={{ height: 34, padding: '0 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: '1px solid #E8A0A0', background: '#fff', color: '#C8202A' }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div style={{ background: '#FCEBEB', color: '#C8202A', fontSize: 13, padding: '8px 24px', flexShrink: 0 }}>{actionError}</div>
      )}

      {printedRev != null && Number(printedRev) < (wo.manufacturing_order.revision ?? 0) && (
        <div className="flex items-center gap-2 border-b border-molten-100 bg-molten-50 text-molten-600" style={{ fontSize: 13, fontWeight: 600, padding: '9px 24px', flexShrink: 0 }}>
          <AlertTriangle size={15} /> ใบงานที่สแกนนี้พิมพ์จาก MO Rev.{printedRev} — ตอนนี้ MO เป็น Rev.{wo.manufacturing_order.revision} แล้ว ข้อมูลบนกระดาษอาจไม่ตรง ให้ดูข้อมูลในหน้านี้และขอใบงานใหม่
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border-b border-chrome-100 px-6 flex items-center gap-1" style={{ flexShrink: 0 }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              height: 42, padding: '0 16px', fontSize: 13, fontWeight: 600, background: 'none', cursor: 'pointer',
              border: 'none', borderBottom: '2px solid ' + (tab === t ? '#C8202A' : 'transparent'),
              color: tab === t ? '#C8202A' : '#777',
            }}
          >
            {t}{t === 'Schedule' && <span style={{ color: '#aaa', fontWeight: 400, marginLeft: 4 }}>· view-only</span>}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#F7F7F7' }}>
        {tab === 'Overview' && (
          <OverviewTab
            wo={wo}
            bomList={bomList ?? []}
            onSaveProgress={(markId, body) => updateProgress.mutateAsync({ markId, body })}
            // throwOnError: a failed refetch must reject (the table toasts and
            // keeps the row closed) instead of resolving with the stale marks.
            onReloadMarks={async () => (await refetch({ throwOnError: true })).data?.marks}
            events={events ?? []}
            eventsLoading={eventsLoading}
            savePending={updateProgress.isPending}
            canWrite={canWrite}
            onRemove={(bomAssemblyId, body) => removeMark.mutateAsync({ bom_assembly_id: bomAssemblyId, ...body })}
            onAcceptVersion={(bomAssemblyId, body) => acceptVersion.mutateAsync({ bom_assembly_id: bomAssemblyId, ...body })}
            removePending={removeMark.isPending}
            acceptPending={acceptVersion.isPending}
            onMo={() => navigate(`/mo/${wo.mo_id}`)}
            onEditActualDates={() => { setDatesError(null); setDatesModal({ mode: 'edit' }) }}
          />
        )}
        {tab === 'Schedule' && <ScheduleTab woId={woId} />}
        {tab === 'History' && <HistoryTab woId={woId} marks={wo.marks} />}
        {tab === 'Visual' && (
          <WoVisualTab
            woId={woId}
            marks={wo.marks.filter(m => !m.removed_at).map(m => {
              const d = m.snapshot_dispatch ?? m.bom_assembly.dispatch
              return { bomAssemblyId: m.bom_assembly_id, mark: m.bom_assembly.assembly_mark, projectId: d.project_id, zoneId: d.zone?.id ?? null, subZoneId: d.sub_zone?.id ?? null }
            })}
          />
        )}
      </div>

      {datesModal && (
        <ActualDatesModal
          title={`${datesModal.mode === 'complete' ? 'Complete' : 'Edit Actual Dates'} · ${wo.wo_code}`}
          plan={{ start: wo.plan_start, finish: wo.plan_finish }}
          initial={datesModal.mode === 'edit'
            ? { actual_start: wo.actual_start, actual_finish: wo.actual_finish, timeliness: wo.timeliness, delay_note: wo.delay_note }
            : undefined}
          withTimeliness
          pending={done.isPending || updateActuals.isPending}
          error={datesError}
          onConfirm={submitDates}
          onClose={() => setDatesModal(null)}
        />
      )}

      {/* Pause / Hold / Cancel modal — Cancel additionally shows one
          QcBreakdownFields per mark with output, plus the cascade-cancel
          preview. */}
      {reasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', width: reasonModal.action === 'cancel' ? 480 : 420, maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{REASON_MODAL_LABEL[reasonModal.action]} · {wo.wo_code}</h2>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>A reason is required.</p>
            <textarea
              value={reason} onChange={(e) => setReason(e.target.value)} autoFocus rows={3} placeholder="Reason…"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, resize: 'vertical' }}
            />

            {reasonModal.action === 'cancel' && marksWithOutput.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#999', marginBottom: 6 }}>
                  QC breakdown — marks with output
                </div>
                {marksWithOutput.map(m => (
                  <div key={m.bom_assembly_id} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: '#333' }}>
                      {m.bom_assembly.assembly_mark} <span style={{ fontFamily: 'inherit', fontWeight: 400, color: '#999' }}>(done: {Number(m.qty_done)})</span>
                    </div>
                    <QcBreakdownFields
                      value={cancelBreakdown[m.bom_assembly_id] ?? EMPTY_QC_BREAKDOWN}
                      onChange={(v) => setCancelBreakdown(prev => ({ ...prev, [m.bom_assembly_id]: v }))}
                      max={Number(m.qty_done)}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Cascade-cancel preview (Task 10, Sprint 20) — only shown when
                this WO has siblings (same mo_id, sharing >=1 mark, other
                routing ops). Common case (single-op routing) leaves the
                modal untouched. */}
            {reasonModal.action === 'cancel' && hasCancelSiblings && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {toCancelSiblings.length > 0 && (
                  <div style={{ background: '#FFF5F5', border: '1px solid #F3C6C6', borderRadius: 6, padding: '10px 12px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#8A2A0D', marginBottom: 6 }}>
                      This will also cancel {toCancelSiblings.length} related work order{toCancelSiblings.length > 1 ? 's' : ''}:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {toCancelSiblings.map((s) => (
                        <li key={s.id} style={{ fontSize: 12, color: '#6B3417' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{s.wo_code}</span> · seq {s.sequence} · {s.status}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {needsDispositionSiblings.length > 0 && (
                  <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '10px 12px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 6 }}>
                      Already produced — not cancelled:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {needsDispositionSiblings.map((s) => (
                        <div key={s.id} className="flex items-center justify-between" style={{ fontSize: 12, color: '#6B4A17' }}>
                          <span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{s.wo_code}</span> · qty done {siblingQtyDone(s)}
                          </span>
                          <button
                            disabled
                            title="Disposition not yet supported"
                            style={{ height: 24, padding: '0 10px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: '1px solid #DDD', background: '#F0F0F0', color: '#AAA', cursor: 'not-allowed' }}
                          >
                            Move to Stock
                          </button>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: '#92400E', marginTop: 6 }}>Already produced — disposition not yet supported.</div>
                  </div>
                )}
              </div>
            )}

            {modalError && <div style={{ color: '#C8202A', fontSize: 12, marginTop: 10 }}>{modalError}</div>}

            <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
              <button onClick={closeReasonModal} style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>Close</button>
              <button
                onClick={submitReasonModal}
                disabled={simpleTransition.isPending || cancel.isPending || !canSubmitReasonModal}
                style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: '#C8202A', color: '#fff', cursor: 'pointer', opacity: !canSubmitReasonModal ? 0.6 : 1 }}
              >
                {simpleTransition.isPending || cancel.isPending ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid #E8E8E8', borderRadius: 10, background: '#fff', padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#999', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex" style={{ fontSize: 13, padding: '5px 0' }}>
      <span style={{ width: 170, color: '#888', flexShrink: 0 }}>{k}</span>
      <span style={{ color: '#1A1A1A', fontWeight: 500 }}>{v}</span>
    </div>
  )
}

function fmtDuration(min: number) {
  if (min <= 0) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

function Chip({ icon, text, bg, color, border }: { icon: React.ReactNode; text: string; bg: string; color: string; border: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color, background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: '2px 8px' }}>
      <span style={{ display: 'flex', opacity: 0.8 }}>{icon}</span>
      {text}
    </span>
  )
}

// Operation-level snapshot — activities/tools/skills/consumable NAMES are
// shared across every mark on this WO; only their per-mark quantities
// (duration_breakdown, consumable driver dims) differ, and those now live
// on each WoMark instead of here (multi-mark redesign, 2026-09-17).
function RoutingSnapshotCard({ rop, wo }: { rop: SourceRoutingOp; wo: WoDetailT }) {
  const color = rop.op_type?.color ?? '#9CA3AF'
  const timeModeLabel = rop.time_mode === 'formula' ? 'Formula' : rop.time_mode === 'manual' ? 'Manual' : rop.time_mode === 'by_activities' ? 'By Activities' : rop.time_mode

  return (
    <Card title="Operation">
      {/* Op header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: color, fontSize: 12, fontWeight: 800, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {String(wo.sequence).padStart(2, '0')}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>{rop.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#666' }}>{wo.mrp_workcenter.name}</span>
            {wo.mrp_workcenter.machine && (
              <>
                <span style={{ fontSize: 10, color: '#DDD' }}>·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#1565C0' }}>
                  <Cpu size={10} />{wo.mrp_workcenter.machine}
                </span>
              </>
            )}
            <span style={{ fontSize: 10, color: '#DDD' }}>·</span>
            <span style={{ fontSize: 10, color: '#888', background: '#F0F0F0', borderRadius: 4, padding: '1px 5px' }}>{timeModeLabel}</span>
            {rop.time_mode === 'formula' && rop.formula_expr && (
              <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#555', background: '#F5F5F5', borderRadius: 3, padding: '0 5px' }}>{rop.formula_expr}</span>
            )}
            {rop.time_mode === 'manual' && (
              <span style={{ fontSize: 10, color: '#555' }}>{rop.time_cycle_manual ?? rop.time_cycle ?? 0} min</span>
            )}
          </div>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A', background: '#F0F0F0', borderRadius: 6, padding: '3px 12px', flexShrink: 0 }}>
          {fmtDuration(wo.expected_duration_min)}
        </span>
      </div>

      {/* Activities */}
      {rop.activities.length > 0 && (
        <div style={{ borderTop: '1px solid #F0F0F0', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rop.activities.map((act, i) => {
            const labors = act.labors ?? []
            const tools = act.tools ?? []
            const consumables = act.consumables ?? []
            const hasResources = labors.length + tools.length + consumables.length > 0
            return (
              <div key={i} style={{ background: '#F8F8F8', borderRadius: 8, padding: '9px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: hasResources ? 7 : 0 }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#ECECEC', fontSize: 9, fontWeight: 700, color: '#888', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#2A2A2A' }}>{act.name}</span>
                  {act.measure && <span style={{ fontSize: 10, color: '#888', background: '#ECECEC', borderRadius: 5, padding: '1px 6px' }}>{act.measure}</span>}
                  {act.per_minute != null && act.per_minute > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#2E7D32', background: '#E8F5E9', border: '1px solid #A5D6A7', borderRadius: 5, padding: '1px 6px', marginLeft: 'auto' }}>
                      {act.per_minute}/min
                    </span>
                  )}
                </div>
                {hasResources && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {labors.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: '#166534', background: '#DCFCE7', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>SKILL</span>
                        {labors.map((l, li) => <Chip key={li} icon={<Users size={10} />} text={`${l.skill}${l.level ? ` (${l.level})` : ''} ×${l.qty}`} bg="#F0FDF4" color="#166534" border="#BBF7D0" />)}
                      </div>
                    )}
                    {tools.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: '#1E40AF', background: '#DBEAFE', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>TOOL</span>
                        {tools.map((t, ti) => <Chip key={ti} icon={<Wrench size={10} />} text={`${t.name} ×${t.qty}`} bg="#EFF6FF" color="#1E40AF" border="#BFDBFE" />)}
                      </div>
                    )}
                    {consumables.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: '#92400E', background: '#FEF3C7', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>USE</span>
                        {consumables.map((c, ci) => (
                          <Chip key={ci} icon={<FlaskConical size={10} />} text={`${c.name}${c.formula_expr ? ` · ${c.formula_expr} ${c.result_unit ?? ''}`.trim() : ''}`} bg="#FFFBEB" color="#92400E" border="#FDE68A" />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// Plan-vs-actual material consume (2026-09-17). qty_planned is server-computed
// (recomputed automatically whenever the WO's marks change) and shown
// read-only; qty_actual is editable here with no upper bound — real material
// usage can exceed the plan. Self-contained (owns its own edit buffer + save
// mutation) since, unlike the Marks table, saving actuals isn't gated behind
// the Done action — it can be recorded any time.
// Read-only (2026-09-22) — user: "consume ไม่ควรแก้ไขได้หลังจาก กดสร้าง wo
// แล้ว". Actuals are set once, at WO-create time (Create WO modal's Consume
// picker — auto-computed where a formula exists, typed in by hand where it
// doesn't); this card just shows what was recorded, no longer edits it.
function ConsumeCard({ wo }: { wo: import('../api/wo').WoDetail }) {
  const rows = wo.consumes
  const hdr = { fontSize: 10, fontWeight: 700, color: '#999', letterSpacing: '0.05em' } as const

  return (
    <Card title="Consume — Plan vs Actual">
      {!rows.length ? (
        <span style={{ color: '#B0B0B0', fontSize: 13 }}>No consumable materials for this work order.</span>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 70px 70px 50px', gap: 8, padding: '4px 0 6px', borderBottom: '1px solid #F0F0F0' }}>
          <span style={hdr}>CODE</span>
          <span style={hdr}>MATERIAL</span>
          <span style={{ ...hdr, textAlign: 'right' }}>PLAN</span>
          <span style={{ ...hdr, textAlign: 'right' }}>ACTUAL</span>
          <span style={hdr}>UNIT</span>
        </div>
      )}
      {rows.map((r, i) => (
        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 70px 70px 50px', gap: 8, padding: '6px 0', borderBottom: i < rows.length - 1 ? '1px solid #F9F9F9' : 'none', alignItems: 'center' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.material.default_code}</span>
          <span style={{ fontSize: 12, color: '#1A1A1A' }}>{r.material.name}</span>
          <span style={{ fontSize: 12, color: '#888', textAlign: 'right' }}>{Math.round(Number(r.qty_planned))}</span>
          <span style={{ fontSize: 12, color: '#1A1A1A', textAlign: 'right' }}>{Math.round(Number(r.qty_actual))}</span>
          <span style={{ fontSize: 11, color: '#666' }}>{r.unit ?? '—'}</span>
        </div>
      ))}
    </Card>
  )
}

function OverviewTab({
  wo, bomList, onSaveProgress, onReloadMarks, events, eventsLoading, savePending, canWrite, onRemove, onAcceptVersion, removePending, acceptPending,
  onMo, onEditActualDates,
}: {
  wo: WoDetailT
  bomList: import('../api/wo').BomVersionStatus[]
  onSaveProgress: (markId: number, body: MarkProgressValues & { expected: MarkProgressExpected }) => Promise<unknown>
  onReloadMarks: () => Promise<WoMark[] | undefined>
  events: WoEvent[]
  eventsLoading: boolean
  savePending: boolean
  canWrite: boolean
  onRemove: (bomAssemblyId: number, body: { reason: string; qty_qc_passed?: number; qty_rework?: number; qty_renew?: number }) => Promise<unknown>
  onAcceptVersion: (bomAssemblyId: number, body: { note?: string; qty_qc_passed?: number; qty_rework?: number; qty_renew?: number; apply_to_other_wos?: boolean }) => Promise<unknown>
  removePending: boolean
  acceptPending: boolean
  onMo: () => void
  onEditActualDates: () => void
}) {
  const rop = wo.source_routing_op
  const activeMarks = wo.marks.filter(m => !m.removed_at)
  const outdatedCount = activeMarks.filter(m => bomList.find(b => b.bom_assembly_id === m.bom_assembly_id)?.is_outdated).length

  return (
    <>
      <Card title="MO Context">
        <Row k="Manufacturing Order" v={<button onClick={onMo} style={{ color: '#0C447C', fontFamily: 'monospace', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{wo.manufacturing_order.mo_code}</button>} />
        <Row k="Marks" v={`${activeMarks.length} mark${activeMarks.length === 1 ? '' : 's'}${outdatedCount > 0 ? ` · ${outdatedCount} outdated` : ''}`} />
      </Card>

      {rop
        ? <RoutingSnapshotCard rop={rop} wo={wo} />
        : (
          <Card title="Operation">
            <span style={{ fontSize: 13, color: '#AAA' }}>No routing operation linked.</span>
          </Card>
        )
      }

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#999', marginBottom: 8 }}>Marks</div>
        <WoMarksTable
          marks={wo.marks}
          bomVersionStatus={bomList}
          onSaveProgress={onSaveProgress}
          onReloadMarks={onReloadMarks}
          events={events}
          eventsLoading={eventsLoading}
          savePending={savePending}
          canEditQty={canWrite && (wo.status === 'IN_PROGRESS' || wo.status === 'PAUSED')}
          canModify={canWrite && wo.status !== 'DONE' && wo.status !== 'CANCELLED'}
          onRemove={onRemove}
          onAcceptVersion={onAcceptVersion}
          removePending={removePending}
          acceptPending={acceptPending}
        />
      </div>

      <ConsumeCard wo={wo} />

      <Card title="Execution">
        <Row k="Released" v={wo.released_at ? `${fmtDateTime(wo.released_at)} · ${wo.released_by ?? ''}` : '—'} />
        <Row k="Plan Start" v={fmtDateTime(wo.plan_start)} />
        <Row k="Plan Finish" v={<>{fmtDateTime(wo.plan_finish)} <DaysRemainingBadge planFinish={wo.plan_finish} /></>} />
        <Row k="Actual Start" v={<>{fmtDateTime(wo.actual_start)}{canWrite && wo.status === 'DONE' && <EditActualDatesButton onClick={onEditActualDates} />}</>} />
        <Row k="Actual Finish" v={fmtDateTime(wo.actual_finish)} />
        <Row k="Result" v={wo.timeliness === 'ON_PLAN' ? 'On Plan' : wo.timeliness === 'DELAYED' ? 'Delayed' : '—'} />
        {wo.timeliness === 'DELAYED' && <Row k="Delay Reason" v={<span style={{ whiteSpace: 'pre-wrap' }}>{wo.delay_note || '—'}</span>} />}
        <Row k="Team" v={wo.subcontractor?.name ?? wo.assigned_to ?? '—'} />
        <Row k="Notes" v={wo.notes || '—'} />
      </Card>
      <Card title="Audit">
        <Row k="Created" v={`${fmtDateTime(wo.created_at)} · ${wo.created_by}`} />
        <Row k="Last write" v={`${fmtDateTime(wo.updated_at)} · ${wo.updated_by ?? '—'}`} />
      </Card>
    </>
  )
}

function ScheduleTab({ woId }: { woId: number }) {
  const { data, isLoading } = useWoSchedule(woId)
  if (isLoading) return <Loader2 size={18} className="animate-spin" style={{ color: '#C2C2C2' }} />
  const groups = data ?? []
  if (!groups.length) return <div style={{ color: '#8E8E8E', fontSize: 13 }}>No schedule rows yet. The APS service will populate these.</div>
  return (
    <>
      {groups.map((g) => (
        <div key={g.version.id} style={{ border: '1px solid ' + (g.version.is_active ? '#1E6B36' : '#E8E8E8'), borderRadius: 10, background: '#fff', padding: '14px 18px', marginBottom: 14 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{g.version.version_code}</span>
            {g.version.is_active && <span style={{ background: '#E3F4E8', color: '#1E6B36', borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>Active</span>}
            {g.version.scheduler_source && <span style={{ color: '#999', fontSize: 11 }}>· {g.version.scheduler_source}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#999', borderBottom: '1px solid #EEE', paddingBottom: 6 }}>
            <div>Start</div><div>End</div><div>Workcenter Line</div>
          </div>
          {g.rows.map((r) => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: 13, padding: '8px 0', borderBottom: '1px solid #F4F4F4' }}>
              <div>{fmtDateTime(r.start_datetime)}</div>
              <div>{fmtDateTime(r.end_datetime)}</div>
              <div style={{ color: '#555' }}>{r.workcenter_line ? `${r.workcenter_line.code} · ${r.workcenter_line.name}` : '—'}</div>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

function HistoryTab({ woId, marks }: { woId: number; marks: WoMark[] }) {
  const { data, isLoading } = useWoEvents(woId)
  const markList = useMemo(() => marks.map(m => ({ id: m.id, mark: m.bom_assembly.assembly_mark })), [marks])
  if (isLoading) return <Loader2 size={18} className="animate-spin" style={{ color: '#C2C2C2' }} />
  if (!data?.length) return <div style={{ color: '#8E8E8E', fontSize: 13 }}>ยังไม่มีประวัติ</div>
  return <WoHistoryTimeline events={data} marks={markList} />
}
