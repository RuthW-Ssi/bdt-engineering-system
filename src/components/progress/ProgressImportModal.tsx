import { useState } from 'react'
import { X, ChevronDown, ChevronUp } from 'lucide-react'
import { FileDropzone } from '../bom/FileDropzone'
import { ProgressDiffTable } from './ProgressDiffTable'
import { usePreviewProgressImport, useConfirmProgressImport } from '../../hooks/useProjectProgress'
import type { ProgressImportUnmatched, ProgressImportSkip } from '../../api/projectProgress'

interface Props {
  projectCode: string
  onClose: () => void
}

function extractErrorMessage(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  if (Array.isArray(msg)) return msg.join(', ')
  return msg ?? 'Import failed — please try again'
}

function CollapsibleMarkList({ label, items, render }: { label: string; items: unknown[]; render: (item: never, i: number) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, font: 'inherit', fontSize: 12, fontWeight: 600, color: '#8E8E8E', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {label} ({items.length})
      </button>
      {open && (
        <div style={{ marginTop: 6, fontSize: 11.5, ...{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }, color: '#555', lineHeight: 1.7, maxHeight: 160, overflowY: 'auto' }}>
          {items.map((item, i) => render(item as never, i))}
        </div>
      )}
    </div>
  )
}

// Preview → review diff → confirm, per the spec's 2-step flow. Structural
// (whole-file) rejections skip the diff review entirely and show the error
// directly — there's nothing to review when the file itself is malformed.
export function ProgressImportModal({ projectCode, onClose }: Props) {
  const preview = usePreviewProgressImport(projectCode)
  const confirm = useConfirmProgressImport(projectCode)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)

  const reset = () => {
    setFile(null)
    setError(null)
    preview.reset()
    confirm.reset()
  }

  const handleFilesAdded = (accepted: File[], rejected: { reason: string }[]) => {
    if (rejected.length) {
      setError(rejected[0].reason)
      return
    }
    const f = accepted[0]
    if (!f) return
    setFile(f)
    setError(null)
    preview.mutate(f, { onError: e => setError(extractErrorMessage(e)) })
  }

  const handleConfirm = () => {
    if (!file) return
    confirm.mutate(file, {
      onSuccess: r => setDone(r.updated),
      onError: e => setError(extractErrorMessage(e)),
    })
  }

  const result = preview.data
  const busy = preview.isPending || confirm.isPending

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '85vh', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1F1F1F' }}>Import Progress from Excel</div>
          <button onClick={onClose} disabled={busy} style={{ background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer', color: '#8E8E8E' }}>
            <X size={18} />
          </button>
        </div>

        {done != null ? (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#1A1A1A', marginBottom: 4 }}>
              Import applied — {done} assembl{done === 1 ? 'y' : 'ies'} updated.
            </div>
            <div style={{ fontSize: 12, color: '#8E8E8E' }}>View it any time under Progress → History.</div>
            <button
              onClick={onClose}
              style={{ marginTop: 16, font: 'inherit', fontSize: 13, fontWeight: 700, color: 'white', background: '#C8202A', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer' }}
            >
              Done
            </button>
          </div>
        ) : !file ? (
          <FileDropzone
            maxFiles={1}
            acceptedFormats={['.xlsx']}
            hint="Excel exported from this page — .xlsx, max 20 MB"
            onFilesAdded={handleFilesAdded}
          />
        ) : (
          <div style={{ overflowY: 'auto', minHeight: 0 }}>
            <div style={{ fontSize: 12.5, color: '#8E8E8E', marginBottom: 8 }}>{file.name}</div>

            {preview.isPending && <div style={{ padding: 20, textAlign: 'center', color: '#8E8E8E', fontSize: 12.5 }}>Validating…</div>}

            {error && (
              <div style={{ background: '#FCEBEB', border: '1px solid #F3C9CB', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: '#C8202A', marginBottom: 12 }}>
                {error}
              </div>
            )}

            {result && !error && (
              <>
                <div style={{ border: '1px solid #E0E0E0', borderRadius: 8, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
                  <ProgressDiffTable changes={result.changes} emptyMessage="No changes — this file matches current progress exactly" />
                </div>
                <CollapsibleMarkList
                  label="Marks not found in this project"
                  items={result.unmatchedMarks}
                  render={(item: ProgressImportUnmatched) => <div key={`${item.zone}-${item.mark}`}>{item.zone} / {item.mark}</div>}
                />
                <CollapsibleMarkList
                  label="Cells skipped (invalid value)"
                  items={result.skippedCells}
                  render={(item: ProgressImportSkip) => <div key={`${item.zone}-${item.mark}-${item.field}`}>{item.zone} / {item.mark} · {item.field}: {item.reason}</div>}
                />
              </>
            )}
          </div>
        )}

        {done == null && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            {file && (
              <button
                onClick={reset}
                disabled={busy}
                style={{ fontSize: 13, color: '#555', padding: '6px 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: 'white', cursor: busy ? 'default' : 'pointer' }}
              >
                {error ? 'Try another file' : 'Choose different file'}
              </button>
            )}
            <button
              onClick={onClose}
              disabled={busy}
              style={{ fontSize: 13, color: '#555', padding: '6px 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: 'white', cursor: busy ? 'default' : 'pointer' }}
            >
              Cancel
            </button>
            {result && !error && (
              <button
                onClick={handleConfirm}
                disabled={busy || !result.changes.length}
                style={{
                  fontSize: 13, fontWeight: 700, color: 'white', padding: '6px 16px', borderRadius: 6, border: 'none',
                  background: result.changes.length ? '#C8202A' : '#E0A6AA', cursor: busy || !result.changes.length ? 'default' : 'pointer',
                }}
              >
                {confirm.isPending ? 'Applying…' : `Apply ${result.changes.length} change${result.changes.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
