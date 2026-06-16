import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react'
import {
  useWo, useWoEvents, useWoSchedule, useBomVersionStatus,
  useWoTransition, useAcceptNewVersion,
} from '../hooks/useWo'
import { WoStatusPill } from '../components/wo/WoStatusPill'
import type { WoAction, WoStatus, WoDetail as WoDetailT } from '../api/wo'

const TABS = ['Overview', 'Schedule', 'Events'] as const
type Tab = (typeof TABS)[number]

type ActionDef = { action: WoAction; label: string; danger?: boolean; needs?: 'reason' | 'qty' }

// Context-aware actions per status (T-WO.05 mirror · sticky header buttons)
const ACTIONS: Record<WoStatus, ActionDef[]> = {
  NOT_STARTED: [{ action: 'release', label: 'Release' }, { action: 'cancel', label: 'Cancel', danger: true, needs: 'reason' }],
  RELEASED: [{ action: 'start', label: 'Start' }, { action: 'cancel', label: 'Cancel', danger: true, needs: 'reason' }],
  IN_PROGRESS: [{ action: 'pause', label: 'Pause', needs: 'reason' }, { action: 'done', label: 'Complete', needs: 'qty' }, { action: 'cancel', label: 'Cancel', danger: true, needs: 'reason' }],
  PAUSED: [{ action: 'resume', label: 'Resume' }, { action: 'done', label: 'Complete', needs: 'qty' }, { action: 'cancel', label: 'Cancel', danger: true, needs: 'reason' }],
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
  const [dismissedBanner, setDismissedBanner] = useState(false)

  const { data: wo, isLoading } = useWo(woId)
  const { data: bom } = useBomVersionStatus(woId)
  const transition = useWoTransition(woId)
  const acceptVersion = useAcceptNewVersion(woId)

  if (isLoading || !wo) {
    return <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 56px)' }}><Loader2 size={22} className="animate-spin" style={{ color: '#C2C2C2' }} /></div>
  }

  function runAction(def: ActionDef) {
    if (def.needs) {
      setReason(''); setQtyDone(''); setQtyScrap(''); setModal(def)
    } else {
      transition.mutate({ action: def.action })
    }
  }

  async function submitModal() {
    if (!modal) return
    if (modal.needs === 'reason') {
      if (!reason.trim()) return
      await transition.mutateAsync({ action: modal.action, body: { reason: reason.trim() } })
    } else if (modal.needs === 'qty') {
      if (qtyDone === '') return
      await transition.mutateAsync({
        action: modal.action,
        body: { qty_done: Number(qtyDone), qty_scrapped: qtyScrap ? Number(qtyScrap) : undefined },
      })
    }
    setModal(null)
  }

  const showBanner = bom?.is_outdated && !dismissedBanner && wo.status !== 'CANCELLED' && wo.status !== 'DONE'

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
          {ACTIONS[wo.status].map((a) => (
            <button
              key={a.action}
              onClick={() => runAction(a)}
              disabled={transition.isPending}
              style={{
                height: 34, padding: '0 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                border: a.danger ? '1px solid #E8A0A0' : 'none',
                background: a.danger ? '#fff' : '#C8202A', color: a.danger ? '#C8202A' : '#fff',
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* BOM Version Alert banner */}
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
              onClick={() => acceptVersion.mutate()}
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
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', width: 420 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{modal.label} · {wo.wo_code}</h2>
            {modal.needs === 'reason' ? (
              <>
                <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>A reason is required.</p>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus rows={3} placeholder="Reason…"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, resize: 'vertical' }} />
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
                disabled={transition.isPending || (modal.needs === 'reason' ? !reason.trim() : qtyDone === '')}
                style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: '#C8202A', color: '#fff', cursor: 'pointer', opacity: transition.isPending ? 0.6 : 1 }}
              >
                {transition.isPending ? 'Saving…' : 'Confirm'}
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

function OverviewTab({ wo, bomOutdated, onMo }: { wo: WoDetailT; bomOutdated: boolean; onMo: () => void }) {
  const d = wo.snapshot_dispatch ?? wo.bom_assembly.dispatch
  return (
    <>
      <Card title="Operation (snapshot)">
        <Row k="WO Code" v={wo.wo_code} />
        <Row k="Sequence" v={String(wo.sequence).padStart(3, '0')} />
        <Row k="Work Center" v={`${wo.mrp_workcenter.code} · ${wo.mrp_workcenter.name}`} />
        <Row k="Expected Duration" v={`${wo.expected_duration_min} min`} />
        <Row k="Setup Time" v={`${wo.setup_time_min} min`} />
        <Row k="Op Attributes" v={Object.keys(wo.op_attributes ?? {}).length ? JSON.stringify(wo.op_attributes) : '—'} />
      </Card>
      <Card title="MO Context">
        <Row k="Manufacturing Order" v={<button onClick={onMo} style={{ color: '#0C447C', fontFamily: 'monospace', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{wo.manufacturing_order.mo_code}</button>} />
        <Row k="Assembly" v={<span style={{ fontFamily: 'monospace' }}>{wo.bom_assembly.assembly_mark}{wo.bom_assembly.name ? ` · ${wo.bom_assembly.name}` : ''}</span>} />
        <Row k="Project / Zone" v={[d?.project?.name, d?.zone?.label, d?.sub_zone?.name].filter(Boolean).join(' · ') || '—'} />
        <Row k="BOM Version (snapshot)" v={<>dispatch #{wo.bom_dispatch_id_snapshot}{bomOutdated && <span style={{ background: '#FFEBEE', color: '#C62828', borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700, marginLeft: 6 }}>⚠ newer</span>}</>} />
      </Card>
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
