import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Wrench, ClipboardCheck, Settings, AlertTriangle } from 'lucide-react'
import {
  useMachine, useMachineMaintenanceLogs, useMachineRepairTickets, useMachineStatusHistory,
} from '../hooks/useMachines'
import { MachineStatusPill } from '../components/machines/MachineStatusPill'
import { DaysSincePmBadge } from '../components/machines/DaysSincePmBadge'
import { ActionButtons } from '../components/machines/ActionButtons'
import { CloseRepairTicketModal } from '../components/machines/CloseRepairTicketModal'
import type { RepairTicket } from '../api/machines'

const TABS = ['Details', 'Jobs (Mock)', 'PM log', 'Repair Tickets', 'Status history']

export function MachineDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const machineId = Number(id)
  const [tab, setTab] = useState(0)

  const { data: machine, isLoading } = useMachine(machineId)
  const { data: pmLogs } = useMachineMaintenanceLogs(machineId)
  const { data: tickets } = useMachineRepairTickets(machineId)
  const { data: statusHistory } = useMachineStatusHistory(machineId)

  if (isLoading || !machine) {
    return (
      <div style={{ padding: 32, color: '#6b7280', fontSize: 14, textAlign: 'center' }}>
        {isLoading ? 'Loading...' : 'No data found'}
      </div>
    )
  }

  const openTicket = tickets?.find(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS')

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100 }}>
      {/* Back */}
      <button
        onClick={() => navigate('/machines')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, marginBottom: 16, padding: 0 }}
      >
        <ChevronLeft size={16} /> Back
      </button>

      {/* Header card */}
      <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#111827' }}>{machine.name}</h1>
              <MachineStatusPill status={machine.current_status} />
            </div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              <span style={{ fontFamily: 'monospace' }}>{machine.code}</span>
              {machine.location && <> · {machine.location}</>}
              {machine.manufacturer && <> · {machine.manufacturer}</>}
              {machine.model && <> · {machine.model}</>}
            </div>
          </div>

          {/* Quick stats */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <StatBox label="PM age" value={<DaysSincePmBadge days={machine.days_since_pm} />} />
            <StatBox label="Repairs this month" value={`${machine.quick_stats.repairs_this_month}`} />
            <DowntimeBox stats={machine.quick_stats} />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <ActionButtons machine={machine} openTicket={openTicket} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #e5e7eb', marginBottom: 20, display: 'flex', gap: 0 }}>
        {TABS.map((t, i) => (
          <button
            key={i}
            onClick={() => setTab(i)}
            style={{
              padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: tab === i ? 600 : 400,
              color: tab === i ? '#2563eb' : '#6b7280',
              borderBottom: tab === i ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 0 && <DetailsTab machine={machine} />}
        {tab === 1 && <JobsTab jobs={machine.mock_jobs} />}
        {tab === 2 && <PmLogsTab logs={pmLogs ?? []} />}
        {tab === 3 && <RepairTicketsTab tickets={tickets ?? []} machineId={machineId} />}
        {tab === 4 && <StatusHistoryTab history={statusHistory ?? []} />}
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ marginTop: 2 }}>{typeof value === 'string' ? <span style={{ fontSize: 14, fontWeight: 600 }}>{value}</span> : value}</div>
    </div>
  )
}

function DowntimeBox({ stats }: { stats: { total_downtime_hours: number; repair_downtime_hours: number; pm_downtime_hours: number; repairs_this_month: number; pm_count_this_month: number } }) {
  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Downtime</div>
      <div style={{ marginTop: 2, fontSize: 14, fontWeight: 600 }}>{stats.total_downtime_hours} hrs</div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>↳ Repair: {stats.repair_downtime_hours} hrs ({stats.repairs_this_month} tickets)</div>
      <div style={{ fontSize: 11, color: '#6b7280' }}>↳ PM: {stats.pm_downtime_hours} hrs ({stats.pm_count_this_month} PMs)</div>
    </div>
  )
}

