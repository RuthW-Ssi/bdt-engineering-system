import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Info, Pencil } from 'lucide-react'
import { useMo, useMoAssemblies, useMoHistory, useChangeMoStatus } from '../hooks/useMo'
import { useWos } from '../hooks/useWo'
import { MoStatusPill } from '../components/mo/MoStatusPill'
import { WoStatusPill } from '../components/wo/WoStatusPill'
import { OperationsList } from '../components/mo/OperationsList'
import type { MoStatus } from '../api/mo'

const TABS = ['Overview', 'Operations', 'Work Orders', 'Assemblies', 'History'] as const
type Tab = (typeof TABS)[number]

// available forward actions per status (P3)
const ACTIONS: Record<MoStatus, { to: MoStatus; label: string; danger?: boolean }[]> = {
  DRAFT: [{ to: 'CONFIRMED', label: 'Confirm' }, { to: 'CANCELLED', label: 'Cancel', danger: true }],
  CONFIRMED: [{ to: 'IN_PROGRESS', label: 'Start' }, { to: 'CANCELLED', label: 'Cancel', danger: true }],
  IN_PROGRESS: [{ to: 'DONE', label: 'Complete' }],
  DONE: [],
  CANCELLED: [],
}

// audit timestamps — date + time
function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}
// envelope dates (earliest start / due) — date only, no time (formatted in UTC to match stored DATE)
function fmtDay(d: string | null) {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'
}

export function MoDetail() {
  const { id } = useParams<{ id: string }>()
  const moId = Number(id)
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('Overview')
  const [reasonModal, setReasonModal] = useState<{ to: MoStatus; label: string } | null>(null)
  const [reason, setReason] = useState('')

  const { data: mo, isLoading } = useMo(moId)
  const changeStatus = useChangeMoStatus(moId)

  if (isLoading || !mo) {
    return <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 56px)' }}><Loader2 size={22} className="animate-spin" style={{ color: '#C2C2C2' }} /></div>
  }

  async function applyStatus() {
    if (!reasonModal || !reason.trim()) return
    await changeStatus.mutateAsync({ to_status: reasonModal.to, reason: reason.trim() })
    setReasonModal(null)
    setReason('')
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Header */}
      <div className="bg-white flex items-center gap-3 border-b border-chrome-100 px-6" style={{ minHeight: 56, flexShrink: 0 }}>
        <button onClick={() => navigate('/mo')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', display: 'flex' }}><ArrowLeft size={18} /></button>
        <span style={{ fontFamily: 'monospace', fontSize: 17, fontWeight: 700, color: '#1A1A1A' }}>{mo.mo_code}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#C8202A', background: '#FCEBEB', borderRadius: 4, padding: '1px 7px' }}>{mo.mark_prefix?.code}</span>
        <MoStatusPill status={mo.status} />
        <div style={{ flex: 1 }} />
        <div className="flex items-center gap-2">
          {mo.status === 'DRAFT' && (
            <button
              onClick={() => navigate(`/mo/${moId}/edit`)}
              className="flex items-center gap-1.5"
              style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: '1px solid #C2C2C2', background: '#fff', color: '#333' }}
            >
              <Pencil size={14} /> Edit
            </button>
          )}
          {ACTIONS[mo.status].map(a => (
            <button
              key={a.to}
              onClick={() => { setReason(''); setReasonModal({ to: a.to, label: a.label }) }}
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

      {/* Tabs */}
      <div className="bg-white border-b border-chrome-100 px-6 flex items-center gap-1" style={{ flexShrink: 0 }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              height: 42, padding: '0 16px', fontSize: 13, fontWeight: 600, background: 'none', cursor: 'pointer',
              border: 'none', borderBottom: '2px solid ' + (tab === t ? '#C8202A' : 'transparent'),
              color: tab === t ? '#C8202A' : '#777',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#F7F7F7' }}>
        {tab === 'Overview' && <OverviewTab mo={mo} />}
        {tab === 'Operations' && <OperationsList moId={moId} operations={mo.operations} bottleneckOpId={mo.bottleneck_op_id} />}
        {tab === 'Work Orders' && <WorkOrdersTab moId={moId} moStatus={mo.status} />}
        {tab === 'Assemblies' && <AssembliesTab moId={moId} />}
        {tab === 'History' && <HistoryTab moId={moId} />}
      </div>

      {/* Reason modal (status change requires reason) */}
      {reasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', width: 420 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{reasonModal.label} MO</h2>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>{mo.status} → {reasonModal.to}. A reason is required.</p>
            <textarea
              value={reason} onChange={e => setReason(e.target.value)} autoFocus rows={3}
              placeholder="Reason…"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, resize: 'vertical' }}
            />
            <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
              <button onClick={() => setReasonModal(null)} style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={applyStatus}
                disabled={!reason.trim() || changeStatus.isPending}
                style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: reason.trim() ? '#C8202A' : '#C2C2C2', color: '#fff', cursor: reason.trim() ? 'pointer' : 'not-allowed' }}
              >
                {changeStatus.isPending ? 'Saving…' : 'Confirm'}
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
      <span style={{ width: 160, color: '#888', flexShrink: 0 }}>{k}</span>
      <span style={{ color: '#1A1A1A', fontWeight: 500 }}>{v}</span>
    </div>
  )
}

