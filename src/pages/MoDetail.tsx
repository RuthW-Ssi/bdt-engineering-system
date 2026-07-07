import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Info, Pencil, Cpu, FlaskConical, Users, Wrench } from 'lucide-react'
import { useMo, useMoAssemblies, useMoHistory, useMoParts, useMoConsumeSummary, useChangeMoStatus } from '../hooks/useMo'
import { useWos } from '../hooks/useWo'
import { MoStatusPill } from '../components/mo/MoStatusPill'
import { WoStatusPill } from '../components/wo/WoStatusPill'
import type { MoStatus } from '../api/mo'

const TABS = ['Overview', 'Work Orders', 'Assemblies', 'Parts', 'History'] as const
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
        {tab === 'Work Orders' && <WorkOrdersTab moId={moId} moStatus={mo.status} />}
        {tab === 'Assemblies' && <AssembliesTab moId={moId} />}
        {tab === 'Parts' && <PartsTab moId={moId} />}
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

// Non-blocking, informational — mirrors DiffWarningBanner.tsx's amber styling
// (components/bom) but supports a per-line list since an MO can have several
// stale assembly lines at once. Only ever non-empty while mo.status ===
// 'DRAFT' (backend gate — see MoDetail type in api/mo.ts), so no extra
// frontend status check is needed here.
function StaleAssemblyWarningsBanner({ warnings }: { warnings: import('../api/mo').MoDetail['stale_assembly_warnings'] }) {
  if (!warnings.length) return null
  return (
    <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#92400E', marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        ⚠ Newer BOM version available for {warnings.length} assembly line{warnings.length > 1 ? 's' : ''}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {warnings.map(w => (
          <div key={w.mo_assembly_line_id}>
            <strong>{w.assembly_mark}</strong>: {w.delta_types.join(' · ') || 'change'}
          </div>
        ))}
      </div>
    </div>
  )
}

