import { useState } from 'react'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useCategories, useUoms } from '../hooks/useMasters'
import { useCreateMaterial } from '../hooks/useMaterials'
import type { CreateMaterialPayload, CategoryDTO } from '../api/types'

interface Props {
  onClose: () => void
}

// Dynamic attribute fields per category prefix
const ATTR_FIELDS: Record<string, { key: string; label: string; type: 'text' | 'number'; required?: boolean }[]> = {
  HR000: [
    { key: 'grade', label: 'Grade (e.g. SS400)', type: 'text', required: true },
    { key: 'height_h', label: 'H — Height (mm)', type: 'number', required: true },
    { key: 'width_b', label: 'B — Width (mm)', type: 'number', required: true },
    { key: 'web_tw', label: 'TW — Web Thickness (mm)', type: 'number', required: true },
    { key: 'flange_tf', label: 'TF — Flange Thickness (mm)', type: 'number', required: true },
    { key: 'length_mm', label: 'Standard Length (mm)', type: 'number' },
    { key: 'weight_per_m', label: 'Weight kg/m', type: 'number' },
  ],
  PL000: [
    { key: 'grade', label: 'Grade', type: 'text', required: true },
    { key: 'thickness_t', label: 'T — Thickness (mm)', type: 'number', required: true },
    { key: 'width_mm', label: 'Width (mm)', type: 'number' },
    { key: 'length_mm', label: 'Length (mm)', type: 'number' },
  ],
  CF000: [
    { key: 'grade', label: 'Grade', type: 'text', required: true },
    { key: 'height_h', label: 'H (mm)', type: 'number', required: true },
    { key: 'width_b', label: 'B (mm)', type: 'number', required: true },
    { key: 'thickness_t', label: 'T (mm)', type: 'number', required: true },
    { key: 'lip_c', label: 'C — Lip (mm)', type: 'number' },
  ],
  PT000: [
    { key: 'grade', label: 'Grade', type: 'text', required: true },
    { key: 'diameter_d', label: 'D — Diameter (mm)', type: 'number', required: true },
    { key: 'thickness_t', label: 'T — Thickness (mm)', type: 'number', required: true },
  ],
  BN000: [
    { key: 'grade', label: 'Grade', type: 'text' },
    { key: 'diameter_d', label: 'D — Thread Size (mm)', type: 'number', required: true },
    { key: 'length_mm', label: 'Length (mm)', type: 'number' },
  ],
}

const DEFAULT_FIELDS: { key: string; label: string; type: 'text' | 'number'; required?: boolean }[] = [
  { key: 'grade', label: 'Grade / Type', type: 'text' },
]

