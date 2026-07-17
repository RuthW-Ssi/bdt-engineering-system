import { AlertTriangle, XCircle } from 'lucide-react'
import type { CuttingPlanPreviewResult } from '../../api/cutting-plan'

interface Props {
  preview: CuttingPlanPreviewResult
  onCancel: () => void
  onConfirm: () => void
  isUploading: boolean
}

export function CuttingPlanPreviewModal({ preview, onCancel, onConfirm, isUploading }: Props) {
  const { summary, warnings, mappingError } = preview

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget && !isUploading) onCancel() }}
    >
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 480, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1F1F1F' }}>Confirm before saving</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { label: 'Plates', value: summary.plateCount },
            { label: 'Parts', value: summary.partCount },
            { label: 'Plate usage', value: summary.plateUsageCount },
            { label: 'Remnants', value: summary.remnantCount },
          ].map(s => (
            <div key={s.label} style={{ border: '1px solid #E0E0E0', borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1F1F1F' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#8E8E8E', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {mappingError && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: 12, display: 'flex', gap: 10 }}>
            <XCircle size={16} style={{ color: '#B91C1C', flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: '#991B1B', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Cannot save this upload</div>
              {mappingError}
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: 12, display: 'flex', gap: 10 }}>
            <AlertTriangle size={16} style={{ color: '#B45309', flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {warnings.length} file{warnings.length === 1 ? '' : 's'} may contain more than 1 plate
              </div>
              {warnings.map(w => (
                <div key={w.filename} style={{ fontFamily: 'monospace' }}>
                  {w.filename} — ~{w.plateCountDetected} plates detected, only 1 will be saved (known parser limitation)
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2" style={{ marginTop: 8 }}>
          <button
            onClick={onCancel}
            disabled={isUploading}
            style={{ fontSize: 13, color: '#555', padding: '6px 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: 'white' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isUploading || !!mappingError}
            className="disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontSize: 13, fontWeight: 600, color: 'white', padding: '6px 16px', borderRadius: 6, border: 'none', background: '#C8202A' }}
          >
            {isUploading ? 'Saving...' : 'Confirm & Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