function Chips({ items }: { items: string[] }) {
  if (!items.length) return <span style={{ color: '#B0B0B0' }}>—</span>
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {items.map(i => <span key={i} style={{ background: '#F0F0F0', borderRadius: 999, padding: '2px 10px', fontSize: 12, color: '#444' }}>{i}</span>)}
    </span>
  )
}

function OverviewTab({ mo }: { mo: import('../api/mo').MoDetail }) {
  return (
    <>
      <Card title="Order">
        <Row k="MO Code" v={mo.mo_code} />
        <Row k="Mark Prefix" v={`${mo.mark_prefix?.code} · ${mo.mark_prefix?.label}`} />
        <Row k="Routing Template" v={mo.routing_template?.name} />
        <Row k="Status" v={<MoStatusPill status={mo.status} />} />
        <Row k="Due Date" v={fmtDay(mo.due_date)} />
      </Card>
      <Card title="Derived (on-read · P20)">
        <Row k="Project" v={<Chips items={mo.projects_involved.map(p => p.name)} />} />
        <Row k="Zone" v={<Chips items={mo.zones_involved.map(z => z.label)} />} />
        <Row k="Sub Zone" v={<Chips items={mo.sub_zones_involved.map(s => s.name)} />} />
      </Card>
      <Card title="Audit">
        <Row k="Created" v={`${fmtDate(mo.create_date)} · ${mo.create_user?.name ?? `uid ${mo.create_uid}`}`} />
        <Row k="Last write" v={`${fmtDate(mo.write_date)} · ${mo.write_user?.name ?? `uid ${mo.write_uid}`}`} />
      </Card>
    </>
  )
}