function DetailsTab({ machine }: { machine: ReturnType<typeof useMachine>['data'] & object }) {
  if (!machine) return null
  const fields = [
    ['Code', machine.code],
    ['Name', machine.name],
    ['Type', machine.type],
    ['Location', machine.location],
    ['Manufacturer', machine.manufacturer],
    ['Model', machine.model],
    ['Serial No.', machine.serial_number],
    ['Install date', machine.install_date ? new Date(machine.install_date).toLocaleDateString('th-TH') : null],
    ['Specs', machine.specs],
  ]
  return (
    <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: 20 }}>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 24px' }}>
        {fields.map(([label, value]) => (
          <div key={label as string} style={{ display: 'contents' }}>
            <dt style={{ fontSize: 13, color: '#6b7280', fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</dt>
            <dd style={{ fontSize: 13, color: '#111827', margin: 0 }}>{(value as string) ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function JobsTab({ jobs }: { jobs: { code: string; operation: string; status: string; start: string; end: string | null }[] }) {
  return (
    <div>
      <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertTriangle size={14} style={{ color: '#d97706' }} />
        <span style={{ fontSize: 13, color: '#92400e' }}>⚠ Mock data · not linked to real work orders</span>
      </div>
      <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Job code', 'Operation', 'Status', 'Start', 'End'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((j, i) => (
              <tr key={j.code} style={{ borderBottom: i < jobs.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                <td style={tdS}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{j.code}</span></td>
                <td style={tdS}>{j.operation}</td>
                <td style={tdS}>
                  <span style={{
                    borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                    background: j.status === 'Done' ? '#dcfce7' : j.status === 'Running' ? '#fff7ed' : '#f3f4f6',
                    color: j.status === 'Done' ? '#16a34a' : j.status === 'Running' ? '#ea580c' : '#6b7280',
                  }}>{j.status}</span>
                </td>
                <td style={tdS}>{j.start}</td>
                <td style={tdS}>{j.end ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PmLogsTab({ logs }: { logs: import('../api/machines').MaintenanceLog[] }) {
  if (logs.length === 0) {
    return <div style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: 32 }}>No PM logs yet</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {logs.map(log => (
        <div key={log.id} style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Wrench size={16} style={{ color: '#2563eb', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{log.description}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Performed by: {log.performed_by}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'right', flexShrink: 0 }}>
              {new Date(log.performed_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
          {(log.parts_replaced || log.duration_min) && (
            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#6b7280' }}>
              {log.parts_replaced && <span>Parts replaced: {log.parts_replaced}</span>}
              {log.duration_min && <span>Duration: {log.duration_min} min</span>}
            </div>
          )}
          {log.photo_urls.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {log.photo_urls.map((url, i) => (
                <img key={i} src={url} alt="pm" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function RepairTicketsTab({ tickets, machineId }: { tickets: RepairTicket[]; machineId: number }) {
  const [closeTicket, setCloseTicket] = useState<RepairTicket | null>(null)

  if (tickets.length === 0) {
    return <div style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: 32 }}>No repair tickets yet</div>
  }
  return (
    <>
      {closeTicket && (
        <CloseRepairTicketModal
          machineId={machineId}
          ticket={closeTicket}
          onClose={() => setCloseTicket(null)}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tickets.map(t => {
          const isOpen = t.status === 'OPEN' || t.status === 'IN_PROGRESS'
          const mttr = t.duration_min ? `${Math.round(t.duration_min / 60 * 10) / 10}h` : null
          return (
            <div
              key={t.id}
              style={{
                background: isOpen ? '#fff7ed' : 'white',
                borderRadius: 10,
                border: `1px solid ${isOpen ? '#fed7aa' : '#e5e7eb'}`,
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Settings size={16} style={{ color: isOpen ? '#ea580c' : '#6b7280', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>{t.ticket_code}</span>
                      <span style={{
                        borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 600,
                        background: isOpen ? '#ffedd5' : '#f0fdf4',
                        color: isOpen ? '#ea580c' : '#16a34a',
                      }}>{t.status}</span>
                      <span style={{
                        borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 600,
                        background: t.severity === 'HIGH' ? '#fee2e2' : t.severity === 'MEDIUM' ? '#fef3c7' : '#f0fdf4',
                        color: t.severity === 'HIGH' ? '#dc2626' : t.severity === 'MEDIUM' ? '#d97706' : '#16a34a',
                      }}>{t.severity}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{t.problem_description}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Reported by: {t.reported_by}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'right', flexShrink: 0 }}>
                    {new Date(t.reported_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  {isOpen && (
                    <button
                      onClick={() => setCloseTicket(t)}
                      style={{
                        padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: '#16a34a', color: 'white', fontSize: 12, fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ✓ Closed · Repair complete
                    </button>
                  )}
                </div>
              </div>
              {t.status === 'CLOSED' && t.repair_description && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6', fontSize: 13, color: '#374151' }}>
                  <b>Repair:</b> {t.repair_description}
                  {mttr && <span style={{ marginLeft: 12, color: '#6b7280' }}>MTTR: {mttr}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function StatusHistoryTab({ history }: { history: import('../api/machines').StatusHistory[] }) {
  if (history.length === 0) {
    return <div style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: 32 }}>No status history yet</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {history.map(h => (
        <div key={h.id} style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <ClipboardCheck size={16} style={{ color: '#6b7280', flexShrink: 0 }} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <MachineStatusPill status={h.from_status} size="sm" />
                <span style={{ color: '#9ca3af', fontSize: 12 }}>→</span>
                <MachineStatusPill status={h.to_status} size="sm" />
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'right', flexShrink: 0 }}>
              {new Date(h.changed_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#374151', marginTop: 8 }}>
            <b>Reason:</b> {h.reason}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>By: {h.changed_by}</div>
        </div>
      ))}
    </div>
  )
}

const tdS: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: '#374151' }
