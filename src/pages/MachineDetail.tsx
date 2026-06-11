import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Wrench, ClipboardCheck, Settings, AlertTriangle } from 'lucide-react'
import {
  useMachine, useMachineMaintenanceLogs, useMachineRepairTickets, useMachineStatusHistory,
} from '../hooks/useMachines'
import { MachineStatusPill } from '../components/machines/MachineStatusPill'
import { DaysSincePmBadge } from '../components/machines/DaysSincePmBadge'
import { ActionButtons } from '../components/machines/ActionButtons'
import type { RepairTicket } from '../api/machines'

const TABS = ['รายละเอียด', 'งาน (Mock)', 'บันทึก PM', 'Ticket ซ่อม', 'ประวัติสถานะ']

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
        {isLoading ? 'กำลังโหลด...' : 'ไม่พบข้อมูล'}
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
        <ChevronLeft size={16} /> กลับ
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
          <div style={{ display: 'flex', gap: 20 }}>
            <StatBox label="อายุ PM" value={<DaysSincePmBadge days={machine.days_since_pm} />} />
            <StatBox label="ซ่อมเดือนนี้" value={`${machine.quick_stats.repairs_this_month} ครั้ง`} />
            <StatBox label="Downtime" value={machine.quick_stats.downtime_hours !== null ? `${machine.quick_stats.downtime_hours}h` : '—'} />
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

function DetailsTab({ machine }: { machine: ReturnType<typeof useMachine>['data'] & object }) {
  if (!machine) return null
  const fields = [
    ['รหัส', machine.code],
    ['ชื่อ', machine.name],
    ['ประเภท', machine.type],
    ['พื้นที่', machine.location],
    ['ผู้ผลิต', machine.manufacturer],
    ['รุ่น', machine.model],
    ['Serial No.', machine.serial_number],
    ['วันที่ติดตั้ง', machine.install_date ? new Date(machine.install_date).toLocaleDateString('th-TH') : null],
    ['สเปก', machine.specs],
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
        <span style={{ fontSize: 13, color: '#92400e' }}>⚠ ข้อมูล Mock · ยังไม่ link work order จริง</span>
      </div>
      <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['รหัสงาน', 'ออเปอเรชัน', 'สถานะ', 'เริ่ม', 'สิ้นสุด'].map(h => (
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
    return <div style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: 32 }}>ยังไม่มีบันทึก PM</div>
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
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>ดำเนินการโดย: {log.performed_by}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'right', flexShrink: 0 }}>
              {new Date(log.performed_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
          {(log.parts_replaced || log.duration_min) && (
            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#6b7280' }}>
              {log.parts_replaced && <span>อะไหล่: {log.parts_replaced}</span>}
              {log.duration_min && <span>เวลา: {log.duration_min} นาที</span>}
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

function RepairTicketsTab({ tickets }: { tickets: RepairTicket[]; machineId: number }) {
  if (tickets.length === 0) {
    return <div style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: 32 }}>ยังไม่มี ticket ซ่อม</div>
  }
  return (
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
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>แจ้งโดย: {t.reported_by}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'right', flexShrink: 0 }}>
                {new Date(t.reported_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
            {t.status === 'CLOSED' && t.repair_description && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6', fontSize: 13, color: '#374151' }}>
                <b>การซ่อม:</b> {t.repair_description}
                {mttr && <span style={{ marginLeft: 12, color: '#6b7280' }}>MTTR: {mttr}</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StatusHistoryTab({ history }: { history: import('../api/machines').StatusHistory[] }) {
  if (history.length === 0) {
    return <div style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: 32 }}>ยังไม่มีประวัติการเปลี่ยนสถานะ</div>
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
            <b>เหตุผล:</b> {h.reason}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>โดย: {h.changed_by}</div>
        </div>
      ))}
    </div>
  )
}

const tdS: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: '#374151' }
