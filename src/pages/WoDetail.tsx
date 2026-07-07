import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, AlertTriangle, Cpu, Wrench, FlaskConical, Users, Clock } from 'lucide-react'
import {
  useWo, useWoEvents, useWoSchedule, useBomVersionStatus,
  useWoTransition, useAcceptNewVersion,
} from '../hooks/useWo'
import { WoStatusPill } from '../components/wo/WoStatusPill'
import { QtyReusableField, WoHoldResolutionModal, qtyReusableValid } from '../components/wo/WoHoldResolutionModal'
import type { WoAction, WoStatus, WoDetail as WoDetailT, SourceRoutingOp } from '../api/wo'

const TABS = ['Overview', 'Schedule', 'Events'] as const
type Tab = (typeof TABS)[number]

// 'accept-hold' is a frontend-only pseudo-action (ON_HOLD resolution, opens
// WoHoldResolutionModal) — it doesn't map to a woTransition() WoAction; the
// real endpoint is acceptNewVersion() (POST /wo/:id/accept-new-version).
type ActionDef = { action: WoAction | 'accept-hold'; label: string; danger?: boolean; needs?: 'reason' | 'qty' }

// Context-aware actions per status (T-WO.05 mirror · sticky header buttons)
const ACTIONS: Record<WoStatus, ActionDef[]> = {
  NOT_STARTED: [{ action: 'release', label: 'Release' }, { action: 'cancel', label: 'Cancel', danger: true, needs: 'reason' }],
  RELEASED: [{ action: 'start', label: 'Start' }, { action: 'cancel', label: 'Cancel', danger: true, needs: 'reason' }],
  IN_PROGRESS: [{ action: 'pause', label: 'Pause', needs: 'reason' }, { action: 'done', label: 'Complete', needs: 'qty' }, { action: 'cancel', label: 'Cancel', danger: true, needs: 'reason' }],
  PAUSED: [{ action: 'resume', label: 'Resume' }, { action: 'done', label: 'Complete', needs: 'qty' }, { action: 'cancel', label: 'Cancel', danger: true, needs: 'reason' }],
  // ON_HOLD (WO BOM-Version Hold, Sprint 20): only Accept or Cancel — no passive
  // dismiss. Accept is hidden at render time when delta_types includes REMOVED
  // (see headerActions below) — the backend 409s on accept for a removed assembly.
  ON_HOLD: [{ action: 'accept-hold', label: 'Accept' }, { action: 'cancel', label: 'Cancel', danger: true, needs: 'reason' }],
  DONE: [],
  CANCELLED: [],
}

function fmtDateTime(d: string | null) {
  return d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}
function fmtDay(d: string | null) {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'
}

