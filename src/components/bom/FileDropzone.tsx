import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'

const ACCEPTED_FORMATS = ['.xls', '.xlsx', '.csv']
const MAX_SIZE_BYTES = 200_000

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
  if (!ACCEPTED_FORMATS.includes(ext)) return `ไม่รองรับรูปแบบ ${ext} (รับเฉพาะ .xls, .xlsx, .csv)`
  if (file.size > MAX_SIZE_BYTES) return `ไฟล์ใหญ่เกิน 200 KB (${(file.size / 1024).toFixed(0)} KB)`
  if (currentCount >= maxFiles) return `รับได้สูงสุด ${maxFiles} ไฟล์`
  return null
}

export function FileDropzone({ maxFiles = 3, onFilesAdded, disabled = false, currentCount = 0 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
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
      onClick={() => !disabled && inputRef.current?.click()}
      style={{
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
        {dragOver ? 'วางไฟล์ที่นี่' : 'ลากไฟล์มาวางที่นี่ หรือ คลิกเพื่อเลือก'}
      </div>
      <div style={{ fontSize: 12, color: '#8E8E8E' }}>
        .xls, .xlsx, .csv · สูงสุด 200 KB / ไฟล์ · รับได้ {maxFiles} ไฟล์
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xls,.xlsx,.csv"
        multiple
        style={{ display: 'none' }}
        onChange={onInputChange}
      />
    </div>
  )
}
