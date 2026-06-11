import { useState } from 'react'
import { useOpenRepairTicket, useChangeStatus } from '../../hooks/useMachines'
import { PhotoUploadField } from './PhotoUploadField'
import { MachineStatusPill } from './MachineStatusPill'
import type { RepairSeverity, EquipmentStatus, SuggestedStatusChange } from '../../api/machines'

interface Props {
  machineId: number
  onClose: () => void
}

export function ReportRepairModal({ machineId, onClose }: Props) {
  const [form, setForm] = useState({
    reported_by: '',
    reported_at: new Date().toISOString().slice(0, 16),
    severity: 'MEDIUM' as RepairSeverity,
    problem_description: '',
    photos_before: [] as string[],
  })
  const [suggest, setSuggest] = useState<SuggestedStatusChange | null>(null)
  const [statusChangedBy, setStatusChangedBy] = useState('')

  const openMutation = useOpenRepairTicket(machineId)
  const statusMutation = useChangeStatus(machineId)

  const set = (k: string, v: string | string[]) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await openMutation.mutateAsync({
      reported_by: form.reported_by,
      reported_at: new Date(form.reported_at).toISOString(),
      severity: form.severity,
      problem_description: form.problem_description,
      photos_before: form.photos_before,
    })
    if (result.suggested_status_change) {
      setSuggest(result.suggested_status_change)
    } else {
      onClose()
    }
  }

  const handleAcceptSuggest = async () => {
    if (!suggest) return
    await statusMutation.mutateAsync({
      new_status: suggest.to,
      reason: 'เปลี่ยนสถานะอัตโนมัติหลังแจ้งซ่อม',
      changed_by: statusChangedBy || form.reported_by,
    })
    onClose()
  }

  if (suggest) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 400 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>เปลี่ยนสถานะด้วยไหม?</h2>
          <p style={{ fontSize: 14, color: '#374151', marginBottom: 16 }}>
            ต้องการเปลี่ยนสถานะจาก{' '}
            <MachineStatusPill status={suggest.from as EquipmentStatus} size="sm" /> เป็น{' '}
            <MachineStatusPill status={suggest.to as EquipmentStatus} size="sm" /> ด้วยไหม?
          </p>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>ผู้บันทึก</label>
            <input value={statusChangedBy} onChange={e => setStatusChangedBy(e.target.value)} placeholder={form.reported_by} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={cancelBtnStyle}>ไม่ต้องการ</button>
            <button onClick={handleAcceptSuggest} disabled={statusMutation.isPending} style={submitBtnStyle}>
              {statusMutation.isPending ? 'กำลังบันทึก...' : 'ยืนยัน เปลี่ยนสถานะ'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>แจ้งซ่อม</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280' }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="ผู้แจ้ง *">
            <input required value={form.reported_by} onChange={e => set('reported_by', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="วันที่แจ้ง *">
            <input required type="datetime-local" value={form.reported_at} onChange={e => set('reported_at', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="ความรุนแรง *">
            <div style={{ display: 'flex', gap: 8 }}>
              {(['LOW', 'MEDIUM', 'HIGH'] as RepairSeverity[]).map(s => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13 }}>
                  <input type="radio" value={s} checked={form.severity === s} onChange={() => set('severity', s)} />
                  <span style={{ color: s === 'HIGH' ? '#dc2626' : s === 'MEDIUM' ? '#d97706' : '#16a34a', fontWeight: 600 }}>
                    {s === 'LOW' ? 'เล็กน้อย' : s === 'MEDIUM' ? 'ปานกลาง' : 'รุนแรง'}
                  </span>
                </label>
              ))}
            </div>
          </Field>
          <Field label="รายละเอียดปัญหา *">
            <textarea required value={form.problem_description} onChange={e => set('problem_description', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
          <PhotoUploadField label="รูปก่อนซ่อม" value={form.photos_before} onChange={v => set('photos_before', v)} />

          {openMutation.error && (
            <div style={{ color: '#dc2626', fontSize: 13 }}>เกิดข้อผิดพลาด กรุณาลองใหม่</div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>ยกเลิก</button>
            <button type="submit" disabled={openMutation.isPending} style={{ ...submitBtnStyle, background: '#dc2626' }}>
              {openMutation.isPending ? 'กำลังบันทึก...' : 'แจ้งซ่อม'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

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
