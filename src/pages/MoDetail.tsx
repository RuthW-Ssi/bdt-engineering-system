import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Info, Pencil, Cpu, FlaskConical, Users, Wrench, Printer } from 'lucide-react'
import { useMo, useMoAssemblies, useMoHistory, useMoParts, useMoConsumeSummary, useChangeMoStatus, useCreateWorkOrder, usePreviewWorkOrder } from '../hooks/useMo'
import { useWos } from '../hooks/useWo'
import { useTeams, useLaborSkills } from '../hooks/useLaborSkills'
import { MoStatusPill } from '../components/mo/MoStatusPill'
import { WoStatusPill } from '../components/wo/WoStatusPill'
import { fetchMoPrintPacketBlob, type MoStatus, type RoutingOp, type MoAssemblyRow } from '../api/mo'
import { usePermission } from '../hooks/usePermission'
import { getErrorMessage } from '../lib/getErrorMessage'
import DaysRemainingBadge from '../components/DaysRemainingBadge'

const TABS = ['Overview', 'Work Orders', 'Assemblies', 'Parts', 'History'] as const
type Tab = (typeof TABS)[number]

// available forward actions per status (P3) — IN_PROGRESS gained Cancel
// alongside Complete (2026-09-23, user: "mo ต้องมี ปุ่ม complete แล้วก็
// cancel ด้วย").
const ACTIONS: Record<MoStatus, { to: MoStatus; label: string; danger?: boolean }[]> = {
  DRAFT: [{ to: 'CONFIRMED', label: 'Confirm' }, { to: 'CANCELLED', label: 'Cancel', danger: true }],
  CONFIRMED: [{ to: 'IN_PROGRESS', label: 'Start' }, { to: 'CANCELLED', label: 'Cancel', danger: true }],
  IN_PROGRESS: [{ to: 'DONE', label: 'Complete' }, { to: 'CANCELLED', label: 'Cancel', danger: true }],
  DONE: [],
  CANCELLED: [],
}

// audit timestamps + plan/actual dates — date + time
function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}

