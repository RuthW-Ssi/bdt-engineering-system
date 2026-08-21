import { useState } from 'react'
import { X, Upload, Loader2, FileText } from 'lucide-react'
import { FileDropzone } from '../bom/FileDropzone'

const DRAWING_FORMATS = ['.pdf', '.dwg', '.dxf', '.png', '.jpg', '.jpeg']
const MAX_DRAWING_SIZE = 50_000_000 // 50MB

interface Props {
  productLabel: string
  isUploading: boolean
  onFileConfirmed: (file: File) => void
  onClose: () => void
}

export function DrawingUploadModal({ productLabel, isUploading, onFileConfirmed, onClose }: Props) {
  // Staged, not uploaded yet — matches BimUploadModal's pattern: picking a
  // file only stages it, the Upload button below is what actually sends it,
  // giving a chance to double-check (or remove and re-pick) first.
  const [stagedFile, setStagedFile] = useState<File | null>(null)

  const handleConfirm = () => {
    if (stagedFile) onFileConfirmed(stagedFile)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget && !isUploading) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 480, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>Upload Drawing</span>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40"
            style={{ width: 28, height: 28, color: '#8E8E8E' }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ fontSize: 12, color: '#8E8E8E' }}>
          {productLabel}
        </div>

        {stagedFile ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#FAFAFA', border: '1px solid #ECECEC', borderRadius: 8, fontSize: 13 }}>
            <FileText size={16} style={{ color: '#8E8E8E', flexShrink: 0 }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{stagedFile.name}</span>
            <button
              onClick={() => setStagedFile(null)}
              disabled={isUploading}
              className="flex items-center justify-center rounded hover:bg-chrome-100 disabled:opacity-40"
              style={{ width: 22, height: 22, color: '#8E8E8E', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <FileDropzone
            maxFiles={1}
            currentCount={0}
            acceptedFormats={DRAWING_FORMATS}
            maxSizeBytes={MAX_DRAWING_SIZE}
            hint="PDF, DWG, DXF, PNG, JPG · up to 50 MB"
            onFilesAdded={accepted => setStagedFile(accepted[0] ?? null)}
            disabled={isUploading}
          />
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isUploading}
            className="disabled:opacity-40"
            style={{ fontSize: 13, color: '#555', padding: '6px 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: 'white' }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!stagedFile || isUploading}
            className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#0C447C' }}
          >
            {isUploading
              ? <><Loader2 size={13} className="animate-spin" />Uploading...</>
              : <><Upload size={13} />Upload</>}
          </button>
        </div>
      </div>
    </div>
  )
}
