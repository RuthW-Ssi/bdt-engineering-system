import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Upload, Loader2, Package, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useDispatchDetail, useUploadBom } from '../hooks/useBomDispatches'
import { BomTreeView } from '../components/bom/BomTreeView'
import { RevisionList } from '../components/bom/RevisionList'
import { ProgressChip } from '../components/bom/ProgressChip'
import { FileDropzone } from '../components/bom/FileDropzone'
import { FilePreviewItem } from '../components/bom/FilePreviewItem'
import { classifyFilename, DOC_TYPE_LABELS } from '../lib/bom/filenameClassifier'
import type { DocType } from '../lib/bom/filenameClassifier'
import type { FileRejection } from '../components/bom/FileDropzone'
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

interface FileEntry {
  file: File
  detectedType: DocType | null
  error?: string
}

// ─── ConfirmRevisionModal ──────────────────────────────────────────────────

interface ModalProps {
  dispatchId: number
  projectId: number
  zoneId: number
  subZoneId: number | null
  onClose: () => void
}

function ConfirmRevisionModal({ dispatchId, projectId, zoneId, subZoneId, onClose }: ModalProps) {
  const qc = useQueryClient()
  const uploadMutation = useUploadBom()
  const [files, setFiles] = useState<FileEntry[]>([])
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onFilesAdded = (accepted: File[], rejected: FileRejection[]) => {
    const entries: FileEntry[] = []
    accepted.forEach(f => {
      const detectedType = classifyFilename(f.name)
      const existingTypes = files.filter(e => !e.error).map(e => e.detectedType)
      if (detectedType && existingTypes.includes(detectedType)) {
        entries.push({ file: f, detectedType, error: `มีไฟล์ประเภท "${detectedType}" อยู่แล้ว` })
      } else {
        entries.push({ file: f, detectedType })
      }
    })
    const rejectedEntries: FileEntry[] = rejected.map(r => ({ file: r.file, detectedType: null, error: r.reason }))
    setFiles(prev => [...prev, ...entries, ...rejectedEntries])
  }

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, j) => j !== i))

  const updateType = (index: number, type: DocType) => {
    setFiles(prev => prev.map((entry, i) => {
      if (i !== index) return entry
      const otherTypes = prev.filter((_, j) => j !== i && !prev[j].error).map(e => e.detectedType)
      if (otherTypes.includes(type)) return { ...entry, detectedType: type, error: `มีไฟล์ประเภท "${type}" อยู่แล้ว` }
      return { ...entry, detectedType: type, error: undefined }
    }))
  }

  const validFiles = files.filter(e => !e.error && e.detectedType !== null)
  const canSubmit = validFiles.length >= 1 && !uploadMutation.isPending

  const handleSubmit = async () => {
    setError(null)
    setProgress(0)
    const formData = new FormData()
    formData.append('project_id', String(projectId))
    formData.append('zone_id', String(zoneId))
    if (subZoneId != null) formData.append('sub_zone_id', String(subZoneId))
    formData.append('dispatch_id', String(dispatchId))
    validFiles.forEach(e => {
      formData.append('files', e.file)
      formData.append('doc_types', e.detectedType!)
    })
    try {
      await uploadMutation.mutateAsync({ formData, onProgress: pct => setProgress(pct) })
      qc.invalidateQueries({ queryKey: ['dispatch', dispatchId] })
      qc.invalidateQueries({ queryKey: ['dispatch-history', dispatchId] })
      onClose()
    } catch {
      setError('อัพโหลดไม่สำเร็จ — ตรวจสอบว่า backend พร้อมใช้งาน')
      setProgress(null)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 520, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>Upload ไฟล์ใหม่</span>
          <button onClick={onClose} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 28, height: 28, color: '#8E8E8E' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ fontSize: 13, color: '#8E8E8E', background: '#FFF9C4', border: '1px solid #FDE68A', borderRadius: 6, padding: '8px 12px' }}>
          จะเพิ่ม revision ใหม่ — ไม่ลบไฟล์เดิม ประวัติยังคงอยู่
        </div>

        <FileDropzone
          maxFiles={3}
          currentCount={files.filter(e => !e.error).length}
          onFilesAdded={onFilesAdded}
          disabled={files.filter(e => !e.error).length >= 3}
        />

        {files.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {files.map((entry, i) => (
              <FilePreviewItem
                key={i}
                file={entry.file}
                detectedType={entry.detectedType}
                error={entry.error}
                onRemove={() => removeFile(i)}
                onTypeChange={type => updateType(i, type)}
              />
            ))}
          </div>
        )}

        {progress !== null && (
          <div>
            <div style={{ height: 4, background: '#E0E0E0', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: '#C8202A', transition: 'width 0.2s' }} />
            </div>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 13, color: '#C8202A', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '8px 12px' }}>
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} style={{ fontSize: 13, color: '#555', padding: '6px 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: 'white' }}>
            ยกเลิก
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}
          >
            {uploadMutation.isPending
              ? <><Loader2 size={13} className="animate-spin" />กำลังอัพโหลด...</>
              : <><Upload size={13} />Upload ({validFiles.length})</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── BomDispatchDetail ──────────────────────────────────────────────────────

export function BomDispatchDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatchId = id ? parseInt(id) : undefined

  const { data: detail, isLoading, isError } = useDispatchDetail(dispatchId)
  const [tab, setTab] = useState<Tab>('current')
  const [showModal, setShowModal] = useState(false)

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
          />
        ) : (
          <RevisionList dispatchId={detail.id} />
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <ConfirmRevisionModal
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
