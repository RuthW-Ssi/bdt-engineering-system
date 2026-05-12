import { X, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import type { DocType } from '../../lib/bom/filenameClassifier'
import { DOC_TYPE_LABELS } from '../../lib/bom/filenameClassifier'

const DOC_TYPES: DocType[] = ['ASSEMBLY_LIST', 'ASSEMBLY_PART_LIST', 'PART_LIST']

interface Props {
  file: File
  detectedType: DocType | null
  onRemove: () => void
  onTypeChange?: (type: DocType) => void
  error?: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export function FilePreviewItem({ file, detectedType, onRemove, onTypeChange, error }: Props) {
  const hasError = !!error
  const needsPick = !detectedType && !hasError

  const borderColor = hasError ? '#EF4444' : '#E0E0E0'
  const bg = hasError ? '#FEF2F2' : '#F9F9F9'

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: 6,
      background: bg,
      padding: '10px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      {/* Status icon */}
      <div style={{ flexShrink: 0 }}>
        {hasError
          ? <XCircle size={16} style={{ color: '#EF4444' }} />
          : needsPick
          ? <AlertTriangle size={16} style={{ color: '#B45309' }} />
          : <CheckCircle size={16} style={{ color: '#059669' }} />}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="truncate" style={{ fontSize: 13, fontWeight: 500, color: '#1F1F1F', maxWidth: 280 }}>
            {file.name}
          </span>
          <span style={{ fontSize: 11, color: '#8E8E8E', flexShrink: 0 }}>{formatSize(file.size)}</span>
        </div>

        {/* Type chip or picker */}
        {hasError ? (
          <div style={{ fontSize: 12, color: '#EF4444', marginTop: 2 }}>{error}</div>
        ) : detectedType ? (
          <span style={{
            display: 'inline-block', marginTop: 3,
            background: '#EAF3DE', color: '#27500A',
            borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 500,
          }}>
            {DOC_TYPE_LABELS[detectedType]}
          </span>
        ) : (
          <div className="flex items-center gap-1 mt-1">
            <span style={{ fontSize: 11, color: '#B45309' }}>ระบุประเภทไฟล์:</span>
            <select
              style={{ fontSize: 12, border: '1px solid #E0E0E0', borderRadius: 4, padding: '1px 6px', background: 'white' }}
              value=""
              onChange={e => onTypeChange?.(e.target.value as DocType)}
            >
              <option value="" disabled>เลือก...</option>
              {DOC_TYPES.map(t => (
                <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="flex items-center justify-center rounded hover:bg-chrome-100 flex-shrink-0"
        style={{ width: 24, height: 24, color: '#8E8E8E' }}
      >
        <X size={14} />
      </button>
    </div>
  )
}
