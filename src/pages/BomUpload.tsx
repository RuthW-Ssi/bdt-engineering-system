import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { FileDropzone } from '../components/bom/FileDropzone'
import { FilePreviewItem } from '../components/bom/FilePreviewItem'
import { useActiveProject } from '../context/ProjectContext'
import { useProjectZones } from '../hooks/useProjectZones'
import { useSubZones } from '../hooks/useSubZones'
import { useUploadBom, useZoneUploadMode, useLatestRevision } from '../hooks/useBomDispatches'
import { classifyFilename, REQUIRED_MAIN_TYPES, REQUIRED_ACC_TYPES } from '../lib/bom/filenameClassifier'
import type { DocType } from '../lib/bom/filenameClassifier'
import type { FileRejection } from '../components/bom/FileDropzone'

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

function makeFileHandlers(
  files: FileEntry[],
  setFiles: React.Dispatch<React.SetStateAction<FileEntry[]>>,
  typeMap?: Partial<Record<DocType, DocType>>,
  requiredKeyword?: string,
) {
  const onFilesAdded = (accepted: File[], rejected: FileRejection[]) => {
    const newEntries: FileEntry[] = []
    accepted.forEach(file => {
      if (requiredKeyword && !file.name.toUpperCase().includes(requiredKeyword.toUpperCase())) {
        newEntries.push({ file, detectedType: null, error: `Filename must contain "${requiredKeyword}"` })
        return
      }
      const raw = classifyFilename(file.name)
      const detectedType = raw && typeMap ? (typeMap[raw] ?? raw) : raw
      const existingTypes = files.filter(e => !e.error).map(e => e.detectedType)
      if (detectedType && existingTypes.includes(detectedType)) {
        newEntries.push({ file, detectedType, error: `A file of type "${detectedType}" already exists` })
      } else {
        newEntries.push({ file, detectedType })
      }
    })
    const rejectedEntries: FileEntry[] = rejected.map(r => ({ file: r.file, detectedType: null, error: r.reason }))
    setFiles(prev => [...prev, ...newEntries, ...rejectedEntries])
  }

  const removeFile = (index: number) => setFiles(prev => prev.filter((_, i) => i !== index))

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

export function BomUpload() {
  const navigate = useNavigate()
  const { activeProject } = useActiveProject()

  const [zoneId, setZoneId] = useState('')
  const [subZoneId, setSubZoneId] = useState('')
  const [uploadMode, setUploadMode] = useState<'combined' | 'separate'>('combined')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [mainFiles, setMainFiles] = useState<FileEntry[]>([])
  const [accFiles, setAccFiles] = useState<FileEntry[]>([])
  const [ncFiles, setNcFiles] = useState<File[]>([])
  const [progress, setProgress] = useState<number | null>(null)
  const [revisionChoice, setRevisionChoice] = useState<'continue' | 'new'>('continue')

  const { data: zonesData } = useProjectZones(activeProject?.id)
  const zones = zonesData ?? []
  const { data: subZonesData } = useSubZones(zoneId ? parseInt(zoneId) : null)
  const subZones = subZonesData ?? []

  const { data: zoneMode, isLoading: zoneModeLoading } = useZoneUploadMode(
    activeProject?.id ?? null,
    zoneId ? parseInt(zoneId) : null,
  )

  const { data: latestRevision } = useLatestRevision(
    activeProject?.id,
    zoneId ? parseInt(zoneId) : undefined,
    subZoneId ? parseInt(subZoneId) : null,
  )

  const isModeLocked = !!zoneMode
  const effectiveMode = isModeLocked ? zoneMode! : uploadMode

  const uploadMutation = useUploadBom()

  const combined = makeFileHandlers(files, setFiles)
  const main = makeFileHandlers(mainFiles, setMainFiles, MAIN_TYPE_MAP, 'MAIN')
  const acc = makeFileHandlers(accFiles, setAccFiles, ACC_TYPE_MAP, 'ACC')

  const handleZoneChange = (val: string) => {
    setZoneId(val)
    setSubZoneId('')
    setFiles([])
    setMainFiles([])
    setAccFiles([])
    setNcFiles([])
  }

  // Validation
  const validCombined = files.filter(e => !e.error && e.detectedType)
  const validMain = mainFiles.filter(e => !e.error && e.detectedType)
  const validAcc = accFiles.filter(e => !e.error && e.detectedType)

  const hasAllCombined = REQUIRED_BOM_TYPES.every(t => validCombined.map(e => e.detectedType).includes(t))
  const hasAllMain = REQUIRED_MAIN_TYPES.every(t => validMain.map(e => e.detectedType).includes(t))
  const hasAllAcc = REQUIRED_ACC_TYPES.every(t => validAcc.map(e => e.detectedType).includes(t))

  const bomReady = effectiveMode === 'combined' ? hasAllCombined : (hasAllMain || hasAllAcc)
  const canSubmit = !!zoneId && bomReady && ncFiles.length >= 1 && !uploadMutation.isPending

  const handleSubmit = async () => {
    if (!activeProject || !canSubmit) return
    setProgress(0)

    const formData = new FormData()
    formData.append('project_id', String(activeProject.id))
    formData.append('zone_id', zoneId)
    formData.append('upload_mode', effectiveMode)
    formData.append('revision_choice', zoneId && latestRevision != null ? revisionChoice : 'new')
    if (subZoneId) formData.append('sub_zone_id', subZoneId)

    const allValid = effectiveMode === 'combined' ? validCombined : [...validMain, ...validAcc]
    allValid.forEach(e => {
      formData.append('bom_files', e.file)
      formData.append('doc_types', e.detectedType!)
    })
    ncFiles.forEach(f => formData.append('nc_files', f))

    try {
      const res = await uploadMutation.mutateAsync({ formData, onProgress: pct => setProgress(pct) })
      navigate(`/bom/dispatch/${res.id}/paint`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'BOM upload failed — please try again'))
      setProgress(null)
    }
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflowY: 'auto' }}>
      {/* Header */}
      <div className="bg-white flex items-center gap-3 border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <button
          onClick={() => navigate('/bom')}
          className="flex items-center justify-center rounded hover:bg-chrome-50"
          style={{ width: 32, height: 32, color: '#8E8E8E' }}
        >
          <ArrowLeft size={16} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>Upload BOM</span>
      </div>

      {/* Form */}
      <div style={{ maxWidth: 640, width: '100%', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Project (read-only) */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Project</label>
          <div style={{ height: 36, padding: '0 12px', fontSize: 13, border: '1px solid #E0E0E0', borderRadius: 6, background: '#F5F5F5', color: '#8E8E8E', display: 'flex', alignItems: 'center' }}>
            {activeProject ? `${activeProject.project_code} — ${activeProject.name}` : 'No project selected'}
          </div>
        </div>

        {/* Zone */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
            Zone <span style={{ color: '#C8202A' }}>*</span>
          </label>
          <select
            disabled={!activeProject}
            style={{ width: '100%', height: 36, padding: '0 10px', fontSize: 13, border: `1px solid ${zoneId ? '#C8202A' : '#E0E0E0'}`, borderRadius: 6, background: activeProject ? 'white' : '#F5F5F5' }}
            value={zoneId}
            onChange={e => handleZoneChange(e.target.value)}
          >
            <option value="">Select Zone...</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.code} — {z.label}</option>)}
          </select>
        </div>

        {/* Sub-zone */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
            Sub-zone
            <span style={{ fontSize: 11, fontWeight: 400, color: '#8E8E8E', marginLeft: 6 }}>
              {subZones.length === 0 && zoneId ? '(this zone has no sub-zones)' : '(optional)'}
            </span>
          </label>
          <select
            disabled={!zoneId || subZones.length === 0}
            style={{ width: '100%', height: 36, padding: '0 10px', fontSize: 13, border: `1px solid ${subZoneId ? '#C8202A' : '#E0E0E0'}`, borderRadius: 6, background: zoneId && subZones.length > 0 ? 'white' : '#F5F5F5', opacity: !zoneId || subZones.length === 0 ? 0.5 : 1 }}
            value={subZoneId}
            onChange={e => setSubZoneId(e.target.value)}
          >
            <option value="">(None)</option>
            {subZones.map(sz => <option key={sz.id} value={sz.id}>{sz.code ? `${sz.code} — ` : ''}{sz.name}</option>)}
          </select>
        </div>

        {/* Revision Choice */}
        {zoneId && latestRevision != null && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Revision</label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="radio" checked={revisionChoice === 'continue'} onChange={() => setRevisionChoice('continue')} />
                Continue revision {latestRevision}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="radio" checked={revisionChoice === 'new'} onChange={() => setRevisionChoice('new')} />
                Start new revision ({latestRevision + 1})
              </label>
            </div>
          </div>
        )}

        {/* Upload Mode Radio */}
        {zoneId && !zoneModeLoading && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>
              BOM Upload Mode
              {isModeLocked && (
                <span style={{ fontSize: 11, fontWeight: 400, color: '#8E8E8E', marginLeft: 6 }}>
                  (locked by previous version)
                </span>
              )}
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              {(['combined', 'separate'] as const).map(mode => (
                <label
                  key={mode}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, cursor: isModeLocked ? 'default' : 'pointer',
                    padding: '8px 16px', borderRadius: 8, fontSize: 13,
                    border: `1px solid ${effectiveMode === mode ? '#C8202A' : '#E0E0E0'}`,
                    background: effectiveMode === mode ? '#FEF2F2' : 'white',
                    color: isModeLocked && effectiveMode !== mode ? '#CCC' : '#1F1F1F',
                    opacity: isModeLocked && effectiveMode !== mode ? 0.4 : 1,
                  }}
                >
                  <input
                    type="radio"
                    value={mode}
                    checked={effectiveMode === mode}
                    disabled={isModeLocked}
                    onChange={() => {
                      setUploadMode(mode)
                      setFiles([])
                      setMainFiles([])
                      setAccFiles([])
                    }}
                    style={{ accentColor: '#C8202A' }}
                  />
                  {mode === 'combined' ? 'Combined' : 'Separate Main + ACC'}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* BOM Files — Combined */}
        {effectiveMode === 'combined' && (
          <BomFileSection
            label="BOM Files"
            hint="Assembly List, Assembly Part List, Part List (3 files required)"
            maxFiles={3}
            files={files}
            allowedTypes={['ASSEMBLY_LIST', 'ASSEMBLY_PART_LIST', 'PART_LIST']}
            onFilesAdded={combined.onFilesAdded}
            onRemove={combined.removeFile}
            onTypeChange={combined.updateType}
          />
        )}

        {/* BOM Files — Separate */}
        {effectiveMode === 'separate' && (
          <>
            <BomFileSection
              label="MAIN BOM Files"
              hint="MAIN Assembly List, MAIN Assembly Part List, MAIN Part List"
              maxFiles={3}
              files={mainFiles}
              allowedTypes={REQUIRED_MAIN_TYPES}
              onFilesAdded={main.onFilesAdded}
              onRemove={main.removeFile}
              onTypeChange={main.updateType}
            />
            <BomFileSection
              label="ACC BOM Files"
              hint="ACC Assembly List, ACC Assembly Part List, ACC Part List"
              maxFiles={3}
              files={accFiles}
              allowedTypes={REQUIRED_ACC_TYPES}
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
            <span style={{ fontSize: 11, fontWeight: 400, color: '#8E8E8E', marginLeft: 6 }}>
              .nc1 files from Tekla (canonical source for qty + dimensions)
            </span>
          </label>
          <FileDropzone
            maxFiles={200}
            currentCount={ncFiles.length}
            acceptedFormats={NC_FORMATS}
            hint=".nc1 · max 20 MB / file · up to 200 files"
            onFilesAdded={(accepted) => setNcFiles(prev => [...prev, ...accepted])}
            disabled={false}
          />
        </div>

        {ncFiles.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', marginBottom: 6 }}>NC FILES ({ncFiles.length})</div>
            <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, border: '1px solid #E0E0E0', borderRadius: 6, padding: '6px', background: '#FAFAFA' }}>
              {ncFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: 'white', borderRadius: 4, border: '1px solid #ECECEC', fontSize: 12, flexShrink: 0 }}>
                  <span style={{ color: '#333', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <button onClick={() => setNcFiles(prev => prev.filter((_, j) => j !== i))} style={{ fontSize: 11, color: '#8E8E8E', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 8, flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress */}
        {progress !== null && (
          <div>
            <div style={{ height: 6, background: '#E0E0E0', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: '#C8202A', transition: 'width 0.2s' }} />
            </div>
            <div style={{ fontSize: 12, color: '#8E8E8E', marginTop: 4, textAlign: 'right' }}>{progress}%</div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between" style={{ paddingTop: 4 }}>
          <button onClick={() => navigate('/bom')} style={{ fontSize: 13, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}
          >
            {uploadMutation.isPending
              ? <><Loader2 size={14} className="animate-spin" />Uploading...</>
              : <><Upload size={14} />Upload</>}
          </button>
        </div>
      </div>
    </div>
  )
}

interface BomFileSectionProps {
  label: string
  hint: string
  maxFiles: number
  files: FileEntry[]
  allowedTypes: DocType[]
  onFilesAdded: (accepted: File[], rejected: FileRejection[]) => void
  onRemove: (index: number) => void
  onTypeChange: (index: number, type: DocType) => void
}

function BomFileSection({ label, hint, maxFiles, files, allowedTypes, onFilesAdded, onRemove, onTypeChange }: BomFileSectionProps) {
  const validCount = files.filter(e => !e.error).length
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
        {label} <span style={{ color: '#C8202A' }}>*</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: '#8E8E8E', marginLeft: 6 }}>{hint}</span>
      </label>
      <FileDropzone
        maxFiles={maxFiles}
        currentCount={validCount}
        onFilesAdded={onFilesAdded}
        disabled={validCount >= maxFiles}
      />
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {files.map((entry, i) => (
            <FilePreviewItem
              key={i}
              file={entry.file}
              detectedType={entry.detectedType}
              error={entry.error}
              allowedTypes={allowedTypes}
              onRemove={() => onRemove(i)}
              onTypeChange={type => onTypeChange(i, type)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
