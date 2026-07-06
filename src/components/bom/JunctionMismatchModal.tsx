import type { PreviewJunctionsResult } from '../../api/dispatches'

interface Props {
  mismatch: PreviewJunctionsResult
  onCancel: () => void
  onConfirm: () => void
  isUploading: boolean
}

const MAX_DISPLAYED = 20

function MarkList({ label, marks }: { label: string; marks: string[] }) {
  if (marks.length === 0) return null
  const shown = marks.slice(0, MAX_DISPLAYED)
  const remaining = marks.length - shown.length
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#1F1F1F', fontFamily: 'monospace', lineHeight: 1.6 }}>
        {shown.join(', ')}
        {remaining > 0 && <span style={{ color: '#8E8E8E' }}> (+{remaining} more)</span>}
      </div>
    </div>
  )
}

export function JunctionMismatchModal({ mismatch, onCancel, onConfirm, isUploading }: Props) {
  const total = mismatch.unmatchedAssemblyMarks.length + mismatch.unmatchedPartMarks.length

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget && !isUploading) onCancel() }}
    >
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 480, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1F1F1F' }}>
          พบ {total} mark ที่จับคู่กันไม่ได้
        </div>
        <div style={{ fontSize: 13, color: '#555' }}>
          รายการเหล่านี้จะไม่ถูกผูกกับ assembly ใดๆ (กลายเป็น orphan part) ถ้าอัพโหลดต่อ
        </div>
        <MarkList label="Assembly mark ที่ไม่พบใน Assembly List" marks={mismatch.unmatchedAssemblyMarks} />
        <MarkList label="Part mark ที่ไม่พบใน Part List" marks={mismatch.unmatchedPartMarks} />
        <div className="flex items-center justify-end gap-2" style={{ marginTop: 8 }}>
          <button
            onClick={onCancel}
            disabled={isUploading}
            style={{ fontSize: 13, color: '#555', padding: '6px 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: 'white' }}
          >
            ยกเลิก
          </button>
          <button
            onClick={onConfirm}
            disabled={isUploading}
            className="disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontSize: 13, fontWeight: 600, color: 'white', padding: '6px 16px', borderRadius: 6, border: 'none', background: '#C8202A' }}
          >
            {isUploading ? 'กำลังอัพโหลด...' : 'อัพโหลดต่อ'}
          </button>
        </div>
      </div>
    </div>
  )
}
