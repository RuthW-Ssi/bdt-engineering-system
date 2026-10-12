import { useState } from 'react'
import { FileText, Loader2, Upload } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { useDeleteDocument, useDocuments, useSaveDocument } from '../hooks/useDocuments'
import { DocumentCard } from '../components/documents/DocumentCard'
import { CATEGORY_LABELS, groupByCategory } from '../lib/documents'
import { DocumentFormModal } from '../components/documents/DocumentFormModal'
import type { DocumentItem } from '../api/documents'

// Document Center — admin-managed PDF library (wiki features/document-center.md).
// Everyone signed in can open; only admin uploads/edits/deletes. The list is
// already filtered by audience server-side (customers only get theirs).
export function DocumentCenter() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const confirm = useConfirm()
  const { data: docs = [], isLoading, isError } = useDocuments()
  const save = useSaveDocument()
  const remove = useDeleteDocument()
  // undefined = closed, null = new upload, a doc = editing it
  const [editing, setEditing] = useState<DocumentItem | null | undefined>(undefined)

  const handleDelete = async (doc: DocumentItem) => {
    const ok = await confirm({ title: `Delete "${doc.title}"?`, message: 'The file is removed for everyone. This cannot be undone', variant: 'danger', confirmLabel: 'Delete' })
    if (ok) remove.mutate(doc.id)
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Documents</span>
        {isAdmin && (
          <button
            onClick={() => setEditing(null)}
            className="flex items-center gap-1.5 rounded-md text-white"
            style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}
          >
            <Upload size={14} />Upload Document
          </button>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 24 }}>
        <DocumentGroups
          docs={docs}
          isLoading={isLoading}
          isError={isError}
          gridClassName="grid gap-3"
          gridStyle={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
          onEdit={isAdmin ? setEditing : undefined}
          onDelete={isAdmin ? handleDelete : undefined}
        />
      </div>

      {editing !== undefined && (
        <DocumentFormModal
          doc={editing ?? undefined}
          saving={save.isPending}
          onSave={(fields, file) => save.mutate({ id: editing?.id, fields, file }, { onSuccess: () => setEditing(undefined) })}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  )
}

// Shared by the desktop page and MobileDocumentList — loading/empty/error + one section per category.
export function DocumentGroups({ docs, isLoading, isError, gridClassName, gridStyle, onEdit, onDelete }: {
  docs: DocumentItem[]
  isLoading: boolean
  isError: boolean
  gridClassName: string
  gridStyle?: React.CSSProperties
  onEdit?: (doc: DocumentItem) => void
  onDelete?: (doc: DocumentItem) => void
}) {
  if (isLoading) {
    return <div className="flex items-center justify-center gap-2 text-chrome-400 py-16"><Loader2 size={20} className="animate-spin" />Loading...</div>
  }
  if (isError) {
    return <div className="text-center py-16 text-sm" style={{ color: '#C8202A' }}>Failed to load documents — please try again</div>
  }
  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-chrome-400">
        <FileText size={32} style={{ opacity: 0.3 }} />
        <div className="text-sm">No documents yet</div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      {groupByCategory(docs).map(([category, items]) => (
        <section key={category}>
          <div className="mb-2 px-1" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8E8E8E' }}>
            {CATEGORY_LABELS[category] ?? category}
          </div>
          <div className={gridClassName} style={gridStyle}>
            {items.map(doc => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onEdit={onEdit && (() => onEdit(doc))}
                onDelete={onDelete && (() => onDelete(doc))}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
