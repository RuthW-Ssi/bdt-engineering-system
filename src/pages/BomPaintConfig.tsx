import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ChevronLeft, Loader2, Search, X } from 'lucide-react'
import { useDispatchDetail } from '../hooks/useBomDispatches'
import { usePaintConfig, useSavePaintConfig, usePaintMaterials } from '../hooks/usePaint'

type PaintRow = { primer: number | null; intermediate: number | null; fireproof: number | null; topcoat: number | null }

export function BomPaintConfig() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const dispatchId = id ? Number(id) : undefined

  const goBack = () => {
    const fromBomList = (location.state as { fromBomList?: boolean } | null)?.fromBomList
    if (fromBomList && dispatchId) {
      navigate('/bom', { state: { selectDispatch: dispatchId, tab: 'paint' } })
    } else {
      navigate(`/bom/dispatch/${dispatchId}`)
    }
  }

  const { data: detail, isLoading } = useDispatchDetail(dispatchId)
  const { data: existingPaint, isFetched: paintFetched } = usePaintConfig(dispatchId)
  const { data: primerMats = [] } = usePaintMaterials('primer')
  const { data: intermediateMats = [] } = usePaintMaterials('intermediate')
  const { data: fireproofMats = [] } = usePaintMaterials('fireproof')
  const { data: topcoatMats = [] } = usePaintMaterials('topcoat')
  const savePaint = useSavePaintConfig(dispatchId!)

  const [rows, setRows] = useState<Map<number, PaintRow>>(new Map())
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkPrimer, setBulkPrimer] = useState('')
  const [bulkIntermediate, setBulkIntermediate] = useState('')
  const [bulkFireproof, setBulkFireproof] = useState('')
  const [bulkTopcoat, setBulkTopcoat] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [markFilter, setMarkFilter] = useState('')
  const initialized = useRef(false)

  const assemblies = useMemo(() => detail?.assemblies ?? [], [detail])

  useEffect(() => {
    if (!assemblies.length || !paintFetched || initialized.current) return
    initialized.current = true
    const m = new Map<number, PaintRow>()
    for (const asm of assemblies) m.set(asm.id, { primer: null, intermediate: null, fireproof: null, topcoat: null })
    if (existingPaint) {
      for (const asm of existingPaint.assemblies) {
        const row = m.get(asm.assembly_id) ?? { primer: null, intermediate: null, fireproof: null, topcoat: null }
        for (const cfg of asm.configs) {
          if (cfg.paint_type === 'primer') row.primer = cfg.material_id
          if (cfg.paint_type === 'intermediate') row.intermediate = cfg.material_id
          if (cfg.paint_type === 'fireproof') row.fireproof = cfg.material_id
          if (cfg.paint_type === 'topcoat') row.topcoat = cfg.material_id
        }
        m.set(asm.assembly_id, row)
      }
    }
    setRows(m)
  }, [assemblies, existingPaint, paintFetched])

  const doneCount = useMemo(
    () => [...rows.values()].filter(r => r.topcoat != null).length,
    [rows],
  )


  const setRow = useCallback((asmId: number, field: keyof PaintRow, val: number | null) => {
    setRows(prev => {
      const next = new Map(prev)
      next.set(asmId, { ...(next.get(asmId) ?? { primer: null, intermediate: null, fireproof: null, topcoat: null }), [field]: val })
      return next
    })
  }, [])

  const toggleSelect = useCallback((asmId: number, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev)
      checked ? next.add(asmId) : next.delete(asmId)
      return next
    })
  }, [])

  const toggleAll = useCallback(
    (checked: boolean) =>
      setSelected(prev => {
        const next = new Set(prev)
        filteredAssemblies.forEach(a => checked ? next.add(a.id) : next.delete(a.id))
        return next
      }),
    [assemblies],
  )

  const applyBulk = (targetIds: number[]) => {
    const primer = bulkPrimer ? Number(bulkPrimer) : null
    const intermediate = bulkIntermediate ? Number(bulkIntermediate) : null
    const fireproof = bulkFireproof ? Number(bulkFireproof) : null
    const topcoat = bulkTopcoat ? Number(bulkTopcoat) : null
    setRows(prev => {
      const next = new Map(prev)
      for (const id of targetIds) next.set(id, { primer, intermediate, fireproof, topcoat })
      return next
    })
  }

  const buildPayload = () =>
    assemblies.flatMap(asm => {
      const row = rows.get(asm.id) ?? { primer: null, intermediate: null, fireproof: null, topcoat: null }
      return [
        { assembly_id: asm.id, paint_type: 'primer', material_id: row.primer, layers: 1 },
        { assembly_id: asm.id, paint_type: 'intermediate', material_id: row.intermediate, layers: 1 },
        { assembly_id: asm.id, paint_type: 'fireproof', material_id: row.fireproof, layers: 1 },
        { assembly_id: asm.id, paint_type: 'topcoat', material_id: row.topcoat, layers: 1 },
      ]
    })

  const handleSave = async () => {
    if (!dispatchId) return
    setSubmitError(null)
    try {
      await savePaint.mutateAsync({ configs: buildPayload() })
      goBack()
    } catch {
      setSubmitError('Save failed — check backend')
    }
  }

  const isSaving = savePaint.isPending
  const filteredAssemblies = useMemo(() => {
    const term = markFilter.trim().toLowerCase()
    return term ? assemblies.filter(a => a.assembly_mark.toLowerCase().includes(term)) : assemblies
  }, [assemblies, markFilter])

  const allSelected = filteredAssemblies.length > 0 && filteredAssemblies.every(a => selected.has(a.id))
  const progressPct = assemblies.length ? (doneCount / assemblies.length) * 100 : 0

  const zoneLabel = useMemo(() => {
    if (!detail) return ''
    const zone = detail.zone?.code ?? ''
    const sub = detail.sub_zone?.code ? ` / ${detail.sub_zone.code}` : ''
    return `${zone}${sub}`
  }, [detail])

  const dispatchLabel = `DSP-${String(dispatchId).padStart(5, '0')}`

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center gap-2"
        style={{ height: 'calc(100vh - 56px)', color: '#8E8E8E', fontSize: 13 }}
      >
        <Loader2 size={18} className="animate-spin" />
        Loading...
      </div>
    )
  }

  const TH: React.CSSProperties = {
    padding: '10px 8px',
    background: '#fafafa',
    color: '#6e6e73',
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase',
    borderBottom: '1px solid #e5e5e7',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  }
  const TD: React.CSSProperties = { padding: '8px', borderBottom: '1px solid #f5f5f7' }

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', background: '#F5F5F7', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div
        className="bg-white border-b border-chrome-100 px-6 flex items-center gap-3"
        style={{ height: 56, flexShrink: 0 }}
      >
        <button
          onClick={goBack}
          className="flex items-center justify-center rounded hover:bg-chrome-50"
          style={{ width: 32, height: 32, color: '#8E8E8E' }}
        >
          <ChevronLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1d1d1f' }}>
            Paint Config — {zoneLabel || dispatchLabel}
          </div>
          <div style={{ fontSize: 11, color: '#8E8E8E' }}>
            BOM › {dispatchLabel} · <strong>Paint</strong>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, color: '#6e6e73' }}>
            <strong style={{ color: '#1d1d1f' }}>{doneCount}/{assemblies.length}</strong> เลือกแล้ว
          </div>
          <div
            style={{
              width: 140, height: 5, background: '#f0f0f0', borderRadius: 3,
              overflow: 'hidden', marginTop: 4,
            }}
          >
            <div
              style={{
                height: '100%', background: '#2e7d32',
                width: `${progressPct}%`, transition: 'width 0.3s',
              }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          maxWidth: 1000, width: '100%', margin: '0 auto',
          padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >

        {/* Bulk apply card */}
        <div
          style={{
            background: '#fff', borderRadius: 10, padding: 18,
            boxShadow: '0 1px 3px rgba(0,0,0,.05)',
          }}
        >
          <div
            style={{
              fontSize: 11, fontWeight: 600, color: '#6e6e73',
              textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12,
            }}
          >
            ⚡ Bulk apply · กรอกครั้งเดียวใช้ได้ทุก row ที่เลือก
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            {([
              { label: 'Primer', value: bulkPrimer, setter: setBulkPrimer, mats: primerMats },
              { label: 'Intermediate', value: bulkIntermediate, setter: setBulkIntermediate, mats: intermediateMats },
              { label: 'Fireproof', value: bulkFireproof, setter: setBulkFireproof, mats: fireproofMats },
              { label: 'Topcoat', value: bulkTopcoat, setter: setBulkTopcoat, mats: topcoatMats },
            ] as const).map(({ label, value, setter, mats }) => (
              <div key={label}>
                <label style={{ fontSize: 11, color: '#6e6e73', display: 'block', marginBottom: 3 }}>{label}</label>
                <select
                  value={value}
                  onChange={e => setter(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d2d2d7', borderRadius: 6, fontSize: 13, background: '#fff' }}
                >
                  <option value="">— None —</option>
                  {mats.map((m: { id: number; name: string }) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button
              onClick={() => applyBulk([...selected])}
              disabled={selected.size === 0}
              style={{
                padding: '7px 14px', borderRadius: 6,
                border: '1px solid #C8202A', background: '#fff', color: '#C8202A',
                fontSize: 13, fontWeight: 500, cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                opacity: selected.size === 0 ? 0.4 : 1, whiteSpace: 'nowrap',
              }}
            >
              Apply ({selected.size})
            </button>
            <button
              onClick={() => applyBulk(assemblies.map(a => a.id))}
              style={{
                padding: '7px 14px', borderRadius: 6, border: 'none',
                background: '#C8202A', color: '#fff',
                fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Apply all ({assemblies.length})
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#6e6e73', marginTop: 8 }}>
            💡 <strong>Apply</strong> = กับเฉพาะ row ที่ check ·{' '}
            <strong>Apply all</strong> = ทุก row · per-row dropdown ใต้ก็แก้เองได้
          </div>
        </div>

        {/* Assemblies table */}
        <div
          style={{
            background: '#fff', borderRadius: 10,
            boxShadow: '0 1px 3px rgba(0,0,0,.05)', overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 18px 0 18px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6e6e73', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Assemblies · {filteredAssemblies.length}{markFilter ? `/${assemblies.length}` : ''} items
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={12} style={{ position: 'absolute', left: 8, color: '#8E8E8E', pointerEvents: 'none' }} />
                <input
                  type="text"
                  value={markFilter}
                  onChange={e => setMarkFilter(e.target.value)}
                  placeholder="Filter mark…"
                  style={{
                    paddingLeft: 26, paddingRight: markFilter ? 24 : 8, paddingTop: 4, paddingBottom: 4,
                    border: '1px solid #D0D0D0', borderRadius: 6, fontSize: 12,
                    background: '#fff', outline: 'none', width: 140,
                  }}
                />
                {markFilter && (
                  <button
                    onClick={() => setMarkFilter('')}
                    style={{ position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#8E8E8E', display: 'flex' }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
              <span style={{ fontSize: 13, color: '#6e6e73' }}>
                <strong style={{ color: '#C8202A' }}>{selected.size}</strong> selected
              </span>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 36, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={e => toggleAll(e.target.checked)}
                  />
                </th>
                <th style={TH}>Mark</th>
                <th style={{ ...TH, textAlign: 'right' }}>Qty</th>
                <th style={TH}>Primer</th>
                <th style={TH}>Intermediate</th>
                <th style={TH}>Fireproof</th>
                <th style={TH}>Topcoat</th>
              </tr>
            </thead>
            <tbody>
              {assemblies.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#8E8E8E', fontSize: 13 }}>
                    No assemblies found — upload a BOM first
                  </td>
                </tr>
              ) : filteredAssemblies.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 30, textAlign: 'center', color: '#8E8E8E', fontSize: 13 }}>
                    ไม่พบ mark "{markFilter}"
                  </td>
                </tr>
              ) : (
                filteredAssemblies.map((asm, i) => {
                  const row = rows.get(asm.id) ?? { primer: null, intermediate: null, fireproof: null, topcoat: null }
                  const isSelected = selected.has(asm.id)
                  return (
                    <tr
                      key={asm.id}
                      style={{ background: isSelected ? '#fff8e1' : i % 2 === 0 ? '#fff' : '#fafafa' }}
                    >
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => toggleSelect(asm.id, e.target.checked)}
                        />
                      </td>
                      <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {asm.assembly_mark}
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 500 }}>
                        ×{asm.assembly_qty}
                      </td>
                      {([
                        { field: 'primer', mats: primerMats },
                        { field: 'intermediate', mats: intermediateMats },
                        { field: 'fireproof', mats: fireproofMats },
                        { field: 'topcoat', mats: topcoatMats },
                      ] as const).map(({ field, mats }) => (
                        <td key={field} style={{ ...TD }}>
                          <select
                            value={row[field] ?? ''}
                            onChange={e => setRow(asm.id, field, e.target.value ? Number(e.target.value) : null)}
                            style={{
                              padding: '5px 7px', border: '1px solid #d2d2d7', borderRadius: 6,
                              fontSize: 12, background: '#fff', width: '100%', minWidth: 130,
                            }}
                          >
                            <option value="">— None —</option>
                            {mats.map((m: { id: number; name: string }) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </td>
                      ))}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>

          {/* Action bar */}
          <div
            style={{
              position: 'sticky', bottom: 0, background: '#fff',
              padding: '14px 18px', borderTop: '1px solid #e5e5e7',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              boxShadow: '0 -2px 8px rgba(0,0,0,.04)',
            }}
          >
            <button
              onClick={goBack}
              style={{
                padding: '7px 14px', borderRadius: 6, border: '1px solid #d2d2d7',
                background: '#fff', fontSize: 13, cursor: 'pointer', color: '#1d1d1f',
              }}
            >
              ← กลับไป BOM
            </button>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {submitError && (
                <span style={{ fontSize: 12, color: '#C8202A' }}>{submitError}</span>
              )}
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{
                  padding: '7px 20px', borderRadius: 6, border: 'none',
                  background: isSaving ? '#ccc' : '#C8202A', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer',
                }}
              >
                {isSaving ? 'Saving...' : '💾 Save'}
              </button>
            </div>
          </div>
        </div>


      </div>
    </div>
  )
}
