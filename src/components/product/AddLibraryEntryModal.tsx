import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useCreateLibraryEntry } from '../../hooks/useLibrary'
import { libraryApi } from '../../api/library'
import { PREFIX_CATEGORIES } from '../../api/types'
import type { PrefixCategory } from '../../api/types'

const CATEGORY_LABELS: Record<PrefixCategory, string> = {
  main_structure: 'Main Structure',
  secondary_structure: 'Secondary Structure',
  accessory: 'Accessory',
  building_component: 'Building Component',
}

interface Props {
  onClose: () => void
  onCreated?: (entry: { id: number; code: string; name: string }) => void
  initialName?: string
}

export function AddLibraryEntryModal({ onClose, onCreated, initialName = '' }: Props) {
  const [name, setName] = useState(initialName.toUpperCase())
  const [prefixCode, setPrefixCode] = useState('')
  const [prefixLabel, setPrefixLabel] = useState('')
  const [prefixCategory, setPrefixCategory] = useState<PrefixCategory | ''>('')

  const [nameError, setNameError] = useState('')
  const [prefixError, setPrefixError] = useState('')
  const [formError, setFormError] = useState('')
  const [checkingName, setCheckingName] = useState(false)
  const [checkingPrefix, setCheckingPrefix] = useState(false)
  const [success, setSuccess] = useState<{ code: string; name: string } | null>(null)

  const { mutateAsync: create, isPending } = useCreateLibraryEntry()

  // Debounced name duplicate check
  useEffect(() => {
    const trimmed = name.trim()
    if (!trimmed) { setNameError(''); return }
    const timer = setTimeout(async () => {
      setCheckingName(true)
      try {
        const res = await libraryApi.list({ q: trimmed, limit: 5 })
        const exact = res.items.find(e => e.name.toLowerCase() === trimmed.toLowerCase())
        setNameError(exact ? `Already exists as ${exact.code}` : '')
      } catch {
        setNameError('')
      } finally {
        setCheckingName(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [name])

  // Debounced prefix code duplicate check
  useEffect(() => {
    const code = prefixCode.trim()
    if (!code) { setPrefixError(''); return }
    const timer = setTimeout(async () => {
      setCheckingPrefix(true)
      try {
        const res = await libraryApi.checkPrefix(code)
        setPrefixError(res.available ? '' : `Prefix "${code}" is already in use`)
      } catch {
        setPrefixError('')
      } finally {
        setCheckingPrefix(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [prefixCode])

  const handleNameChange = (val: string) => {
    setName(val.toUpperCase())
    setFormError('')
  }

  const handlePrefixCodeChange = (val: string) => {
    setPrefixCode(val.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    setPrefixError('')
    setFormError('')
  }

  const isValid =
    name.trim() &&
    prefixCode.trim() &&
    prefixLabel.trim() &&
    prefixCategory &&
    !nameError &&
    !prefixError &&
    !checkingName &&
    !checkingPrefix

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setFormError('Product name is required'); return }
    if (!prefixCode.trim()) { setFormError('Mark Prefix Code is required'); return }
    if (!prefixLabel.trim()) { setFormError('Mark Prefix Label is required'); return }
    if (!prefixCategory) { setFormError('Mark Prefix Category is required'); return }
    if (nameError || prefixError) return
    setFormError('')
    try {
      const entry = await create({
        name: name.trim(),
        mark_prefix: prefixCode.trim(),
        mark_prefix_label: prefixLabel.trim(),
        mark_prefix_category: prefixCategory,
      })
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
      <div className="bg-white rounded-xl shadow-xl flex flex-col" style={{ width: 500, maxHeight: '90vh', overflowY: 'auto' }}>
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

          {/* Product Name */}
          <div className="flex flex-col" style={{ gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Product Name <span style={{ color: '#C8202A' }}>*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              maxLength={200}
              placeholder="e.g. H300X300X12X12"
              className="border rounded-md focus:outline-none font-mono"
              style={{
                height: 38, padding: '0 12px', fontSize: 14,
                borderColor: nameError ? '#C8202A' : '#E0E0E0',
              }}
            />
            {nameError && <span style={{ fontSize: 12, color: '#C8202A' }}>{nameError}</span>}
            {checkingName && (
              <span style={{ fontSize: 12, color: '#8E8E8E', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Loader2 size={11} className="animate-spin" /> checking...
              </span>
            )}
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>English uppercase only · {name.length}/200</span>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid #F0F0F0', margin: '0 -4px' }} />
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0C447C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Mark Prefix
          </div>

          {/* Prefix Code */}
          <div className="flex flex-col" style={{ gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>
              Code <span style={{ color: '#C8202A' }}>*</span>
              <span style={{ fontWeight: 400, color: '#9CA3AF', marginLeft: 6 }}>uppercase letters and digits only, max 10</span>
            </label>
            <input
              value={prefixCode}
              onChange={e => handlePrefixCodeChange(e.target.value)}
              maxLength={10}
              placeholder="e.g. HB"
              className="border rounded-md focus:outline-none font-mono"
              style={{
                height: 38, padding: '0 12px', fontSize: 14,
                borderColor: prefixError ? '#C8202A' : '#E0E0E0',
              }}
            />
            {prefixError && <span style={{ fontSize: 12, color: '#C8202A' }}>{prefixError}</span>}
            {checkingPrefix && (
              <span style={{ fontSize: 12, color: '#8E8E8E', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Loader2 size={11} className="animate-spin" /> checking...
              </span>
            )}
          </div>

          {/* Prefix Label */}
          <div className="flex flex-col" style={{ gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>
              Label <span style={{ color: '#C8202A' }}>*</span>
            </label>
            <input
              value={prefixLabel}
              onChange={e => { setPrefixLabel(e.target.value); setFormError('') }}
              maxLength={40}
              placeholder="e.g. H-Beam Column"
              className="border rounded-md focus:outline-none"
              style={{ height: 38, padding: '0 12px', fontSize: 14, borderColor: '#E0E0E0' }}
            />
          </div>

          {/* Prefix Category */}
          <div className="flex flex-col" style={{ gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>
              Category <span style={{ color: '#C8202A' }}>*</span>
            </label>
            <select
              value={prefixCategory}
              onChange={e => { setPrefixCategory(e.target.value as PrefixCategory); setFormError('') }}
              className="border rounded-md focus:outline-none"
              style={{ height: 38, padding: '0 10px', fontSize: 14, borderColor: '#E0E0E0', background: '#fff' }}
            >
              <option value="">— เลือก Category —</option>
              {PREFIX_CATEGORIES.map(c => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          <div style={{ padding: '10px 12px', background: '#F5F5F5', borderRadius: 8, fontSize: 12, color: '#555' }}>
            Code จะถูกสร้างอัตโนมัติ (LIB-001, LIB-002, ...) · Mark Prefix จะถูก sync ไป mark_prefix_master
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2" style={{ paddingTop: 4 }}>
            <button type="button" onClick={onClose}
              className="rounded-md border border-chrome-200 hover:bg-chrome-50"
              style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 500, color: '#555' }}>
              Cancel
            </button>
            <button type="submit" disabled={isPending || !isValid}
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
