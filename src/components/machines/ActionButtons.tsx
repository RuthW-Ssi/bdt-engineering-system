import { useState } from 'react'
import { Wrench, ClipboardCheck, Settings, CheckCircle } from 'lucide-react'
import { ReportRepairModal } from './ReportRepairModal'
import { LogPmModal } from './LogPmModal'
import { ChangeStatusModal } from './ChangeStatusModal'
import { CloseRepairTicketModal } from './CloseRepairTicketModal'
import type { MachineDetail, RepairTicket } from '../../api/machines'

interface Props {
  machine: MachineDetail
  openTicket: RepairTicket | undefined
}

export function ActionButtons({ machine, openTicket }: Props) {
  const [modal, setModal] = useState<'repair' | 'pm' | 'status' | 'close' | null>(null)

  const close = () => setModal(null)

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {machine.current_status === 'OPERATIONAL' && (
        <>
          <button onClick={() => setModal('repair')} style={btnStyle('#dc2626')}>
            <Wrench size={14} /> แจ้งซ่อม
          </button>
          <button onClick={() => setModal('pm')} style={btnStyle('#2563eb')}>
            <ClipboardCheck size={14} /> บันทึก PM
          </button>
        </>
      )}

      {(machine.current_status === 'REPAIR') && openTicket && (
        <button onClick={() => setModal('close')} style={btnStyle('#16a34a', true)}>
          <CheckCircle size={14} /> ปิด Ticket ซ่อม
        </button>
      )}

      {machine.current_status === 'MAINTENANCE' && (
        <>
          <button onClick={() => setModal('pm')} style={btnStyle('#16a34a', true)}>
            <ClipboardCheck size={14} /> ปิด PM
          </button>
        </>
      )}

      <button onClick={() => setModal('status')} style={btnOutlineStyle}>
        <Settings size={14} /> เปลี่ยนสถานะ
      </button>

      {modal === 'repair' && <ReportRepairModal machineId={machine.id} onClose={close} />}
      {modal === 'pm' && <LogPmModal machineId={machine.id} onClose={close} />}
      {modal === 'status' && (
        <ChangeStatusModal machineId={machine.id} currentStatus={machine.current_status} onClose={close} />
      )}
      {modal === 'close' && openTicket && (
        <CloseRepairTicketModal machineId={machine.id} ticket={openTicket} onClose={close} />
      )}
    </div>
  )
}

function btnStyle(bg: string, prominent?: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: prominent ? '8px 16px' : '7px 14px',
    borderRadius: 6, border: 'none', background: bg, color: 'white',
    cursor: 'pointer', fontSize: 13, fontWeight: 600,
    boxShadow: prominent ? '0 2px 4px rgba(0,0,0,0.15)' : undefined,
  }
}

const btnOutlineStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 14px', borderRadius: 6, border: '1px solid #d1d5db',
  background: 'white', color: '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 500,
}
