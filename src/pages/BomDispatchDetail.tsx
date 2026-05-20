import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Package } from 'lucide-react'
import { useDispatchDetail, useDispatchDiff } from '../hooks/useBomDispatches'
import { useMbom } from '../hooks/usePaint'
import { useWeldingMbom } from '../hooks/useWelding'
import { DiffWarningBanner } from '../components/bom/DiffWarningBanner'
import { DiffAggregateCard } from '../components/bom/DiffAggregateCard'
import { DiffHierarchyView } from '../components/bom/DiffHierarchyView'
import { DiffExportButtons } from '../components/bom/DiffExportButtons'
import { DispatchTabs } from '../components/bom/DispatchTabs'
import type { DispatchTab } from '../components/bom/DispatchTabs'
import { PaintMaterialsTable } from '../components/bom/PaintMaterialsTable'
import { WeldingMaterialsTable } from '../components/bom/WeldingMaterialsTable'
import { DOC_TYPE_LABELS } from '../lib/bom/filenameClassifier'
import type { DocType } from '../lib/bom/filenameClassifier'
import type { DispatchDiffDto } from '../api/dispatches'

const ALL_DOC_TYPES: DocType[] = ['ASSEMBLY_LIST', 'ASSEMBLY_PART_LIST', 'PART_LIST']

// ─── BomDispatchDetail ──────────────────────────────────────────────────────

export function BomDispatchDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatchId = id ? parseInt(id) : undefined
  const [activeTab, setActiveTab] = useState<DispatchTab>('compare')

  const { data: detail, isLoading, isError } = useDispatchDetail(dispatchId)
  const { data: diff, isLoading: isDiffLoading, isError: isDiffError } = useDispatchDiff(dispatchId)
  const { data: mbom, isLoading: isMbomLoading, isError: isMbomError, refetch: refetchMbom } = useMbom(dispatchId, activeTab === 'mbom')
  const { data: weldingMbom, isLoading: isWeldingMbomLoading, isError: isWeldingMbomError, refetch: refetchWeldingMbom } = useWeldingMbom(dispatchId, activeTab === 'mbom')

  if (isLoading) {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
        <div className="bg-white flex items-center gap-3 border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
          <button onClick={() => navigate('/bom')} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 32, height: 32, color: '#8E8E8E' }}>
            <ArrowLeft size={16} />
          </button>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#C2C2C2' }}>Loading...</span>
        </div>
        <div className="flex items-center justify-center gap-2 flex-1" style={{ color: '#8E8E8E', fontSize: 13 }}>
          <Loader2 size={20} className="animate-spin" />Loading data...
        </div>
      </div>
    )
  }

  if (isError || !detail) {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
        <div className="bg-white flex items-center gap-3 border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
          <button onClick={() => navigate('/bom')} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 32, height: 32, color: '#8E8E8E' }}>
            <ArrowLeft size={16} />
          </button>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#C8202A' }}>Not found</span>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 flex-1" style={{ color: '#8E8E8E' }}>
          <Package size={40} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 14 }}>Dispatch #{id} not found</div>
          <button onClick={() => navigate('/bom')} style={{ fontSize: 13, color: '#0C447C', textDecoration: 'underline' }}>Back to BOM</button>
        </div>
      </div>
    )
  }

  const uploadedDocTypes = new Set(detail.doc_revisions.map(r => r.doc_type))
  const missingTypes = ALL_DOC_TYPES.filter(t => !uploadedDocTypes.has(t))

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Header */}
      <div className="bg-white flex items-center gap-3 border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <button onClick={() => navigate('/bom')} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 32, height: 32, color: '#8E8E8E' }}>
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>{detail.zone.code}</span>
          {detail.sub_zone && (
            <>
              <span style={{ color: '#C2C2C2' }}>/</span>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#555' }}>{detail.sub_zone.code || detail.sub_zone.name}</span>
            </>
          )}
        </div>
      </div>

      {/* Warning bar */}
      {missingTypes.length > 0 && (
        <div style={{ background: '#FFFBEB', borderBottom: '1px solid #FDE68A', padding: '8px 24px', fontSize: 12, color: '#92400E', flexShrink: 0 }}>
          ⚠ Missing files: {missingTypes.map(t => DOC_TYPE_LABELS[t]).join(', ')}
        </div>
      )}

      {/* Tabs */}
      <DispatchTabs active={activeTab} onChange={setActiveTab} />

      {/* Content */}
      <div className="flex flex-col flex-1" style={{ overflowY: 'auto', minHeight: 0, padding: activeTab === 'mbom' ? 0 : '0 24px 24px' }}>
        {activeTab === 'compare' && (
          <CompareContent
            isDiffLoading={isDiffLoading}
            isDiffError={isDiffError}
            diff={diff ?? null}
          />
        )}
        {activeTab === 'mbom' && (() => {
          const bothEmpty =
            !isMbomLoading && !isWeldingMbomLoading &&
            (!mbom || mbom.by_paint_type.length === 0) &&
            (!weldingMbom || weldingMbom.items.length === 0)

          if (bothEmpty) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 6 }}>
                <Package size={32} style={{ color: '#D9D9D9' }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: '#555' }}>No mBOM for this dispatch yet</div>
                <div style={{ fontSize: 12, color: '#8E8E8E', marginBottom: 4 }}>Configure paint and wire to compute</div>
                <button
                  onClick={() => navigate(`/bom/dispatch/${dispatchId}/paint`)}
                  style={{ fontSize: 13, fontWeight: 600, padding: '7px 20px', borderRadius: 6, border: 'none', background: '#C8202A', color: '#fff', cursor: 'pointer' }}
                >
                  Configure mBOM
                </button>
              </div>
            )
          }

          return (
            <>
              <PaintMaterialsTable
                dispatchId={dispatchId!}
                data={mbom}
                isLoading={isMbomLoading}
                isError={isMbomError}
                onRetry={refetchMbom}
              />
              <div style={{ borderTop: '1px solid #E8E8E8', marginTop: 8 }} />
              <WeldingMaterialsTable
                dispatchId={dispatchId!}
                data={weldingMbom}
                isLoading={isWeldingMbomLoading}
                isError={isWeldingMbomError}
                onRetry={refetchWeldingMbom}
              />
            </>
          )
        })()}
      </div>
    </div>
  )
}

