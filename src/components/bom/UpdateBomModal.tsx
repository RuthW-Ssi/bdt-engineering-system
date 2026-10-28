import { useState } from 'react'
import { Upload, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useUploadBomWithPreview } from '../../hooks/useBomDispatches'
import { useRenameStep } from '../../hooks/useRenameStep'
import type { DispatchDetailDto, RevEdit } from '../../api/dispatches'
import { JunctionMismatchModal } from './JunctionMismatchModal'
import { RenamePairDialog } from './RenamePairDialog'
import { RevReviewDialog } from './RevReviewDialog'
import { InfoTip } from './InfoTip'
import { FileDropzone } from './FileDropzone'
import { FilePreviewItem } from './FilePreviewItem'
import { classifyFilename, REQUIRED_MAIN_TYPES, REQUIRED_ACC_TYPES } from '../../lib/bom/filenameClassifier'
import type { DocType } from '../../lib/bom/filenameClassifier'
import type { FileRejection } from './FileDropzone'

const REQUIRED_BOM_TYPES: DocType[] = ['ASSEMBLY_LIST', 'ASSEMBLY_PART_LIST', 'PART_LIST']
const NC_FORMATS = ['.nc1']

interface FileEntry {
  file: File
  detectedType: DocType | null
  error?: string
}

const MAIN_TYPE_MAP: Partial<Record<DocType, DocType>> = {
  ASSEMBLY_LIST: 'MAIN_ASSEMBLY_LIST',
  ASSEMBLY_PART_LIST: 'MAIN_ASSEMBLY_PART_LIST',
  PART_LIST: 'MAIN_PART_LIST',
}

const ACC_TYPE_MAP: Partial<Record<DocType, DocType>> = {
  ASSEMBLY_LIST: 'ACC_ASSEMBLY_LIST',
  ASSEMBLY_PART_LIST: 'ACC_ASSEMBLY_PART_LIST',
  PART_LIST: 'ACC_PART_LIST',
}

// A Dispatch Note is optional and goes in through the same picker as the
// Tekla lists (2026-10-26) — one per dropzone, at most. A duplicate is
// rejected with a toast instead of the usual inline "already exists" row.
const DISPATCH_NOTE_TYPES: DocType[] = ['DISPATCH_NOTE', 'MAIN_DISPATCH_NOTE', 'ACC_DISPATCH_NOTE']

function makeFileHandlers(
  files: FileEntry[],
  setFiles: React.Dispatch<React.SetStateAction<FileEntry[]>>,
  typeMap?: Partial<Record<DocType, DocType>>,
  requiredKeyword?: 'MAIN' | 'ACC',
) {
  // The slot this dropzone belongs to (for separate mode) — null for the combined picker.
  const ownDnType: DocType | null = requiredKeyword === 'MAIN' ? 'MAIN_DISPATCH_NOTE' : requiredKeyword === 'ACC' ? 'ACC_DISPATCH_NOTE' : null
  const otherDnType: DocType | null = requiredKeyword === 'MAIN' ? 'ACC_DISPATCH_NOTE' : requiredKeyword === 'ACC' ? 'MAIN_DISPATCH_NOTE' : null
  const otherSlotLabel = requiredKeyword === 'MAIN' ? 'Acc' : 'Main'

  const onFilesAdded = (accepted: File[], rejected: FileRejection[]) => {
    const entries: FileEntry[] = []
    const typesSoFar = files.filter(e => !e.error).map(e => e.detectedType)
    accepted.forEach(f => {
      const raw = classifyFilename(f.name)

      if (raw && DISPATCH_NOTE_TYPES.includes(raw)) {
        // Named for the OTHER slot (e.g. an "ACC Dispatch Note" dropped in the MAIN box) — wrong box.
        if (otherDnType && raw === otherDnType) {
          entries.push({ file: f, detectedType: null, error: `ไฟล์นี้เป็น Dispatch Note ของ ${otherSlotLabel} — ใส่ในช่อง ${otherSlotLabel}` })
          return
        }
        // Combined picker: any MAIN/ACC naming collapses to the plain type.
        // Slotted picker: unprefixed or already-this-slot → this slot's type.
        const detectedType = ownDnType ?? 'DISPATCH_NOTE'
        if (typesSoFar.includes(detectedType)) {
          toast.error('ใส่ Dispatch Note ได้ไฟล์เดียว')
          return
        }
        typesSoFar.push(detectedType)
        entries.push({ file: f, detectedType })
        return
      }

      if (requiredKeyword && !f.name.toUpperCase().includes(requiredKeyword)) {
        entries.push({ file: f, detectedType: null, error: `Filename must contain "${requiredKeyword}"` })
        return
      }
      const detectedType = raw && typeMap ? (typeMap[raw] ?? raw) : raw
      if (detectedType && typesSoFar.includes(detectedType)) {
        entries.push({ file: f, detectedType, error: `A file of type "${detectedType}" already exists` })
        return
      }
      if (detectedType) typesSoFar.push(detectedType)
      entries.push({ file: f, detectedType })
    })
    const rejectedEntries: FileEntry[] = rejected.map(r => ({ file: r.file, detectedType: null, error: r.reason }))
    setFiles(prev => [...prev, ...entries, ...rejectedEntries])
  }
  const removeFile = (i: number) => setFiles(prev => prev.filter((_, j) => j !== i))
  const updateType = (index: number, type: DocType) => {
    setFiles(prev => prev.map((entry, i) => {
      if (i !== index) return entry
      const otherTypes = prev.filter((_, j) => j !== i && !prev[j].error).map(e => e.detectedType)
      if (otherTypes.includes(type)) return { ...entry, detectedType: type, error: `A file of type "${type}" already exists` }
      return { ...entry, detectedType: type, error: undefined }
    }))
  }
  return { onFilesAdded, removeFile, updateType }
}

