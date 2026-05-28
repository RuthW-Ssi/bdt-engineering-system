import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useCreateLibraryEntry } from '../../hooks/useLibrary'
import { libraryApi } from '../../api/library'

interface Props {
  onClose: () => void
  onCreated?: (entry: { id: number; code: string; name: string }) => void
  initialName?: string
}

export function AddLibraryEntryModal({ onClose, onCreated, initialName = '' }: Props) {
  const [name, setName] = useState(initialName)
  const [dupError, setDupError] = useState('')
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState<{ code: string; name: string } | null>(null)
  const [checkingDup, setCheckingDup] = useState(false)

  const { mutateAsync: create, isPending } = useCreateLibraryEntry()

  // Debounced duplicate check
  useEffect(() => {
    if (!name.trim()) { setDupError(''); return }
    const timer = setTimeout(async () => {
      setCheckingDup(true)
      try {
        const res = await libraryApi.list({ q: name.trim(), limit: 5 })
        const exact = res.items.find(e => e.name.toLowerCase() === name.trim().toLowerCase())
        setDupError(exact ? `Already exists as ${exact.code}` : '')
      } catch {
        setDupError('')
      } finally {
        setCheckingDup(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [name])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setFormError('Product name is required'); return }
    if (dupError) return
    setFormError('')
    try {
      const entry = await create({ name: trimmed })
      setSuccess({ code: entry.code, name: entry.name })
      onCreated?.({ id: entry.id, code: entry.code, name: entry.name })
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'An error occurred'
      setFormError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    }
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
        <div className="bg-white rounded-xl shadow-xl flex flex-col items-center" style={{ width: 440, padding: 40, gap: 16 }}>
          <div style={{ fontSize: 32 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1F1F1F' }}>Library entry created</div>
          <div style={{ fontSize: 13, color: '#555', textAlign: 'center' }}>
            <span className="font-mono" style={{ fontWeight: 600, color: '#0C447C' }}>{success.code}</span>
            {' · '}{success.name}
          </div>
          <button onClick={onClose} className="rounded-md text-white"
            style={{ marginTop: 8, height: 36, padding: '0 24px', fontSize: 13, fontWeight: 600, background: '#0C447C' }}>
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-xl shadow-xl flex flex-col" style={{ width: 480, maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-chrome-100" style={{ padding: '16px 20px', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1F1F1F' }}>Add Library Entry</span>
          <button onClick={onClose} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 28, height: 28 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col" style={{ padding: 20, gap: 16 }}>
          {formError && (
            <div className="rounded-lg" style={{ padding: 12, background: '#FCEBEB', color: '#5C0D15', fontSize: 13 }}>
              {formError}
            </div>
          )}

          <div className="flex flex-col" style={{ gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Product Name <span style={{ color: '#C8202A' }}>*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={e => { setName(e.target.value); setFormError('') }}
              maxLength={200}
              placeholder="e.g. H300x300x12x12"
              className="border rounded-md focus:outline-none"
              style={{
                height: 38, padding: '0 12px', fontSize: 14,
                borderColor: dupError ? '#C8202A' : '#E0E0E0',
              }}
            />
            {dupError && (
              <span style={{ fontSize: 12, color: '#C8202A' }}>{dupError}</span>
            )}
            {checkingDup && (
              <span style={{ fontSize: 12, color: '#8E8E8E', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Loader2 size={11} className="animate-spin" /> checking...
              </span>
            )}
            <span style={{ fontSize: 12, color: '#8E8E8E' }}>{name.length}/200 chars</span>
          </div>

          <div style={{ padding: '10px 12px', background: '#F5F5F5', borderRadius: 8, fontSize: 12, color: '#555' }}>
            Code จะถูกสร้างอัตโนมัติ (LIB-001, LIB-002, ...)
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2" style={{ paddingTop: 4 }}>
            <button type="button" onClick={onClose}
              className="rounded-md border border-chrome-200 hover:bg-chrome-50"
              style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 500, color: '#555' }}>
              Cancel
            </button>
            <button type="submit" disabled={isPending || !!dupError || !name.trim()}
              className="rounded-md text-white flex items-center gap-1.5 disabled:opacity-50"
              style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#0C447C' }}>
              {isPending && <Loader2 size={13} className="animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
