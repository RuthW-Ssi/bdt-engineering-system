import { useState } from 'react'
import { useCloseRepairTicket, useChangeStatus } from '../../hooks/useMachines'
import { PhotoUploadField } from './PhotoUploadField'
import { MachineStatusPill } from './MachineStatusPill'
import type { RepairTicket, EquipmentStatus, SuggestedStatusChange } from '../../api/machines'

interface Props {
  machineId: number
  ticket: RepairTicket
  onClose: () => void
}

export function CloseRepairTicketModal({ machineId, ticket, onClose }: Props) {
  const [form, setForm] = useState({
    repaired_by: '',
    closed_at: new Date().toISOString().slice(0, 16),
    repair_description: '',
    parts_replaced: '',
    duration_min: '',
    photos_after: [] as string[],
  })
  const [suggest, setSuggest] = useState<SuggestedStatusChange | null>(null)
  const [statusChangedBy, setStatusChangedBy] = useState('')

  const closeMutation = useCloseRepairTicket(machineId)
  const statusMutation = useChangeStatus(machineId)

  const set = (k: string, v: string | string[]) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await closeMutation.mutateAsync({
      ticketId: ticket.id,
      payload: {
        repaired_by: form.repaired_by,
        closed_at: new Date(form.closed_at).toISOString(),
        repair_description: form.repair_description,
        parts_replaced: form.parts_replaced || undefined,
        duration_min: form.duration_min ? Number(form.duration_min) : undefined,
        photos_after: form.photos_after,
      },
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
      reason: 'Status auto-changed after closing repair ticket',
      changed_by: statusChangedBy || form.repaired_by,
      related_repair_id: ticket.id,
    })
    onClose()
  }

  if (suggest) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 400 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Change status as well?</h2>
          <p style={{ fontSize: 14, color: '#374151', marginBottom: 16 }}>
            Change status from{' '}
            <MachineStatusPill status={suggest.from as EquipmentStatus} size="sm" /> to{' '}
            <MachineStatusPill status={suggest.to as EquipmentStatus} size="sm" /> as well?
          </p>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Recorded by</label>
            <input value={statusChangedBy} onChange={e => setStatusChangedBy(e.target.value)} placeholder={form.repaired_by} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={cancelBtnStyle}>No thanks</button>
            <button onClick={handleAcceptSuggest} disabled={statusMutation.isPending} style={{ ...submitBtnStyle, background: '#16a34a' }}>
              {statusMutation.isPending ? 'Saving...' : 'Confirm status change'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Close Repair Ticket</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280' }}>×</button>
        </div>

        <div style={{ background: '#fff7ed', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
          <div style={{ fontWeight: 600, color: '#ea580c', marginBottom: 4 }}>Problem Report (reference)</div>
          <div style={{ color: '#374151' }}><b>Ticket:</b> {ticket.ticket_code}</div>
          <div style={{ color: '#374151', marginTop: 4 }}><b>Problem:</b> {ticket.problem_description}</div>
          <div style={{ color: '#374151', marginTop: 4 }}><b>Reported by:</b> {ticket.reported_by}</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Repaired by *">
            <input required value={form.repaired_by} onChange={e => set('repaired_by', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Repair completion date *">
            <input required type="datetime-local" value={form.closed_at} onChange={e => set('closed_at', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Repair description *">
            <textarea required value={form.repair_description} onChange={e => set('repair_description', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
          <Field label="Parts replaced">
            <input value={form.parts_replaced} onChange={e => set('parts_replaced', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Downtime (minutes)">
            <input type="number" min={0} value={form.duration_min} onChange={e => set('duration_min', e.target.value)} style={inputStyle} />
          </Field>
          <PhotoUploadField label="After repair photos" value={form.photos_after} onChange={v => set('photos_after', v)} />

          {closeMutation.error && (
            <div style={{ color: '#dc2626', fontSize: 13 }}>Error occurred. Please try again</div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>Cancel</button>
            <button type="submit" disabled={closeMutation.isPending} style={{ ...submitBtnStyle, background: '#16a34a' }}>
              {closeMutation.isPending ? 'Saving...' : 'Close Ticket'}
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