interface Props {
  dispatchId: number
  projectId: number
  zoneId: number
  subZoneId: number | null
  uploadMode: 'combined' | 'separate'
  onClose: () => void
}

export function UpdateBomModal({ dispatchId, projectId, zoneId, subZoneId, uploadMode, onClose }: Props) {
  const qc = useQueryClient()
  const uploadFlow = useUploadBomWithPreview()
  const renameStep = useRenameStep()
  const [files, setFiles] = useState<FileEntry[]>([])
  const [mainFiles, setMainFiles] = useState<FileEntry[]>([])
  const [accFiles, setAccFiles] = useState<FileEntry[]>([])
  const [ncFiles, setNcFiles] = useState<File[]>([])
  const [progress, setProgress] = useState<number | null>(null)

  const combined = makeFileHandlers(files, setFiles)
  const main = makeFileHandlers(mainFiles, setMainFiles, MAIN_TYPE_MAP, 'MAIN')
  const acc = makeFileHandlers(accFiles, setAccFiles, ACC_TYPE_MAP, 'ACC')

  const validCombined = files.filter(e => !e.error && e.detectedType)
  const validMain = mainFiles.filter(e => !e.error && e.detectedType)
  const validAcc = accFiles.filter(e => !e.error && e.detectedType)

  const hasAllCombined = REQUIRED_BOM_TYPES.every(t => validCombined.map(e => e.detectedType).includes(t))
  const hasAllMain = REQUIRED_MAIN_TYPES.every(t => validMain.map(e => e.detectedType).includes(t))
  const hasAllAcc = REQUIRED_ACC_TYPES.every(t => validAcc.map(e => e.detectedType).includes(t))

  // A DN picked for a slot with none of that slot's own lists is almost
  // certainly a mistake — block submit and flag it under that box rather
  // than silently sending an orphan Dispatch Note.
  const mainDnOrphan = mainFiles.some(e => !e.error && e.detectedType === 'MAIN_DISPATCH_NOTE')
    && !REQUIRED_MAIN_TYPES.some(t => validMain.map(e => e.detectedType).includes(t))
  const accDnOrphan = accFiles.some(e => !e.error && e.detectedType === 'ACC_DISPATCH_NOTE')
    && !REQUIRED_ACC_TYPES.some(t => validAcc.map(e => e.detectedType).includes(t))

  const bomReady = uploadMode === 'combined' ? hasAllCombined : (hasAllMain || hasAllAcc)
  const canSubmit = bomReady && ncFiles.length >= 1 && !mainDnOrphan && !accDnOrphan
    && !uploadFlow.uploadMutation.isPending && !uploadFlow.isPreviewing

  const handleUploadSuccess = async (res: DispatchDetailDto) => {
    qc.invalidateQueries({ queryKey: ['dispatch', dispatchId] })
    qc.invalidateQueries({ queryKey: ['dispatch-history', dispatchId] })
    qc.invalidateQueries({ queryKey: ['dispatches'] })
    toast.success('BOM uploaded successfully')
    // WO BOM-Version Hold (Sprint 20, T10): surface WOs the upload put on hold.
    if (res.hold_summary && res.hold_summary.held_wo_count > 0) {
      toast.warning(`${res.hold_summary.held_wo_count} WO(s) held due to spec change`)
    }
    if (await renameStep.afterUpload(res.id)) return
    onClose()
  }

  const handleUploadError = (err: unknown) => {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    toast.error(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'BOM upload failed — please try again'))
    setProgress(null)
  }

  const handleSubmit = async () => {
    setProgress(0)
    const formData = new FormData()
    formData.append('project_id', String(projectId))
    formData.append('zone_id', String(zoneId))
    formData.append('upload_mode', uploadMode)
    if (subZoneId != null) formData.append('sub_zone_id', String(subZoneId))

    const allValid = uploadMode === 'combined' ? validCombined : [...validMain, ...validAcc]
    allValid.forEach(e => {
      formData.append('bom_files', e.file)
      formData.append('doc_types', e.detectedType!)
    })
    ncFiles.forEach(f => formData.append('nc_files', f))

    try {
      const res = await uploadFlow.submit(formData, pct => setProgress(pct))
      if (res == null) { setProgress(null); return }
      await handleUploadSuccess(res)
    } catch (err: unknown) {
      handleUploadError(err)
    }
  }

  const handleConfirmUpload = async () => {
    try {
      const res = await uploadFlow.confirm()
      if (res == null) return
      await handleUploadSuccess(res)
    } catch (err: unknown) {
      handleUploadError(err)
    }
  }

  const handleConfirmReview = async (revs: RevEdit[]) => {
    try {
      const res = await uploadFlow.confirmReview(revs)
      if (res == null) return
      await handleUploadSuccess(res)
    } catch (err: unknown) {
      handleUploadError(err)
    }
  }

  const modeLabel = uploadMode === 'separate' ? 'Separate Main + ACC' : 'Combined'

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 520, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>Update BOM</span>
          <button onClick={onClose} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 28, height: 28, color: '#8E8E8E' }}>
            <X size={14} />
          </button>
        </div>

        {/* Mode badge */}
        <div style={{ fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Upload mode:</span>
          <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: uploadMode === 'separate' ? '#EFF6FF' : '#F0FDF4', color: uploadMode === 'separate' ? '#1D4ED8' : '#15803D', border: `1px solid ${uploadMode === 'separate' ? '#BFDBFE' : '#BBF7D0'}` }}>
            {modeLabel}
          </span>
        </div>

        {/* BOM Files — Combined */}
        {uploadMode === 'combined' && (
          <BomSection
            label="BOM Files"
            hint="3 files required"
            maxFiles={3}
            files={files}
            allowedTypes={['ASSEMBLY_LIST', 'ASSEMBLY_PART_LIST', 'PART_LIST']}
            onFilesAdded={combined.onFilesAdded}
            onRemove={combined.removeFile}
            onTypeChange={combined.updateType}
          />
        )}

        {/* BOM Files — Separate */}
        {uploadMode === 'separate' && (
          <>
            <BomSection
              label="MAIN BOM Files"
              hint="MAIN Assembly List, MAIN Assembly Part List, MAIN Part List"
              maxFiles={3}
              files={mainFiles}
              allowedTypes={REQUIRED_MAIN_TYPES}
              dnInfoText={DN_SLOT_INFO_TEXT}
              dnOrphanMessage={mainDnOrphan ? 'ใส่ Dispatch Note ของ Main แล้ว แต่ไม่มีไฟล์ BOM ของ Main' : undefined}
              onFilesAdded={main.onFilesAdded}
              onRemove={main.removeFile}
              onTypeChange={main.updateType}
            />
            <BomSection
              label="ACC BOM Files"
              hint="ACC Assembly List, ACC Assembly Part List, ACC Part List"
              maxFiles={3}
              files={accFiles}
              allowedTypes={REQUIRED_ACC_TYPES}
              dnInfoText={DN_SLOT_INFO_TEXT}
              dnOrphanMessage={accDnOrphan ? 'ใส่ Dispatch Note ของ Acc แล้ว แต่ไม่มีไฟล์ BOM ของ Acc' : undefined}
              onFilesAdded={acc.onFilesAdded}
              onRemove={acc.removeFile}
              onTypeChange={acc.updateType}
            />
          </>
        )}

        {/* NC Files */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
            NC Files <span style={{ color: '#C8202A' }}>*</span>
            <span style={{ fontSize: 11, fontWeight: 400, color: '#8E8E8E', marginLeft: 6 }}>.nc1 files from Tekla</span>
          </label>
          <FileDropzone
            maxFiles={1500}
            currentCount={ncFiles.length}
            acceptedFormats={NC_FORMATS}
            hint=".nc1 · max 20 MB / file · up to 1500 files"
            onFilesAdded={(accepted) => setNcFiles(prev => [...prev, ...accepted])}
            disabled={false}
          />
        </div>

        {ncFiles.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', marginBottom: 6 }}>NC FILES ({ncFiles.length})</div>
            <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, border: '1px solid #E0E0E0', borderRadius: 6, padding: '6px', background: '#FAFAFA' }}>
              {ncFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: 'white', borderRadius: 4, border: '1px solid #ECECEC', fontSize: 12, flexShrink: 0 }}>
                  <span style={{ color: '#333', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <button onClick={() => setNcFiles(prev => prev.filter((_, j) => j !== i))} style={{ fontSize: 11, color: '#8E8E8E', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 8, flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {progress !== null && (
          <div style={{ height: 4, background: '#E0E0E0', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: '#185FA5', transition: 'width 0.2s' }} />
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} style={{ fontSize: 13, color: '#555', padding: '6px 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: 'white' }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#185FA5' }}
          >
            {uploadFlow.isPreviewing
              ? <><Loader2 size={13} className="animate-spin" />Checking...</>
              : uploadFlow.uploadMutation.isPending
                ? <><Loader2 size={13} className="animate-spin" />Uploading...</>
                : <><Upload size={13} />Upload</>}
          </button>
        </div>
      </div>

      {uploadFlow.pendingMismatch && (
        <JunctionMismatchModal
          mismatch={uploadFlow.pendingMismatch}
          onCancel={uploadFlow.cancel}
          onConfirm={handleConfirmUpload}
          isUploading={uploadFlow.uploadMutation.isPending}
        />
      )}

      {uploadFlow.pendingReview && (
        <RevReviewDialog
          review={uploadFlow.pendingReview}
          isUploading={uploadFlow.uploadMutation.isPending}
          onCancel={() => { uploadFlow.cancel(); setProgress(null) }}
          onConfirm={handleConfirmReview}
        />
      )}

      {renameStep.dispatchId != null && (
        <RenamePairDialog dispatchId={renameStep.dispatchId} onClose={() => { renameStep.close(); onClose() }} />
      )}
    </div>
  )
}

const DEFAULT_DN_INFO_TEXT = 'ใส่ไฟล์ Dispatch Note ปนมากับไฟล์พวกนี้ได้เลย ไม่บังคับ ใช้ดู Rev ของแต่ละ mark ถ้าไม่มีไฟล์นี้ ระบบจะเทียบกับ BOM ครั้งก่อนให้'
const DN_SLOT_INFO_TEXT = 'ช่อง Main ใส่ Dispatch Note ของ Main / ช่อง Acc ใส่ของ Acc'

interface BomSectionProps {
  label: string
  hint: string
  maxFiles: number
  files: FileEntry[]
  allowedTypes: DocType[]
  dnInfoText?: string
  dnOrphanMessage?: string
  onFilesAdded: (accepted: File[], rejected: FileRejection[]) => void
  onRemove: (i: number) => void
  onTypeChange: (i: number, type: DocType) => void
}

function BomSection({ label, hint, maxFiles, files, allowedTypes, dnInfoText, dnOrphanMessage, onFilesAdded, onRemove, onTypeChange }: BomSectionProps) {
  const validCount = files.filter(e => !e.error).length
  // +1 slot: a Dispatch Note can be picked here too, on top of the required files — optional.
  const capacity = maxFiles + 1
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
        {label} <span style={{ color: '#C8202A' }}>*</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: '#8E8E8E', marginLeft: 6 }}>{hint}</span>{' '}
        <InfoTip label="Dispatch Note ใช้ทำอะไร" text={dnInfoText ?? DEFAULT_DN_INFO_TEXT} />
      </label>
      <FileDropzone
        maxFiles={capacity}
        currentCount={validCount}
        hint={`${maxFiles} ไฟล์ + Dispatch Note (ไม่ใส่ก็ได้)`}
        onFilesAdded={onFilesAdded}
        disabled={validCount >= capacity}
      />
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {files.map((entry, i) => (
            <FilePreviewItem key={i} file={entry.file} detectedType={entry.detectedType} error={entry.error} allowedTypes={allowedTypes} onRemove={() => onRemove(i)} onTypeChange={type => onTypeChange(i, type)} />
          ))}
        </div>
      )}
      {dnOrphanMessage && (
        <div style={{ fontSize: 12, color: '#EF4444', marginTop: 6 }}>{dnOrphanMessage}</div>
      )}
    </div>
  )
}