function ConsumeSummaryCard({ moId }: { moId: number }) {
  const { data, isLoading } = useMoConsumeSummary(moId)
  return (
    <Card title="Planned Consume">
      {isLoading ? (
        <Loader2 size={16} className="animate-spin" style={{ color: '#C2C2C2' }} />
      ) : !data?.length ? (
        <span style={{ color: '#B0B0B0', fontSize: 13 }}>No consumable materials defined.</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 90px 50px', gap: 8, padding: '4px 0 6px', borderBottom: '1px solid #F0F0F0' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#999', letterSpacing: '0.05em' }}>CODE</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#999', letterSpacing: '0.05em' }}>MATERIAL</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#999', letterSpacing: '0.05em', textAlign: 'right' }}>QTY</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#999', letterSpacing: '0.05em' }}>UNIT</span>
          </div>
          {data.map((r, i) => (
            <div key={r.material_id} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 90px 50px', gap: 8, padding: '6px 0', borderBottom: i < data.length - 1 ? '1px solid #F9F9F9' : 'none', alignItems: 'center' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.code}</span>
              <span style={{ fontSize: 12, color: '#1A1A1A' }}>{r.name}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1A1A', textAlign: 'right' }}>{r.qty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span style={{ fontSize: 11, color: '#666' }}>{r.unit ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function OverviewTab({ mo }: { mo: import('../api/mo').MoDetail }) {
  return (
    <>
      <StaleAssemblyWarningsBanner warnings={mo.stale_assembly_warnings} />

      {/* Order info */}
      <Card title="Order">
        <Row k="MO Code" v={mo.mo_code} />
        <Row k="Mark Prefix" v={`${mo.mark_prefix?.code} · ${mo.mark_prefix?.label}`} />
        <Row k="Routing Template" v={mo.routing_template?.name} />
        <Row k="Status" v={<MoStatusPill status={mo.status} />} />
        <Row k="Due Date" v={fmtDay(mo.due_date)} />
      </Card>

      {/* Scope */}
      <Card title="Scope">
        <Row k="Project" v={<Chips items={mo.projects_involved.map(p => p.name)} />} />
        <Row k="Zone" v={<Chips items={mo.zones_involved.map(z => z.label)} />} />
        <Row k="Sub Zone" v={<Chips items={mo.sub_zones_involved.map(s => s.name)} />} />
      </Card>

      {/* Planned Consume Summary */}
      <ConsumeSummaryCard moId={mo.id} />

      {/* Routing operations */}
      <Card title="Routing">
        {!mo.routing_template.operations.length ? (
          <span style={{ color: '#B0B0B0', fontSize: 13 }}>No operations on this routing template.</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mo.routing_template.operations.map(op => {
              const color = op.op_type?.color ?? '#9CA3AF'
              return (
              <div key={op.id} style={{ border: '1px solid #EEEEEE', borderRadius: 10, overflow: 'hidden' }}>
                {/* Op header */}
                <div style={{ background: '#FAFAFA', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 8, background: color, fontSize: 11, fontWeight: 800, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {op.sequence}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{op.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: '#666' }}>{op.workcenter.name}</span>
                      {op.workcenter.machine && (
                        <>
                          <span style={{ fontSize: 10, color: '#DDD' }}>·</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#1565C0' }}>
                            <Cpu size={10} />{op.workcenter.machine}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Activities */}
                {(op.activities?.length ?? 0) > 0 && (
                  <div style={{ background: '#fff', padding: '8px 14px 10px', borderTop: '1px solid #F0F0F0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {op.activities!.map((act, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ marginTop: 3, width: 16, height: 16, borderRadius: '50%', background: '#F0F0F0', fontSize: 9, fontWeight: 700, color: '#999', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1A1A' }}>{act.name}</span>
                            {act.measure && <span style={{ fontSize: 10, color: '#999', background: '#F5F5F5', borderRadius: 4, padding: '1px 5px' }}>{act.measure}</span>}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 5 }}>
                            {act.labors.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: '#166534', background: '#DCFCE7', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>SKILL</span>
                                {act.labors.map((l, li) => (
                                  <span key={li} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#166534', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: '2px 8px' }}>
                                    <Users size={9} />{l.skill}{l.level ? ` (${l.level})` : ''} ×{l.qty}
                                  </span>
                                ))}
                              </div>
                            )}
                            {act.tools.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: '#1E40AF', background: '#DBEAFE', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>TOOL</span>
                                {act.tools.map((t, ti) => (
                                  <span key={ti} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#1E40AF', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '2px 8px' }}>
                                    <Wrench size={9} />{t.name} ×{t.qty}
                                  </span>
                                ))}
                              </div>
                            )}
                            {act.consumables.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: '#92400E', background: '#FEF3C7', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>USE</span>
                                {act.consumables.map((c, ci) => (
                                  <span key={ci} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '2px 8px' }}>
                                    <FlaskConical size={9} />{c.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          )}
          </div>
        )}
      </Card>

      {/* Audit */}
      <Card title="Audit">
        <Row k="Created" v={`${fmtDate(mo.create_date)} · ${mo.create_user?.name ?? '—'}`} />
        <Row k="Last write" v={`${fmtDate(mo.write_date)} · ${mo.write_user?.name ?? '—'}`} />
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

function PartsTab({ moId }: { moId: number }) {
  const { data, isLoading } = useMoParts(moId)
  if (isLoading) return <Loader2 size={18} className="animate-spin" style={{ color: '#C2C2C2' }} />
  const rows = data ?? []
  if (!rows.length) return <div style={{ color: '#8E8E8E', fontSize: 13 }}>No parts found.</div>

  const totalWeight = rows.reduce((s, r) => s + (r.total_weight_kg ?? 0), 0)

  return (
    <div>
      <div style={{ border: '1px solid #E8E8E8', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 80px 60px 120px 1.2fr', background: '#F5F5F5', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#999', borderBottom: '1px solid #E8E8E8' }}>
          <div style={{ padding: '9px 14px' }}>Part Mark</div>
          <div style={{ padding: '9px 14px' }}>Profile</div>
          <div style={{ padding: '9px 14px' }}>Grade</div>
          <div style={{ padding: '9px 14px', textAlign: 'right' }}>Qty</div>
          <div style={{ padding: '9px 14px', textAlign: 'right' }}>Total (kg)</div>
          <div style={{ padding: '9px 14px' }}>Allocation</div>
        </div>
        {rows.map(r => (
          <div key={r.part_mark} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 80px 60px 120px 1.2fr', borderTop: '1px solid #F0F0F0', fontSize: 13, alignItems: 'center' }}>
            <div style={{ padding: '10px 14px' }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1A1A1A' }}>{r.part_mark}</span>
              {r.assembly_marks.length > 0 && (
                <div style={{ fontSize: 11, color: '#ABABAB', marginTop: 2 }}>{r.assembly_marks.join(', ')}</div>
              )}
            </div>
            <div style={{ padding: '10px 14px', color: '#444' }}>{r.profile ?? '—'}</div>
            <div style={{ padding: '10px 14px', fontSize: 12, color: '#666' }}>{r.grade ?? '—'}</div>
            <div style={{ padding: '10px 14px', fontWeight: 700, color: '#C8202A', textAlign: 'right' }}>{r.total_qty}</div>
            <div style={{ padding: '10px 14px', fontWeight: 500, color: '#333', textAlign: 'right' }}>{r.total_weight_kg != null ? r.total_weight_kg.toFixed(2) : '—'}</div>
            <div style={{ padding: '10px 14px', fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Info size={12} style={{ color: '#0C447C', flexShrink: 0 }} />
              {r.mo_breakdown.length
                ? r.mo_breakdown.map(b => `${b.mo_code} (${b.qty})`).join(' · ')
                : '—'}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: '#888', textAlign: 'right' }}>
        {rows.length} parts · Total weight: <strong style={{ color: '#333' }}>{totalWeight.toFixed(2)} kg</strong>
      </div>
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
