import { Loader2, FileText, ExternalLink } from 'lucide-react'
import { useDispatchHistory } from '../../hooks/useBomDispatches'
import type { DocType } from '../../lib/bom/filenameClassifier'
import { DOC_TYPE_LABELS } from '../../lib/bom/filenameClassifier'

const DOC_TYPE_ORDER: DocType[] = ['ASSEMBLY_LIST', 'ASSEMBLY_PART_LIST', 'PART_LIST']

interface Props {
  dispatchId: number
}

export function RevisionList({ dispatchId }: Props) {
  const { data: revisions, isLoading } = useDispatchHistory(dispatchId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2" style={{ padding: 48, color: '#8E8E8E', fontSize: 13 }}>
        <Loader2 size={18} className="animate-spin" />Loading...
      </div>
    )
  }

  if (!revisions || revisions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2" style={{ padding: 64, color: '#C2C2C2' }}>
        <FileText size={32} style={{ opacity: 0.3 }} />
        <div style={{ fontSize: 13 }}>No upload history yet</div>
      </div>
    )
  }

  type ByType = Record<DocType, typeof revisions>
  const byType = DOC_TYPE_ORDER.reduce<ByType>((acc, t) => {
    acc[t] = revisions.filter(r => r.doc_type === t)
    return acc
  }, {} as ByType)

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {DOC_TYPE_ORDER.map(docType => {
        const items = byType[docType]
        if (items.length === 0) return null
        return (
          <div key={docType}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8E8E8E', letterSpacing: '0.05em', marginBottom: 8 }}>
              {DOC_TYPE_LABELS[docType]}
            </div>
            <div style={{ border: '1px solid #F0F0F0', borderRadius: 6, overflow: 'hidden' }}>
              {items.map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px',
                    borderBottom: i < items.length - 1 ? '1px solid #F5F5F5' : 'none',
                    background: i === items.length - 1 ? '#FAFFF8' : 'white',
                  }}
                >
                  <FileText size={14} style={{ color: '#8E8E8E', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1F1F1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.filename}
                    </div>
                    <div style={{ fontSize: 11, color: '#8E8E8E', marginTop: 2 }}>
                      {r.uploader.name} · {new Date(r.uploaded_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  {i === items.length - 1 && (
                    <span style={{ fontSize: 10, background: '#D1F2E0', color: '#065F46', borderRadius: 999, padding: '2px 6px', fontWeight: 600, flexShrink: 0 }}>
                      LATEST
                    </span>
                  )}
                  <button
                    title="View file"
                    className="flex items-center justify-center rounded hover:bg-chrome-50"
                    style={{ width: 28, height: 28, color: '#8E8E8E', flexShrink: 0 }}
                  >
                    <ExternalLink size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
