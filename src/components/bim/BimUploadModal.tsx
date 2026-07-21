import { useState } from 'react'
import { X, Upload, Loader2, FileText } from 'lucide-react'
import { FileDropzone } from '../bom/FileDropzone'

const IFC_FORMATS = ['.ifc']
const MAX_IFC_SIZE = 100_000_000 // 100MB — "start small" per design discussion; revisit if real exports run larger

interface Props {
  projectLabel: string
  latestVersion: { major: number; minor: number } | null
  versionChoice: 'minor' | 'major'
  onVersionChoiceChange: (choice: 'minor' | 'major') => void
  isUploading: boolean
  onFilesAdded: (files: File[]) => void
  onClose: () => void
}

export function BimUploadModal({
  projectLabel, latestVersion, versionChoice, onVersionChoiceChange, isUploading, onFilesAdded, onClose,
}: Props) {
  // Staged, not uploaded yet — dropping/selecting a file only picks it, the
  // Upload button below is what actually kicks off the request. Confirmed
  // 2026-07-21: auto-uploading on drop gave no chance to double-check the
  // file or version choice first.
  const [stagedFile, setStagedFile] = useState<File | null>(null)

  const handleConfirm = () => {
    if (stagedFile) onFilesAdded([stagedFile])
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget && !isUploading) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 480, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>Upload Model</span>
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
          {projectLabel}
        </div>

        {latestVersion && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Version</label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="radio" checked={versionChoice === 'minor'} onChange={() => onVersionChoiceChange('minor')} disabled={isUploading} />
                Minor update (v{latestVersion.major}.{latestVersion.minor + 1})
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="radio" checked={versionChoice === 'major'} onChange={() => onVersionChoiceChange('major')} disabled={isUploading} />
                Major update (v{latestVersion.major + 1}.0)
              </label>
            </div>
          </div>
        )}

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
            acceptedFormats={IFC_FORMATS}
            maxSizeBytes={MAX_IFC_SIZE}
            hint=".ifc (IFC2x3 / IFC4) · up to 100MB"
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
            style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}
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
