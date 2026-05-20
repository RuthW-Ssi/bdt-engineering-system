import { useState, useMemo, useEffect } from 'react'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import { useCategories, useMaterialsByPrefix } from '../../hooks/useMasters'
import { useProjects } from '../../hooks/useProjects'
import { useProjectZones } from '../../hooks/useProjectZones'
import { useCreateProduct, useProducts } from '../../hooks/useProducts'
import { MarkPrefixDropdown } from './MarkPrefixDropdown'
import { productsApi } from '../../api/products'
import type { CreateCustomProductPayload, PaintSpecPreset, WeldingSpecPreset } from '../../api/types'

const ALLOWED_CATEGORIES: Record<'part' | 'assembly', string[]> = {
  part:     ['PL000', 'HR000', 'CF000', 'PT000', 'BN000', 'AC000'],
  assembly: ['MS000'],
}

const STEEL_GRADES = ['SS400', 'HY370', 'SM520B', 'S275', 'HSS500', 'S355', 'A36']
const SHAPES = ['PL', 'H', 'L', 'PIPE', 'RB', 'ACCESSORY'] as const
type Shape = typeof SHAPES[number]

const ASSEMBLY_TYPES = [
  { key: 'column',     label: 'Column',     prefixes: ['HR000', 'PL000', 'BN000'] },
  { key: 'beam',       label: 'Beam',       prefixes: ['HR000', 'PL000', 'BN000'] },
  { key: 'bracing',    label: 'Bracing',    prefixes: ['CF000', 'BN000'] },
  { key: 'flybracing', label: 'Flybracing', prefixes: ['CF000', 'BN000'] },
  { key: 'rod',        label: 'Rod',        prefixes: ['PT000', 'AC000'] },
  { key: 'pipestud',   label: 'Pipestud',   prefixes: ['PT000', 'AC000'] },
  { key: 'base_plate', label: 'Base Plate', prefixes: ['PL000', 'BN000'] },
] as const
type AssemblyTypeKey = typeof ASSEMBLY_TYPES[number]['key']

const SHAPE_SPEC: Record<string, { paint: '2layer' | '3layer'; fillet: number; sides: 1 | 2; wire: string }> = {
  PL:        { paint: '2layer', fillet: 6, sides: 2, wire: 'WIRE70S612' },
  H:         { paint: '3layer', fillet: 8, sides: 2, wire: 'WIRE70S612' },
  L:         { paint: '2layer', fillet: 5, sides: 2, wire: 'WIRE70S612' },
  PIPE:      { paint: '2layer', fillet: 5, sides: 1, wire: 'WIRE70S612' },
  RB:        { paint: '2layer', fillet: 4, sides: 2, wire: 'WIRE70S610' },
  ACCESSORY: { paint: '2layer', fillet: 6, sides: 2, wire: 'WIRE70S612' },
}
const ASSEMBLY_SPEC: Record<string, { paint: '2layer' | '3layer'; fillet: number; sides: 1 | 2; wire: string }> = {
  column:     { paint: '3layer', fillet: 8, sides: 2, wire: 'WIRE70S612' },
  beam:       { paint: '3layer', fillet: 8, sides: 2, wire: 'WIRE70S612' },
  bracing:    { paint: '2layer', fillet: 5, sides: 2, wire: 'WIRE70S612' },
  flybracing: { paint: '2layer', fillet: 5, sides: 2, wire: 'WIRE70S612' },
  rod:        { paint: '2layer', fillet: 4, sides: 2, wire: 'WIRE70S610' },
  pipestud:   { paint: '2layer', fillet: 5, sides: 1, wire: 'WIRE70S612' },
  base_plate: { paint: '2layer', fillet: 6, sides: 2, wire: 'WIRE70S612' },
}

interface SpecState {
  paintSystem: '2layer' | '3layer'
  primer_code: string; primer_microns: string
  intermediate_code: string; intermediate_microns: string
  topcoat_code: string; topcoat_microns: string
  welding_wire: string; fillet_mm: string; sides: '1' | '2'; weld_layers: string
}
const DEFAULT_SPEC: SpecState = {
  paintSystem: '2layer',
  primer_code: '', primer_microns: '',
  intermediate_code: '', intermediate_microns: '',
  topcoat_code: '', topcoat_microns: '',
  welding_wire: '', fillet_mm: '6', sides: '2', weld_layers: '1',
}

