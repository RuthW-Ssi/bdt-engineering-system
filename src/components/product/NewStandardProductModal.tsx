import { useState, useMemo, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useCategories, useMaterialsByPrefix } from '../../hooks/useMasters'
import { useCreateProduct, useProducts } from '../../hooks/useProducts'
import { parseProfile } from '../../libs/parseProfile'
import type { CreateStandardProductPayload } from '../../api/types'

const STEEL_GRADES = ['SS400', 'HY370', 'SM520B', 'S275', 'HSS500', 'S355', 'A36']

const SHAPES = ['PL', 'H', 'L', 'PIPE', 'RB', 'ACCESSORY'] as const
type Shape = typeof SHAPES[number]

const ALLOWED_CATEGORIES: Record<'part' | 'assembly', string[]> = {
  part:     ['PL000', 'HR000', 'CF000', 'PT000', 'BN000', 'AC000'],
  assembly: ['MS000'],
}

const VOL_SOLIDS = { primer: 0.65, intermediate: 0.70, fireproof: 0.60, topcoat: 0.55 }

const ASSEMBLY_TYPES = [
  { key: 'column',     label: 'Column',     labelTh: '',           prefixes: ['HR000', 'PL000', 'BN000'] },
  { key: 'beam',       label: 'Beam',       labelTh: '',           prefixes: ['HR000', 'PL000', 'BN000'] },
  { key: 'bracing',    label: 'Bracing',    labelTh: '',           prefixes: ['CF000', 'BN000'] },
  { key: 'flybracing', label: 'Flybracing', labelTh: '',           prefixes: ['CF000', 'BN000'] },
  { key: 'rod',        label: 'Rod',        labelTh: '',           prefixes: ['PT000', 'AC000'] },
  { key: 'pipestud',   label: 'Pipestud',   labelTh: '',           prefixes: ['PT000', 'AC000'] },
  { key: 'base_plate', label: 'Base Plate', labelTh: '',           prefixes: ['PL000', 'BN000'] },
] as const
type AssemblyTypeKey = typeof ASSEMBLY_TYPES[number]['key']

interface Props { onClose: () => void }

