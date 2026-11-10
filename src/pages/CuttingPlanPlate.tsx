import { lazy, Suspense } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useCuttingPlan, usePlateView } from '../hooks/useCuttingPlan'
import { PlanMeta } from '../components/cuttingPlan/PlanMeta'
import { sheetKgByPlate } from '../lib/cuttingPlan/planSummary'

// One plate (Charge) of a cutting plan: 3D / 2D layout, cut path and CNC simulation
// (2026-11-06: split off the detail page, which keeps the data tabs). Linked from the
// Plates tab; prev / next walk the plates that have files. three.js loads only here.
const PlateViewer = lazy(() => import('../components/cuttingPlan/plateViewer/PlateViewer'))

const fmt = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en', { maximumFractionDigits: 2 }))

export function CuttingPlanPlate() {
  const { id, plate } = useParams<{ id: string; plate: string }>()
  const navigate = useNavigate()
  const uploadId = id ? parseInt(id) : NaN
  const { data: detail } = useCuttingPlan(uploadId)
  const { data: view, isLoading, isError } = usePlateView(uploadId, plate ?? null)

  const plates = [...new Set((detail?.files ?? []).filter(f => f.kind === 'DXF').map(f => f.plate_name))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const at = plate ? plates.indexOf(plate) : -1
  const go = (p: string) => navigate(`/cutting-plan/${uploadId}/plate/${encodeURIComponent(p)}`, { replace: true })
  const orders = view?.sheet && detail ? detail.order_parts.filter(o => o.nesting_id === view.sheet!.nesting_id) : []
  const s = view?.sheet
  const sheetKg = s && detail ? sheetKgByPlate(detail.nestings, detail.remnants).get(plate ?? '') ?? Number(s.weight_kg) : null
  const tiles = s ? [
    [s.nc_file ?? '—', 'NC File'],
    [s.plate_number ?? '—', 'Plate Number'],
    [`${s.quality ?? '—'} · ${fmt(s.thick_mm)} mm`, 'Quality · thickness'],
    [`${fmt(s.width_mm)} × ${fmt(s.length_mm)}`, 'Sheet size (mm)'],
    // the report's plate weight is only the nested area; the sheet adds this plate's remnants (2026-11-07)
    [`${fmt(s.weight_kg)} kg`, 'Nested weight'],
    [`${fmt(sheetKg)} kg`, 'Sheet weight'],
    [`${fmt(s.nesting_percent)}%`, 'Nesting'],
    [`${view!.parts.length} ${view!.parts.length === 1 ? 'part' : 'parts'}`, 'Parts'],
  ] : []
  const navBtn = { width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E0E0E0', borderRadius: 6, background: 'white', cursor: 'pointer', color: '#555' } as const

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      <div className="bg-white flex items-center gap-3 border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <button onClick={() => navigate(`/cutting-plan/${uploadId}`)} aria-label="Back to the cutting plan"
          className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 32, height: 32, color: '#8E8E8E' }}>
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E' }}>Plate (Charge)</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F', fontFamily: 'monospace' }}>{plate}</span>
          {detail && <PlanMeta plan={detail} />}
        </div>
        {plates.length > 1 && at >= 0 && (
          <div className="flex items-center gap-2" style={{ fontSize: 12, color: '#6B6F76' }}>
            <button onClick={() => go(plates[at - 1])} disabled={at === 0} aria-label="Previous plate" className="disabled:opacity-40" style={navBtn}><ChevronLeft size={16} /></button>
            <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 70, textAlign: 'center' }}>{at + 1} / {plates.length}</span>
            <button onClick={() => go(plates[at + 1])} disabled={at === plates.length - 1} aria-label="Next plate" className="disabled:opacity-40" style={navBtn}><ChevronRight size={16} /></button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 24px 24px', background: '#F9FAFB', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tiles.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 8, flexShrink: 0 }}>
            {tiles.map(([b, l]) => (
              <div key={l} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, padding: '8px 12px' }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{b}</div>
                <div style={{ fontSize: 11, color: '#8E8E8E' }}>{l}</div>
              </div>
            ))}
          </div>
        )}
        {isLoading && <div className="flex items-center gap-2" style={{ fontSize: 12, color: '#8E8E8E', padding: 20 }}><Loader2 size={16} className="animate-spin" />Loading plate {plate}...</div>}
        {isError && <div style={{ fontSize: 13, color: '#C8202A', padding: 12 }}>Can't open plate {plate} (it may have no .dxf file) · <button onClick={() => navigate(`/cutting-plan/${uploadId}`)} style={{ color: '#0C447C', textDecoration: 'underline' }}>Back to the cutting plan</button></div>}
        {view && (
          <div style={{ flexShrink: 0 }}>
            <Suspense fallback={<div className="flex items-center gap-2" style={{ fontSize: 12, color: '#8E8E8E', padding: 20 }}><Loader2 size={16} className="animate-spin" />Loading 3D...</div>}>
              <PlateViewer key={view.plate} view={view} orders={orders} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  )
}