export function MoDetail() {
  const { id } = useParams<{ id: string }>()
  const moId = Number(id)
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('Overview')
  const [reasonModal, setReasonModal] = useState<{ to: MoStatus; label: string } | null>(null)
  const [reason, setReason] = useState('')
  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)
  const [printPickerOpen, setPrintPickerOpen] = useState(false)

  const { data: mo, isLoading } = useMo(moId)
  const changeStatus = useChangeMoStatus(moId)
  const canWrite = usePermission('orders', 'update')

  if (isLoading || !mo) {
    return <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 56px)' }}><Loader2 size={22} className="animate-spin" style={{ color: '#C2C2C2' }} /></div>
  }

  async function applyStatus() {
    if (!reasonModal || !reason.trim()) return
    await changeStatus.mutateAsync({ to_status: reasonModal.to, reason: reason.trim() })
    setReasonModal(null)
    setReason('')
  }

  // Opens the merged PDF in a new tab (browser's native viewer, print icon
  // built in) rather than triggering a download — matches how PDF drawing
  // previews already work (DrawingPreviewPanel.tsx). Deliberately never
  // revokes the object URL — same accepted trade-off as
  // wiki/features/drawing.md's blob-URL fix (eager revoke broke a
  // switch-back-to-cached-file case there); a handful of packets printed
  // per session is not worth the risk of revoking a URL the new tab still
  // needs.
  //
  // Selective print (2026-09-21): "Print" opens PrintSelectModal first
  // instead of generating immediately — the user picks which WO travelers
  // AND whether the MO overview page itself is included (independent
  // toggles — "just the MO", "just some WOs", or both are all valid), then
  // the modal's own Print button calls this with the choice.
  async function handlePrint(woIds: number[], includeManifest: boolean) {
    setPrinting(true)
    setPrintError(null)
    try {
      const blob = await fetchMoPrintPacketBlob(moId, woIds, includeManifest)
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
      window.open(url, '_blank')
      setPrintPickerOpen(false)
    } catch (err) {
      setPrintError(getErrorMessage(err, 'Failed to generate the print packet.'))
    } finally {
      setPrinting(false)
    }
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
          <button
            onClick={() => setPrintPickerOpen(true)}
            disabled={printing}
            className="flex items-center gap-1.5"
            style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: printing ? 'default' : 'pointer', border: '1px solid #C2C2C2', background: '#fff', color: '#333', opacity: printing ? 0.6 : 1 }}
          >
            {printing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Print
          </button>
          {canWrite && mo.status === 'DRAFT' && (
            <button
              onClick={() => navigate(`/mo/${moId}/edit`)}
              className="flex items-center gap-1.5"
              style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: '1px solid #C2C2C2', background: '#fff', color: '#333' }}
            >
              <Pencil size={14} /> Edit
            </button>
          )}
          {canWrite && ACTIONS[mo.status].map(a => (
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

      {printError && (
        <div style={{ background: '#FCEBEB', color: '#C8202A', fontSize: 13, padding: '8px 24px', flexShrink: 0 }}>
          {printError}
        </div>
      )}

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
        {tab === 'Work Orders' && <WorkOrdersTab moId={moId} operations={mo.routing_template.operations} />}
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

      {printPickerOpen && (
        <PrintSelectModal
          moId={moId}
          operations={mo.routing_template.operations}
          printing={printing}
          error={printError}
          onClose={() => { setPrintPickerOpen(false); setPrintError(null) }}
          onPrint={handlePrint}
        />
      )}
    </div>
  )
}

// Selective print (2026-09-21) — appears on clicking "Print"; the MO overview
// page always prints regardless (not a selectable item here), only which WO
// travelers to include is a choice. Defaults to every non-cancelled WO
// selected, matching the old "print everything" one-click behavior.
function PrintSelectModal({
  moId, operations, printing, error, onClose, onPrint,
}: {
  moId: number
  operations: RoutingOp[]
  printing: boolean
  error: string | null
  onClose: () => void
  onPrint: (woIds: number[], includeManifest: boolean) => void
}) {
  const { data, isLoading } = useWos({ mo_id: moId })
  const wos = (data ?? []).filter(w => w.status !== 'CANCELLED')
  const opBySeq = new Map(operations.map(op => [op.sequence, op]))
  const [selected, setSelected] = useState<Set<number> | null>(null)
  const effectiveSelected = selected ?? new Set(wos.map(w => w.id))
  // MO overview is its own independent toggle (2026-09-21) — "just the MO"
  // (uncheck every WO) and "just some WOs, no MO page" are both valid; only
  // "nothing at all" is blocked.
  const [includeManifest, setIncludeManifest] = useState(true)
  const nothingSelected = !includeManifest && effectiveSelected.size === 0

  function toggle(id: number) {
    setSelected((prev) => {
      const base = prev ?? new Set(wos.map(w => w.id))
      const next = new Set(base)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Print — select what to include</h2>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Pick the MO overview page and/or which work order travelers to print.</p>

        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #EEE', borderRadius: 6, minHeight: 60 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid #F4F4F4', cursor: 'pointer', background: '#FAFAFA' }}>
            <input
              type="checkbox" checked={includeManifest} onChange={(e) => setIncludeManifest(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: '#C8202A', flexShrink: 0 }}
            />
            <span style={{ fontWeight: 700, fontSize: 13 }}>MO Overview</span>
            <span style={{ fontSize: 11, color: '#999' }}>Routing + Assembly List + Assembly Part List</span>
          </label>
          {isLoading ? (
            <div style={{ padding: 20 }}><Loader2 size={16} className="animate-spin" style={{ color: '#C2C2C2' }} /></div>
          ) : !wos.length ? (
            <div style={{ padding: 14, color: '#AAA', fontSize: 13 }}>No work orders on this MO.</div>
          ) : (
            wos.map((w, i) => {
              const op = opBySeq.get(w.sequence)
              return (
                <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: i < wos.length - 1 ? '1px solid #F4F4F4' : 'none', cursor: 'pointer' }}>
                  <input
                    type="checkbox" checked={effectiveSelected.has(w.id)} onChange={() => toggle(w.id)}
                    style={{ width: 15, height: 15, accentColor: '#C8202A', flexShrink: 0 }}
                  />
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{w.wo_code}</span>
                  <span style={{ fontSize: 12, color: '#888', flexShrink: 0 }}>{op ? op.name : `Op ${w.sequence}`}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={w.assembly_marks.join(', ')}>
                    {w.assembly_marks.slice(0, 2).join(', ')}{w.assembly_marks.length > 2 ? '…' : ''}
                  </span>
                </label>
              )
            })
          )}
        </div>

        {nothingSelected && <div style={{ color: '#B85C00', fontSize: 12, marginTop: 10 }}>Select the MO overview and/or at least one work order.</div>}
        {error && <div style={{ color: '#C8202A', fontSize: 12, marginTop: 10 }}>{error}</div>}

        <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={() => onPrint([...effectiveSelected], includeManifest)}
            disabled={printing || nothingSelected}
            className="flex items-center gap-1.5"
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: '#C8202A', color: '#fff', cursor: printing || nothingSelected ? 'default' : 'pointer', opacity: printing || nothingSelected ? 0.6 : 1 }}
          >
            {printing && <Loader2 size={14} className="animate-spin" />}
            Print
          </button>
        </div>
      </div>
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
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1A1A', textAlign: 'right' }}>{Math.round(r.qty).toLocaleString('en-US')}</span>
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
        <Row k="Plan Start" v={fmtDate(mo.plan_start)} />
        <Row k="Plan Finish" v={<>{fmtDate(mo.plan_finish)} <DaysRemainingBadge planFinish={mo.plan_finish} /></>} />
        <Row k="Actual Start" v={fmtDate(mo.actual_start)} />
        <Row k="Actual Finish" v={fmtDate(mo.actual_finish)} />
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

// Multi-mark redesign (2026-09-17): a WO spans many marks — this tab drives
// its rows off the routing template's OWN operation list (not off whatever
// WOs happen to already exist), so an operation with no WO yet still gets a
// row offering to create one. `useWos({ mo_id })`'s rows have no
// source_routing_op_id (list-shape doesn't carry it), so matching a WO to
// its operation goes through `sequence` — a snapshot the WO took from its
// operation at creation time and unique per routing template.
//
// Multiple WOs per operation (2026-09-23): "เราต้องแยกเป็นหลาย wo ได้นะ เพื่อ
// แยกการทำงานกระจายโหลดให้หลายทีม" — an operation can be split across several
// WOs (e.g. different teams working it in parallel; a mark may deliberately
// end up on more than one). "+ Create Work Order" is always available per
// operation (never replaced by "+ Add Marks") and always makes a brand-new
// WO; each existing WO row gets its OWN "+ Add Marks" targeting just that WO.
function WorkOrdersTab({ moId, operations }: { moId: number; operations: RoutingOp[] }) {
  const navigate = useNavigate()
  const canWrite = usePermission('orders', 'update')
  const { data, isLoading } = useWos({ mo_id: moId })
  const [picker, setPicker] = useState<{ operationId: number; operationLabel: string } | null>(null)

  if (isLoading) return <Loader2 size={18} className="animate-spin" style={{ color: '#C2C2C2' }} />
  if (!operations.length) {
    return <div style={{ color: '#8E8E8E', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>No operations on this routing template.</div>
  }
  const rows = data ?? []
  const wosBySeq = new Map<number, typeof rows>()
  for (const w of rows) {
    const list = wosBySeq.get(w.sequence) ?? []
    list.push(w)
    wosBySeq.set(w.sequence, list)
  }
  const sortedOps = [...operations].sort((a, b) => a.sequence - b.sequence)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {sortedOps.map((op) => {
        const wos = wosBySeq.get(op.sequence) ?? []
        return (
          <div key={op.id} style={{ border: '1px solid #E8E8E8', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
            <div style={{ background: '#F5F5F5', padding: '8px 14px', fontSize: 12, fontWeight: 700, color: '#555', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>Operation {String(op.sequence).padStart(3, '0')} · {op.name}</span>
              {wos.length > 0 && <span style={{ fontWeight: 400, color: '#999' }}>({wos.length} WO{wos.length === 1 ? '' : 's'})</span>}
              <div style={{ flex: 1 }} />
              {canWrite && (
                <CreateWorkOrderButton moId={moId} operationId={op.id} onClick={() => setPicker({ operationId: op.id, operationLabel: op.name })} />
              )}
            </div>
            {wos.length > 0 ? wos.map((wo) => (
              <div
                key={wo.id}
                onClick={() => navigate(`/order/wo/${wo.id}`)}
                style={{ display: 'grid', gridTemplateColumns: '150px 1fr 130px 120px 110px 110px 150px 70px', borderTop: '1px solid #EEE', fontSize: 13, alignItems: 'center', cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFAFA')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
              >
                <div style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700 }}>{wo.wo_code}</div>
                <div style={{ padding: '10px 14px', fontSize: 12, color: '#555' }}>
                  <span style={{ background: '#F0F0F0', borderRadius: 999, padding: '1px 8px', fontWeight: 600 }}>{wo.mark_count} mark{wo.mark_count === 1 ? '' : 's'}</span>
                  <span style={{ marginLeft: 6, color: '#999' }} title={wo.assembly_marks.join(', ')}>{wo.assembly_marks.slice(0, 3).join(', ')}{wo.assembly_marks.length > 3 ? '…' : ''}</span>
                </div>
                <div style={{ padding: '10px 14px', fontSize: 12, color: '#666' }}>{wo.work_center.code}</div>
                <div style={{ padding: '10px 14px', fontSize: 12, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={wo.subcontractor?.name ?? wo.assigned_to ?? undefined}>{wo.subcontractor?.name ?? wo.assigned_to ?? '—'}</div>
                <div style={{ padding: '10px 14px' }}><WoStatusPill status={wo.status} /></div>
                <div style={{ padding: '10px 14px', fontSize: 12, color: '#666' }}>{wo.qty_done_total} / {wo.qty_planned_total}</div>
                <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 12, color: '#666' }}>{fmtDate(wo.plan_finish)}</span>
                  <DaysRemainingBadge planFinish={wo.plan_finish} />
                </div>
                <div style={{ padding: '10px 14px' }}>{wo.is_outdated ? <span title="BOM outdated" style={{ color: '#C62828', fontSize: 11, fontWeight: 700 }}>⚠</span> : ''}</div>
              </div>
            )) : (
              <div style={{ padding: '14px', color: '#AAA', fontSize: 12, borderTop: '1px solid #EEE' }}>No work order yet for this operation.</div>
            )}
          </div>
        )
      })}

      {picker && (
        <WoMarkPickerModal
          moId={moId}
          operationId={picker.operationId}
          operationLabel={picker.operationLabel}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}

// Hides "+ Create Work Order" once every mark is fully committed for this
// operation (wo_remaining === 0 on all of them) — nothing left to plan, so
// opening the picker would only show disabled rows (2026-09-25).
function CreateWorkOrderButton({ moId, operationId, onClick }: { moId: number; operationId: number; onClick: () => void }) {
  const { data: lines } = useMoAssemblies(moId, operationId)
  const fullyCommitted = !!lines?.length && lines.every(l => l.wo_remaining === 0)
  if (fullyCommitted) return null
  return (
    <button
      onClick={onClick}
      style={{ height: 24, padding: '0 10px', fontSize: 11, fontWeight: 600, borderRadius: 5, border: '1px solid #C2C2C2', background: '#fff', color: '#333', cursor: 'pointer' }}
    >
      + Create Work Order
    </button>
  )
}

// Multi-mark redesign (2026-09-17) — the only way a WO gets created now.
// ALWAYS creates a brand-new WO: every assembly line on the MO is a
// candidate, even ones already on a SIBLING WO of the same operation
// (2026-09-23: marks may deliberately be shared across an operation's
// several WOs — no cross-WO exclusivity). There is no "add marks to an
// existing WO" mode any more (removed 2026-09-23, same day it was added —
// user: "สร้าง wo แล้วไม่ควรเพิ่ม mark ทีหลังได้" — a WO's mark set is fixed
// at creation; need more marks for the same operation, create another WO).
// Create WO — ONE page, top to bottom (2026-09-17 revision, per user:
// "ทำเป็นหน้าเดียวได้ไหม" / "ต้องเลือกทั้ง part และ consume ในฟอร์มนี้เลย" —
// must be a single page, with parts AND consume both in this same form, not a
// separate step/screen). Marks stay editable at the top until Create is
// pressed; pressing it creates the WO (server computes each part's
// suggested weight_kg and each material's planned qty), and the SAME page
// then reveals Parts (grouped by mark — a part row is always mark-specific,
// see work_order_part's schema comment) and Consume sections below the now-
// locked marks summary, still in one scroll, one Done button.
// Create WO — ONE page, everything decided before Create is pressed
// (2026-09-17, 2nd revision — per user: "ไม่ต้องกด create ก่อนสิ ต้องเลือก
// mark เลือก part เลือก consume ก่อนถึงค่อยกด create" — must pick marks, then
// review/edit Parts + Consume, and ONLY THEN press Create; the earlier
// "create the WO first, then review" 2-step design was explicitly rejected).
// Parts/Consume are computed live via a read-only preview endpoint
// (POST /mo/:id/work-orders/preview) as the mark/qty selection changes — no
// WO exists yet at this point. Pressing Create submits marks + any
// part-weight/consume-actual edits together in ONE call.
function WoMarkPickerModal({
  moId, operationId, operationLabel, onClose,
}: {
  moId: number
  operationId: number
  operationLabel: string
  onClose: () => void
}) {
  const { data: lines, isLoading: loadingLines } = useMoAssemblies(moId, operationId)
  const createWo = useCreateWorkOrder(moId)
  // Map of assembly_line_id -> qty for this work order. Presence in the map = selected.
  // qty defaults to the line's full planned qty but is editable and capped at it — a WO
  // may plan fewer pieces of a mark than the MO's total (caught in manual testing, 2026-09-17).
  const [selected, setSelected] = useState<Map<number, number>>(new Map())
  const [consumeEdits, setConsumeEdits] = useState<Map<number, string>>(new Map())
  // Which team this WO is issued to (2026-09-22) — structured picker (FK to
  // `team`) now that the Team CRUD exists to back a real dropdown; string
  // state holding the <select>'s value, same pattern as OperatorModal's Team
  // field in ResourceList.tsx.
  const [teamId, setTeamId] = useState('')
  const { data: teams = [] } = useTeams()
  const { data: operators = [] } = useLaborSkills()
  // How many people from the picked team are on this WO (2026-09-25) —
  // internal: auto-counted from active operators on that team, still
  // editable (may not use the whole team); external: no operators to count,
  // entered manually. Re-derived from scratch on every team change, not
  // merged with a prior manual edit — switching teams mid-pick is rare
  // enough that "start fresh" beats guessing whether an old number still
  // makes sense for the new team.
  const [headcount, setHeadcount] = useState('')
  const selectedTeam = teams.find(t => String(t.id) === teamId)
  // Internal teams can't plan more people than are actually active on the
  // roster; external teams have no roster to cap against (2026-09-25).
  const headcountMax = selectedTeam?.team_type === 'internal'
    ? operators.filter(o => o.active && o.team?.id === selectedTeam.id).length
    : undefined
  function selectTeam(id: string) {
    setTeamId(id)
    const team = teams.find(t => String(t.id) === id)
    if (team?.team_type === 'internal') {
      const activeCount = operators.filter(o => o.active && o.team?.id === team.id).length
      setHeadcount(String(activeCount))
    } else {
      setHeadcount('')
    }
  }
  function onHeadcountChange(raw: string) {
    if (raw === '') { setHeadcount(''); return }
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    const clamped = headcountMax !== undefined ? Math.min(Math.max(n, 1), headcountMax) : Math.max(n, 1)
    setHeadcount(String(clamped))
  }
  // Planned production window (2026-09-22) — date+time, same "only on actual
  // creation" rule as teamId above. Plan Finish went through two reversals
  // the same week: first made auto-calculated from Plan Start + the
  // routing's planned duration (2026-09-23: "plan finish user ไม่ต้องกรอกเอง
  // ตอนสร้าง wo เพราะระบบจะคำนวณให้จาก routing ที่มี plan duration"), then
  // reverted BACK to manual entry the same day once the user reconsidered
  // ("ปรับตอนสร้าง wo ให้หน่อย user ต้องเป็นคนใส่ plan start finish เอง") —
  // both fields are now plain user input again, no computed/locked value.
  const [planStart, setPlanStart] = useState('')
  const [planFinish, setPlanFinish] = useState('')
  const [error, setError] = useState<string | null>(null)

  const available = lines ?? []
  const loading = loadingLines

  const marksForPreview = useMemo(
    () => [...selected].map(([assembly_line_id, qty]) => ({ assembly_line_id, qty })),
    [selected],
  )
  const { data: preview, isFetching: loadingPreview } = usePreviewWorkOrder(moId, operationId, marksForPreview)
  const consumes = preview?.consume ?? []

  function toggle(line: MoAssemblyRow) {
    if (line.wo_remaining === 0) return // fully committed to a sibling WO of this operation
    setSelected((prev) => {
      const next = new Map(prev)
      next.has(line.id) ? next.delete(line.id) : next.set(line.id, Math.min(line.qty, line.wo_remaining ?? line.qty))
      return next
    })
  }

  function setQty(lineId: number, maxQty: number, raw: string) {
    const n = Number(raw)
    setSelected((prev) => {
      const next = new Map(prev)
      next.set(lineId, Number.isFinite(n) ? Math.min(Math.max(n, 1), maxQty) : 1)
      return next
    })
  }

  const missingRequired = !selected.size || !teamId || !planStart || !planFinish || !headcount || Number(headcount) < 1

  async function submit() {
    if (!selected.size) return
    setError(null)
    if (!teamId || !planStart || !planFinish || !headcount || Number(headcount) < 1) {
      setError('Team, Headcount, Plan Start, and Plan Finish are all required.')
      return
    }
    try {
      const consume = [...consumeEdits]
        .map(([material_id, raw]) => ({ material_id, qty_actual: Number(raw) }))
        .filter((c) => Number.isFinite(c.qty_actual) && c.qty_actual >= 0)
      await createWo.mutateAsync({
        operation_id: operationId,
        marks: marksForPreview,
        consume,
        team_id: Number(teamId),
        team_headcount: Number(headcount),
        // datetime-local's value has no timezone — new Date(...) reads it in
        // the browser's own local time (the shop floor's), so .toISOString()
        // converts it to an unambiguous UTC instant before it leaves the
        // client (same pattern as ReportRepairModal/LogPmModal).
        plan_start: new Date(planStart).toISOString(),
        plan_finish: new Date(planFinish).toISOString(),
      })
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create the work order.'))
    }
  }

  const hdr = { fontSize: 10, fontWeight: 700, color: '#999', letterSpacing: '0.05em' } as const
  const sectionLabel = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#999', margin: '14px 0 6px' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', width: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Create Work Order · {operationLabel}</h2>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
          Pick the marks for this new work order. Consume updates below as you pick.
        </p>

        <div style={{ marginBottom: 4 }}>
            <div style={sectionLabel}>Team — who is this work order issued to <span style={{ color: '#C8202A' }}>*</span></div>
            <select
              value={teamId} onChange={(e) => selectTeam(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #DDD', borderRadius: 6, marginBottom: 6, boxSizing: 'border-box', background: '#fff' }}
            >
              <option value="">— Select team —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.team_type === 'internal' ? 'Internal' : 'External'})</option>)}
            </select>
            {teamId && (
              <div style={{ marginBottom: 10 }}>
                <div style={sectionLabel}>Headcount <span style={{ color: '#C8202A' }}>*</span></div>
                <input
                  type="number" min={1} max={headcountMax} value={headcount}
                  onChange={(e) => onHeadcountChange(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #DDD', borderRadius: 6, boxSizing: 'border-box' }}
                  placeholder={selectedTeam?.team_type === 'internal' ? 'Auto-counted from active operators — editable' : 'Enter headcount'}
                />
                {selectedTeam?.team_type === 'internal' && (
                  <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>
                    {headcountMax} active operator(s) on this team — max {headcountMax}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={sectionLabel}>Plan Start <span style={{ color: '#C8202A' }}>*</span></div>
                <input
                  type="datetime-local" value={planStart} onChange={(e) => setPlanStart(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #DDD', borderRadius: 6, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={sectionLabel}>Plan Finish <span style={{ color: '#C8202A' }}>*</span></div>
                <input
                  type="datetime-local" value={planFinish} onChange={(e) => setPlanFinish(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #DDD', borderRadius: 6, boxSizing: 'border-box' }}
                />
              </div>
            </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ border: '1px solid #EEE', borderRadius: 6, minHeight: 80 }}>
            {loading ? (
              <div style={{ padding: 20 }}><Loader2 size={16} className="animate-spin" style={{ color: '#C2C2C2' }} /></div>
            ) : !available.length ? (
              <div style={{ padding: 20, color: '#AAA', fontSize: 13 }}>No assemblies on this MO.</div>
            ) : (
              available.map((l) => {
                const fullyCommitted = l.wo_remaining === 0
                const maxQty = l.wo_remaining ?? l.qty
                return (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid #F4F4F4', opacity: fullyCommitted ? 0.5 : 1 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: fullyCommitted ? 'default' : 'pointer', flex: 1, minWidth: 0 }}>
                    <input type="checkbox" checked={selected.has(l.id)} disabled={fullyCommitted} onChange={() => toggle(l)} style={{ width: 15, height: 15, accentColor: '#C8202A', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{l.assembly_mark}</span>
                    {l.name && <span style={{ fontSize: 12, color: '#999', flexShrink: 0 }}>{l.name}</span>}
                    {fullyCommitted ? (
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: '#AAA', flexShrink: 0 }}>Fully committed to another WO</span>
                    ) : (
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: '#888', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[l.project, l.zone, l.sub_zone].filter(Boolean).join(' · ')}</span>
                    )}
                  </label>
                  {selected.has(l.id) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <input
                        type="number" min={1} max={maxQty} value={selected.get(l.id)}
                        onChange={(e) => setQty(l.id, maxQty, e.target.value)}
                        style={{ width: 52, padding: '3px 6px', fontSize: 13, border: '1px solid #DDD', borderRadius: 4, textAlign: 'right' }}
                      />
                      <span style={{ fontSize: 11, color: '#AAA' }}>/ {maxQty}</span>
                    </div>
                  )}
                </div>
                )
              })
            )}
          </div>

          {selected.size > 0 && (
            <>
              <div style={sectionLabel}>Consume</div>
              <div style={{ border: '1px solid #EEE', borderRadius: 6 }}>
                {loadingPreview ? (
                  <div style={{ padding: 20 }}><Loader2 size={16} className="animate-spin" style={{ color: '#C2C2C2' }} /></div>
                ) : !consumes.length ? (
                  <div style={{ padding: 14, color: '#AAA', fontSize: 13 }}>No consumable materials for this operation.</div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 70px 80px 50px', gap: 8, padding: '6px 12px', borderBottom: '1px solid #F0F0F0' }}>
                      <span style={hdr}>CODE</span><span style={hdr}>MATERIAL</span><span style={{ ...hdr, textAlign: 'right' }}>PLAN</span><span style={{ ...hdr, textAlign: 'right' }}>ACTUAL</span><span style={hdr}>UNIT</span>
                    </div>
                    {consumes.map((r, i) => {
                      const raw = consumeEdits.get(r.material_id)
                      // null qty = linked to this op in the Activity Library but with
                      // no formula to compute a quantity from — leave the actual-qty
                      // input blank (no sensible default) rather than pre-filling "null".
                      const displayVal = raw ?? (r.qty != null ? String(r.qty) : '')
                      return (
                        <div key={r.material_id} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 70px 80px 50px', gap: 8, padding: '6px 12px', borderBottom: i < consumes.length - 1 ? '1px solid #F9F9F9' : 'none', alignItems: 'center' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#666' }}>{r.code}</span>
                          <span style={{ fontSize: 12 }}>
                            {r.name}
                            {r.qty == null && (
                              <span style={{ marginLeft: 6, fontSize: 10, color: '#B08900', background: '#FFF8E1', border: '1px solid #FFE7A0', borderRadius: 4, padding: '1px 5px' }}>
                                no formula
                              </span>
                            )}
                          </span>
                          <span style={{ fontSize: 12, color: '#888', textAlign: 'right' }}>{r.qty != null ? r.qty.toFixed(2) : '—'}</span>
                          <input
                            type="number" min={0} step="0.01" value={displayVal}
                            placeholder={r.qty == null ? 'enter qty' : undefined}
                            onChange={(e) => setConsumeEdits((prev) => { const next = new Map(prev); next.set(r.material_id, e.target.value); return next })}
                            style={{ width: 70, textAlign: 'right', fontSize: 12, padding: '3px 6px', border: '1px solid #DDD', borderRadius: 4 }}
                          />
                          <span style={{ fontSize: 11, color: '#666' }}>{r.unit ?? '—'}</span>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {error && <div style={{ color: '#C8202A', fontSize: 12, marginTop: 8 }}>{error}</div>}
        <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={submit}
            disabled={missingRequired || createWo.isPending}
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: !missingRequired ? '#C8202A' : '#C2C2C2', color: '#fff', cursor: !missingRequired ? 'pointer' : 'not-allowed' }}
          >
            {createWo.isPending ? 'Saving…' : `Create (${selected.size})`}
          </button>
        </div>
      </div>
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
