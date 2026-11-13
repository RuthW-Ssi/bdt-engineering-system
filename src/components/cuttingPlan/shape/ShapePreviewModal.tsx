import { AlertTriangle, XCircle } from 'lucide-react'
import type { ShapePreviewResult } from '../../../api/cutting-plan'

interface Props {
  preview: ShapePreviewResult
  onCancel: () => void
  onConfirm: () => void
  isUploading: boolean
}

const cell = { padding: '6px 8px' } as const
const head = { ...cell, fontWeight: 500 } as const

// Shape (2026-11-10): what will be saved, per size, before Confirm & Save. Same rules as plate: any problem
// blocks the whole upload; a size already saved with the same report is skipped, all copies = nothing to save.
export function ShapePreviewModal({ preview, onCancel, onConfirm, isUploading }: Props) {
  const { sizes, problems, warnings, notUsed, alreadyInSystem } = preview
  const badFiles = new Set(problems.map(p => p.file)).size
  const copies = alreadyInSystem.filter(a => a.sameReport).length
  const nothingToSave = sizes.length > 0 && copies === sizes.length
  const blocked = problems.length > 0 || nothingToSave || sizes.length === 0
  const box = (bad: boolean) => ({
    background: bad ? '#FEF2F2' : '#FFFBEB', border: `1px solid ${bad ? '#FCA5A5' : '#FCD34D'}`, borderRadius: 8, padding: 12,
    fontSize: 12, color: bad ? '#991B1B' : '#92400E', lineHeight: 1.6,
  })

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget && !isUploading) onCancel() }}
    >
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1F1F1F' }}>Confirm before saving · {sizes.length} {sizes.length === 1 ? 'size' : 'sizes'}</div>

        {sizes.length > 0 && (
          <div style={{ border: '1px solid #E0E0E0', borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#8E8E8E' }}>
                  <th style={head}>Size</th><th style={head}>Grade</th>
                  <th style={{ ...head, textAlign: 'right' }}>Stock pieces</th><th style={{ ...head, textAlign: 'right' }}>Parts</th><th style={{ ...head, textAlign: 'right' }}>Yield</th>
                </tr>
              </thead>
              <tbody>
                {sizes.map(s => (
                  <tr key={s.file} style={{ borderTop: '1px solid #F3F4F6', color: '#1F1F1F' }}>
                    <td style={{ ...cell, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{s.profile}</td>
                    <td style={cell}>{s.grade ?? '—'}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{s.stocks}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{s.parts}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{s.yieldPct.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {notUsed.length > 0 && (
          <div style={{ fontSize: 12, color: '#8E8E8E' }}>
            {notUsed.length} {notUsed.length === 1 ? 'file' : 'files'} not used (plan stocks and part lists): {notUsed.join(', ')}
          </div>
        )}

        {problems.length > 0 && (
          <div style={box(true)}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <XCircle size={16} style={{ color: '#B91C1C', flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 600 }}>Cannot save: {badFiles} {badFiles === 1 ? 'file needs' : 'files need'} fixing. Nothing was saved.</div>
                Fix these files in CutLogic and upload again.
              </div>
            </div>
            <div style={{ marginTop: 8, background: 'white', borderRadius: 6, border: '1px solid #FECACA', maxHeight: 240, overflowY: 'auto' }}>
              {problems.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '6px 8px', borderTop: i ? '1px solid #FEE2E2' : 'none', color: '#1F1F1F' }}>
                  <span style={{ fontFamily: 'monospace', flex: '0 0 45%', wordBreak: 'break-all' }}>{p.file}</span>
                  <span>{p.problem}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div style={box(false)}>
            <div style={{ display: 'flex', gap: 8, fontWeight: 600 }}><AlertTriangle size={16} style={{ color: '#D97706' }} />Can be saved; check these</div>
            {warnings.map(w => <div key={w}>{w}</div>)}
          </div>
        )}

        {alreadyInSystem.length > 0 && (
          <div style={box(nothingToSave)}>
            <div style={{ fontWeight: 600 }}>
              {nothingToSave
                ? 'Every size is already in the system with the same report. Nothing to save.'
                : `${alreadyInSystem.length} of ${sizes.length} sizes are already in this project and zone.`}
            </div>
            {alreadyInSystem.map(a => (
              <div key={a.profile}>
                <span style={{ fontFamily: 'monospace' }}>{a.profile}</span> · upload #{a.uploadId} · {a.sameReport ? 'Same report · not saved again' : 'Report changed · saved as the newer version'}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-2" style={{ marginTop: 8 }}>
          <button onClick={onCancel} disabled={isUploading}
            style={{ fontSize: 13, color: '#555', padding: '6px 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: 'white' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isUploading || blocked} className="disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontSize: 13, fontWeight: 600, color: 'white', padding: '6px 16px', borderRadius: 6, border: 'none', background: '#C8202A' }}>
            {isUploading ? 'Saving...' : 'Confirm & Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
