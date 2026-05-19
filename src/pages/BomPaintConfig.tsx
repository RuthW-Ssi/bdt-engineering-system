import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { useDispatchDetail, useSaveAssemblyMatch } from '../hooks/useBomDispatches'
import type { MatchStatus } from '../api/dispatches'
import { usePaintConfig, useSavePaintConfig } from '../hooks/usePaint'
import { useWeldingConfig, useSaveWeldingConfig } from '../hooks/useWelding'
import { useProducts } from '../hooks/useProducts'
import { PAINT_TYPES } from '../api/paint'
import type { PaintType } from '../api/paint'
import { MbomConfigTable } from '../components/bom/MbomConfigTable'
import type { PaintCellKey, PaintCell, WireCell } from '../components/bom/MbomConfigTable'

export function BomPaintConfig() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatchId = id ? Number(id) : undefined

  const { data: detail, isLoading } = useDispatchDetail(dispatchId)
  const { data: existingPaint, isFetched: paintFetched } = usePaintConfig(dispatchId)
  const { data: existingWire, isFetched: wireFetched } = useWeldingConfig(dispatchId)
  const { data: standardProducts } = useProducts({ product_type: 'standard', state: 'released', limit: 100 })
  const savePaint = useSavePaintConfig(dispatchId!)
  const saveWire = useSaveWeldingConfig(dispatchId!)
  const saveMatch = useSaveAssemblyMatch(dispatchId!)

  const assemblies = useMemo(() => detail?.assemblies ?? [], [detail])
  const orphanParts = useMemo(() => detail?.orphan_parts ?? [], [detail])
  const allPartsCount = useMemo(() => [
    ...assemblies.flatMap(a => a.parts),
    ...orphanParts,
  ].length, [assemblies, orphanParts])

  const [paintState, setPaintState] = useState<Map<PaintCellKey, PaintCell>>(new Map())
  const [wireState, setWireState] = useState<Map<number, WireCell>>(new Map())
  const [matchState, setMatchState] = useState<Map<number, MatchStatus | null>>(new Map())
  const [productState, setProductState] = useState<Map<number, number | null>>(new Map())
  const [selectedAssemblies, setSelectedAssemblies] = useState<Set<number>>(new Set())
  const [submitError, setSubmitError] = useState<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (!assemblies.length || !paintFetched || !wireFetched || initialized.current) return
    initialized.current = true

    // Paint state
    const pm = new Map<PaintCellKey, PaintCell>()
    for (const asm of assemblies) {
      for (const pt of PAINT_TYPES) {
        pm.set(`${asm.id}_${pt}`, { material_id: null })
      }
    }
    if (existingPaint) {
      for (const asm of existingPaint.assemblies) {
        for (const cfg of asm.configs) {
          pm.set(`${asm.assembly_id}_${cfg.paint_type as PaintType}`, { material_id: cfg.material_id })
        }
      }
    }
    setPaintState(pm)

    // Match state
    const mm = new Map<number, MatchStatus | null>()
    for (const asm of assemblies) {
      mm.set(asm.id, (asm.match_status as MatchStatus | null) ?? null)
    }
    setMatchState(mm)

    // Product state
    const pm2 = new Map<number, number | null>()
    for (const asm of assemblies) {
      pm2.set(asm.id, asm.product?.id ?? null)
    }
    setProductState(pm2)

    // Wire state — keyed by assembly_id
    const wm = new Map<number, WireCell>()
    for (const asm of assemblies) {
      wm.set(asm.id, { material_id: null })
    }
    if (existingWire) {
      for (const a of existingWire.assemblies) {
        wm.set(a.assembly_id, { material_id: a.material_id })
      }
    }
    setWireState(wm)
  }, [assemblies, existingPaint, existingWire, paintFetched, wireFetched])

  const handlePaintChange = useCallback((key: PaintCellKey, value: PaintCell) => {
    setPaintState(prev => new Map(prev).set(key, value))
  }, [])

  const handleWireChange = useCallback((asmId: number, value: WireCell) => {
    setWireState(prev => new Map(prev).set(asmId, value))
  }, [])

  const handleMatchChange = useCallback((asmId: number, value: MatchStatus | null) => {
    setMatchState(prev => new Map(prev).set(asmId, value))
  }, [])

  const handleProductChange = useCallback((asmId: number, productId: number | null) => {
    setProductState(prev => new Map(prev).set(asmId, productId))

    if (!productId || matchState.get(asmId) !== 'MATCHED_STANDARD') return
    const product = standardProducts?.items.find(p => p.id === productId)
    if (!product) return

    const attrs = product.attributes as Record<string, unknown>
    const paintSpec = attrs.paint_spec as Record<string, number | null> | undefined
    if (paintSpec) {
      setPaintState(prev => {
        const next = new Map(prev)
        for (const pt of PAINT_TYPES) {
          next.set(`${asmId}_${pt}` as PaintCellKey, { material_id: paintSpec[pt] ?? null })
        }
        return next
      })
    }

    const wireMatId = attrs.welding_wire_material_id
    if (wireMatId != null) {
      setWireState(prev => new Map(prev).set(asmId, { material_id: Number(wireMatId) }))
    }
  }, [matchState, standardProducts])

  const handleAssemblySelect = useCallback((id: number, checked: boolean, e: React.MouseEvent) => {
    setSelectedAssemblies(prev => {
      const next = new Set(prev)
      if (e.shiftKey) {
        const ids = assemblies.map(a => a.id)
        const last = [...prev].at(-1) ?? id
        const a = ids.indexOf(last), b = ids.indexOf(id)
        const [lo, hi] = a < b ? [a, b] : [b, a]
        for (let i = lo; i <= hi; i++) checked ? next.add(ids[i]) : next.delete(ids[i])
      } else {
        checked ? next.add(id) : next.delete(id)
      }
      return next
    })
  }, [assemblies])

  const handleSelectAllAssemblies = useCallback((checked: boolean) => {
    setSelectedAssemblies(checked ? new Set(assemblies.map(a => a.id)) : new Set())
  }, [assemblies])

  const handleApplyToSelected = useCallback(() => {
    if (selectedAssemblies.size < 2) return
    const [sourceId, ...targetIds] = [...selectedAssemblies]
    setPaintState(prev => {
      const next = new Map(prev)
      for (const pt of PAINT_TYPES) {
        const src = prev.get(`${sourceId}_${pt}`) ?? { material_id: null }
        for (const tid of targetIds) next.set(`${tid}_${pt}`, { ...src })
      }
      return next
    })
  }, [selectedAssemblies])

  const handleClearSelected = useCallback(() => {
    if (!window.confirm(`Clear paint config for ${selectedAssemblies.size} assemblies?`)) return
    setPaintState(prev => {
      const next = new Map(prev)
      for (const id of selectedAssemblies) {
        for (const pt of PAINT_TYPES) next.set(`${id}_${pt}`, { material_id: null })
      }
      return next
    })
  }, [selectedAssemblies])

  const handleSubmit = async () => {
    if (!dispatchId) return
    setSubmitError(null)

    const paintConfigs = assemblies.flatMap(asm =>
      PAINT_TYPES.map(pt => ({
        assembly_id: asm.id,
        paint_type: pt,
        material_id: paintState.get(`${asm.id}_${pt}`)?.material_id ?? null,
        layers: 1,
      }))
    )
    const wireConfigs = assemblies.map(asm => ({
      assembly_id: asm.id,
      material_id: wireState.get(asm.id)?.material_id ?? null,
    }))
    const matchAssignments = assemblies.map(asm => ({
      assembly_id: asm.id,
      match_status: matchState.get(asm.id) ?? null,
      product_id: productState.get(asm.id) ?? null,
    }))

    try {
      await Promise.all([
        savePaint.mutateAsync({ configs: paintConfigs }),
        saveWire.mutateAsync({ configs: wireConfigs }),
        saveMatch.mutateAsync(matchAssignments),
      ])
      navigate(`/bom/dispatch/${dispatchId}`)
    } catch {
      setSubmitError('Save failed — check backend')
    }
  }

  const zoneLabel = useMemo(() => {
    if (!detail) return ''
    const zone = detail.zone?.code ?? ''
    const sub = detail.sub_zone?.code ? ` / ${detail.sub_zone.code}` : ''
    return `${zone}${sub}`
  }, [detail])

  const isSaving = savePaint.isPending || saveWire.isPending || saveMatch.isPending

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2" style={{ height: 'calc(100vh - 56px)', color: '#8E8E8E', fontSize: 13 }}>
        <Loader2 size={18} className="animate-spin" />Loading...
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Header */}
      <div className="bg-white flex items-center gap-3 border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <button
          onClick={() => navigate(`/bom/dispatch/${dispatchId}`)}
          className="flex items-center justify-center rounded hover:bg-chrome-50"
          style={{ width: 32, height: 32, color: '#8E8E8E' }}
        >
          <ChevronLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>
            Configure mBOM — {zoneLabel || `Dispatch #${dispatchId}`}
          </div>
          <div style={{ fontSize: 11, color: '#8E8E8E' }}>
            {assemblies.length} assemblies · {allPartsCount} parts
          </div>
        </div>
      </div>

      {/* Bulk-edit toolbar */}
      {selectedAssemblies.size > 0 && (
        <div className="bg-white border-b border-chrome-100 px-6 flex items-center gap-3" style={{ height: 40, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#555' }}>{selectedAssemblies.size} assemblies selected</span>
          <button
            onClick={handleApplyToSelected}
            disabled={selectedAssemblies.size < 2}
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, border: '1px solid #C8202A', color: '#C8202A', background: '#fff', cursor: selectedAssemblies.size < 2 ? 'not-allowed' : 'pointer', opacity: selectedAssemblies.size < 2 ? 0.5 : 1 }}
          >
            Apply first to all
          </button>
          <button
            onClick={handleClearSelected}
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, border: '1px solid #D9D9D9', color: '#555', background: '#fff', cursor: 'pointer' }}
          >
            Clear paint
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {assemblies.length === 0 ? (
          <div style={{ padding: 32, color: '#8E8E8E', fontSize: 14, textAlign: 'center' }}>
            No assemblies found — upload a BOM first
          </div>
        ) : (
          <MbomConfigTable
            assemblies={assemblies}
            paintState={paintState}
            wireState={wireState}
            matchState={matchState}
            productState={productState}
            onPaintChange={handlePaintChange}
            onWireChange={handleWireChange}
            onMatchChange={handleMatchChange}
            onProductChange={handleProductChange}
            selectedAssemblies={selectedAssemblies}
            onAssemblySelect={handleAssemblySelect}
            onSelectAllAssemblies={handleSelectAllAssemblies}
          />
        )}
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-chrome-100 px-6 flex items-center justify-between" style={{ height: 56, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: '#C8202A' }}>{submitError ?? ''}</span>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/bom/dispatch/${dispatchId}`)}
            style={{ fontSize: 13, padding: '7px 16px', borderRadius: 6, border: '1px solid #D9D9D9', color: '#555', background: '#fff', cursor: 'pointer' }}
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            style={{ fontSize: 13, fontWeight: 600, padding: '7px 20px', borderRadius: 6, border: 'none', background: isSaving ? '#ccc' : '#C8202A', color: '#fff', cursor: isSaving ? 'not-allowed' : 'pointer' }}
          >
            {isSaving ? 'Saving...' : 'Save & Compute mBOM'}
          </button>
        </div>
      </div>
    </div>
  )
}