// ─── Compare content ────────────────────────────────────────────────────────

function CompareContent({
  isDiffLoading, isDiffError, diff,
}: {
  isDiffLoading: boolean
  isDiffError: boolean
  diff: DispatchDiffDto | null | undefined
}) {
  if (isDiffLoading) {
    return (
      <div className="flex items-center justify-center gap-2 flex-1" style={{ color: '#8E8E8E', fontSize: 13 }}>
        <Loader2 size={18} className="animate-spin" />Loading diff data...
      </div>
    )
  }

  if (isDiffError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 flex-1" style={{ color: '#C8202A', fontSize: 13 }}>
        <Package size={32} style={{ opacity: 0.3 }} />
        Unable to load diff data
      </div>
    )
  }

  if (!diff) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 flex-1" style={{ color: '#8E8E8E', fontSize: 13 }}>
        <Package size={32} style={{ opacity: 0.2 }} />
        No previous version
      </div>
    )
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      <DiffWarningBanner warning={diff.warning} />

      <DiffAggregateCard aggregate={diff.aggregate} />

      <div style={{ padding: '0 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '4px 16px 6px' }}>
          <DiffExportButtons />
        </div>

        <DiffHierarchyView
          assembly_diff={diff.assembly_diff}
          part_diff={diff.part_diff}
          junction_diff={diff.junction_diff}
        />
      </div>
    </div>
  )
}
