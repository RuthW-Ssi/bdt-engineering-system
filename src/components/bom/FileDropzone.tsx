import { useState } from 'react'
import { Upload } from 'lucide-react'

const ACCEPTED_FORMATS = ['.xls', '.xlsx', '.csv']
const MAX_SIZE_BYTES = 20_000_000

export interface FileRejection {
  file: File
  reason: string
}

interface Props {
  maxFiles?: number
  onFilesAdded: (accepted: File[], rejected: FileRejection[]) => void
  disabled?: boolean
  currentCount?: number
}

function validateFile(file: File, currentCount: number, maxFiles: number): string | null {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!ACCEPTED_FORMATS.includes(ext)) return `Unsupported format ${ext} (only .xls, .xlsx, .csv accepted)`
  if (file.size > MAX_SIZE_BYTES) return `File exceeds 20 MB (${(file.size / 1024 / 1024).toFixed(1)} MB)`
  if (currentCount >= maxFiles) return `Maximum ${maxFiles} files allowed`
  return null
}

export function FileDropzone({ maxFiles = 3, onFilesAdded, disabled = false, currentCount = 0 }: Props) {
  const [dragOver, setDragOver] = useState(false)

  const processFiles = (fileList: FileList) => {
    const accepted: File[] = []
    const rejected: FileRejection[] = []
    let runningCount = currentCount

    Array.from(fileList).forEach(file => {
      const reason = validateFile(file, runningCount, maxFiles)
      if (reason) {
        rejected.push({ file, reason })
      } else {
        accepted.push(file)
        runningCount++
      }
    })

    onFilesAdded(accepted, rejected)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files)
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      processFiles(e.target.files)
      e.target.value = ''
    }
  }

  const borderColor = dragOver ? '#C8202A' : disabled ? '#E0E0E0' : '#D0D0D0'
  const bg = dragOver ? '#FFF5F5' : disabled ? '#FAFAFA' : 'white'

  return (
    <div
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      style={{
        position: 'relative',
        border: `2px dashed ${borderColor}`,
        borderRadius: 8,
        background: bg,
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Upload size={28} style={{ color: dragOver ? '#C8202A' : '#C2C2C2' }} />
      <div style={{ fontSize: 14, fontWeight: 500, color: '#555' }}>
        {dragOver ? 'Drop files here' : 'Drag files here, or click to select'}
      </div>
      <div style={{ fontSize: 12, color: '#8E8E8E' }}>
        .xls, .xlsx, .csv · max 20 MB / file · up to {maxFiles} files
      </div>

      {/* Input คลุมทั้ง dropzone — คลิกที่ไหนก็เปิด file picker */}
      {!disabled && (
        <input
          type="file"
          accept=".xls,.xlsx,.csv"
          multiple
          onChange={onInputChange}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0,
            cursor: 'pointer',
            width: '100%',
            height: '100%',
          }}
        />
      )}
    </div>
  )
}
