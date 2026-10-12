import { useState } from 'react'
import { X } from 'lucide-react'
import type { DocumentFields, DocumentItem } from '../../api/documents'
import { AUDIENCE_LABELS } from '../../lib/documents'

interface Props {
  // Present = editing an existing document; absent = new upload
  doc?: DocumentItem
  saving: boolean
  onSave: (fields: DocumentFields, file: File | null) => void
  onClose: () => void
}

const inputStyle = { height: 36, padding: '0 10px', fontSize: 13, borderRadius: 6, border: '1px solid #E0E0E0', width: '100%' }
// Matches the backend cap (Cloud Run's 32 MiB request limit, 2026-10-12)
const MAX_MB = 30
const labelStyle = { fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4, display: 'block' }

export function DocumentFormModal({ doc, saving, onSave, onClose }: Props) {
  const [fields, setFields] = useState<DocumentFields>({
    title: doc?.title ?? '',
    version: doc?.version ?? '',
    category: doc?.category ?? 'user-manual',
    audience: doc?.audience ?? 'employee',
    description: doc?.description ?? '',
  })
  const [file, setFile] = useState<File | null>(null)
  const set = (k: keyof DocumentFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setFields(f => ({ ...f, [k]: e.target.value }))

  const tooBig = !!file && file.size > MAX_MB * 1024 * 1024
  const canSave = fields.title.trim() && fields.version.trim() && (doc || file) && !tooBig && !saving

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 480, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>{doc ? 'Edit Document' : 'Upload Document'}</span>
          <button onClick={onClose} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 28, height: 28, color: '#8E8E8E' }}>
            <X size={16} />
          </button>
        </div>

        <div>
          <label style={labelStyle}>Title</label>
          <input value={fields.title} onChange={set('title')} maxLength={200} style={inputStyle} placeholder="คู่มือระบบ BDT — งานผลิต" />
        </div>
        <div className="flex gap-3">
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Version</label>
            <input value={fields.version} onChange={set('version')} maxLength={30} style={inputStyle} placeholder="v1" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Visible to</label>
            <select value={fields.audience} onChange={set('audience')} style={inputStyle}>
              {Object.entries(AUDIENCE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Description (optional)</label>
          <textarea value={fields.description} onChange={set('description')} maxLength={1000} rows={2}
            style={{ ...inputStyle, height: 'auto', padding: 8, resize: 'vertical' }} />
        </div>
        <div>
          <label style={labelStyle}>{doc ? 'Replace PDF with a new version (optional)' : 'PDF file'}</label>
          <input type="file" accept="application/pdf,.pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: 13 }} />
          {doc && !file && <div style={{ fontSize: 12, color: '#8E8E8E', marginTop: 4 }}>Current file: {doc.file_name}</div>}
          {tooBig && <div style={{ fontSize: 12, color: '#C8202A', marginTop: 4 }}>ไฟล์ใหญ่เกิน {MAX_MB} MB — ลดขนาด PDF ก่อนอัปโหลด</div>}
          {!tooBig && <div style={{ fontSize: 12, color: '#8E8E8E', marginTop: 4 }}>PDF ไม่เกิน {MAX_MB} MB</div>}
          {doc && file && <div style={{ fontSize: 12, color: '#854F0B', marginTop: 4 }}>The current file will be replaced — remember to update the version.</div>}
        </div>

        <div className="flex justify-end gap-2" style={{ marginTop: 4 }}>
          <button onClick={onClose} className="rounded-md border border-chrome-200 hover:bg-chrome-50" style={{ height: 36, padding: '0 16px', fontSize: 13 }}>
            Cancel
          </button>
          <button
            onClick={() => onSave(fields, file)}
            disabled={!canSave}
            className="rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
