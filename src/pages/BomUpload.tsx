import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Upload, Loader2 } from 'lucide-react'
import { FileDropzone } from '../components/bom/FileDropzone'
import { FilePreviewItem } from '../components/bom/FilePreviewItem'
import { useActiveProject } from '../context/ProjectContext'
import { useProjectZones } from '../hooks/useProjectZones'
import { useSubZones } from '../hooks/useSubZones'
import { useUploadBom } from '../hooks/useBomDispatches'
import { classifyFilename } from '../lib/bom/filenameClassifier'
import type { DocType } from '../lib/bom/filenameClassifier'
import type { FileRejection } from '../components/bom/FileDropzone'

const REQUIRED_BOM_TYPES: DocType[] = ['ASSEMBLY_LIST', 'ASSEMBLY_PART_LIST', 'PART_LIST']
const NC_FORMATS = ['.nc1']

interface FileEntry {
  file: File
  detectedType: DocType | null
  error?: string
}

export function BomUpload() {
  const navigate = useNavigate()
  const { activeProject } = useActiveProject()

  const [zoneId, setZoneId] = useState('')
  const [subZoneId, setSubZoneId] = useState('')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [ncFiles, setNcFiles] = useState<File[]>([])
  const [progress, setProgress] = useState<number | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { data: zonesData } = useProjectZones(activeProject?.id)
  const zones = zonesData ?? []

  const { data: subZonesData } = useSubZones(zoneId ? parseInt(zoneId) : null)
  const subZones = subZonesData ?? []

  const uploadMutation = useUploadBom()

  const onFilesAdded = (accepted: File[], rejected: FileRejection[]) => {
    const newEntries: FileEntry[] = []

    accepted.forEach(file => {
      const detectedType = classifyFilename(file.name)
      // Check duplicate type against existing valid entries
      const existingTypes = files.filter(e => !e.error).map(e => e.detectedType)
      if (detectedType && existingTypes.includes(detectedType)) {
        newEntries.push({ file, detectedType, error: `A file of type "${detectedType}" already exists` })
      } else {
        newEntries.push({ file, detectedType })
      }
    })

    const rejectedEntries: FileEntry[] = rejected.map(r => ({
      file: r.file,
      detectedType: null,
      error: r.reason,
    }))

    setFiles(prev => [...prev, ...newEntries, ...rejectedEntries])
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const updateType = (index: number, type: DocType) => {
    setFiles(prev => prev.map((entry, i) => {
      if (i !== index) return entry
      // Check duplicate
      const otherTypes = prev.filter((_, j) => j !== i && !prev[j].error).map(e => e.detectedType)
      if (otherTypes.includes(type)) {
        return { ...entry, detectedType: type, error: `A file of type "${type}" already exists` }
      }
      return { ...entry, detectedType: type, error: undefined }
    }))
  }

  const validFiles = files.filter(e => !e.error && e.detectedType !== null)
  const detectedTypes = validFiles.map(e => e.detectedType)
  const hasAllBomTypes = REQUIRED_BOM_TYPES.every(t => detectedTypes.includes(t))
  const canSubmit = !!zoneId && hasAllBomTypes && ncFiles.length >= 1 && !uploadMutation.isPending

  const handleSubmit = async () => {
    if (!activeProject || !canSubmit) return
    setSubmitError(null)
    setProgress(0)

    const formData = new FormData()
    formData.append('project_id', String(activeProject.id))
    formData.append('zone_id', zoneId)
    if (subZoneId) formData.append('sub_zone_id', subZoneId)
    validFiles.forEach(e => {
      formData.append('bom_files', e.file)
      formData.append('doc_types', e.detectedType!)
    })
    ncFiles.forEach(f => formData.append('nc_files', f))

    try {
      const res = await uploadMutation.mutateAsync({
        formData,
        onProgress: pct => setProgress(pct),
      })
      navigate(`/bom/dispatch/${res.id}/paint`)
    } catch {
      setSubmitError('Upload failed — verify that the backend is ready (Batch 2)')
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
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
            Project
          </label>
          <div style={{
            height: 36, padding: '0 12px', fontSize: 13, border: '1px solid #E0E0E0',
            borderRadius: 6, background: '#F5F5F5', color: '#8E8E8E',
            display: 'flex', alignItems: 'center',
          }}>
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
            style={{
              width: '100%', height: 36, padding: '0 10px', fontSize: 13,
              border: `1px solid ${zoneId ? '#C8202A' : '#E0E0E0'}`, borderRadius: 6,
              background: activeProject ? 'white' : '#F5F5F5',
            }}
            value={zoneId}
            onChange={e => { setZoneId(e.target.value); setSubZoneId('') }}
          >
            <option value="">Select Zone...</option>
            {zones.map(z => (
              <option key={z.id} value={z.id}>{z.code} — {z.label}</option>
            ))}
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
            style={{
              width: '100%', height: 36, padding: '0 10px', fontSize: 13,
              border: `1px solid ${subZoneId ? '#C8202A' : '#E0E0E0'}`, borderRadius: 6,
              background: zoneId && subZones.length > 0 ? 'white' : '#F5F5F5',
              opacity: !zoneId || subZones.length === 0 ? 0.5 : 1,
            }}
            value={subZoneId}
            onChange={e => setSubZoneId(e.target.value)}
          >
            <option value="">(None)</option>
            {subZones.map(sz => (
              <option key={sz.id} value={sz.id}>{sz.code ? `${sz.code} — ` : ''}{sz.name}</option>
            ))}
          </select>
        </div>

        {/* BOM Dropzone */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
            BOM Files <span style={{ color: '#C8202A' }}>*</span>
            <span style={{ fontSize: 11, fontWeight: 400, color: '#8E8E8E', marginLeft: 6 }}>
              Assembly List, Assembly Part List, Part List (ครบ 3 ไฟล์)
            </span>
          </label>
          <FileDropzone
            maxFiles={3}
            currentCount={files.filter(e => !e.error).length}
            onFilesAdded={onFilesAdded}
            disabled={files.filter(e => !e.error).length >= 3}
          />
        </div>

        {/* BOM File previews */}
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

        {/* NC Dropzone */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
            NC Files <span style={{ color: '#C8202A' }}>*</span>
            <span style={{ fontSize: 11, fontWeight: 400, color: '#8E8E8E', marginLeft: 6 }}>
              ไฟล์ .nc1 จาก Tekla (ใช้เป็น canonical source สำหรับ qty + dimensions)
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

        {/* NC File list */}
        {ncFiles.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', marginBottom: 6 }}>
              NC FILES ({ncFiles.length})
            </div>
            <div style={{
              maxHeight: 180, overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 4,
              border: '1px solid #E0E0E0', borderRadius: 6, padding: '6px 6px',
              background: '#FAFAFA',
            }}>
              {ncFiles.map((f, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '4px 8px', background: 'white', borderRadius: 4,
                    border: '1px solid #ECECEC', fontSize: 12, flexShrink: 0,
                  }}
                >
                  <span style={{ color: '#333', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <button
                    onClick={() => setNcFiles(prev => prev.filter((_, j) => j !== i))}
                    style={{ fontSize: 11, color: '#8E8E8E', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 8, flexShrink: 0 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress bar */}
        {progress !== null && (
          <div>
            <div style={{ height: 6, background: '#E0E0E0', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${progress}%`,
                background: '#C8202A', transition: 'width 0.2s',
              }} />
            </div>
            <div style={{ fontSize: 12, color: '#8E8E8E', marginTop: 4, textAlign: 'right' }}>{progress}%</div>
          </div>
        )}

        {/* Submit error */}
        {submitError && (
          <div style={{ fontSize: 13, color: '#C8202A', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 14px' }}>
            {submitError}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between" style={{ paddingTop: 4 }}>
          <button
            onClick={() => navigate('/bom')}
            style={{ fontSize: 13, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}
          >
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
              : <><Upload size={14} />Upload ({validFiles.length} BOM + {ncFiles.length} NC)</>}
          </button>
        </div>
      </div>
    </div>
  )
}