export function NewStandardProductModal({ onClose }: Props) {
  const { data: categories = [], isLoading: loadingCats } = useCategories()
  const { data: paintMaterials = [] } = useMaterialsByPrefix('PAINT')
  const { data: weldingMaterials = [] } = useMaterialsByPrefix('WC000')
  const { mutateAsync: create, isPending } = useCreateProduct()

  const [form, setForm] = useState({
    product_kind: 'part' as 'part' | 'assembly',
    name: '',
    categ_id: '',
    engineering_code: '',
    grade: '',
    assembly_type: '' as '' | AssemblyTypeKey,
    shape: '' as '' | Shape,
    // Dimensions — each field used depending on shape
    thickness_mm:       '',
    width_mm:           '',
    height_mm:          '',
    web_thickness_mm:   '',
    flange_thickness_mm:'',
    diameter_mm:        '',
    outer_diameter_mm:  '',
    leg_a_mm:           '',
    leg_b_mm:           '',
    length_mm:          '',
  })

  const [production, setProduction] = useState({
    surface_area_m2: '',  // assembly only — part uses computedSurfaceArea
    primer: '',        primer_dft: '',
    intermediate: '',  intermediate_dft: '',
    fireproof: '',     fireproof_dft: '',
    topcoat: '',       topcoat_dft: '',
    welding_wire: '',
    weld_type: '2' as '1' | '2',
    welding_fillet_mm: '6',
    part_thickness_mm: '',
    welding_layer: '1',
    welding_path_m: '',
  })

  const [assemblyParts, setAssemblyParts] = useState<Array<{ product_code: string; name: string; profile?: string; grade?: string; qty: number; length_mm: string }>>([])
  const [partSearch, setPartSearch] = useState('')
  const [showPartDropdown, setShowPartDropdown] = useState(false)
  const [selectedPartCategIds, setSelectedPartCategIds] = useState<number[]>([])
  const [nameEdited, setNameEdited] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState('')

  // ── computed ──────────────────────────────────────────────────────────────

  const computedProfile = useMemo((): string | null => {
    const f = form
    switch (f.shape) {
      case 'PL': {
        const t = parseFloat(f.thickness_mm), w = parseFloat(f.width_mm)
        return t > 0 && w > 0 ? `PL${t}x${w}` : null
      }
      case 'H': {
        const h = parseFloat(f.height_mm), w = parseFloat(f.width_mm)
        const tw = parseFloat(f.web_thickness_mm), tf = parseFloat(f.flange_thickness_mm)
        return h > 0 && w > 0 && tw > 0 && tf > 0 ? `H${h}x${w}x${tw}x${tf}` : null
      }
      case 'L': {
        const a = parseFloat(f.leg_a_mm), b = parseFloat(f.leg_b_mm), t = parseFloat(f.thickness_mm)
        return a > 0 && b > 0 && t > 0 ? `L${a}x${b}x${t}` : null
      }
      case 'PIPE': {
        const od = parseFloat(f.outer_diameter_mm), t = parseFloat(f.thickness_mm)
        return od > 0 && t > 0 ? `PIPE${od}x${t}` : null
      }
      case 'RB': {
        const d = parseFloat(f.diameter_mm)
        return d > 0 ? `RB${d}` : null
      }
      case 'ACCESSORY': return 'ACCESSORY'
      default: return null
    }
  }, [form])

  // Surface area m² = perimeter_mm × length_mm / 1,000,000
  const computedSurfaceArea = useMemo((): number | null => {
    const l = parseFloat(form.length_mm)
    if (!l || l <= 0) return null
    let perimeter: number | null = null
    switch (form.shape) {
      case 'PL': {
        const t = parseFloat(form.thickness_mm), w = parseFloat(form.width_mm)
        if (t > 0 && w > 0) perimeter = 2 * (t + w)
        break
      }
      case 'H': {
        const h = parseFloat(form.height_mm), w = parseFloat(form.width_mm)
        if (h > 0 && w > 0) perimeter = 2 * (h + w)
        break
      }
      case 'L': {
        const a = parseFloat(form.leg_a_mm), b = parseFloat(form.leg_b_mm)
        if (a > 0 && b > 0) perimeter = 2 * (a + b)
        break
      }
      case 'PIPE': {
        const od = parseFloat(form.outer_diameter_mm)
        if (od > 0) perimeter = Math.PI * od
        break
      }
      case 'RB': {
        const d = parseFloat(form.diameter_mm)
        if (d > 0) perimeter = Math.PI * d
        break
      }
    }
    if (!perimeter) return null
    return (perimeter * l) / 1_000_000
  }, [form])

  const filteredCategories = useMemo(
    () => categories.filter(c => c.prefix_5 && ALLOWED_CATEGORIES[form.product_kind].includes(c.prefix_5)),
    [categories, form.product_kind],
  )

  const { data: stdPartsData } = useProducts(
    { product_type: 'standard', limit: 100 },
  )
  const stdParts = useMemo(
    () => (stdPartsData?.items ?? []).filter(p => (p as any).product_kind === 'part'),
    [stdPartsData],
  )
  const partCategories = useMemo(
    () => categories.filter(c => c.prefix_5 && ALLOWED_CATEGORIES.part.includes(c.prefix_5)),
    [categories],
  )

  const partDropdownItems = useMemo(() => {
    const q = partSearch.trim().toLowerCase()
    const available = stdParts
      .filter(p => ['approved', 'released'].includes(p.state))
      .filter(p => !assemblyParts.find(a => a.product_code === p.product_code))
      .filter(p => !selectedPartCategIds.length || selectedPartCategIds.includes(p.categ_id))
    if (!q) return available.slice(0, 12)
    return available
      .filter(p => p.name.toLowerCase().includes(q) || p.product_code.toLowerCase().includes(q))
      .slice(0, 10)
  }, [stdParts, assemblyParts, partSearch, selectedPartCategIds])

  const autoName = useMemo(() => {
    if (!computedProfile || !form.grade) return ''
    return `${computedProfile} ${form.grade}`
  }, [computedProfile, form.grade])

  useEffect(() => {
    if (!nameEdited && autoName) setForm(f => ({ ...f, name: autoName }))
  }, [autoName, nameEdited])

  // ── helpers ───────────────────────────────────────────────────────────────

  const setField = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
  }

  const totalAssemblySurfaceArea = useMemo(() => {
    if (form.product_kind !== 'assembly' || !assemblyParts.length) return null
    let total = 0
    for (const p of assemblyParts) {
      if (!p.profile || !p.length_mm) continue
      const parsed = parseProfile(p.profile)
      let perim: number | null = null
      switch (parsed.shape) {
        case 'PL':   perim = parsed.thickness_mm && parsed.width_mm ? 2 * (parsed.thickness_mm + parsed.width_mm) : null; break
        case 'H':    perim = parsed.height_mm && parsed.width_mm ? 2 * (parsed.height_mm + parsed.width_mm) : null; break
        case 'L':    perim = parsed.leg_a_mm && parsed.leg_b_mm ? 2 * (parsed.leg_a_mm + parsed.leg_b_mm) : null; break
        case 'PIPE': perim = parsed.outer_diameter_mm ? Math.PI * parsed.outer_diameter_mm : null; break
        case 'RB':   perim = parsed.diameter_mm ? Math.PI * parsed.diameter_mm : null; break
      }
      if (perim) total += (perim * parseFloat(p.length_mm) * p.qty) / 1_000_000
    }
    return total > 0 ? total : null
  }, [assemblyParts, form.product_kind])

  function effectiveArea(): number | null {
    if (form.product_kind === 'part') return computedSurfaceArea
    return totalAssemblySurfaceArea ?? (parseFloat(production.surface_area_m2) > 0 ? parseFloat(production.surface_area_m2) : null)
  }

  function calcPaintLiters(dft: string, vs: number): number | null {
    const area = effectiveArea()
    const dftVal = parseFloat(dft)
    if (!area || !dftVal || area <= 0 || dftVal <= 0) return null
    return (area * dftVal) / (vs * 1000)
  }

  function calcWeld(): { kg: number; tack: number; boxes: number | null } | null {
    const path = parseFloat(production.welding_path_m)
    if (!path || path <= 0) return null
    const sides = parseInt(production.weld_type)
    const layers = Math.max(1, parseInt(production.welding_layer) || 1)
    const tack = Math.ceil(path / 0.5) + 4
    const totalRunM = path * sides * layers
    const mat = weldingMaterials.find(m => m.default_code === production.welding_wire)
    const kgPerMeter = mat?.attributes?.kg_per_meter as number | undefined
    const pkgKg = mat?.attributes?.pkg_kg as number | undefined
    if (!kgPerMeter) return { kg: 0, tack, boxes: null }
    const kg = totalRunM * kgPerMeter
    const boxes = pkgKg ? Math.ceil(kg / pkgKg) : null
    return { kg, tack, boxes }
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.categ_id) errs.categ_id = 'Please select a category'
    if (!form.name.trim()) errs.name = 'Please enter a name'
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

    const variantAttrs: Record<string, unknown> = {}
    if (form.product_kind === 'part' && form.shape) {
      if (computedProfile) variantAttrs.profile = computedProfile
      variantAttrs.shape = form.shape
      variantAttrs.grade = form.grade
      switch (form.shape) {
        case 'PL':
          variantAttrs.method = 'PL'
          variantAttrs.thickness_mm = parseFloat(form.thickness_mm)
          variantAttrs.width_mm = parseFloat(form.width_mm)
          break
        case 'H':
          variantAttrs.method = 'HR'
          variantAttrs.height_mm = parseFloat(form.height_mm)
          variantAttrs.width_mm = parseFloat(form.width_mm)
          variantAttrs.web_thickness_mm = parseFloat(form.web_thickness_mm)
          variantAttrs.flange_thickness_mm = parseFloat(form.flange_thickness_mm)
          break
        case 'L':
          variantAttrs.method = 'ANG'
          variantAttrs.leg_a_mm = parseFloat(form.leg_a_mm)
          variantAttrs.leg_b_mm = parseFloat(form.leg_b_mm)
          variantAttrs.thickness_mm = parseFloat(form.thickness_mm)
          break
        case 'PIPE':
          variantAttrs.method = 'PIPE'
          variantAttrs.outer_diameter_mm = parseFloat(form.outer_diameter_mm)
          variantAttrs.thickness_mm = parseFloat(form.thickness_mm)
          break
        case 'RB':
          variantAttrs.method = 'BAR'
          variantAttrs.diameter_mm = parseFloat(form.diameter_mm)
          break
        case 'ACCESSORY':
          variantAttrs.method = 'ACCESSORY'
          break
      }
      if (form.length_mm) variantAttrs.length_mm = parseFloat(form.length_mm)
    }
    if (form.product_kind === 'assembly') {
      if (form.assembly_type) variantAttrs.assembly_type = form.assembly_type
      if (form.grade) variantAttrs.grade = form.grade
      if (assemblyParts.length) variantAttrs.typical_parts = assemblyParts
    }

    const payload: CreateStandardProductPayload = {
      product_type: 'standard',
      product_kind: form.product_kind,
      name: form.name,
      categ_id: parseInt(form.categ_id),
      sale_ok: false,
      purchase_ok: false,
      engineering_code: form.engineering_code || undefined,
      variant_attributes: Object.keys(variantAttrs).length ? variantAttrs : undefined,
      attributes: {
        ...(effectiveArea() ? { surface_area_m2: effectiveArea() } : {}),
        ...(production.primer ? {
          primer: production.primer,
          ...(production.primer_dft ? { primer_dft_um: parseFloat(production.primer_dft) } : {}),
          ...(calcPaintLiters(production.primer_dft, VOL_SOLIDS.primer) !== null
            ? { primer_liters: calcPaintLiters(production.primer_dft, VOL_SOLIDS.primer) } : {}),
        } : {}),
        ...(production.intermediate ? {
          intermediate: production.intermediate,
          ...(production.intermediate_dft ? { intermediate_dft_um: parseFloat(production.intermediate_dft) } : {}),
          ...(calcPaintLiters(production.intermediate_dft, VOL_SOLIDS.intermediate) !== null
            ? { intermediate_liters: calcPaintLiters(production.intermediate_dft, VOL_SOLIDS.intermediate) } : {}),
        } : {}),
        ...(production.fireproof ? {
          fireproof: production.fireproof,
          ...(production.fireproof_dft ? { fireproof_dft_um: parseFloat(production.fireproof_dft) } : {}),
          ...(calcPaintLiters(production.fireproof_dft, VOL_SOLIDS.fireproof) !== null
            ? { fireproof_liters: calcPaintLiters(production.fireproof_dft, VOL_SOLIDS.fireproof) } : {}),
        } : {}),
        ...(production.topcoat ? {
          topcoat: production.topcoat,
          ...(production.topcoat_dft ? { topcoat_dft_um: parseFloat(production.topcoat_dft) } : {}),
          ...(calcPaintLiters(production.topcoat_dft, VOL_SOLIDS.topcoat) !== null
            ? { topcoat_liters: calcPaintLiters(production.topcoat_dft, VOL_SOLIDS.topcoat) } : {}),
        } : {}),
        ...(production.welding_wire || production.welding_path_m ? (() => {
          const w = calcWeld()
          return {
            ...(production.welding_wire ? { welding_wire: production.welding_wire } : {}),
            weld_type: production.weld_type === '2' ? 'fillet_2side' : 'fillet_1side',
            welding_fillet_mm: parseFloat(production.welding_fillet_mm) || 6,
            ...(production.part_thickness_mm ? { part_thickness_mm: parseFloat(production.part_thickness_mm) } : {}),
            welding_layer: parseInt(production.welding_layer) || 1,
            ...(production.welding_path_m ? { welding_path_m: parseFloat(production.welding_path_m) } : {}),
            ...(w && w.tack ? { tak_point_ea: w.tack } : {}),
            ...(w && w.kg > 0 ? { weld_wire_kg: w.kg } : {}),
            ...(w && w.boxes !== null ? { weld_wire_boxes: w.boxes } : {}),
          }
        })() : {}),
      },
    }

    try {
      const result = await create(payload)
      setSuccess(`Created successfully: ${result.product_code}`)
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'An error occurred'
      setErrors(prev => ({ ...prev, _form: typeof msg === 'string' ? msg : JSON.stringify(msg) }))
    }
  }

  // ── success screen ────────────────────────────────────────────────────────

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

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-xl shadow-xl flex flex-col" style={{ width: 640, maxHeight: '90vh', overflow: 'hidden' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6" style={{ height: 56, borderBottom: '1px solid #E0E0E0', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Add Standard Product</span>
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
                  <button key={k} type="button"
                    onClick={() => {
                      setForm(f => ({ ...f, product_kind: k, categ_id: '', shape: '', assembly_type: '' }))
                      setAssemblyParts([])
                      setSelectedPartCategIds([])
                      setProduction({ surface_area_m2: '', primer: '', primer_dft: '', intermediate: '', intermediate_dft: '', fireproof: '', fireproof_dft: '', topcoat: '', topcoat_dft: '', welding_wire: '', weld_type: '2', welding_fillet_mm: '6', part_thickness_mm: '', welding_layer: '1', welding_path_m: '' })
                    }}
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

            {/* Material dimensions (part only) */}
            {form.product_kind === 'part' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, background: '#F8F9FA', borderRadius: 8, border: `1px solid ${errors.shape ? '#C8202A' : '#E0E0E0'}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>Material Data</div>

                {/* Shape picker */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Shape *</label>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {SHAPES.map(s => (
                      <button key={s} type="button"
                        onClick={() => { setNameEdited(false); setForm(f => ({ ...f, shape: s, thickness_mm: '', width_mm: '', height_mm: '', web_thickness_mm: '', flange_thickness_mm: '', diameter_mm: '', outer_diameter_mm: '', leg_a_mm: '', leg_b_mm: '' })) }}
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

                {/* Dimension inputs per shape */}
                {form.shape && form.shape !== 'ACCESSORY' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    {form.shape === 'PL' && <>
                      <DimInput label="t (mm)" value={form.thickness_mm}        onChange={v => setField('thickness_mm', v)} />
                      <Sep />
                      <DimInput label="w (mm)" value={form.width_mm}            onChange={v => setField('width_mm', v)} />
                    </>}
                    {form.shape === 'H' && <>
                      <DimInput label="h (mm)"  value={form.height_mm}           onChange={v => setField('height_mm', v)} />
                      <Sep />
                      <DimInput label="w (mm)"  value={form.width_mm}            onChange={v => setField('width_mm', v)} />
                      <Sep />
                      <DimInput label="tw (mm)" value={form.web_thickness_mm}    onChange={v => setField('web_thickness_mm', v)} />
                      <Sep />
                      <DimInput label="tf (mm)" value={form.flange_thickness_mm} onChange={v => setField('flange_thickness_mm', v)} />
                    </>}
                    {form.shape === 'L' && <>
                      <DimInput label="A (mm)" value={form.leg_a_mm}            onChange={v => setField('leg_a_mm', v)} />
                      <Sep />
                      <DimInput label="B (mm)" value={form.leg_b_mm}            onChange={v => setField('leg_b_mm', v)} />
                      <Sep />
                      <DimInput label="t (mm)" value={form.thickness_mm}        onChange={v => setField('thickness_mm', v)} />
                    </>}
                    {form.shape === 'PIPE' && <>
                      <DimInput label="OD (mm)" value={form.outer_diameter_mm}  onChange={v => setField('outer_diameter_mm', v)} step="0.1" />
                      <Sep />
                      <DimInput label="t (mm)"  value={form.thickness_mm}       onChange={v => setField('thickness_mm', v)} step="0.1" />
                    </>}
                    {form.shape === 'RB' && <>
                      <DimInput label="ø (mm)" value={form.diameter_mm}         onChange={v => setField('diameter_mm', v)} />
                    </>}
                  </div>
                )}

                {/* Profile preview chip */}
                {computedProfile && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: '#888' }}>Profile:</span>
                    <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 4, background: '#E6F1FB', color: '#0C447C', fontWeight: 700, fontFamily: 'monospace' }}>
                      {computedProfile}
                    </span>
                    {form.grade && (
                      <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 4, background: '#EAF3DE', color: '#27500A', fontWeight: 600 }}>
                        {form.grade}
                      </span>
                    )}
                  </div>
                )}

                {/* Length + surface area */}
                {form.shape && form.shape !== 'ACCESSORY' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 3 }}>Length (mm)</label>
                      <input type="number" min="0" step="1"
                        className="border rounded-md" style={{ width: 110, height: 32, padding: '0 8px', fontSize: 12, borderColor: '#E0E0E0', background: '#fff' }}
                        value={form.length_mm} onChange={e => setField('length_mm', e.target.value)}
                        placeholder="e.g. 6000" />
                    </div>
                    <div style={{ paddingTop: 16 }}>
                      {computedSurfaceArea !== null
                        ? <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 4, background: '#EAF3DE', color: '#27500A', fontWeight: 600 }}>
                            Surface area {computedSurfaceArea.toFixed(3)} m²
                          </span>
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

            {/* Assembly parts */}
            {form.product_kind === 'assembly' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, background: '#F8F9FA', borderRadius: 8, border: '1px solid #E0E0E0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>Components (Standard Parts)</div>
                  {assemblyParts.length > 0 && (
                    <span style={{ fontSize: 11, color: '#888' }}>{assemblyParts.length} items</span>
                  )}
                </div>

                {/* Assembly type picker */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 5 }}>Assembly Type *</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {ASSEMBLY_TYPES.map(t => (
                      <button key={t.key} type="button"
                        onClick={() => {
                          const prefixes = [...t.prefixes]
                          const ids = partCategories
                            .filter(c => c.prefix_5 && prefixes.includes(c.prefix_5))
                            .map(c => c.id)
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
                        {t.label}{t.labelTh ? ` (${t.labelTh})` : ''}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category filter chips — auto-set by assembly type, still toggleable */}
                {form.assembly_type && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>Filter:</span>
                    {partCategories.map(c => {
                      const active = selectedPartCategIds.includes(c.id)
                      return (
                        <button key={c.id} type="button"
                          onClick={() => setSelectedPartCategIds(prev =>
                            active ? prev.filter(id => id !== c.id) : [...prev, c.id]
                          )}
                          style={{ height: 22, padding: '0 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${active ? '#0C447C' : '#E0E0E0'}`, background: active ? '#E6F1FB' : '#fff', color: active ? '#0C447C' : '#888' }}>
                          {c.prefix_5}
                        </button>
                      )
                    })}
                    {selectedPartCategIds.length > 0 && (
                      <button type="button" onClick={() => setSelectedPartCategIds([])}
                        style={{ fontSize: 10, color: '#BDBDBD', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}>
                        Clear
                      </button>
                    )}
                  </div>
                )}

                {/* Search + dropdown */}
                <div style={{ position: 'relative' }}>
                  <input
                    className="w-full border rounded-md"
                    style={{ height: 34, padding: '0 10px 0 32px', fontSize: 13, borderColor: showPartDropdown ? '#0C447C' : '#E0E0E0', background: '#fff', outline: 'none' }}
                    value={partSearch}
                    onChange={e => setPartSearch(e.target.value)}
                    onFocus={() => setShowPartDropdown(true)}
                    onBlur={() => setTimeout(() => setShowPartDropdown(false), 150)}
                    placeholder="Select or type to search..." />
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#BDBDBD', pointerEvents: 'none', fontSize: 13 }}>⌕</span>

                  {showPartDropdown && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', marginTop: 2, maxHeight: 240, overflowY: 'auto' }}>
                      {partDropdownItems.length === 0 ? (
                        <div style={{ padding: '12px', fontSize: 12, color: '#BDBDBD', textAlign: 'center' }}>
                          {stdParts.filter(p => ['approved', 'released'].includes(p.state)).length === 0
                            ? 'No approved/released parts yet'
                            : 'No matching parts found'}
                        </div>
                      ) : (
                        <>
                          {!partSearch && <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 600, color: '#BDBDBD', letterSpacing: '0.05em' }}>STANDARD PARTS</div>}
                          {partDropdownItems.map(p => {
                            const va = p.variant_attributes as Record<string, unknown> | null
                            const stateColor = p.state === 'released' ? { bg: '#D1F2E0', text: '#065F46' } : { bg: '#EAF3DE', text: '#27500A' }
                            return (
                              <button key={p.product_code} type="button"
                                onMouseDown={() => {
                                  setAssemblyParts(prev => [...prev, {
                                    product_code: p.product_code,
                                    name: p.name,
                                    profile: va?.profile as string | undefined,
                                    grade: va?.grade as string | undefined,
                                    qty: 1,
                                    length_mm: va?.length_mm != null ? String(va.length_mm) : stockLengthMm(p.name),
                                  }])
                                  setPartSearch('')
                                  setShowPartDropdown(false)
                                }}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#F5F8FF')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#0C447C', fontWeight: 700, minWidth: 88 }}>{p.product_code}</span>
                                <span style={{ fontSize: 12, color: '#333', flex: 1 }}>{p.name}</span>
                                {va?.profile && <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{String(va.profile)}</span>}
                                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: stateColor.bg, color: stateColor.text, fontWeight: 600 }}>{p.state}</span>
                              </button>
                            )
                          })}
                          {!partSearch && stdParts.filter(p => ['approved', 'released'].includes(p.state) && !assemblyParts.find(a => a.product_code === p.product_code) && (!selectedPartCategIds.length || selectedPartCategIds.includes(p.categ_id))).length > 12 && (
                            <div style={{ padding: '6px 12px', fontSize: 11, color: '#BDBDBD', borderTop: '1px solid #F0F0F0' }}>
                              Type to search for more...
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Selected parts */}
                {assemblyParts.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {assemblyParts.map((p, i) => {
                      const parsed = p.profile ? parseProfile(p.profile) : null
                      let perim: number | null = null
                      if (parsed) {
                        switch (parsed.shape) {
                          case 'PL':   perim = parsed.thickness_mm && parsed.width_mm ? 2 * (parsed.thickness_mm + parsed.width_mm) : null; break
                          case 'H':    perim = parsed.height_mm && parsed.width_mm ? 2 * (parsed.height_mm + parsed.width_mm) : null; break
                          case 'L':    perim = parsed.leg_a_mm && parsed.leg_b_mm ? 2 * (parsed.leg_a_mm + parsed.leg_b_mm) : null; break
                          case 'PIPE': perim = parsed.outer_diameter_mm ? Math.PI * parsed.outer_diameter_mm : null; break
                          case 'RB':   perim = parsed.diameter_mm ? Math.PI * parsed.diameter_mm : null; break
                        }
                      }
                      const l = parseFloat(p.length_mm)
                      const areaEa = perim && l > 0 ? (perim * l) / 1_000_000 : null
                      const areaTotal = areaEa !== null ? areaEa * p.qty : null
                      return (
                        <div key={p.product_code} style={{ background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6, overflow: 'hidden' }}>
                          {/* Row 1: identity + qty + delete */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
                            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#0C447C', fontWeight: 600, minWidth: 88 }}>{p.product_code}</span>
                            <span style={{ fontSize: 12, color: '#333', flex: 1 }}>{p.name}</span>
                            {p.profile && <span style={{ fontSize: 11, padding: '1px 6px', background: '#E6F1FB', color: '#0C447C', borderRadius: 3, fontFamily: 'monospace' }}>{p.profile}</span>}
                            {p.grade && <span style={{ fontSize: 11, padding: '1px 6px', background: '#EAF3DE', color: '#27500A', borderRadius: 3 }}>{p.grade}</span>}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <button type="button" onClick={() => setAssemblyParts(prev => prev.map((x, idx) => idx === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x))}
                                style={{ width: 20, height: 20, borderRadius: 3, border: '1px solid #E0E0E0', background: '#F5F5F5', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                              <span style={{ fontSize: 12, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{p.qty}</span>
                              <button type="button" onClick={() => setAssemblyParts(prev => prev.map((x, idx) => idx === i ? { ...x, qty: x.qty + 1 } : x))}
                                style={{ width: 20, height: 20, borderRadius: 3, border: '1px solid #E0E0E0', background: '#F5F5F5', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                            </div>
                            <button type="button" onClick={() => setAssemblyParts(prev => prev.filter((_, idx) => idx !== i))}
                              style={{ padding: 2, background: 'none', border: 'none', cursor: 'pointer', color: '#BDBDBD' }}><X size={13} /></button>
                          </div>
                          {/* Row 2: length + computed area */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px 6px 10px', background: '#FAFAFA', borderTop: '1px solid #F0F0F0' }}>
                            <span style={{ fontSize: 11, color: '#888' }}>Length</span>
                            <input type="number" min="0" step="1"
                              className="border rounded-md"
                              style={{ width: 80, height: 26, padding: '0 6px', fontSize: 12, borderColor: '#E0E0E0', background: '#fff' }}
                              value={p.length_mm}
                              onChange={e => setAssemblyParts(prev => prev.map((x, idx) => idx === i ? { ...x, length_mm: e.target.value } : x))}
                              placeholder="mm" />
                            {areaEa !== null
                              ? <span style={{ fontSize: 11, color: '#555' }}>
                                  {areaEa.toFixed(3)} m²/ea
                                  {p.qty > 1 && <span style={{ color: '#0C447C', fontWeight: 600 }}> × {p.qty} = {areaTotal!.toFixed(3)} m²</span>}
                                </span>
                              : <span style={{ fontSize: 11, color: '#BDBDBD' }}>Enter length to calculate surface area</span>
                            }
                          </div>
                        </div>
                      )
                    })}

                    {/* Total surface area summary */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '4px 2px' }}>
                      <span style={{ fontSize: 11, color: '#555' }}>Total surface area:</span>
                      {totalAssemblySurfaceArea !== null
                        ? <span style={{ fontSize: 13, fontWeight: 700, color: '#0C447C' }}>{totalAssemblySurfaceArea.toFixed(3)} m²</span>
                        : <span style={{ fontSize: 11, color: '#BDBDBD' }}>— Enter length for all parts first</span>
                      }
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#BDBDBD', textAlign: 'center', padding: '8px 0' }}>No components yet — select a part from the dropdown</div>
                )}
              </div>
            )}

            {/* Name */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Product Name *</label>
                {nameEdited && autoName && (
                  <button type="button" onClick={() => { setNameEdited(false); setForm(f => ({ ...f, name: autoName })) }}
                    style={{ fontSize: 11, color: '#0C447C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    ↺ Reset to auto
                  </button>
                )}
              </div>
              <input className="w-full border rounded-md"
                style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: errors.name ? '#C8202A' : '#E0E0E0' }}
                value={form.name}
                onChange={e => { setNameEdited(true); setField('name', e.target.value) }}
                placeholder="PL6x1500 SS400 (stock 6m)" />
              {errors.name && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.name}</div>}
            </div>

            {/* Engineering Code */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Engineering Code</label>
              <input className="w-full border rounded-md font-mono"
                style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: '#E0E0E0' }}
                value={form.engineering_code} onChange={e => setField('engineering_code', e.target.value)}
                placeholder="BDTCM_001" />
            </div>

            {/* Paint & Welding */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, background: '#F8F9FA', borderRadius: 8, border: '1px solid #E0E0E0' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>Production (optional)</div>

              {/* Part: show computed surface area as info */}
              {form.product_kind === 'part' && computedSurfaceArea !== null && (
                <div style={{ fontSize: 11, color: '#555' }}>
                  Surface area: <span style={{ fontWeight: 600, color: '#0C447C' }}>{computedSurfaceArea.toFixed(3)} m²</span>
                  <span style={{ color: '#BDBDBD', marginLeft: 6 }}>(from profile + length)</span>
                </div>
              )}

              {/* Assembly: show auto total or fallback manual input */}
              {form.product_kind === 'assembly' && (
                totalAssemblySurfaceArea !== null ? (
                  <div style={{ fontSize: 11, color: '#555' }}>
                    Total surface area: <span style={{ fontWeight: 600, color: '#0C447C' }}>{totalAssemblySurfaceArea.toFixed(3)} m²</span>
                    <span style={{ color: '#BDBDBD', marginLeft: 6 }}>(calculated from all parts)</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>Total surface area (m²)</div>
                    <input type="number" min="0" step="0.01"
                      className="border rounded-md"
                      style={{ width: 100, height: 30, padding: '0 8px', fontSize: 12, borderColor: '#E0E0E0', background: '#fff' }}
                      value={production.surface_area_m2}
                      onChange={e => setProduction(p => ({ ...p, surface_area_m2: e.target.value }))}
                      placeholder="m²" />
                    <span style={{ fontSize: 11, color: '#BDBDBD' }}>Enter part lengths to auto-calculate</span>
                  </div>
                )
              )}

              {/* Paint coats */}
              {([
                { key: 'primer'       as const, dftKey: 'primer_dft'       as const, label: 'Primer',        prefix: 'PAINTPR', vs: VOL_SOLIDS.primer },
                { key: 'intermediate' as const, dftKey: 'intermediate_dft' as const, label: 'Intermediate',   prefix: 'PAINTIT', vs: VOL_SOLIDS.intermediate },
                { key: 'fireproof'    as const, dftKey: 'fireproof_dft'    as const, label: 'Fireproof',      prefix: 'PAINTFP', vs: VOL_SOLIDS.fireproof },
                { key: 'topcoat'      as const, dftKey: 'topcoat_dft'      as const, label: 'Topcoat',        prefix: 'PAINTTC', vs: VOL_SOLIDS.topcoat },
              ]).map(({ key, dftKey, label, prefix, vs }) => {
                const items = paintMaterials.filter(m => m.default_code.startsWith(prefix))
                const liters = calcPaintLiters(production[dftKey], vs)
                const gallons = liters !== null ? liters / 3.785 : null
                return (
                  <div key={key}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 3 }}>{label}</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select className="border rounded-md"
                        style={{ flex: 1, height: 32, padding: '0 8px', fontSize: 12, borderColor: '#E0E0E0', background: '#fff' }}
                        value={production[key]}
                        onChange={e => {
                          const code = e.target.value
                          const mat = items.find(m => m.default_code === code)
                          const micron = mat?.attributes?.paint_micron as number | undefined
                          setProduction(p => ({
                            ...p,
                            [key]: code,
                            ...(micron ? { [dftKey]: String(micron) } : {}),
                          }))
                        }}>
                        <option value="">— None —</option>
                        {items.map(m => <option key={m.default_code} value={m.default_code}>{m.name}</option>)}
                      </select>
                      <input type="number" min="0" step="1"
                        className="border rounded-md"
                        style={{ width: 76, height: 32, padding: '0 8px', fontSize: 12, borderColor: '#E0E0E0', background: '#fff' }}
                        value={production[dftKey]}
                        onChange={e => setProduction(p => ({ ...p, [dftKey]: e.target.value }))}
                        placeholder="DFT μm" />
                      {liters !== null
                        ? <span style={{ fontSize: 11, color: '#0C447C', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {liters.toFixed(3)} L<span style={{ color: '#888', fontWeight: 400 }}> / {gallons!.toFixed(2)} gal</span>
                          </span>
                        : <span style={{ fontSize: 12, color: '#BDBDBD', whiteSpace: 'nowrap' }}>— L</span>
                      }
                    </div>
                  </div>
                )
              })}

              {/* Welding wire */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>Welding Wire</label>

                {/* Row 1: type + fillet + thickness + layer */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#888', marginBottom: 2 }}>Weld sides</div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {(['1', '2'] as const).map(s => (
                        <button key={s} type="button"
                          onClick={() => setProduction(p => ({ ...p, weld_type: s }))}
                          style={{
                            height: 28, padding: '0 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            border: `1.5px solid ${production.weld_type === s ? '#0C447C' : '#E0E0E0'}`,
                            background: production.weld_type === s ? '#E6F1FB' : '#fff',
                            color: production.weld_type === s ? '#0C447C' : '#555',
                          }}>{s} side(s)</button>
                      ))}
                    </div>
                  </div>
                  <DimInput label="Fillet (mm)" value={production.welding_fillet_mm} step="1"
                    onChange={v => setProduction(p => ({ ...p, welding_fillet_mm: v }))} />
                  <DimInput label="t part (mm)" value={production.part_thickness_mm} step="1"
                    onChange={v => setProduction(p => ({ ...p, part_thickness_mm: v }))} />
                  <DimInput label="Layer" value={production.welding_layer} step="1"
                    onChange={v => setProduction(p => ({ ...p, welding_layer: v }))} />
                </div>

                {/* Row 2: wire select + path */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#888', marginBottom: 2 }}>Welding wire</div>
                    <select className="border rounded-md w-full"
                      style={{ height: 32, padding: '0 8px', fontSize: 12, borderColor: '#E0E0E0', background: '#fff' }}
                      value={production.welding_wire} onChange={e => setProduction(p => ({ ...p, welding_wire: e.target.value }))}>
                      <option value="">— None —</option>
                      {weldingMaterials.map(m => <option key={m.default_code} value={m.default_code}>{m.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#888', marginBottom: 2 }}>Weld length (m)</div>
                    <input type="number" min="0" step="0.5"
                      className="border rounded-md"
                      style={{ width: 90, height: 32, padding: '0 8px', fontSize: 12, borderColor: '#E0E0E0', background: '#fff' }}
                      value={production.welding_path_m}
                      onChange={e => setProduction(p => ({ ...p, welding_path_m: e.target.value }))}
                      placeholder="e.g. 12.5" />
                  </div>
                </div>

                {/* Result row */}
                {(() => {
                  const w = calcWeld()
                  if (!w || !production.welding_path_m) return (
                    <div style={{ fontSize: 11, color: '#BDBDBD' }}>Enter weld length and select wire to calculate</div>
                  )
                  return (
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '6px 10px', background: '#E6F1FB', borderRadius: 6 }}>
                      <ResultChip label="Tack points" value={`${w.tack} EA`} />
                      {w.kg > 0 && <ResultChip label="Welding wire" value={`${w.kg.toFixed(3)} kg`} />}
                      {w.boxes !== null && <ResultChip label="Boxes" value={`${w.boxes} EA`} highlight />}
                    </div>
                  )
                })()}
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6" style={{ height: 60, borderTop: '1px solid #E0E0E0', flexShrink: 0 }}>
            <button type="button" onClick={onClose} className="rounded-md border"
              style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, borderColor: '#E0E0E0' }}>Cancel</button>
            <button type="submit" disabled={isPending} className="flex items-center gap-2 rounded-md text-white disabled:opacity-60"
              style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#0C447C' }}>
              {isPending && <Loader2 size={14} className="animate-spin" />}
              Create Standard Product
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── tiny helpers ──────────────────────────────────────────────────────────────

function DimInput({ label, value, onChange, step = '1' }: {
  label: string
  value: string
  onChange: (v: string) => void
  step?: string
}) {
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 600, color: '#888', display: 'block', marginBottom: 2 }}>{label}</label>
      <input type="number" min="0" step={step}
        className="border rounded-md"
        style={{ width: 72, height: 32, padding: '0 8px', fontSize: 12, borderColor: '#E0E0E0', background: '#fff', textAlign: 'center' }}
        value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function stockLengthMm(name: string): string {
  const m = name.match(/\(stock\s+(\d+(?:\.\d+)?)m\)/i)
  return m ? String(parseFloat(m[1]) * 1000) : ''
}

function Sep() {
  return <span style={{ fontSize: 16, color: '#BDBDBD', paddingBottom: 6 }}>×</span>
}

function ResultChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 10, color: '#666' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: highlight ? '#0C447C' : '#333' }}>{value}</span>
    </div>
  )
}
