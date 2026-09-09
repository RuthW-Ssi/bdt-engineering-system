import { useState } from 'react'
import { X } from 'lucide-react'
import type { ProgressZoneRow, UpdateAssemblyProgressPayload } from '../../api/projectProgress'
import { ProgressEditFields } from './ProgressEditForm'
import { rowToDraft, diffDraft } from './progressEditShared'

const mono: React.CSSProperties = { fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }

// The Overview tab's 3D-click popup — same field set as
// ProgressAssemblyTable's inline accordion (via the shared ProgressEditFields),
// just in a modal instead of a table row, since Overview has no per-zone
// assembly table to expand a row inside of. Same backdrop/card convention
// as ConfirmDialog.tsx (fixed inset overlay, click-outside-to-close).
export function ProgressEditModal({ row, saving, onUpdate, onClose }: {
  row: ProgressZoneRow
  saving: boolean
  onUpdate: (assemblyId: number, payload: UpdateAssemblyProgressPayload) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<UpdateAssemblyProgressPayload>(() => rowToDraft(row))

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'white', borderRadius: 12, width: 640, maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)', border: '1px solid #E5E7EB',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid #EDEFF2', position: 'sticky', top: 0, background: 'white',
        }}>
          <div>
            <div style={{ ...mono, fontWeight: 700, fontSize: 15, color: '#1A1A1A' }}>{row.mark}</div>
            {row.zone_label && <div style={{ fontSize: 11.5, color: '#8E8E8E', marginTop: 2 }}>{row.zone_label}</div>}
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 7, border: '1px solid #E0E0E0', background: 'white',
              color: '#8E8E8E', cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: '18px 20px' }}>
          <ProgressEditFields
            row={row}
            draft={draft}
            onChange={setDraft}
            saving={saving}
            onSave={() => {
              const payload = diffDraft(draft, row)
              if (Object.keys(payload).length) onUpdate(row.assembly_id, payload)
              onClose()
            }}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  )
}
