import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Upload, Loader2, Package } from 'lucide-react'
import { useDispatchDetail } from '../hooks/useBomDispatches'
import { BomTreeView } from '../components/bom/BomTreeView'
import { RevisionList } from '../components/bom/RevisionList'
import { ProgressChip } from '../components/bom/ProgressChip'
import { UpdateBomModal } from '../components/bom/UpdateBomModal'
import { DOC_TYPE_LABELS } from '../lib/bom/filenameClassifier'
import type { DocType } from '../lib/bom/filenameClassifier'
import type { DispatchStatus } from '../api/dispatches'

type Tab = 'current' | 'history'

const STATUS_LABELS: Record<DispatchStatus, string> = {
  pending: 'รอดำเนินการ',
  partial: 'บางส่วน',
  complete: 'ครบถ้วน',
}

const STATUS_COLORS: Record<DispatchStatus, { background: string; color: string }> = {
  pending: { background: '#FEF9C3', color: '#854D0E' },
  partial: { background: '#FEF3C7', color: '#B45309' },
  complete: { background: '#D1F2E0', color: '#065F46' },
}

const ALL_DOC_TYPES: DocType[] = ['ASSEMBLY_LIST', 'ASSEMBLY_PART_LIST', 'PART_LIST']

// ─── BomDispatchDetail ──────────────────────────────────────────────────────

export function BomDispatchDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatchId = id ? parseInt(id) : undefined

  const { data: detail, isLoading, isError } = useDispatchDetail(dispatchId)
  const [tab, setTab] = useState<Tab>('current')
  const [showModal, setShowModal] = useState(false)

  // Reset to current tab whenever dispatch changes
  useEffect(() => { setTab('current') }, [dispatchId])

  if (isLoading) {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
        <div className="bg-white flex items-center gap-3 border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
          <button onClick={() => navigate('/bom')} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 32, height: 32, color: '#8E8E8E' }}>
            <ArrowLeft size={16} />
          </button>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#C2C2C2' }}>กำลังโหลด...</span>
        </div>
        <div className="flex items-center justify-center gap-2 flex-1" style={{ color: '#8E8E8E', fontSize: 13 }}>
          <Loader2 size={20} className="animate-spin" />กำลังโหลดข้อมูล...
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
          <span style={{ fontSize: 16, fontWeight: 600, color: '#C8202A' }}>ไม่พบข้อมูล</span>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 flex-1" style={{ color: '#8E8E8E' }}>
          <Package size={40} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 14 }}>ไม่พบ Dispatch #{id}</div>
          <button onClick={() => navigate('/bom')} style={{ fontSize: 13, color: '#0C447C', textDecoration: 'underline' }}>กลับไปหน้า BOM</button>
        </div>
      </div>
    )
  }

  const statusStyle = STATUS_COLORS[detail.status]
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
          <span style={{ ...statusStyle, borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 500 }}>
            {STATUS_LABELS[detail.status]}
          </span>
          <ProgressChip count={detail.doc_count} />
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-md text-white"
          style={{ height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600, background: '#C8202A', flexShrink: 0 }}
        >
          <Upload size={13} />Upload File
        </button>
      </div>

      {/* Warning bar */}
      {missingTypes.length > 0 && (
        <div style={{ background: '#FFFBEB', borderBottom: '1px solid #FDE68A', padding: '8px 24px', fontSize: 12, color: '#92400E', flexShrink: 0 }}>
          ⚠ ยังขาดไฟล์: {missingTypes.map(t => DOC_TYPE_LABELS[t]).join(', ')}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border-b border-chrome-100 flex px-6 gap-1" style={{ flexShrink: 0 }}>
        {(['current', 'history'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              height: 40, padding: '0 16px', fontSize: 13, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? '#C8202A' : '#8E8E8E',
              background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #C8202A' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {t === 'current' ? 'Current' : 'History'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex flex-col flex-1" style={{ overflow: 'hidden', minHeight: 0 }}>
        {tab === 'current' ? (
          <BomTreeView
            assemblies={detail.assemblies ?? []}
            assemblyCount={detail.assembly_count}
            partCount={detail.part_count}
            orphanParts={detail.orphan_parts}
          />
        ) : (
          <RevisionList dispatchId={detail.id} />
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <UpdateBomModal
          dispatchId={detail.id}
          projectId={detail.project_id}
          zoneId={detail.zone_id}
          subZoneId={detail.sub_zone_id}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
