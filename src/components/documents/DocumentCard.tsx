import { useState } from 'react'
import { toast } from 'sonner'
import { Download, ExternalLink, FileText, Loader2, Pencil, Trash2 } from 'lucide-react'
import { downloadDocument, openDocument, type DocumentItem } from '../../api/documents'
import { AUDIENCE_LABELS } from '../../lib/documents'

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`)

interface Props {
  doc: DocumentItem
  // Admin-only actions; omitted = read-only card
  onEdit?: () => void
  onDelete?: () => void
}

// One card per document — "Open" is the big obvious action (most users only
// ever need that); download/edit/delete are secondary icons.
export function DocumentCard({ doc, onEdit, onDelete }: Props) {
  const [busy, setBusy] = useState<'open' | 'download' | null>(null)

  const run = async (kind: 'open' | 'download') => {
    setBusy(kind)
    try {
      await (kind === 'open' ? openDocument(doc.id) : downloadDocument(doc))
    } catch {
      toast.error('Could not open the file — please try again')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="bg-white border border-chrome-100 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center" style={{ background: '#FCEBEB' }}>
          <FileText size={20} className="text-ssi-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-chrome-900 text-[15px] leading-snug">{doc.title}</div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-chrome-400">
            <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: '#E6F1FB', color: '#0C447C' }}>{doc.version}</span>
            {doc.write_date && <span>{new Date(doc.write_date).toLocaleDateString('th-TH')}</span>}
            <span>{formatSize(doc.file_size)}</span>
            {onEdit && <span>· {AUDIENCE_LABELS[doc.audience]}</span>}
          </div>
          {doc.description && <div className="text-[13px] text-chrome-600 mt-1.5">{doc.description}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => run('open')}
          disabled={busy !== null}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg text-white font-semibold disabled:opacity-60"
          style={{ height: 42, fontSize: 14, background: '#C8202A' }}
        >
          {busy === 'open' ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
          Open
        </button>
        <IconButton label="Download" onClick={() => run('download')} disabled={busy !== null}>
          {busy === 'download' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        </IconButton>
        {onEdit && <IconButton label="Edit" onClick={onEdit}><Pencil size={16} /></IconButton>}
        {onDelete && <IconButton label="Delete" onClick={onDelete} danger><Trash2 size={16} /></IconButton>}
      </div>
    </div>
  )
}

function IconButton({ label, onClick, disabled, danger, children }: {
  label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex items-center justify-center rounded-lg border border-chrome-200 hover:bg-chrome-50 disabled:opacity-50"
      style={{ width: 42, height: 42, color: danger ? '#C8202A' : '#0C447C' }}
    >
      {children}
    </button>
  )
}
