import { useState, useEffect } from 'react'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useUpdateLibraryEntry } from '../../hooks/useLibrary'
import { libraryApi } from '../../api/library'
import { PREFIX_CATEGORIES } from '../../api/types'
import type { LibraryEntryDTO, PrefixCategory } from '../../api/types'

const CATEGORY_LABELS: Record<PrefixCategory, string> = {
  main_structure: 'Main Structure',
  secondary_structure: 'Secondary Structure',
  accessory: 'Accessory',
  building_component: 'Building Component',
}

interface Props {
  entry: LibraryEntryDTO
  onClose: () => void
}

export function EditLibraryEntryModal({ entry, onClose }: Props) {
  const [name, setName] = useState(entry.name)
  const [active, setActive] = useState(entry.active)

  // Mark prefix fields — pre-fill from existing entry
  const [prefixCode, setPrefixCode] = useState(entry.mark_prefix ?? '')
  const [prefixLabel, setPrefixLabel] = useState(entry.mark_prefix_label ?? '')
  const [prefixCategory, setPrefixCategory] = useState<PrefixCategory | ''>(
    (entry.mark_prefix_category as PrefixCategory) ?? ''
  )

  const [dupError, setDupError] = useState('')
  const [checkingDup, setCheckingDup] = useState(false)
  const [prefixError, setPrefixError] = useState('')
  const [checkingPrefix, setCheckingPrefix] = useState(false)
  const [formError, setFormError] = useState('')

  const { mutateAsync: update, isPending } = useUpdateLibraryEntry(entry.id)

  const nameChanged = name.trim() !== entry.name
  const activeChanged = active !== entry.active
  const prefixCodeChanged = prefixCode.trim() !== (entry.mark_prefix ?? '')
  const prefixLabelChanged = prefixLabel.trim() !== (entry.mark_prefix_label ?? '')
  const prefixCategoryChanged = prefixCategory !== (entry.mark_prefix_category ?? '')
  const prefixChanged = prefixCodeChanged || prefixLabelChanged || prefixCategoryChanged
  const hasChanges = nameChanged || activeChanged || prefixChanged

  // Debounced name dup check
  useEffect(() => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === entry.name) { setDupError(''); return }
    const timer = setTimeout(async () => {
      setCheckingDup(true)
      try {
        const res = await libraryApi.list({ q: trimmed, limit: 50 })
        const exact = res.items.find(e => e.name.toLowerCase() === trimmed.toLowerCase() && e.id !== entry.id)
        setDupError(exact ? `Already exists as ${exact.code}` : '')
      } catch { setDupError('') }
      finally { setCheckingDup(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [name, entry.name, entry.id])

  // Debounced prefix code check — only runs when code changes from current value
  useEffect(() => {
    const code = prefixCode.trim()
    if (!code || code === (entry.mark_prefix ?? '')) { setPrefixError(''); return }
    const timer = setTimeout(async () => {
      setCheckingPrefix(true)
      try {
        const res = await libraryApi.checkPrefix(code)
        setPrefixError(res.available ? '' : `Prefix "${code}" is already in use`)
      } catch { setPrefixError('') }
      finally { setCheckingPrefix(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [prefixCode, entry.mark_prefix])

  const handlePrefixCodeChange = (val: string) => {
    setPrefixCode(val.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    setPrefixError('')
    setFormError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setFormError('Name is required'); return }
    if (dupError || prefixError) return
    if (!hasChanges) { onClose(); return }

    // If prefix code is being set, label and category are required
    if (prefixCode.trim() && (!prefixLabel.trim() || !prefixCategory)) {
      setFormError('Mark Prefix Label and Category are required when setting a prefix')
      return
    }

    setFormError('')
    try {
      const payload: Record<string, unknown> = {}
      if (nameChanged) payload.name = trimmed
      if (activeChanged) payload.active = active
      if (prefixChanged && prefixCode.trim()) {
        payload.mark_prefix = prefixCode.trim()
        payload.mark_prefix_label = prefixLabel.trim()
        payload.mark_prefix_category = prefixCategory
      }
      await update(payload)
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to save changes — please try again')
      console.error(err)
    }
  }

  const linkedTotal = entry.std_count + entry.cus_count
  const archiveWarning = !active && entry.active && linkedTotal > 0
  const hasPrefix = !!entry.mark_prefix

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-xl shadow-xl flex flex-col" style={{ width: 500, maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-chrome-100" style={{ padding: '16px 20px', flexShrink: 0 }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1F1F1F' }}>Edit Library Entry</span>
            <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, color: '#065F46', background: '#D1FAE5', borderRadius: 4, padding: '2px 8px' }}>
              {entry.code}
            </span>
          </div>
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

          {/* Name */}
          <div className="flex flex-col" style={{ gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Product Name <span style={{ color: '#C8202A' }}>*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={e => { setName(e.target.value); setFormError('') }}
              maxLength={200}
              className="border rounded-md focus:outline-none font-mono"
              style={{ height: 38, padding: '0 12px', fontSize: 14, borderColor: dupError ? '#C8202A' : '#E0E0E0' }}
            />
            {dupError && <span style={{ fontSize: 12, color: '#C8202A' }}>{dupError}</span>}
            {checkingDup && (
              <span style={{ fontSize: 12, color: '#8E8E8E', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Loader2 size={11} className="animate-spin" /> checking...
              </span>
            )}
            <span style={{ fontSize: 12, color: '#8E8E8E' }}>{name.length}/200</span>
          </div>

          {/* Status */}
          <div className="flex flex-col" style={{ gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</label>
            <div className="flex gap-2">
              {[true, false].map(val => (
                <button key={String(val)} type="button" onClick={() => setActive(val)}
                  style={{
                    height: 34, padding: '0 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    border: `1.5px solid ${active === val ? (val ? '#059669' : '#9CA3AF') : '#E0E0E0'}`,
                    background: active === val ? (val ? '#F0FDF4' : '#F5F5F5') : '#fff',
                    color: active === val ? (val ? '#065F46' : '#555') : '#8E8E8E',
                  }}>
                  {val ? 'Active' : 'Archived'}
                </button>
              ))}
            </div>
          </div>

          {archiveWarning && (
            <div className="flex items-start gap-2 rounded-lg" style={{ padding: 12, background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: 13 }}>
              <AlertTriangle size={15} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
              <div style={{ color: '#92400E' }}>
                <span style={{ fontWeight: 600 }}>{linkedTotal} product(s) still reference this entry</span>
                {' '}({entry.std_count > 0 && `${entry.std_count} STD`}{entry.std_count > 0 && entry.cus_count > 0 && ', '}{entry.cus_count > 0 && `${entry.cus_count} CUS`}).
                {' '}Archiving will not unlink them.
              </div>
            </div>
          )}

          {linkedTotal > 0 && (
            <div style={{ padding: '10px 12px', background: '#F5F5F5', borderRadius: 8, fontSize: 12, color: '#555', display: 'flex', gap: 12 }}>
              <span style={{ fontWeight: 600 }}>Used by:</span>
              {entry.std_count > 0 && <span style={{ color: '#0C447C', fontWeight: 600 }}>{entry.std_count} Standard</span>}
              {entry.cus_count > 0 && <span style={{ color: '#B45309', fontWeight: 600 }}>{entry.cus_count} Custom</span>}
            </div>
          )}

          {/* Mark Prefix section */}
          <div style={{ borderTop: '1px solid #F0F0F0', paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0C447C', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
              Mark Prefix {!hasPrefix && <span style={{ fontWeight: 400, color: '#9CA3AF', textTransform: 'none' }}>— Not configured</span>}
            </div>

            <div className="flex flex-col" style={{ gap: 12 }}>
              {/* Code */}
              <div className="flex flex-col" style={{ gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>
                  Code
                  <span style={{ fontWeight: 400, color: '#9CA3AF', marginLeft: 6 }}>uppercase letters/digits · max 10</span>
                </label>
                <input
                  value={prefixCode}
                  onChange={e => handlePrefixCodeChange(e.target.value)}
                  maxLength={10}
                  placeholder="e.g. BM"
                  className="border rounded-md focus:outline-none font-mono"
                  style={{ height: 36, padding: '0 10px', fontSize: 14, borderColor: prefixError ? '#C8202A' : '#E0E0E0' }}
                />
                {prefixError && <span style={{ fontSize: 12, color: '#C8202A' }}>{prefixError}</span>}
                {checkingPrefix && (
                  <span style={{ fontSize: 12, color: '#8E8E8E', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Loader2 size={11} className="animate-spin" /> checking...
                  </span>
                )}
              </div>

              {/* Label */}
              <div className="flex flex-col" style={{ gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Label</label>
                <input
                  value={prefixLabel}
                  onChange={e => { setPrefixLabel(e.target.value); setFormError('') }}
                  maxLength={40}
                  placeholder="e.g. Beam"
                  className="border rounded-md focus:outline-none"
                  style={{ height: 36, padding: '0 10px', fontSize: 14, borderColor: '#E0E0E0' }}
                />
              </div>

              {/* Category */}
              <div className="flex flex-col" style={{ gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Category</label>
                <select
                  value={prefixCategory}
                  onChange={e => { setPrefixCategory(e.target.value as PrefixCategory); setFormError('') }}
                  className="border rounded-md focus:outline-none"
                  style={{ height: 36, padding: '0 10px', fontSize: 14, borderColor: '#E0E0E0', background: '#fff' }}
                >
                  <option value="">— Select category —</option>
                  {PREFIX_CATEGORIES.map(c => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2" style={{ paddingTop: 4 }}>
            <button type="button" onClick={onClose}
              className="rounded-md border border-chrome-200 hover:bg-chrome-50"
              style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 500, color: '#555' }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !!dupError || !!prefixError || !name.trim() || !hasChanges}
              className="rounded-md text-white flex items-center gap-1.5 disabled:opacity-50"
              style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#065F46' }}>
              {isPending && <Loader2 size={13} className="animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
