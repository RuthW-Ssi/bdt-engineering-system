import { useState } from 'react'
import { useCreateMaintenanceLog } from '../../hooks/useMachines'
import { PhotoUploadField } from './PhotoUploadField'

interface Props {
  machineId: number
  onClose: () => void
}

export function LogPmModal({ machineId, onClose }: Props) {
  const [form, setForm] = useState({
    performed_by: '',
    performed_at: new Date().toISOString().slice(0, 16),
    description: '',
    parts_replaced: '',
    duration_min: '',
    notes: '',
    photo_urls: [] as string[],
  })

  const mutation = useCreateMaintenanceLog(machineId)

  const set = (k: string, v: string | string[]) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await mutation.mutateAsync({
      performed_by: form.performed_by,
      performed_at: new Date(form.performed_at).toISOString(),
      description: form.description,
      parts_replaced: form.parts_replaced || undefined,
      duration_min: form.duration_min ? Number(form.duration_min) : undefined,
      notes: form.notes || undefined,
      photo_urls: form.photo_urls,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Log PM</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280' }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Performed by *">
            <input required value={form.performed_by} onChange={e => set('performed_by', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Date performed *">
            <input required type="datetime-local" value={form.performed_at} onChange={e => set('performed_at', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Description *">
            <textarea required value={form.description} onChange={e => set('description', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
          <Field label="Parts replaced">
            <input value={form.parts_replaced} onChange={e => set('parts_replaced', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Downtime (minutes)">
            <input type="number" min={0} value={form.duration_min} onChange={e => set('duration_min', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Notes">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
          <PhotoUploadField label="Photos (optional)" value={form.photo_urls} onChange={v => set('photo_urls', v)} />

          {mutation.error && (
            <div style={{ color: '#dc2626', fontSize: 13 }}>Error occurred. Please try again</div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>Cancel</button>
            <button type="submit" disabled={mutation.isPending} style={submitBtnStyle}>
              {mutation.isPending ? 'Saving...' : 'Log PM'}
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