export function WoDetail() {
  const { id } = useParams<{ id: string }>()
  const woId = Number(id)
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('Overview')
  const [modal, setModal] = useState<ActionDef | null>(null)
  const [reason, setReason] = useState('')
  const [qtyDone, setQtyDone] = useState('')
  const [qtyScrap, setQtyScrap] = useState('')
  const [qtyReusable, setQtyReusable] = useState('')
  const [dismissedBanner, setDismissedBanner] = useState(false)
  const [showAcceptModal, setShowAcceptModal] = useState(false)

  const { data: wo, isLoading } = useWo(woId)
  const { data: bom } = useBomVersionStatus(woId)
  const transition = useWoTransition(woId)
  const acceptVersion = useAcceptNewVersion(woId)

  if (isLoading || !wo) {
    return <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 56px)' }}><Loader2 size={22} className="animate-spin" style={{ color: '#C2C2C2' }} /></div>
  }

  const qtyDoneNum = wo.qty_done != null ? Number(wo.qty_done) : 0
  // Cancel-with-qty_reusable is a general rule (any status, whenever qty_done > 0)
  // — not ON_HOLD-specific — matching the backend guard in transition().
  const cancelNeedsQtyReusable = qtyDoneNum > 0

  function runAction(def: ActionDef) {
    if (def.action === 'accept-hold') {
      setShowAcceptModal(true)
      return
    }
    // `def.action` narrowed to WoAction here (accept-hold excluded above).
    if (def.needs) {
      setReason(''); setQtyDone(''); setQtyScrap(''); setQtyReusable(''); setModal(def)
    } else {
      transition.mutate({ action: def.action })
    }
  }

  async function submitModal() {
    if (!modal || modal.action === 'accept-hold') return
    if (modal.needs === 'reason') {
      if (!reason.trim()) return
      const isCancel = modal.action === 'cancel'
      if (isCancel && cancelNeedsQtyReusable && !qtyReusableValid(qtyReusable, qtyDoneNum)) return
      await transition.mutateAsync({
        action: modal.action,
        body: {
          reason: reason.trim(),
          ...(isCancel && cancelNeedsQtyReusable ? { qty_reusable: Number(qtyReusable) } : {}),
        },
      })
    } else if (modal.needs === 'qty') {
      if (qtyDone === '') return
      await transition.mutateAsync({
        action: modal.action,
        body: { qty_done: Number(qtyDone), qty_scrapped: qtyScrap ? Number(qtyScrap) : undefined },
      })
    }
    setModal(null)
  }

  // Informational stale-version banner — only for WOs that are NOT (yet/still)
  // ON_HOLD. ON_HOLD gets its own blocking banner below (distinct treatment:
  // no dismiss, no "continue with snapshot" escape hatch).
  const showBanner = bom?.is_outdated && !dismissedBanner && wo.status !== 'CANCELLED' && wo.status !== 'DONE' && wo.status !== 'ON_HOLD'
  // Accept is unavailable once the assembly was REMOVED in the latest version
  // (backend 409s) — hide it entirely rather than show a disabled button.
  const headerActions = ACTIONS[wo.status].filter((a) => a.action !== 'accept-hold' || !bom?.delta_types.includes('REMOVED'))

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Sticky header */}
      <div className="bg-white flex items-center gap-3 border-b border-chrome-100 px-6" style={{ minHeight: 56, flexShrink: 0 }}>
        <button onClick={() => navigate('/order?tab=wo')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', display: 'flex' }}><ArrowLeft size={18} /></button>
        <span style={{ fontFamily: 'monospace', fontSize: 17, fontWeight: 700, color: '#1A1A1A' }}>{wo.wo_code}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#C8202A', background: '#FCEBEB', borderRadius: 4, padding: '1px 7px' }}>{wo.mark_prefix?.code}</span>
        <WoStatusPill status={wo.status} />
        {bom?.is_outdated && (
          <span title="Newer BOM version available" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#C62828', fontSize: 11, fontWeight: 700 }}>
            <AlertTriangle size={12} /> BOM outdated
          </span>
        )}
        <div style={{ flex: 1 }} />
        <div className="flex items-center gap-2">
          {headerActions.map((a) => (
            <button
              key={a.action}
              onClick={() => runAction(a)}
              disabled={transition.isPending || acceptVersion.isPending}
              style={{
                height: 34, padding: '0 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                border: a.danger ? '1px solid #E8A0A0' : 'none',
                background: a.action === 'accept-hold' ? '#1E6B36' : a.danger ? '#fff' : '#C8202A',
                color: a.danger ? '#C8202A' : '#fff',
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* ON_HOLD blocking banner — system-imposed, cannot proceed without resolving.
          Distinct from the informational stale-version banner below (no dismiss,
          no "continue with snapshot" escape hatch): the WO is genuinely stuck. */}
      {wo.status === 'ON_HOLD' && bom && (
        <div style={{ background: '#FDEAE3', borderBottom: '2px solid #C8202A', padding: '14px 24px', flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#8A2A0D', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} /> ON HOLD — BOM change requires resolution
          </div>
          <div style={{ fontSize: 12, color: '#6B3417', marginBottom: 8 }}>
            Assembly <strong>{bom.assembly_mark}</strong> changed in dispatch #{bom.latest_dispatch_id}: {bom.delta_types.join(' · ') || 'unspecified change'}.
            This work order cannot proceed until you accept the new BOM version or cancel it.
            {bom.delta_types.includes('REMOVED') && ' The assembly was removed from the latest BOM version — accepting is unavailable; cancel is the only option.'}
          </div>
          <div className="flex items-center gap-2">
            {!bom.delta_types.includes('REMOVED') && (
              <button
                onClick={() => setShowAcceptModal(true)}
                disabled={acceptVersion.isPending}
                style={{ height: 30, padding: '0 14px', fontSize: 12, fontWeight: 600, borderRadius: 5, border: 'none', cursor: 'pointer', background: '#1E6B36', color: '#fff' }}
              >
                Accept new version
              </button>
            )}
            <button
              onClick={() => runAction({ action: 'cancel', label: 'Cancel', danger: true, needs: 'reason' })}
              style={{ height: 30, padding: '0 14px', fontSize: 12, fontWeight: 600, borderRadius: 5, border: '1px solid #E8A0A0', background: '#fff', color: '#C8202A', cursor: 'pointer' }}
            >
              Cancel WO
            </button>
          </div>
        </div>
      )}

      {/* BOM Version Alert banner (informational — non-ON_HOLD stale WOs only) */}
      {showBanner && bom && (
        <div style={{ background: '#FFEBEE', borderBottom: '1px solid #EF9A9A', padding: '14px 24px', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#C62828', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} /> Newer BOM version available · using snapshot dispatch #{bom.snapshot_dispatch_id}
          </div>
          <div style={{ fontSize: 12, color: '#5D4037', marginBottom: 8 }}>
            Assembly <strong>{bom.assembly_mark}</strong> changed in dispatch #{bom.latest_dispatch_id}: {bom.delta_types.join(' · ') || 'no field-level change'}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => acceptVersion.mutate({})}
              disabled={acceptVersion.isPending || bom.delta_types.includes('REMOVED')}
              title={bom.delta_types.includes('REMOVED') ? 'Assembly removed — cancel the WO instead' : ''}
              style={{ height: 30, padding: '0 14px', fontSize: 12, fontWeight: 600, borderRadius: 5, border: 'none', cursor: 'pointer', background: bom.delta_types.includes('REMOVED') ? '#C2C2C2' : '#1E6B36', color: '#fff' }}
            >
              {acceptVersion.isPending ? 'Accepting…' : 'Accept new version'}
            </button>
            <button onClick={() => setDismissedBanner(true)} style={{ height: 30, padding: '0 14px', fontSize: 12, fontWeight: 600, borderRadius: 5, border: '1px solid #C2C2C2', background: '#fff', color: '#555', cursor: 'pointer' }}>
              Continue with snapshot
            </button>
            <button onClick={() => runAction({ action: 'cancel', label: 'Cancel', danger: true, needs: 'reason' })} style={{ height: 30, padding: '0 14px', fontSize: 12, fontWeight: 600, borderRadius: 5, border: '1px solid #E8A0A0', background: '#fff', color: '#C8202A', cursor: 'pointer' }}>
              Cancel WO
            </button>
          </div>
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
        {tab === 'Overview' && <OverviewTab wo={wo} bomOutdated={!!bom?.is_outdated} onMo={() => navigate(`/mo/${wo.mo_id}`)} />}
        {tab === 'Schedule' && <ScheduleTab woId={woId} />}
        {tab === 'Events' && <EventsTab woId={woId} />}
      </div>

      {/* Action modal (reason / qty) */}
      {modal && modal.action !== 'accept-hold' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', width: 420 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{modal.label} · {wo.wo_code}</h2>
            {modal.needs === 'reason' ? (
              <>
                <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>A reason is required.</p>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus rows={3} placeholder="Reason…"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, resize: 'vertical' }} />
                {modal.action === 'cancel' && cancelNeedsQtyReusable && (
                  <QtyReusableField value={qtyReusable} onChange={setQtyReusable} max={qtyDoneNum} />
                )}
              </>
            ) : (
              <>
                <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Qty done is required.</p>
                <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Qty done *</label>
                <input value={qtyDone} onChange={(e) => setQtyDone(e.target.value)} autoFocus type="number" min={0}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, marginBottom: 10 }} />
                <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Qty scrapped</label>
                <input value={qtyScrap} onChange={(e) => setQtyScrap(e.target.value)} type="number" min={0}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }} />
              </>
            )}
            <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
              <button onClick={() => setModal(null)} style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={submitModal}
                disabled={
                  transition.isPending ||
                  (modal.needs === 'reason'
                    ? !reason.trim() || (modal.action === 'cancel' && cancelNeedsQtyReusable && !qtyReusableValid(qtyReusable, qtyDoneNum))
                    : qtyDone === '')
                }
                style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: '#C8202A', color: '#fff', cursor: 'pointer', opacity: transition.isPending ? 0.6 : 1 }}
              >
                {transition.isPending ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accept-new-version resolution form (ON_HOLD only — note required, qty_reusable conditional) */}
      {showAcceptModal && bom && (
        <WoHoldResolutionModal
          wo={wo}
          bom={bom}
          isPending={acceptVersion.isPending}
          onClose={() => setShowAcceptModal(false)}
          onSubmit={async (body) => {
            await acceptVersion.mutateAsync(body)
            setShowAcceptModal(false)
          }}
        />
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

type ConsumeEntry = { resource_id: number; code: string; name: string; formula_name?: string | null; formula_unit?: string | null; consume_rate?: number | null; consume_unit?: string | null }

function RoutingSnapshotCard({ rop, wo }: { rop: SourceRoutingOp; wo: WoDetailT }) {
  const bom = wo.bom_assembly
  const color = rop.op_type?.color ?? '#9CA3AF'
  const timeModeLabel = rop.time_mode === 'formula' ? 'Formula' : rop.time_mode === 'manual' ? 'Manual' : rop.time_mode === 'by_activities' ? 'By Activities' : rop.time_mode

  const BOM_VARS: Record<string, number> = {
    cut_length_mm: Number(bom.length_mm ?? 0), weld_length_mm: Number(bom.length_mm ?? 0),
    edge_length_mm: Number(bom.length_mm ?? 0), bevel_length_mm: Number(bom.length_mm ?? 0),
    sumNet_surface_area: Number(bom.surface_area_m2 ?? 0), product_area: Number(bom.surface_area_m2 ?? 0),
    sumWeight: Number(bom.weight_kg ?? 0),
  }
  function calcQty(c: ConsumeEntry): string | null {
    if (!c.consume_rate || !c.formula_name) return null
    const driver = BOM_VARS[c.formula_name]
    if (!driver) return null
    const qty = driver * c.consume_rate
    const rounded = qty < 1 ? parseFloat(qty.toFixed(3)) : parseFloat(qty.toFixed(2))
    return `${rounded} ${c.consume_unit ?? ''}`
  }

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
                        {consumables.map((c, ci) => {
                          const qty = calcQty(c)
                          return <Chip key={ci} icon={<FlaskConical size={10} />} text={`${c.name}${c.formula_expr ? ` · ${c.formula_expr} ${c.result_unit ?? ''}`.trim() : (qty ? ` = ${qty}` : '')}`} bg="#FFFBEB" color="#92400E" border="#FDE68A" />
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {/* Duration breakdown */}
      {rop.duration_breakdown?.length > 0 && (
        <div style={{ borderTop: '1px solid #F0F0F0', paddingTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
            <Clock size={11} style={{ color: '#888' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: '0.06em' }}>DURATION BREAKDOWN</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #F0F0F0' }}>
                <th style={{ textAlign: 'left', padding: '3px 6px 4px 0', color: '#999', fontWeight: 600, fontSize: 10 }}>Activity</th>
                <th style={{ textAlign: 'left', padding: '3px 6px 4px', color: '#999', fontWeight: 600, fontSize: 10 }}>Dimension</th>
                <th style={{ textAlign: 'right', padding: '3px 6px 4px', color: '#999', fontWeight: 600, fontSize: 10 }}>Rate</th>
                <th style={{ textAlign: 'right', padding: '3px 0 4px 6px', color: '#999', fontWeight: 600, fontSize: 10 }}>min</th>
              </tr>
            </thead>
            <tbody>
              {rop.duration_breakdown.map((row, i) => (
                <tr key={i} style={{ borderBottom: i < rop.duration_breakdown.length - 1 ? '1px solid #FAFAFA' : 'none', background: row.is_setup ? '#FAFAFA' : 'transparent' }}>
                  <td style={{ padding: '4px 6px 4px 0', color: row.is_setup ? '#888' : '#1A1A1A' }}>
                    {row.is_setup && <span style={{ fontSize: 9, color: '#999', background: '#F0F0F0', borderRadius: 3, padding: '1px 4px', marginRight: 4 }}>SETUP</span>}
                    {row.name}
                  </td>
                  <td style={{ padding: '4px 6px', color: '#555', fontSize: 10 }}>
                    {row.formula_code && row.formula_code !== 'fixed' && (
                      <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#999', background: '#F4F4F4', border: '1px solid #E8E8E8', borderRadius: 3, padding: '1px 4px', marginRight: 5, display: 'inline-block' }}>{row.formula_code}</span>
                    )}
                    <span style={{ fontFamily: 'monospace' }}>{row.dimension_label}</span>
                  </td>
                  <td style={{ padding: '4px 6px', color: '#555', textAlign: 'right', fontFamily: 'monospace', fontSize: 10 }}>
                    {row.per_minute != null && row.per_minute > 0 && !row.is_setup ? `${row.per_minute}/min` : '—'}
                  </td>
                  <td style={{ padding: '4px 0 4px 6px', fontWeight: 700, textAlign: 'right', color: row.is_setup ? '#888' : '#1A1A1A' }}>
                    {row.minutes}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #E8E8E8' }}>
                <td colSpan={2} style={{ padding: '5px 6px 2px 0', fontSize: 10, color: '#666' }}>
                  setup {wo.setup_time_min} min · run {wo.expected_duration_min} min
                </td>
                <td style={{ padding: '5px 6px 2px', textAlign: 'right', fontSize: 10, color: '#666' }}>total</td>
                <td style={{ padding: '5px 0 2px 6px', fontWeight: 800, textAlign: 'right', color: '#1A1A1A' }}>
                  {(wo.setup_time_min ?? 0) + wo.expected_duration_min}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function OverviewTab({ wo, bomOutdated, onMo }: { wo: WoDetailT; bomOutdated: boolean; onMo: () => void }) {
  const d = wo.snapshot_dispatch ?? wo.bom_assembly.dispatch
  const rop = wo.source_routing_op
  return (
    <>
      <Card title="MO Context">
        <Row k="Manufacturing Order" v={<button onClick={onMo} style={{ color: '#0C447C', fontFamily: 'monospace', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{wo.manufacturing_order.mo_code}</button>} />
        <Row k="Assembly" v={<span style={{ fontFamily: 'monospace' }}>{wo.bom_assembly.assembly_mark}{wo.bom_assembly.name ? ` · ${wo.bom_assembly.name}` : ''}</span>} />
        <Row k="Project / Zone" v={[d?.project?.name, d?.zone?.label, d?.sub_zone?.name].filter(Boolean).join(' · ') || '—'} />
        <Row k="BOM Version (snapshot)" v={<>dispatch #{wo.bom_dispatch_id_snapshot}{bomOutdated && <span style={{ background: '#FFEBEE', color: '#C62828', borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700, marginLeft: 6 }}>⚠ newer</span>}</>} />
      </Card>

      {rop
        ? <RoutingSnapshotCard rop={rop} wo={wo} />
        : (
          <Card title="Operation">
            <span style={{ fontSize: 13, color: '#AAA' }}>No routing operation linked.</span>
          </Card>
        )
      }

      <Card title="Execution">
        <Row k="Released" v={wo.released_at ? `${fmtDateTime(wo.released_at)} · ${wo.released_by ?? ''}` : '—'} />
        <Row k="Actual Start" v={fmtDateTime(wo.actual_start_at)} />
        <Row k="Actual End" v={fmtDateTime(wo.actual_end_at)} />
        <Row k="Earliest Start" v={fmtDay(wo.earliest_start_at)} />
        <Row k="Target End" v={fmtDay(wo.target_end_at)} />
        <Row k="Qty Done" v={wo.qty_done ?? '—'} />
        <Row k="Qty Scrapped" v={wo.qty_scrapped ?? '—'} />
        <Row k="Assigned To" v={wo.assigned_to || '—'} />
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

const EVENT_LABEL: Record<string, string> = {
  START: 'Started', PAUSE: 'Paused', RESUME: 'Resumed', DONE: 'Completed', CANCEL: 'Cancelled', ACCEPT_VERSION: 'Accepted BOM version',
}

function EventsTab({ woId }: { woId: number }) {
  const { data, isLoading } = useWoEvents(woId)
  if (isLoading) return <Loader2 size={18} className="animate-spin" style={{ color: '#C2C2C2' }} />
  const rows = data ?? []
  if (!rows.length) return <div style={{ color: '#8E8E8E', fontSize: 13 }}>No events yet.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {rows.map((e, i) => (
        <div key={e.id} className="flex gap-3" style={{ position: 'relative', paddingBottom: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: '#C8202A', marginTop: 4 }} />
            {i < rows.length - 1 && <div style={{ width: 2, flex: 1, background: '#E0E0E0', marginTop: 2 }} />}
          </div>
          <div style={{ paddingBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{EVENT_LABEL[e.event_type] ?? e.event_type}</div>
            {e.notes && <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{e.notes}</div>}
            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{fmtDateTime(e.recorded_at)} · {e.recorded_by}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