export function MaterialRegisterModal({ onClose }: Props) {
  const { data: categories = [], isLoading: loadingCats } = useCategories()
  const { data: uoms = [], isLoading: loadingUoms } = useUoms()
  const { mutateAsync: createMaterial, isPending } = useCreateMaterial()

  const [form, setForm] = useState({
    categ_id: '',
    uom_id: '',
    name: '',
    description_sale: '',
    drawing_ref: '',
    criticality: '',
  })
  const [attrs, setAttrs] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [duplicates, setDuplicates] = useState<unknown[]>([])
  const [success, setSuccess] = useState('')

  const selectedCat: CategoryDTO | undefined = categories.find(c => c.id === parseInt(form.categ_id))
  const attrFields = selectedCat?.prefix_5 ? (ATTR_FIELDS[selectedCat.prefix_5] ?? DEFAULT_FIELDS) : DEFAULT_FIELDS
  const needsCriticality = selectedCat?.needs_criticality ?? false

  const setField = (k: keyof typeof form, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
  }
  const setAttr = (k: string, v: string) => {
    setAttrs(a => ({ ...a, [k]: v }))
    setErrors(e => ({ ...e, [`attr_${k}`]: '' }))
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.categ_id) errs.categ_id = 'Please select a material category'
    if (!form.uom_id) errs.uom_id = 'Please select a unit of measure'
    if (!form.name.trim()) errs.name = 'Please enter a material name'
    if (!form.description_sale.trim()) errs.description_sale = 'Please enter a Description (EN UPPERCASE)'
    if (needsCriticality && !form.criticality) errs.criticality = 'Please specify Criticality for this category'
    for (const f of attrFields) {
      if (f.required && !attrs[f.key]) errs[`attr_${f.key}`] = `Please enter ${f.label}`
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const attrsParsed: Record<string, unknown> = {}
    for (const f of attrFields) {
      if (attrs[f.key] !== undefined && attrs[f.key] !== '') {
        attrsParsed[f.key] = f.type === 'number' ? parseFloat(attrs[f.key]) : attrs[f.key]
      }
    }

    const payload: CreateMaterialPayload = {
      categ_id: parseInt(form.categ_id),
      uom_id: parseInt(form.uom_id),
      name: form.name,
      description_sale: form.description_sale,
      attributes: attrsParsed,
      drawing_ref: form.drawing_ref || undefined,
      criticality: form.criticality || undefined,
    }

    try {
      const result = await createMaterial(payload)
      setDuplicates(result.duplicates ?? [])
      setSuccess(`Created successfully: ${result.default_code}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to register material — please try again')
      console.error(err)
    }
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
        <div className="bg-white rounded-xl shadow-xl" style={{ width: 440, padding: 32 }}>
          <div className="flex flex-col items-center gap-4">
            <div style={{ fontSize: 32 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#27500A' }}>{success}</div>
            {duplicates.length > 0 && (
              <div className="w-full rounded-lg border" style={{ padding: 12, background: '#FFFBEB', borderColor: '#FCD34D' }}>
                <div className="flex items-center gap-2" style={{ fontSize: 12, fontWeight: 600, color: '#854F0B', marginBottom: 6 }}>
                  <AlertTriangle size={14} /> Similar materials found ({duplicates.length} items)
                </div>
                {(duplicates as any[]).map((d, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                    {d.default_code} — {d.name} (score: {(d.match_score * 100).toFixed(0)}%)
                  </div>
                ))}
              </div>
            )}
            <button onClick={onClose} className="rounded-md text-white" style={{ background: '#C8202A', padding: '8px 24px', fontWeight: 600 }}>
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-xl shadow-xl flex flex-col" style={{ width: 580, maxHeight: '90vh', overflow: 'hidden' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6" style={{ height: 56, borderBottom: '1px solid #E0E0E0', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Add New Material</span>
          <button onClick={onClose} className="rounded hover:bg-chrome-50" style={{ padding: 4 }}><X size={18} /></button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col" style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Category */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Material Category *</label>
              <select
                className="w-full border rounded-md focus:outline-none"
                style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: errors.categ_id ? '#C8202A' : '#E0E0E0' }}
                value={form.categ_id}
                onChange={e => { setField('categ_id', e.target.value); setAttrs({}) }}
                disabled={loadingCats}
              >
                <option value="">— Select category —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.complete_name ?? c.name}</option>
                ))}
              </select>
              {errors.categ_id && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.categ_id}</div>}
            </div>

            {/* UoM */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Unit of Measure (UoM) *</label>
              <select
                className="w-full border rounded-md focus:outline-none"
                style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: errors.uom_id ? '#C8202A' : '#E0E0E0' }}
                value={form.uom_id}
                onChange={e => setField('uom_id', e.target.value)}
                disabled={loadingUoms}
              >
                <option value="">— Select unit —</option>
                {uoms.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              {errors.uom_id && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.uom_id}</div>}
            </div>

            {/* Name */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Material Name *</label>
              <input
                className="w-full border rounded-md focus:outline-none"
                style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: errors.name ? '#C8202A' : '#E0E0E0' }}
                value={form.name}
                onChange={e => setField('name', e.target.value)}
                placeholder="e.g. H-Beam SS400"
              />
              {errors.name && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.name}</div>}
            </div>

            {/* Description Sale */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>
                Description (EN UPPERCASE) *
                <span style={{ fontWeight: 400, marginLeft: 6, color: '#8E8E8E' }}>2-part uppercase English</span>
              </label>
              <input
                className="w-full border rounded-md focus:outline-none font-mono"
                style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: errors.description_sale ? '#C8202A' : '#E0E0E0' }}
                value={form.description_sale}
                onChange={e => setField('description_sale', e.target.value.toUpperCase())}
                placeholder="H-BEAM SS400 H=300 B=150 TW=6.5 TF=9"
              />
              {errors.description_sale && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.description_sale}</div>}
            </div>

            {/* Dynamic Attributes */}
            {attrFields.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Product Attributes{selectedCat ? ` — ${selectedCat.name}` : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                  {attrFields.map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 2 }}>
                        {f.label}{f.required ? ' *' : ''}
                      </label>
                      <input
                        type={f.type}
                        className="w-full border rounded-md focus:outline-none"
                        style={{ height: 32, padding: '0 8px', fontSize: 13, borderColor: errors[`attr_${f.key}`] ? '#C8202A' : '#E0E0E0' }}
                        value={attrs[f.key] ?? ''}
                        onChange={e => setAttr(f.key, e.target.value)}
                      />
                      {errors[`attr_${f.key}`] && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 1 }}>{errors[`attr_${f.key}`]}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Drawing Ref */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Drawing Ref</label>
              <input
                className="w-full border rounded-md focus:outline-none"
                style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: '#E0E0E0' }}
                value={form.drawing_ref}
                onChange={e => setField('drawing_ref', e.target.value)}
                placeholder="DWG-HS-300"
              />
            </div>

            {/* Criticality (conditional) */}
            {needsCriticality && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Criticality *</label>
                <select
                  className="w-full border rounded-md focus:outline-none"
                  style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: errors.criticality ? '#C8202A' : '#E0E0E0' }}
                  value={form.criticality}
                  onChange={e => setField('criticality', e.target.value)}
                >
                  <option value="">— Select —</option>
                  <option value="A">A — Critical</option>
                  <option value="B">B — Major</option>
                  <option value="C">C — Minor</option>
                </select>
                {errors.criticality && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.criticality}</div>}
              </div>
            )}

            {/* Prefix preview */}
            {selectedCat?.prefix_5 && (
              <div className="rounded-lg" style={{ padding: 10, background: '#E6F1FB', fontSize: 12, color: '#185FA5' }}>
                Code to be assigned: <span className="font-mono font-bold">{selectedCat.prefix_5}-PEND</span>
                <span style={{ marginLeft: 8, color: '#555' }}>(Warehouse will assign a 5-digit suffix later)</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6" style={{ height: 60, borderTop: '1px solid #E0E0E0', flexShrink: 0 }}>
            <button type="button" onClick={onClose} className="rounded-md border" style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, borderColor: '#E0E0E0' }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 rounded-md text-white disabled:opacity-60"
              style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}
            >
              {isPending && <Loader2 size={14} className="animate-spin" />}
              Save (Draft)
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
