import { useRef, useState } from 'react'
import { uploadMachinePhoto } from '../../api/machines'

const MAX_PHOTOS = 3
const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png']

interface Props {
  value: string[]
  onChange: (urls: string[]) => void
  label?: string
}

export function PhotoUploadField({ value, onChange, label = 'Photos' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)

    const remaining = MAX_PHOTOS - value.length
    if (remaining <= 0) {
      setError(`Maximum ${MAX_PHOTOS} photos allowed`)
      return
    }

    const toUpload = Array.from(files).slice(0, remaining)

    for (const file of toUpload) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError('Only jpg/png files are supported')
        return
      }
      if (file.size > MAX_SIZE) {
        setError('File must not exceed 5MB')
        return
      }
    }

    setUploading(true)
    try {
      const urls: string[] = []
      for (const file of toUpload) {
        const result = await uploadMachinePhoto(file)
        urls.push(result.url)
      }
      onChange([...value, ...urls])
    } catch {
      setError('Upload failed — please try again')
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  const removePhoto = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>{label}</div>

      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => value.length < MAX_PHOTOS && inputRef.current?.click()}
        style={{
          border: '1.5px dashed #d1d5db',
          borderRadius: 8,
          padding: '16px',
          textAlign: 'center',
          cursor: value.length < MAX_PHOTOS ? 'pointer' : 'default',
          background: '#f9fafb',
          color: '#6b7280',
          fontSize: 13,
          opacity: uploading ? 0.6 : 1,
        }}
      >
        {uploading
          ? 'Uploading...'
          : value.length >= MAX_PHOTOS
          ? `Maximum reached (${MAX_PHOTOS} photos)`
          : 'Drag & drop or click to select photos (jpg/png, max 5MB)'}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        multiple
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />

      {error && (
        <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{error}</div>
      )}

      {value.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {value.map((url, idx) => (
            <div key={idx} style={{ position: 'relative' }}>
              <img
                src={url}
                alt={`photo-${idx}`}
                style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }}
              />
              <button
                type="button"
                onClick={() => removePhoto(idx)}
                style={{
                  position: 'absolute', top: -6, right: -6,
                  width: 18, height: 18, borderRadius: '50%',
                  background: '#dc2626', color: 'white', border: 'none',
                  fontSize: 10, cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
