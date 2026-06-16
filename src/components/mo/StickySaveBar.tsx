import { Loader2 } from 'lucide-react'

/** Live summary + actions, pinned to bottom of the single-page form (P11). */
export function StickySaveBar({
  markPrefix,
  assemblyCount,
  totalQty,
  routingName,
  canSave,
  saving,
  onCancel,
  onSaveDraft,
  onSaveConfirm,
}: {
  markPrefix: string | null
  assemblyCount: number
  totalQty: number
  routingName: string | null
  canSave: boolean
  saving: boolean
  onCancel: () => void
  onSaveDraft: () => void
  onSaveConfirm: () => void
}) {
  return (
    <div
      className="flex items-center justify-between border-t border-chrome-100 px-6"
      style={{ height: 60, background: '#fff', flexShrink: 0, boxShadow: '0 -2px 8px rgba(0,0,0,0.04)' }}
    >
      <div style={{ fontSize: 12, color: '#666', display: 'flex', gap: 18 }}>
        <span>Prefix: <strong style={{ color: '#1A1A1A' }}>{markPrefix ?? '—'}</strong></span>
        <span>Assemblies: <strong style={{ color: '#1A1A1A' }}>{assemblyCount}</strong></span>
        <span>Total qty: <strong style={{ color: '#1A1A1A' }}>{totalQty}</strong></span>
        <span>Routing: <strong style={{ color: '#1A1A1A' }}>{routingName ?? '—'}</strong></span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onCancel}
          style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={onSaveDraft}
          disabled={!canSave || saving}
          style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: '1px solid #0C447C', background: '#fff', color: '#0C447C', cursor: canSave && !saving ? 'pointer' : 'not-allowed', opacity: canSave && !saving ? 1 : 0.5 }}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : 'Save as Draft'}
        </button>
        <button
          onClick={onSaveConfirm}
          disabled={!canSave || saving}
          style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, borderRadius: 6, border: 'none', background: canSave && !saving ? '#C8202A' : '#C2C2C2', color: '#fff', cursor: canSave && !saving ? 'pointer' : 'not-allowed' }}
        >
          Save + Confirm
        </button>
      </div>
    </div>
  )
}