const EMPTY_FORM = {
  product_kind: 'assembly' as 'part' | 'assembly',
  assembly_type: '' as '' | AssemblyTypeKey,
  shape: '' as '' | Shape,
  grade: '',
  name: '', categ_id: '', project_id: '', erection_zone_id: '',
  mark_prefix: '', mark_number: '',
  thickness_mm: '', width_mm: '', height_mm: '',
  web_thickness_mm: '', flange_thickness_mm: '',
  diameter_mm: '', outer_diameter_mm: '',
  leg_a_mm: '', leg_b_mm: '', length_mm: '',
}

interface Props { onClose: () => void }

export function NewCustomProductModal({ onClose }: Props) {
  const { data: categories = [], isLoading: loadingCats } = useCategories()
  const { data: paintMaterials = [] } = useMaterialsByPrefix('PAINT')
  const { data: weldingMaterials = [] } = useMaterialsByPrefix('WC000')
  const { data: projectsData } = useProjects({ limit: 100 })
  const projects = projectsData?.items ?? []
  const { mutateAsync: create, isPending } = useCreateProduct()
  const { data: stdPartsData } = useProducts({ product_type: 'standard', limit: 100 })

  const [form, setForm] = useState(EMPTY_FORM)
  const [spec, setSpec] = useState<SpecState>(DEFAULT_SPEC)
  const [nameEdited, setNameEdited] = useState(false)
  const [assemblyParts, setAssemblyParts] = useState<Array<{ product_code: string; name: string; profile?: string; grade?: string; qty: number }>>([])
  const [partSearch, setPartSearch] = useState('')
  const [showPartDropdown, setShowPartDropdown] = useState(false)
  const [selectedPartCategIds, setSelectedPartCategIds] = useState<number[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState('')
  const [dupWarning, setDupWarning] = useState('')

  const selectedProjectId = form.project_id ? parseInt(form.project_id) : undefined
  const { data: zones = [] } = useProjectZones(selectedProjectId)
  const selectedZone = zones.find(z => z.id === parseInt(form.erection_zone_id || '0'))
  const markPreview = [selectedZone?.code, form.mark_prefix, form.mark_number].filter(Boolean).join('-')
  const filteredCategories = categories.filter(c => c.prefix_5 && ALLOWED_CATEGORIES[form.product_kind].includes(c.prefix_5))

  // ── computed profile & surface area ──────────────────────────────────────
  const computedProfile = useMemo((): string | null => {
    const f = form
    switch (f.shape) {
      case 'PL': { const t = parseFloat(f.thickness_mm), w = parseFloat(f.width_mm); return t > 0 && w > 0 ? `PL${t}x${w}` : null }
      case 'H':  { const h = parseFloat(f.height_mm), w = parseFloat(f.width_mm), tw = parseFloat(f.web_thickness_mm), tf = parseFloat(f.flange_thickness_mm); return h > 0 && w > 0 && tw > 0 && tf > 0 ? `H${h}x${w}x${tw}x${tf}` : null }
      case 'L':  { const a = parseFloat(f.leg_a_mm), b = parseFloat(f.leg_b_mm), t = parseFloat(f.thickness_mm); return a > 0 && b > 0 && t > 0 ? `L${a}x${b}x${t}` : null }
      case 'PIPE': { const od = parseFloat(f.outer_diameter_mm), t = parseFloat(f.thickness_mm); return od > 0 && t > 0 ? `PIPE${od}x${t}` : null }
      case 'RB':   { const d = parseFloat(f.diameter_mm); return d > 0 ? `RB${d}` : null }
      case 'ACCESSORY': return 'ACCESSORY'
      default: return null
    }
  }, [form])

  const computedSurfaceArea = useMemo((): number | null => {
    const l = parseFloat(form.length_mm)
    if (!l || l <= 0) return null
    let p: number | null = null
    switch (form.shape) {
      case 'PL':   { const t = parseFloat(form.thickness_mm), w = parseFloat(form.width_mm); if (t > 0 && w > 0) p = 2 * (t + w); break }
      case 'H':    { const h = parseFloat(form.height_mm), w = parseFloat(form.width_mm); if (h > 0 && w > 0) p = 2 * (h + w); break }
      case 'L':    { const a = parseFloat(form.leg_a_mm), b = parseFloat(form.leg_b_mm); if (a > 0 && b > 0) p = 2 * (a + b); break }
      case 'PIPE': { const od = parseFloat(form.outer_diameter_mm); if (od > 0) p = Math.PI * od; break }
      case 'RB':   { const d = parseFloat(form.diameter_mm); if (d > 0) p = Math.PI * d; break }
    }
    return p ? (p * l) / 1_000_000 : null
  }, [form])

  const autoName = useMemo(() => (computedProfile && form.grade ? `${computedProfile} ${form.grade}` : ''), [computedProfile, form.grade])

  // ── auto-fill effects ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!nameEdited && autoName) setForm(f => ({ ...f, name: autoName }))
  }, [autoName, nameEdited])

  useEffect(() => {
    const d = form.shape ? SHAPE_SPEC[form.shape] : form.assembly_type ? ASSEMBLY_SPEC[form.assembly_type] : null
    if (d) setSpec(s => ({ ...s, paintSystem: d.paint, fillet_mm: String(d.fillet), sides: String(d.sides) as '1' | '2', welding_wire: d.wire }))
  }, [form.shape, form.assembly_type])

  // ── assembly parts helpers ────────────────────────────────────────────────
  const stdParts = useMemo(() => (stdPartsData?.items ?? []).filter(p => (p as any).product_kind === 'part'), [stdPartsData])
  const partCategories = useMemo(() => categories.filter(c => c.prefix_5 && ALLOWED_CATEGORIES.part.includes(c.prefix_5)), [categories])
  const partDropdownItems = useMemo(() => {
    const q = partSearch.trim().toLowerCase()
    const available = stdParts
      .filter(p => ['approved', 'released'].includes(p.state))
      .filter(p => !assemblyParts.find(a => a.product_code === p.product_code))
      .filter(p => !selectedPartCategIds.length || selectedPartCategIds.includes(p.categ_id))
    if (!q) return available.slice(0, 12)
    return available.filter(p => p.name.toLowerCase().includes(q) || p.product_code.toLowerCase().includes(q)).slice(0, 10)
  }, [stdParts, assemblyParts, partSearch, selectedPartCategIds])

  // ── handlers ──────────────────────────────────────────────────────────────
  const setField = (k: string, v: string) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })) }

  const resetAll = (kind: 'part' | 'assembly') => {
    setForm({ ...EMPTY_FORM, product_kind: kind })
    setSpec(DEFAULT_SPEC)
    setNameEdited(false)
    setAssemblyParts([])
    setSelectedPartCategIds([])
    setErrors({})
    setDupWarning('')
  }

  const checkDuplicate = async () => {
    if (!form.project_id || !form.mark_prefix || !form.mark_number) return
    try {
      const result = await productsApi.list({ product_type: 'custom', project_id: parseInt(form.project_id), q: form.mark_number, limit: 5 })
      const dup = result.items.find(p =>
        p.mark_prefix === form.mark_prefix && p.mark_number === form.mark_number
        && (form.erection_zone_id ? p.erection_zone_id === parseInt(form.erection_zone_id) : !p.erection_zone_id)
      )
      setDupWarning(dup ? `Duplicate mark — conflicts with ${dup.product_code} (${dup.name})` : '')
    } catch { /* ignore */ }
  }

  function buildSpecPayload(): { paint: PaintSpecPreset | undefined; welding: WeldingSpecPreset | undefined } {
    const hasPaint = spec.primer_code || spec.topcoat_code
    const layers: PaintSpecPreset['layers'] = hasPaint ? [
      ...(spec.primer_code ? [{ paint_type: 'primer' as const, layers: 1, material_code: spec.primer_code, microns: Number(spec.primer_microns) || undefined }] : []),
      ...(spec.paintSystem === '3layer' && spec.intermediate_code ? [{ paint_type: 'intermediate' as const, layers: 1, material_code: spec.intermediate_code, microns: Number(spec.intermediate_microns) || undefined }] : []),
      ...(spec.topcoat_code ? [{ paint_type: 'topcoat' as const, layers: 1, material_code: spec.topcoat_code, microns: Number(spec.topcoat_microns) || undefined }] : []),
    ] : []
    return {
      paint: layers.length > 0 ? { layers } : undefined,
      welding: spec.welding_wire ? { material_code: spec.welding_wire, fillet_mm: Number(spec.fillet_mm) || 6, sides: Number(spec.sides) as 1 | 2, weld_layers: Number(spec.weld_layers) || 1 } : undefined,
    }
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.categ_id) errs.categ_id = 'Please select a category'
    if (!form.name.trim()) errs.name = 'Please enter a name'
    if (!form.project_id) errs.project_id = 'Please select a Project'
    if (!form.mark_prefix) errs.mark_prefix = 'Please select a Mark Prefix'
    if (!form.mark_number.trim()) errs.mark_number = 'Please enter a Mark Number'
    if (form.product_kind === 'part') {
      if (!form.shape) errs.shape = 'Please select a shape'
      if (form.shape && form.shape !== 'ACCESSORY' && !computedProfile) errs.shape = 'Please fill in all dimensions'
      if (!form.grade) errs.grade = 'Please select a Grade'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    const { paint, welding } = buildSpecPayload()
    const attrs: Record<string, unknown> = {}
    if (form.product_kind === 'part' && form.shape) {
      if (computedProfile) attrs.profile = computedProfile
      attrs.shape = form.shape
      attrs.grade = form.grade
      switch (form.shape) {
        case 'PL':   attrs.method = 'PL';  attrs.thickness_mm = parseFloat(form.thickness_mm); attrs.width_mm = parseFloat(form.width_mm); break
        case 'H':    attrs.method = 'HR';  attrs.height_mm = parseFloat(form.height_mm); attrs.width_mm = parseFloat(form.width_mm); attrs.web_thickness_mm = parseFloat(form.web_thickness_mm); attrs.flange_thickness_mm = parseFloat(form.flange_thickness_mm); break
        case 'L':    attrs.method = 'ANG'; attrs.leg_a_mm = parseFloat(form.leg_a_mm); attrs.leg_b_mm = parseFloat(form.leg_b_mm); attrs.thickness_mm = parseFloat(form.thickness_mm); break
        case 'PIPE': attrs.method = 'PIPE'; attrs.outer_diameter_mm = parseFloat(form.outer_diameter_mm); attrs.thickness_mm = parseFloat(form.thickness_mm); break
        case 'RB':   attrs.method = 'BAR'; attrs.diameter_mm = parseFloat(form.diameter_mm); break
        case 'ACCESSORY': attrs.method = 'ACCESSORY'; break
      }
      if (form.length_mm) attrs.length_mm = parseFloat(form.length_mm)
    }
    if (form.product_kind === 'assembly') {
      if (form.assembly_type) attrs.assembly_type = form.assembly_type
      if (assemblyParts.length) attrs.typical_parts = assemblyParts
    }
    const payload: CreateCustomProductPayload = {
      product_type: 'custom',
      product_kind: form.product_kind,
      name: form.name,
      categ_id: parseInt(form.categ_id),
      project_id: parseInt(form.project_id),
      erection_zone_id: form.erection_zone_id ? parseInt(form.erection_zone_id) : undefined,
      mark_prefix: form.mark_prefix,
      mark_number: form.mark_number,
      attributes: Object.keys(attrs).length ? attrs : undefined,
      default_paint_spec: paint,
      default_welding_spec: welding,
    }
    try {
      const result = await create(payload)
      setSuccess(`Created successfully: ${result.product_code}`)
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'An error occurred'
      setErrors(prev => ({ ...prev, _form: typeof msg === 'string' ? msg : JSON.stringify(msg) }))
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
      <div className="bg-white rounded-xl shadow-xl flex flex-col" style={{ width: 640, maxHeight: '90vh', overflow: 'hidden' }}>

        <div className="flex items-center justify-between px-6" style={{ height: 56, borderBottom: '1px solid #E0E0E0', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Add Custom Product</span>
          <button onClick={onClose} className="rounded hover:bg-gray-50" style={{ padding: 4 }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col" style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {errors._form && (
              <div className="rounded-lg" style={{ padding: 12, background: '#FCEBEB', color: '#5C0D15', fontSize: 13 }}>{errors._form}</div>
            )}

            {/* Product Kind */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Type *</label>
              <div className="flex gap-3">
                {(['part', 'assembly'] as const).map(k => (
                  <button key={k} type="button" onClick={() => resetAll(k)}
                    style={{
                      height: 34, padding: '0 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                      border: `1.5px solid ${form.product_kind === k ? '#0C447C' : '#E0E0E0'}`,
                      background: form.product_kind === k ? '#E6F1FB' : '#fff',
                      color: form.product_kind === k ? '#0C447C' : '#555',
                    }}>
                    {k === 'part' ? 'Part (Material)' : 'Assembly (Component)'}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Part: Material Data ──────────────────────────────────────── */}
            {form.product_kind === 'part' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, background: '#F8F9FA', borderRadius: 8, border: `1px solid ${errors.shape ? '#C8202A' : '#E0E0E0'}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>Material Data</div>

                {/* Shape */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Shape *</label>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {SHAPES.map(s => (
                      <button key={s} type="button"
                        onClick={() => { setNameEdited(false); setForm(f => ({ ...f, shape: s, thickness_mm: '', width_mm: '', height_mm: '', web_thickness_mm: '', flange_thickness_mm: '', diameter_mm: '', outer_diameter_mm: '', leg_a_mm: '', leg_b_mm: '' })); setErrors(e => ({ ...e, shape: '' })) }}
                        style={{
                          height: 30, padding: '0 12px', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          border: `1.5px solid ${form.shape === s ? '#0C447C' : '#E0E0E0'}`,
                          background: form.shape === s ? '#E6F1FB' : '#fff',
                          color: form.shape === s ? '#0C447C' : '#555',
                          fontFamily: 'monospace',
                        }}>
                        {s}
                      </button>
                    ))}
                  </div>
                  {errors.shape && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.shape}</div>}
                </div>

                {/* Dimension inputs */}
                {form.shape && form.shape !== 'ACCESSORY' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    {form.shape === 'PL'   && <><DimInput label="t (mm)" value={form.thickness_mm} onChange={v => setField('thickness_mm', v)} /><Sep /><DimInput label="w (mm)" value={form.width_mm} onChange={v => setField('width_mm', v)} /></>}
                    {form.shape === 'H'    && <><DimInput label="h (mm)" value={form.height_mm} onChange={v => setField('height_mm', v)} /><Sep /><DimInput label="w (mm)" value={form.width_mm} onChange={v => setField('width_mm', v)} /><Sep /><DimInput label="tw (mm)" value={form.web_thickness_mm} onChange={v => setField('web_thickness_mm', v)} /><Sep /><DimInput label="tf (mm)" value={form.flange_thickness_mm} onChange={v => setField('flange_thickness_mm', v)} /></>}
                    {form.shape === 'L'    && <><DimInput label="A (mm)" value={form.leg_a_mm} onChange={v => setField('leg_a_mm', v)} /><Sep /><DimInput label="B (mm)" value={form.leg_b_mm} onChange={v => setField('leg_b_mm', v)} /><Sep /><DimInput label="t (mm)" value={form.thickness_mm} onChange={v => setField('thickness_mm', v)} /></>}
                    {form.shape === 'PIPE' && <><DimInput label="OD (mm)" value={form.outer_diameter_mm} onChange={v => setField('outer_diameter_mm', v)} step="0.1" /><Sep /><DimInput label="t (mm)" value={form.thickness_mm} onChange={v => setField('thickness_mm', v)} step="0.1" /></>}
                    {form.shape === 'RB'   && <DimInput label="ø (mm)" value={form.diameter_mm} onChange={v => setField('diameter_mm', v)} />}
                  </div>
                )}

                {/* Profile preview */}
                {computedProfile && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: '#888' }}>Profile:</span>
                    <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 4, background: '#E6F1FB', color: '#0C447C', fontWeight: 700, fontFamily: 'monospace' }}>{computedProfile}</span>
                    {form.grade && <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 4, background: '#EAF3DE', color: '#27500A', fontWeight: 600 }}>{form.grade}</span>}
                  </div>
                )}

                {/* Length + surface area */}
                {form.shape && form.shape !== 'ACCESSORY' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 3 }}>Length (mm)</label>
                      <input type="number" min="0" step="1" className="border rounded-md"
                        style={{ width: 110, height: 32, padding: '0 8px', fontSize: 12, borderColor: '#E0E0E0', background: '#fff' }}
                        value={form.length_mm} onChange={e => setField('length_mm', e.target.value)} placeholder="e.g. 6000" />
                    </div>
                    <div style={{ paddingTop: 16 }}>
                      {computedSurfaceArea !== null
                        ? <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 4, background: '#EAF3DE', color: '#27500A', fontWeight: 600 }}>Surface area {computedSurfaceArea.toFixed(3)} m²</span>
                        : <span style={{ fontSize: 11, color: '#BDBDBD' }}>Surface area — enter dimensions and length</span>
                      }
                    </div>
                  </div>
                )}

                {/* Grade */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 3 }}>Grade *</label>
                  <select className="w-full border rounded-md"
                    style={{ height: 34, padding: '0 8px', fontSize: 12, borderColor: errors.grade ? '#C8202A' : '#E0E0E0', background: '#fff' }}
                    value={form.grade} onChange={e => setField('grade', e.target.value)}>
                    <option value="">— Select —</option>
                    {STEEL_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  {errors.grade && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.grade}</div>}
                </div>
              </div>
            )}

            {/* ── Assembly: Components ─────────────────────────────────────── */}
            {form.product_kind === 'assembly' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, background: '#F8F9FA', borderRadius: 8, border: '1px solid #E0E0E0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>Components (Standard Parts)</div>
                  {assemblyParts.length > 0 && <span style={{ fontSize: 11, color: '#888' }}>{assemblyParts.length} items</span>}
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 5 }}>Assembly Type</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {ASSEMBLY_TYPES.map(t => (
                      <button key={t.key} type="button"
                        onClick={() => {
                          const ids = partCategories.filter(c => c.prefix_5 && (t.prefixes as readonly string[]).includes(c.prefix_5)).map(c => c.id)
                          setForm(f => ({ ...f, assembly_type: t.key }))
                          setSelectedPartCategIds(ids)
                          setAssemblyParts([])
                        }}
                        style={{
                          height: 30, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          border: `1.5px solid ${form.assembly_type === t.key ? '#0C447C' : '#E0E0E0'}`,
                          background: form.assembly_type === t.key ? '#E6F1FB' : '#fff',
                          color: form.assembly_type === t.key ? '#0C447C' : '#555',
                        }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {form.assembly_type && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Filter:</span>
                    {partCategories.map(c => {
                      const active = selectedPartCategIds.includes(c.id)
                      return (
                        <button key={c.id} type="button"
                          onClick={() => setSelectedPartCategIds(prev => active ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                          style={{ height: 22, padding: '0 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${active ? '#0C447C' : '#E0E0E0'}`, background: active ? '#E6F1FB' : '#fff', color: active ? '#0C447C' : '#888' }}>
                          {c.prefix_5}
                        </button>
                      )
                    })}
                    {selectedPartCategIds.length > 0 && (
                      <button type="button" onClick={() => setSelectedPartCategIds([])}
                        style={{ fontSize: 10, color: '#BDBDBD', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
                    )}
                  </div>
                )}

                <div style={{ position: 'relative' }}>
                  <input className="w-full border rounded-md"
                    style={{ height: 34, padding: '0 10px 0 32px', fontSize: 13, borderColor: showPartDropdown ? '#0C447C' : '#E0E0E0', background: '#fff', outline: 'none' }}
                    value={partSearch} onChange={e => setPartSearch(e.target.value)}
                    onFocus={() => setShowPartDropdown(true)}
                    onBlur={() => setTimeout(() => setShowPartDropdown(false), 150)}
                    placeholder="Select or type to search..." />
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#BDBDBD', pointerEvents: 'none', fontSize: 13 }}>⌕</span>
                  {showPartDropdown && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', marginTop: 2, maxHeight: 240, overflowY: 'auto' }}>
                      {partDropdownItems.length === 0
                        ? <div style={{ padding: 12, fontSize: 12, color: '#BDBDBD', textAlign: 'center' }}>No matching parts found</div>
                        : partDropdownItems.map(p => {
                            const va = p.variant_attributes as Record<string, unknown> | null
                            const stateColor = p.state === 'released' ? { bg: '#D1F2E0', text: '#065F46' } : { bg: '#EAF3DE', text: '#27500A' }
                            return (
                              <button key={p.product_code} type="button"
                                onMouseDown={() => { setAssemblyParts(prev => [...prev, { product_code: p.product_code, name: p.name, profile: va?.profile as string | undefined, grade: va?.grade as string | undefined, qty: 1 }]); setPartSearch(''); setShowPartDropdown(false) }}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#F5F8FF')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#0C447C', fontWeight: 700, minWidth: 88 }}>{p.product_code}</span>
                                <span style={{ fontSize: 12, color: '#333', flex: 1 }}>{p.name}</span>
                                {!!va?.profile && <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{String(va.profile)}</span>}
                                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: stateColor.bg, color: stateColor.text, fontWeight: 600 }}>{p.state}</span>
                              </button>
                            )
                          })
                      }
                    </div>
                  )}
                </div>

                {assemblyParts.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {assemblyParts.map((p, i) => (
                      <div key={p.product_code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6 }}>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#0C447C', fontWeight: 600, minWidth: 88 }}>{p.product_code}</span>
                        <span style={{ fontSize: 12, color: '#333', flex: 1 }}>{p.name}</span>
                        {p.profile && <span style={{ fontSize: 11, padding: '1px 6px', background: '#E6F1FB', color: '#0C447C', borderRadius: 3, fontFamily: 'monospace' }}>{p.profile}</span>}
                        {p.grade && <span style={{ fontSize: 11, padding: '1px 6px', background: '#EAF3DE', color: '#27500A', borderRadius: 3 }}>{p.grade}</span>}
                        <input type="number" min="1" required
                          style={{ width: 44, height: 26, padding: '0 6px', fontSize: 12, fontWeight: 600, textAlign: 'center', border: '1px solid #E0E0E0', borderRadius: 4, background: '#fff' }}
                          value={p.qty}
                          onChange={e => { const v = Math.max(1, parseInt(e.target.value) || 1); setAssemblyParts(prev => prev.map((x, idx) => idx === i ? { ...x, qty: v } : x)) }} />
                        <button type="button" onClick={() => setAssemblyParts(prev => prev.filter((_, idx) => idx !== i))}
                          style={{ padding: 2, background: 'none', border: 'none', cursor: 'pointer', color: '#BDBDBD' }}><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#BDBDBD', textAlign: 'center', padding: '8px 0' }}>No components yet — select a part from the dropdown</div>
                )}
              </div>
            )}

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
              <MarkPrefixDropdown value={form.mark_prefix} onChange={v => setField('mark_prefix', v)} error={errors.mark_prefix} />
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
              {markPreview && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#888' }}>Mark Preview:</span>
                  <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 4, background: '#E6F1FB', color: '#0C447C', fontWeight: 700, fontFamily: 'monospace' }}>{markPreview}</span>
                </div>
              )}
            </div>

            {/* Category */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Category *</label>
              <select className="w-full border rounded-md"
                style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: errors.categ_id ? '#C8202A' : '#E0E0E0' }}
                value={form.categ_id} onChange={e => setField('categ_id', e.target.value)} disabled={loadingCats}>
                <option value="">— Select category —</option>
                {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.complete_name ?? c.name}</option>)}
              </select>
              {errors.categ_id && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.categ_id}</div>}
            </div>

            {/* Product Name */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Product Name *</label>
                {nameEdited && autoName && (
                  <button type="button" onClick={() => { setNameEdited(false); setForm(f => ({ ...f, name: autoName })) }}
                    style={{ fontSize: 11, color: '#0C447C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↺ Reset to auto</button>
                )}
              </div>
              <input className="w-full border rounded-md"
                style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: errors.name ? '#C8202A' : '#E0E0E0' }}
                value={form.name} onChange={e => { setNameEdited(true); setField('name', e.target.value) }} placeholder="Column C-1 Warehouse" />
              {errors.name && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.name}</div>}
            </div>

            {/* Spec Presets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, background: '#F8F9FA', borderRadius: 8, border: '1px solid #E0E0E0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>Spec Presets</div>
                {(form.shape || form.assembly_type) && (
                  <div style={{ fontSize: 11, color: '#639922', background: '#EAF3DE', borderRadius: 4, padding: '3px 8px' }}>
                    Auto-filled from {form.shape || form.assembly_type} — adjust if needed
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 6 }}>Paint System</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {([{ key: '2layer', label: 'Standard (Primer + Topcoat)' }, { key: '3layer', label: 'With Intermediate (3 layers)' }] as const).map(opt => (
                    <button key={opt.key} type="button" onClick={() => setSpec(s => ({ ...s, paintSystem: opt.key }))}
                      style={{ height: 30, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: `1.5px solid ${spec.paintSystem === opt.key ? '#0C447C' : '#E0E0E0'}`, background: spec.paintSystem === opt.key ? '#E6F1FB' : '#fff', color: spec.paintSystem === opt.key ? '#0C447C' : '#555' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {([
                    { label: 'Primer',       paintType: 'primer',       codeKey: 'primer_code'       as const, micronKey: 'primer_microns'       as const, color: '#E6F1FB', text: '#0C447C' },
                    ...(spec.paintSystem === '3layer' ? [{ label: 'Intermediate', paintType: 'intermediate', codeKey: 'intermediate_code' as const, micronKey: 'intermediate_microns' as const, color: '#F3E8FF', text: '#6D28D9' }] : []),
                    { label: 'Topcoat',      paintType: 'topcoat',      codeKey: 'topcoat_code'      as const, micronKey: 'topcoat_microns'      as const, color: '#EAF3DE', text: '#27500A' },
                  ] as Array<{ label: string; paintType: string; codeKey: keyof SpecState; micronKey: keyof SpecState; color: string; text: string }>).map(row => {
                    const options = paintMaterials.filter(m => (m.attributes as any)?.paint_type === row.paintType)
                    return (
                      <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8, background: row.color, borderRadius: 6, padding: '8px 10px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: row.text, minWidth: 88, textTransform: 'uppercase' }}>{row.label}</span>
                        <select className="border rounded" style={{ flex: 1, height: 28, padding: '0 6px', fontSize: 12, borderColor: '#C2C2C2', background: '#fff' }}
                          value={spec[row.codeKey] as string}
                          onChange={e => { const mat = options.find(m => m.default_code === e.target.value); setSpec(s => ({ ...s, [row.codeKey]: e.target.value, ...(mat?.attributes?.paint_micron ? { [row.micronKey]: String(mat.attributes.paint_micron) } : {}) })) }}>
                          <option value="">— Select —</option>
                          {options.map(m => <option key={m.default_code} value={m.default_code}>{m.name}</option>)}
                        </select>
                        <input type="number" min="0" className="border rounded font-mono"
                          style={{ width: 64, height: 28, padding: '0 6px', fontSize: 12, borderColor: '#C2C2C2', background: '#fff', textAlign: 'center' }}
                          value={spec[row.micronKey] as string} onChange={e => setSpec(s => ({ ...s, [row.micronKey]: e.target.value }))} />
                        <span style={{ fontSize: 11, color: row.text }}>μm</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 6 }}>Welding Spec</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#888', marginBottom: 3 }}>Welding Wire</div>
                    <select className="border rounded-md" style={{ width: '100%', height: 32, padding: '0 8px', fontSize: 12, borderColor: '#E0E0E0', background: '#fff' }}
                      value={spec.welding_wire} onChange={e => setSpec(s => ({ ...s, welding_wire: e.target.value }))}>
                      <option value="">— Select —</option>
                      {weldingMaterials.map(m => <option key={m.default_code} value={m.default_code}>{m.name}</option>)}
                    </select>
                  </div>
                  <DimInput label="Fillet (mm)" value={spec.fillet_mm} step="1" onChange={v => setSpec(s => ({ ...s, fillet_mm: v }))} />
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#888', marginBottom: 3 }}>Sides</div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {(['1', '2'] as const).map(s => (
                        <button key={s} type="button" onClick={() => setSpec(sp => ({ ...sp, sides: s }))}
                          style={{ height: 32, padding: '0 12px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${spec.sides === s ? '#0C447C' : '#E0E0E0'}`, background: spec.sides === s ? '#E6F1FB' : '#fff', color: spec.sides === s ? '#0C447C' : '#555' }}>{s}</button>
                      ))}
                    </div>
                  </div>
                  <DimInput label="Weld Layers" value={spec.weld_layers} step="1" onChange={v => setSpec(s => ({ ...s, weld_layers: v }))} />
                </div>
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

function DimInput({ label, value, onChange, step = '1' }: { label: string; value: string; onChange: (v: string) => void; step?: string }) {
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 600, color: '#888', display: 'block', marginBottom: 2 }}>{label}</label>
      <input type="number" min="0" step={step} className="border rounded-md"
        style={{ width: 72, height: 32, padding: '0 8px', fontSize: 12, borderColor: '#E0E0E0', background: '#fff', textAlign: 'center' }}
        value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function Sep() {
  return <span style={{ fontSize: 16, color: '#BDBDBD', paddingBottom: 6 }}>×</span>
}
