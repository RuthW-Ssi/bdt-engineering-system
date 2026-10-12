import { MobileHeader } from '../../components/mobile/MobileHeader'
import { useDocuments } from '../../hooks/useDocuments'
import { DocumentGroups } from '../DocumentCenter'

// Phone view of the Document Center — read-only (uploading is done on desktop by admin).
export function MobileDocumentList() {
  const { data: docs = [], isLoading, isError } = useDocuments()
  return (
    <div className="min-h-screen bg-chrome-50 flex flex-col">
      <MobileHeader title="Documents" />
      <div className="p-3">
        <DocumentGroups docs={docs} isLoading={isLoading} isError={isError} gridClassName="flex flex-col gap-2" />
      </div>
    </div>
  )
}
