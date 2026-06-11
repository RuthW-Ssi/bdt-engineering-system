import { useState } from 'react'
import { useChangeStatus } from '../../hooks/useMachines'
import { MachineStatusPill } from './MachineStatusPill'
import type { EquipmentStatus } from '../../api/machines'

const ALL_STATUSES: EquipmentStatus[] = ['OPERATIONAL', 'MAINTENANCE', 'REPAIR', 'UNAVAILABLE', 'RETIRED']

interface Props {
  machineId: number
  currentStatus: EquipmentStatus
  onClose: () => void
}

export function ChangeStatusModal({ machineId, currentStatus, onClose }: Props) {
  const [newStatus, setNewStatus] = useState<EquipmentStatus | ''>('')
  const [reason, setReason] = useState('')
  const [changedBy, setChangedBy] = useState('')

  const mutation = useChangeStatus(machineId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newStatus) return
    await mutation.mutateAsync({ new_status: newStatus, reason, changed_by: changedBy })
    onClose()
  }

  const available = ALL_STATUSES.filter(s => s !== currentStatus)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 440 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>เปลี่ยนสถานะเครื่องจักร</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280' }}>×</button>
        </div>

        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6b7280' }}>
          สถานะปัจจุบัน: <MachineStatusPill status={currentStatus} size="sm" />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>สถานะใหม่ *</label>
            <select
              required
              value={newStatus}
              onChange={e => setNewStatus(e.target.value as EquipmentStatus)}
              style={inputStyle}
            >
              <option value="">-- เลือกสถานะ --</option>
              {available.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>เหตุผล *</label>
            <textarea
              required
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="ระบุเหตุผลที่เปลี่ยนสถานะ..."
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={labelStyle}>ผู้เปลี่ยน *</label>
            <input
              required
              value={changedBy}
              onChange={e => setChangedBy(e.target.value)}
              style={inputStyle}
            />
          </div>

          {mutation.error && (
            <div style={{ color: '#dc2626', fontSize: 13 }}>เกิดข้อผิดพลาด กรุณาลองใหม่</div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>ยกเลิก</button>
            <button type="submit" disabled={mutation.isPending} style={submitBtnStyle}>
              {mutation.isPending ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนสถานะ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 6,
  border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box',
}
const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db',
  background: 'white', cursor: 'pointer', fontSize: 13,
}
const submitBtnStyle: React.CSSProperties = {
  padding: '8px 20px', borderRadius: 6, border: 'none',
  background: '#2563eb', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600,
}
