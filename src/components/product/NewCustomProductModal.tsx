import { useState, useEffect } from 'react'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useCategories } from '../../hooks/useMasters'
import { useProjects } from '../../hooks/useProjects'
import { useProjectZones } from '../../hooks/useProjectZones'
import { useCreateProduct } from '../../hooks/useProducts'
import { MarkPrefixDropdown } from './MarkPrefixDropdown'
import { productsApi } from '../../api/products'
import { libraryApi } from '../../api/library'
import type { CreateCustomProductPayload, LibraryEntryDTO } from '../../api/types'

const DEFAULT_CATEG_ID = 24 // MS000 — Main Structures

const EMPTY_FORM = {
  name: '', categ_id: '', project_id: '', erection_zone_id: '',
  mark_prefix: '', mark_number: '',
  grade: '', thickness_mm: '',
  area_m2: '', length_mm: '', width_mm: '', height_mm: '', weight_kg: '',
}

interface Props { onClose: () => void }

export function NewCustomProductModal({ onClose }: Props) {
  const { data: categories = [], isLoading: loadingCats } = useCategories()
  const { data: projectsData } = useProjects({ limit: 100 })
  const projects = projectsData?.items ?? []
  const { mutateAsync: create, isPending } = useCreateProduct()

  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState('')
  const [dupWarning, setDupWarning] = useState('')

  // Library picker
  const [libraryId, setLibraryId] = useState<number | null>(null)
  const [libraryCode, setLibraryCode] = useState('')
  const [libraryName, setLibraryName] = useState('')
  const [libraryQuery, setLibraryQuery] = useState('')
  const [libraryResults, setLibraryResults] = useState<LibraryEntryDTO[]>([])
  const [showLibraryDropdown, setShowLibraryDropdown] = useState(false)
  const [librarySearching, setLibrarySearching] = useState(false)
  const [freeformMode, setFreeformMode] = useState(false)
  const [libraryMatchSuggestion, setLibraryMatchSuggestion] = useState<LibraryEntryDTO | null>(null)
  const selectedProjectId = form.project_id ? parseInt(form.project_id) : undefined
  const selectedProject = projects.find(p => p.id === selectedProjectId)
  const { data: zones = [] } = useProjectZones(selectedProjectId)
  const selectedZone = zones.find(z => z.id === parseInt(form.erection_zone_id || '0'))

  // Mark preview: project_code-zone_code-mark_prefix + mark_number (user types)
  const markAutoPrefix = [selectedProject?.project_code, selectedZone?.code, form.mark_prefix]
    .filter(Boolean).join('-')
  const markPreview = markAutoPrefix + form.mark_number

  // Debounced library search
  useEffect(() => {
    if (freeformMode || libraryId) return
    const q = libraryQuery.trim()
    if (!q) { setLibraryResults([]); return }
    const timer = setTimeout(async () => {
      setLibrarySearching(true)
      try {
        const res = await libraryApi.list({ q, limit: 8 })
        setLibraryResults(res.items.filter(e => e.active))
      } catch { setLibraryResults([]) }
      finally { setLibrarySearching(false) }
    }, 200)
    return () => clearTimeout(timer)
  }, [libraryQuery, freeformMode, libraryId])

  // Library match suggestion in freeform mode
  useEffect(() => {
    if (!freeformMode || !form.name.trim()) { setLibraryMatchSuggestion(null); return }
    const timer = setTimeout(async () => {
      try {
        const res = await libraryApi.list({ q: form.name.trim(), limit: 5 })
        const exact = res.items.find(e => e.name.toLowerCase() === form.name.trim().toLowerCase() && e.active)
        setLibraryMatchSuggestion(exact ?? null)
      } catch { setLibraryMatchSuggestion(null) }
    }, 300)
    return () => clearTimeout(timer)
  }, [form.name, freeformMode])

  const setField = (k: string, v: string) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })) }

  const checkDuplicate = async () => {
    if (!form.project_id || !form.mark_prefix || !form.mark_number) return
    try {
      const result = await productsApi.list({ product_type: 'custom', project_id: parseInt(form.project_id), q: form.mark_number, limit: 5 })
      const dup = result.items.find(p =>
        p.mark_prefix === form.mark_prefix && p.mark_number === form.mark_number &&
        (form.erection_zone_id ? p.erection_zone_id === parseInt(form.erection_zone_id) : !p.erection_zone_id)
      )
      setDupWarning(dup ? `Duplicate mark — conflicts with ${dup.product_code} (${dup.name})` : '')
    } catch { /* ignore */ }
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!libraryId && !form.name.trim()) errs.name = 'Please enter a product name or select from library'
    if (!form.project_id) errs.project_id = 'Please select a project'
    if (!form.mark_prefix) errs.mark_prefix = 'Please select a mark prefix'
    if (!form.mark_number.trim()) errs.mark_number = 'Please enter a mark number'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const attrs: Record<string, unknown> = {}
    if (form.grade)        attrs.grade        = form.grade.trim()
    if (form.thickness_mm) attrs.thickness_mm = parseFloat(form.thickness_mm)
    if (form.area_m2)      attrs.area_m2      = parseFloat(form.area_m2)
    if (form.length_mm)    attrs.length_mm    = parseFloat(form.length_mm)
    if (form.width_mm)     attrs.width_mm     = parseFloat(form.width_mm)
    if (form.height_mm)    attrs.height_mm    = parseFloat(form.height_mm)
    if (form.weight_kg)    attrs.weight_kg    = parseFloat(form.weight_kg)

    const payload: CreateCustomProductPayload = {
      product_type: 'custom',
      product_kind: 'assembly',
      name: libraryId ? libraryName : form.name,
      categ_id: form.categ_id ? parseInt(form.categ_id) : DEFAULT_CATEG_ID,
      project_id: parseInt(form.project_id),
      erection_zone_id: form.erection_zone_id ? parseInt(form.erection_zone_id) : undefined,
      mark_prefix: form.mark_prefix,
      mark_number: form.mark_number,
      attributes: Object.keys(attrs).length ? attrs : undefined,
      library_id: libraryId ?? undefined,
    }
    try {
      const result = await create(payload)
      setSuccess(`Created successfully: ${result.product_code}`)
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'An error occurred'
      toast.error(typeof msg === 'string' ? msg : JSON.stringify(msg))
    }
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
        <div className="bg-white rounded-xl shadow-xl" style={{ width: 440, padding: 32 }}>
          <div className="flex flex-col items-center gap-4">
            <div style={{ fontSize: 32 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#27500A' }}>{success}</div>
            <button onClick={onClose} className="rounded-md text-white" style={{ background: '#C8202A', padding: '8px 24px', fontWeight: 600 }}>Close</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-xl shadow-xl flex flex-col" style={{ width: 520, maxHeight: '90vh', overflow: 'hidden' }}>

        <div className="flex items-center justify-between px-6" style={{ height: 56, borderBottom: '1px solid #E0E0E0', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Add Custom Product</span>
          <button onClick={onClose} className="rounded hover:bg-gray-50" style={{ padding: 4 }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col" style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Project & Zone */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, background: '#F8F9FA', borderRadius: 8, border: `1px solid ${errors.project_id ? '#C8202A' : '#E0E0E0'}` }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>Project</div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Project *</label>
                <select className="w-full border rounded-md"
                  style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: errors.project_id ? '#C8202A' : '#E0E0E0', background: '#fff' }}
                  value={form.project_id} onChange={e => { setField('project_id', e.target.value); setField('erection_zone_id', '') }}>
                  <option value="">— Select Project —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>)}
                </select>
                {errors.project_id && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.project_id}</div>}
              </div>
              {selectedProjectId && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Zone (Erection Area)</label>
                  <select className="w-full border rounded-md"
                    style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: '#E0E0E0', background: '#fff' }}
                    value={form.erection_zone_id} onChange={e => setField('erection_zone_id', e.target.value)}>
                    <option value="">— No Zone —</option>
                    {zones.map(z => <option key={z.id} value={z.id}>{z.code} — {z.label}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Mark */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, background: '#F8F9FA', borderRadius: 8, border: `1px solid ${errors.mark_prefix || errors.mark_number ? '#C8202A' : '#E0E0E0'}` }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>Mark</div>
              <MarkPrefixDropdown
                value={form.mark_prefix}
                onChange={v => setField('mark_prefix', v)}
                error={errors.mark_prefix}
              />
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Mark Number *</label>
                <input className="w-full border rounded-md font-mono"
                  style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: errors.mark_number ? '#C8202A' : dupWarning ? '#B45309' : '#E0E0E0', background: '#fff' }}
                  value={form.mark_number} onChange={e => { setField('mark_number', e.target.value); setDupWarning('') }} onBlur={checkDuplicate} placeholder="1" />
                {errors.mark_number && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.mark_number}</div>}
                {dupWarning && !errors.mark_number && (
                  <div className="flex items-center gap-1" style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}><AlertTriangle size={12} />{dupWarning}</div>
                )}
              </div>
              {/* Preview: project_code-zone_code-mark_prefix + mark_number */}
              {markAutoPrefix && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#888' }}>Preview:</span>
                  <span className="font-mono" style={{ fontSize: 12, padding: '2px 10px', borderRadius: 4, background: '#E6F1FB', color: '#0C447C', fontWeight: 700 }}>
                    {markPreview || markAutoPrefix + '…'}
                  </span>
                </div>
              )}
            </div>

            {/* Category (optional) */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>
                Category
                <span style={{ fontSize: 11, fontWeight: 400, color: '#9CA3AF', marginLeft: 6 }}>(optional — defaults to Main Structures)</span>
              </label>
              <select className="w-full border rounded-md"
                style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: '#E0E0E0' }}
                value={form.categ_id} onChange={e => setField('categ_id', e.target.value)} disabled={loadingCats}>
                <option value="">— Main Structures (default) —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.complete_name ?? c.name}</option>)}
              </select>
            </div>

            {/* Product Name */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Product Name *</label>
                <button type="button"
                  onClick={() => {
                    const next = !freeformMode
                    setFreeformMode(next)
                    setLibraryId(null); setLibraryCode(''); setLibraryName('')
                    setLibraryResults([]); setLibraryMatchSuggestion(null)
                  }}
                  style={{ fontSize: 11, color: '#0C447C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {freeformMode ? '← Pick from library' : '✎ Type freeform name'}
                </button>
              </div>

              {!freeformMode ? (
                libraryId ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: '1.5px solid #059669', borderRadius: 6, background: '#F0FDF4' }}>
                    <span className="font-mono" style={{ fontSize: 11, fontWeight: 700, color: '#065F46', background: '#D1FAE5', borderRadius: 4, padding: '1px 6px' }}>{libraryCode}</span>
                    <span style={{ fontSize: 13, color: '#1F1F1F', flex: 1 }}>{libraryName}</span>
                    <button type="button" onClick={() => { setLibraryId(null); setLibraryCode(''); setLibraryName(''); setLibraryQuery('') }}
                      style={{ color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 14 }}>✕</button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <input className="w-full border rounded-md"
                      style={{ height: 36, padding: '0 32px 0 10px', fontSize: 13, borderColor: errors.name ? '#C8202A' : '#E0E0E0' }}
                      value={libraryQuery}
                      onChange={e => { setLibraryQuery(e.target.value); setShowLibraryDropdown(true) }}
                      onFocus={() => setShowLibraryDropdown(true)}
                      onBlur={() => setTimeout(() => setShowLibraryDropdown(false), 150)}
                      placeholder="Search library by name..." />
                    {librarySearching && <Loader2 size={13} className="animate-spin" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />}
                    {showLibraryDropdown && (libraryResults.length > 0 || libraryQuery.trim()) && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto' }}>
                        {libraryResults.map(entry => (
                          <div key={entry.id} onMouseDown={() => { setLibraryId(entry.id); setLibraryCode(entry.code); setLibraryName(entry.name); setShowLibraryDropdown(false) }}
                            style={{ padding: '7px 10px', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}
                            className="hover:bg-chrome-50">
                            <span className="font-mono" style={{ fontSize: 11, color: '#0C447C', minWidth: 60 }}>{entry.code}</span>
                            <span style={{ fontSize: 13 }}>{entry.name}</span>
                          </div>
                        ))}
                        {libraryQuery.trim() && libraryResults.length === 0 && (
                          <div style={{ padding: '7px 10px', borderTop: '1px solid #F0F0F0', color: '#9CA3AF', fontSize: 12 }}>
                            ไม่พบ — กรุณาสร้าง entry ใน Product Library ก่อน
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              ) : (
                <>
                  <input className="w-full border rounded-md"
                    style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: errors.name ? '#C8202A' : '#E0E0E0' }}
                    value={form.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. Column C-1 Warehouse" />
                  {libraryMatchSuggestion && (
                    <div style={{ marginTop: 4, padding: '6px 10px', background: '#FFFBEB', borderRadius: 6, border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <span style={{ color: '#92400E' }}>Matches <span className="font-mono" style={{ fontWeight: 700 }}>{libraryMatchSuggestion.code}</span> in library —</span>
                      <button type="button" onClick={() => {
                        setLibraryId(libraryMatchSuggestion.id); setLibraryCode(libraryMatchSuggestion.code)
                        setLibraryName(libraryMatchSuggestion.name); setFreeformMode(false)
                      }} style={{ color: '#0C447C', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        Use link
                      </button>
                    </div>
                  )}
                </>
              )}
              {errors.name && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.name}</div>}
            </div>

            {/* Dimensions & Material */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, background: '#F8F9FA', borderRadius: 8, border: '1px solid #E0E0E0' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>
                Dimensions &amp; Material
                <span style={{ fontSize: 11, fontWeight: 400, color: '#9CA3AF', marginLeft: 6 }}>(optional)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 3 }}>Grade</label>
                  <input className="w-full border rounded-md"
                    style={{ height: 34, padding: '0 10px', fontSize: 13, borderColor: '#E0E0E0', background: '#fff' }}
                    value={form.grade} onChange={e => setField('grade', e.target.value)} placeholder="e.g. SS400, SM490A" />
                </div>
                <DimField label="Thickness (mm)" value={form.thickness_mm} onChange={v => setField('thickness_mm', v)} step="0.1" placeholder="0.0" />
                <DimField label="Length (mm)"    value={form.length_mm}    onChange={v => setField('length_mm', v)}    step="1"   placeholder="0" />
                <DimField label="Width (mm)"     value={form.width_mm}     onChange={v => setField('width_mm', v)}     step="1"   placeholder="0" />
                <DimField label="Height (mm)"    value={form.height_mm}    onChange={v => setField('height_mm', v)}    step="1"   placeholder="0" />
                <DimField label="Area (m²)"      value={form.area_m2}      onChange={v => setField('area_m2', v)}      step="0.001" placeholder="0.000" />
                <DimField label="Weight (kg)"    value={form.weight_kg}    onChange={v => setField('weight_kg', v)}    step="0.1"   placeholder="0.0" />
              </div>
            </div>

          </div>

          <div className="flex items-center justify-end gap-3 px-6" style={{ height: 60, borderTop: '1px solid #E0E0E0', flexShrink: 0 }}>
            <button type="button" onClick={onClose} className="rounded-md border"
              style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, borderColor: '#E0E0E0' }}>Cancel</button>
            <button type="submit" disabled={isPending} className="flex items-center gap-2 rounded-md text-white disabled:opacity-60"
              style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#B45309' }}>
              {isPending && <Loader2 size={14} className="animate-spin" />}
              Create Custom Product
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DimField({ label, value, onChange, step = '1', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; step?: string; placeholder?: string
}) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 3 }}>{label}</label>
      <input type="number" min="0" step={step} className="w-full border rounded-md"
        style={{ height: 34, padding: '0 10px', fontSize: 13, borderColor: '#E0E0E0', background: '#fff' }}
        value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}