function AssembliesTab({ moId }: { moId: number }) {
  const { data, isLoading } = useMoAssemblies(moId)
  if (isLoading) return <Loader2 size={18} className="animate-spin" style={{ color: '#C2C2C2' }} />
  const rows = data ?? []
  if (!rows.length) return <div style={{ color: '#8E8E8E', fontSize: 13 }}>No assemblies.</div>
  return (
    <div style={{ border: '1px solid #E8E8E8', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '50px 1.3fr 1fr 90px 90px 1fr', background: '#F5F5F5', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#888' }}>
        {['Line', 'Assembly', 'Project / Zone', 'Qty', 'Total', 'Allocation'].map(h => <div key={h} style={{ padding: '8px 12px' }}>{h}</div>)}
      </div>
      {rows.map(r => (
        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '50px 1.3fr 1fr 90px 90px 1fr', borderTop: '1px solid #EEE', fontSize: 13, alignItems: 'center' }}>
          <div style={{ padding: '10px 12px', color: '#999' }}>{r.line_seq + 1}</div>
          <div style={{ padding: '10px 12px' }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.assembly_mark}</span>
            {r.name && <div style={{ fontSize: 11, color: '#999' }}>{r.name}</div>}
          </div>
          <div style={{ padding: '10px 12px', fontSize: 12, color: '#666' }}>{[r.project, r.zone, r.sub_zone].filter(Boolean).join(' · ') || '—'}</div>
          <div style={{ padding: '10px 12px', fontWeight: 700, color: '#C8202A' }}>{r.qty}</div>
          <div style={{ padding: '10px 12px', color: '#555' }}>{r.total}</div>
          <div style={{ padding: '10px 12px', fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Info size={12} style={{ color: '#0C447C', flexShrink: 0 }} />
            {r.allocation_breakdown.map(b => `${b.mo_code} (${b.qty})`).join(' · ') || '—'}
          </div>
        </div>
      ))}
    </div>
  )
}

function WorkOrdersTab({ moId, moStatus }: { moId: number; moStatus: MoStatus }) {
  const navigate = useNavigate()
  const { data, isLoading } = useWos({ mo_id: moId })
  if (isLoading) return <Loader2 size={18} className="animate-spin" style={{ color: '#C2C2C2' }} />
  const rows = data ?? []
  if (!rows.length) {
    return (
      <div style={{ color: '#8E8E8E', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
        {moStatus === 'DRAFT' ? 'WOs will be created on confirm' : 'No work orders for this MO.'}
      </div>
    )
  }
  // Group by op sequence
  const bySeq = new Map<number, typeof rows>()
  for (const w of rows) {
    const arr = bySeq.get(w.sequence) ?? []
    arr.push(w)
    bySeq.set(w.sequence, arr)
  }
  const seqs = [...bySeq.keys()].sort((a, b) => a - b)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {seqs.map((seq) => (
        <div key={seq} style={{ border: '1px solid #E8E8E8', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
          <div style={{ background: '#F5F5F5', padding: '8px 14px', fontSize: 12, fontWeight: 700, color: '#555' }}>
            Operation seq {String(seq).padStart(3, '0')} · {bySeq.get(seq)!.length} WO(s)
          </div>
          {bySeq.get(seq)!.map((w) => (
            <div
              key={w.id}
              onClick={() => navigate(`/order/wo/${w.id}`)}
              style={{ display: 'grid', gridTemplateColumns: '150px 1fr 130px 110px 90px 70px', borderTop: '1px solid #EEE', fontSize: 13, alignItems: 'center', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFAFA')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
            >
              <div style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700 }}>{w.wo_code}</div>
              <div style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: '#555' }}>{w.assembly_mark}</div>
              <div style={{ padding: '10px 14px', fontSize: 12, color: '#666' }}>{w.work_center.code}</div>
              <div style={{ padding: '10px 14px' }}><WoStatusPill status={w.status} /></div>
              <div style={{ padding: '10px 14px', fontSize: 12, color: '#666' }}>{w.qty_done ?? '—'}</div>
              <div style={{ padding: '10px 14px' }}>{w.is_outdated ? <span title="BOM outdated" style={{ color: '#C62828', fontSize: 11, fontWeight: 700 }}>⚠</span> : ''}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function HistoryTab({ moId }: { moId: number }) {
  const { data, isLoading } = useMoHistory(moId)
  if (isLoading) return <Loader2 size={18} className="animate-spin" style={{ color: '#C2C2C2' }} />
  const rows = data ?? []
  if (!rows.length) return <div style={{ color: '#8E8E8E', fontSize: 13 }}>No status changes yet.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {rows.map((h, i) => (
        <div key={h.id} className="flex gap-3" style={{ position: 'relative', paddingBottom: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: '#C8202A', marginTop: 4 }} />
            {i < rows.length - 1 && <div style={{ width: 2, flex: 1, background: '#E0E0E0', marginTop: 2 }} />}
          </div>
          <div style={{ paddingBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>
              {h.from_status} → {h.to_status}
            </div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{h.reason}</div>
            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{fmtDate(h.changed_at)} · {h.changed_by}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
