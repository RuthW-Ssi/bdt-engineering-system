import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Box, Download, Loader2, Scissors, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCuttingPlan, useBulkAssignOrderPartProjectCode, useDeleteCuttingPlan } from '../hooks/useCuttingPlan'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { getErrorMessage } from '../lib/getErrorMessage'
import { usePermission } from '../hooks/usePermission'
import { planLabel } from '../lib/cuttingPlan/planLabel'
import { PlanMeta } from '../components/cuttingPlan/PlanMeta'
import { ShapePlanView } from '../components/cuttingPlan/shape/ShapePlanView'
import { PlanSummaryCharts } from '../components/cuttingPlan/PlanSummary'
import { sheetKgByPlate, summarizePlan } from '../lib/cuttingPlan/planSummary'
import { InfoTip } from '../components/bom/InfoTip'
import type {
  CuttingPlanNestingRow, CuttingPlanOrderPartRow, CuttingPlanPlateUsageRow, CuttingPlanRemnantRow, CuttingPlanFile,
} from '../api/cutting-plan'
import { downloadCuttingPlanFile } from '../api/cutting-plan'
import type { CuttingPlanPrice } from '../api/cutting-plan'
import { useKerfs, usePrices } from '../hooks/useCuttingPlan'
import { kerfFor, priceFor, thb } from '../lib/cuttingPlan/plateMaterial'
import { CertificateCell, KerfButton, KerfDialog, PlateBalanceCard } from '../components/cuttingPlan/PlateMaterial'

type DataTab = 'nesting' | 'order_parts' | 'plate_usage' | 'remnants' | 'files'

const DATA_TABS: { id: DataTab; label: string }[] = [
  { id: 'nesting', label: 'Stock plates' },
  { id: 'order_parts', label: 'Order Parts' },
  { id: 'plate_usage', label: 'Plate Usage' },
  { id: 'remnants', label: 'Remnants' },
  { id: 'files', label: 'Files' },
]

function fmt(v: number | string | null): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString('en', { maximumFractionDigits: 2 }) : String(v)
}

// Tab bar mirrors BomList.tsx's CONTENT_TABS pattern — one table visible at a
// time instead of stacking all 4 (nesting rows in particular can run long).
function DataTabsCard({ tab, onTabChange, counts, children }: {
  tab: DataTab
  counts: Partial<Record<DataTab, number>>
  onTabChange: (tab: DataTab) => void
  children: React.ReactNode
}) {
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #E8E8E8' }}>
        {DATA_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            style={{
              padding: '9px 16px',
              fontSize: 12,
              fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? '#C8202A' : '#555',
              background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === t.id ? '#C8202A' : 'transparent'}`,
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {t.label}{counts[t.id] != null && <span style={{ color: '#9CA3AF', fontWeight: 400 }}> ({counts[t.id]!.toLocaleString('en')})</span>}
          </button>
        ))}
      </div>
      {children}
    </div>
  )
}

function TableGrid({ columns, children }: { columns: string; children: React.ReactNode }) {
  return (
    <div style={{ overflow: 'auto', maxHeight: 420 }}>
      <div style={{ minWidth: 600, display: 'grid', gridTemplateColumns: columns }}>{children}</div>
    </div>
  )
}

function TH({ children }: { children: React.ReactNode }) {
  // z-index via classes so a header showing an ⓘ tooltip can rise above its sticky neighbours
  return (
    <div className="z-[1] hover:z-10 focus-within:z-10" style={{
      padding: '8px 16px', fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.03em',
      borderBottom: '1px solid #F0F0F0', background: '#fff', position: 'sticky', top: 0,
    }}>
      {children}
    </div>
  )
}

function TD({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ padding: '8px 16px', fontSize: 12, color: '#1F1F1F', borderBottom: '1px solid #F5F5F5', ...style }}>{children}</div>
}

// Each plate (Charge) opens its own page with 3D / 2D / cut simulation when its .dxf is stored.
// User report 2026-11-26 (Stock Plate tab): Plate ID, Grade, weight, value and material certificate per plate, totals
function NestingTable({ rows, sheetKg, viewable, onView, prices, canWrite }: { rows: CuttingPlanNestingRow[]; sheetKg: Map<string, number>; viewable: Set<string>; onView: (plate: string) => void; prices: CuttingPlanPrice[] | undefined; canWrite: boolean }) {
  if (rows.length === 0) return <div style={{ padding: 20, fontSize: 12, color: '#8E8E8E' }}>No plates</div>
  const valueOf = (r: CuttingPlanNestingRow) => { const p = priceFor(prices, r.quality, r.thick_mm), k = sheetKg.get(r.cuttingplan_number); return p == null || k == null ? null : p * k }
  const totalKg = rows.reduce((n, r) => n + (sheetKg.get(r.cuttingplan_number) ?? 0), 0), nestedKg = rows.reduce((n, r) => n + Number(r.weight_kg ?? 0), 0)
  const priced = rows.map(valueOf).filter((v): v is number => v != null)
  return (
    <TableGrid columns="0.8fr 1fr 0.7fr 1.2fr 0.9fr 0.9fr 0.9fr 1.2fr 0.7fr 0.5fr 0.4fr">
      <TH>Plate ID</TH><TH>Mark (Charge)</TH><TH>Grade</TH><TH>Dimensions (mm)</TH>
      {/* the report's plate weight is only the nested area (2026-11-07: 452 kg of a 1,394 kg sheet) */}
      <TH><span className="inline-flex items-center gap-1">Nested weight (kg) <InfoTip label="What is nested weight" text="Weight of the part of the sheet used for nesting (Nesting Dim.). The rest of the sheet becomes remnants." /></span></TH>
      <TH><span className="inline-flex items-center gap-1">Sheet weight (kg) <InfoTip label="What is sheet weight" text="Whole sheet = nested weight + this plate's remnants." /></span></TH>
      <TH><span className="inline-flex items-center gap-1">Value <InfoTip label="What is value" text="Sheet weight × the price per kg in Materials for this grade and thickness. No price in Materials: – no price." /></span></TH>
      <TH>Material certificate</TH><TH>Nesting %</TH><TH>Parts</TH><TH>3D</TH>
      {rows.map(r => {
        const can = viewable.has(r.cuttingplan_number)
        return (
          <div key={r.id} style={{ display: 'contents' }}>
            <TD>{r.plate_number ?? '—'}</TD>
            <TD style={{ fontFamily: 'monospace' }}>{r.cuttingplan_number}</TD>
            <TD>{r.quality ?? '—'}</TD>
            <TD>{fmt(r.thick_mm)}×{fmt(r.width_mm)}×{fmt(r.length_mm)}</TD>
            <TD>{fmt(r.weight_kg)}</TD>
            <TD>{fmt(sheetKg.get(r.cuttingplan_number) ?? null)}</TD>
            <TD>{valueOf(r) == null ? <span style={{ color: '#C2C2C2' }}>– no price</span> : thb(valueOf(r)!)}</TD>
            <TD style={{ padding: '4px 16px' }}><CertificateCell key={`${r.id}|${r.certificate ?? ''}`} nestingId={r.id} value={r.certificate} canWrite={canWrite} /></TD>
            <TD>{r.nesting_percent != null ? `${fmt(r.nesting_percent)}%` : '—'}</TD>
            <TD>{r.count ?? '—'}</TD>
            <TD>
              <button onClick={() => can && onView(r.cuttingplan_number)} disabled={!can}
                aria-label={`View plate ${r.cuttingplan_number} in 3D`}
                title={can ? `View plate ${r.cuttingplan_number} in 3D` : 'No .dxf for this plate (uploaded before files were kept), so no 3D view'}
                className="disabled:opacity-30 disabled:cursor-not-allowed hover:bg-red-50"
                style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#C8202A', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                <Box size={16} />
              </button>
            </TD>
          </div>
        )
      })}
      <div data-testid="plates-total" style={{ display: 'contents', fontWeight: 600 }}>
        <TD style={{ fontWeight: 600 }}>Total</TD><TD style={{ fontWeight: 600 }}>{`${rows.reduce((n, r) => n + (r.count ?? 1), 0)} plates`}</TD><TD>{''}</TD><TD>{''}</TD>
        <TD style={{ fontWeight: 600 }}>{fmt(nestedKg)}</TD><TD style={{ fontWeight: 600 }}>{fmt(totalKg)}</TD>
        <TD style={{ fontWeight: 600 }}>{priced.length ? thb(priced.reduce((a, b) => a + b, 0)) : '—'}{priced.length < rows.length ? <span style={{ color: '#92400E', fontWeight: 400 }}>{` (${rows.length - priced.length} no price)`}</span> : null}</TD>
        <TD>{''}</TD><TD>{''}</TD><TD>{''}</TD><TD>{''}</TD>
      </div>
    </TableGrid>
  )
}

function OrderPartTable({ rows: allRows, canWrite }: { rows: CuttingPlanOrderPartRow[]; canWrite: boolean }) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkCode, setBulkCode] = useState('')
  const [query, setQuery] = useState('') // user report 2026-11-26: search a part
  const bulkAssign = useBulkAssignOrderPartProjectCode()

  if (allRows.length === 0) return <div style={{ padding: 20, fontSize: 12, color: '#8E8E8E' }}>No order parts</div>
  const q = query.trim().toLowerCase()
  const rows = q ? allRows.filter(r => [r.drawing_part_no_version_no, r.order_number, r.project_code].some(v => (v ?? '').toLowerCase().includes(q))) : allRows
  // one row per plate × drawing: nested is that plate's pieces (add up); ordered is the drawing's whole order, written
  // again on every plate it sits on (count once per drawing)
  const orderOf = new Map<string, number>()
  for (const r of rows) { const d = (r.drawing_part_no_version_no ?? '').trim(); orderOf.set(d, Math.max(orderOf.get(d) ?? 0, r.ordered ?? 0)) }
  const nested = rows.reduce((n, r) => n + (r.nested ?? 0), 0), ordered = [...orderOf.values()].reduce((a, b) => a + b, 0), drawings = orderOf.size

  const allSelected = selected.size > 0 && selected.size === rows.length

  function toggleRow(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)))
  }

  async function applyBulkCode() {
    if (!bulkCode.trim() || selected.size === 0) return
    try {
      await bulkAssign.mutateAsync({ order_part_ids: [...selected], project_code: bulkCode.trim() })
      toast.success(`Applied "${bulkCode.trim()}" to ${selected.size} part(s)`)
      setSelected(new Set())
      setBulkCode('')
    } catch {
      toast.error('Failed to assign project code')
    }
  }

  return (
    <div>
      <div data-testid="parts-total" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px', borderBottom: '1px solid #F3F4F6', flexWrap: 'wrap' }}>
        <input aria-label="Search parts" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search drawing / part, order or project code"
          style={{ height: 30, padding: '0 10px', fontSize: 12, border: '1px solid #E0E0E0', borderRadius: 6, width: 300 }} />
        <span style={{ fontSize: 12, color: '#555' }}>
          Total parts <b>{nested.toLocaleString('en')}</b> nested of <b>{ordered.toLocaleString('en')}</b> ordered · <b>{drawings.toLocaleString('en')}</b> {drawings === 1 ? 'drawing' : 'drawings'} on <b>{rows.length.toLocaleString('en')}</b> plate rows
          {q && <span style={{ color: '#8E8E8E' }}>{` (search: ${rows.length} of ${allRows.length} rows)`}</span>}
        </span>
      </div>
      {canWrite && selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#FEF2F2', borderBottom: '1px solid #FCA5A5' }}>
          <span style={{ fontSize: 12, color: '#991B1B', fontWeight: 600 }}>{selected.size} selected</span>
          <input
            value={bulkCode}
            onChange={e => setBulkCode(e.target.value)}
            placeholder="Project code, e.g. 0X197"
            style={{ height: 30, padding: '0 10px', fontSize: 12, border: '1px solid #E0E0E0', borderRadius: 6, width: 200 }}
          />
          <button
            onClick={applyBulkCode}
            disabled={!bulkCode.trim() || bulkAssign.isPending}
            className="disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ height: 30, padding: '0 14px', fontSize: 12, fontWeight: 600, color: 'white', background: '#C8202A', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            {bulkAssign.isPending ? 'Applying...' : `Apply to ${selected.size}`}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{ height: 30, padding: '0 10px', fontSize: 12, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Clear
          </button>
        </div>
      )}
      <TableGrid columns={canWrite ? '32px 1.5fr 1fr 1fr 1fr 1fr 1fr 1fr' : '1.5fr 1fr 1fr 1fr 1fr 1fr 1fr'}>
        {canWrite && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid #F0F0F0', background: '#fff', position: 'sticky', top: 0, zIndex: 1 }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          </div>
        )}
        <TH>Drawing</TH><TH>Order Number</TH><TH>Project Code</TH><TH>Nested</TH><TH>Ordered</TH><TH>Dimensions (mm)</TH><TH>Weight (kg)</TH>
        {rows.map(r => (
          <div key={r.id} style={{ display: 'contents' }}>
            {canWrite && <TD><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} /></TD>}
            <TD>{r.drawing_part_no_version_no ?? '—'}</TD>
            <TD>{r.order_number ?? '—'}</TD>
            <TD>{r.project_code ?? <span style={{ color: '#C2C2C2' }}>—</span>}</TD>
            <TD>{r.nested ?? '—'}</TD>
            <TD>{r.ordered ?? '—'}</TD>
            <TD>{fmt(r.length_mm)} × {fmt(r.width_mm)}</TD>
            <TD>{fmt(r.weight_kg)}</TD>
          </div>
        ))}
      </TableGrid>
    </div>
  )
}

function PlateUsageTable({ rows }: { rows: CuttingPlanPlateUsageRow[] }) {
  if (rows.length === 0) return <div style={{ padding: 20, fontSize: 12, color: '#8E8E8E' }}>No plate usage data</div>
  return (
    <TableGrid columns="1fr 1fr 1fr">
      <TH>Order Number</TH><TH>Net (kg)</TH><TH>Gross (kg)</TH>
      {rows.map(r => (
        <div key={r.id} style={{ display: 'contents' }}>
          <TD>{r.order_number ?? '—'}</TD>
          <TD>{fmt(r.net_kg)}</TD>
          <TD>{fmt(r.gross_kg)}</TD>
        </div>
      ))}
    </TableGrid>
  )
}

// User report 2026-11-26 (Remnants tab): Offcut No. (the nesting program's remnant number), its plate, certificate
// (the plate's), weight and value, totals. Every remnant also sits in the remnant register (Cutting Plan › Remnants).
function RemnantTable({ rows, plates, prices }: { rows: CuttingPlanRemnantRow[]; plates: CuttingPlanNestingRow[]; prices: CuttingPlanPrice[] | undefined }) {
  if (rows.length === 0) return <div style={{ padding: 20, fontSize: 12, color: '#8E8E8E' }}>No remnants</div>
  const plateOf = (r: CuttingPlanRemnantRow) => plates.find(p => p.cuttingplan_number === r.cuttingplan_number)
  const valueOf = (r: CuttingPlanRemnantRow) => { const p = plateOf(r), price = priceFor(prices, p?.quality, p?.thick_mm); return price == null || r.weight_kg == null ? null : price * Number(r.weight_kg) }
  const totalKg = rows.reduce((n, r) => n + Number(r.weight_kg ?? 0), 0), pieces = rows.reduce((n, r) => n + (r.count ?? 1), 0)
  const priced = rows.map(valueOf).filter((v): v is number => v != null)
  return (
    <TableGrid columns="0.8fr 0.8fr 0.9fr 1.1fr 0.7fr 0.8fr 0.5fr 1fr 0.8fr">
      <TH>Offcut No.</TH><TH>From plate</TH><TH>Grade · thick</TH><TH>Dimensions (mm)</TH><TH>Area (m²)</TH><TH>Weight (kg)</TH><TH>Count</TH><TH>Material certificate</TH><TH>Value</TH>
      {rows.map(r => {
        const p = plateOf(r)
        return (
          <div key={r.id} style={{ display: 'contents' }}>
            <TD style={{ fontWeight: 600 }}>{r.plate_number ?? '—'}</TD>
            <TD>{p?.plate_number ?? '—'}</TD>
            <TD>{p ? `${p.quality ?? '—'} · ${fmt(p.thick_mm)} mm` : '—'}</TD>
            <TD>{fmt(r.length_mm)} × {fmt(r.width_mm)}</TD>
            <TD>{fmt(r.area_m2)}</TD>
            <TD>{fmt(r.weight_kg)}</TD>
            <TD>{r.count ?? '—'}</TD>
            <TD>{p?.certificate || <span style={{ color: '#C2C2C2' }}>—</span>}</TD>
            <TD>{valueOf(r) == null ? <span style={{ color: '#C2C2C2' }}>– no price</span> : thb(valueOf(r)!)}</TD>
          </div>
        )
      })}
      <div data-testid="remnants-total" style={{ display: 'contents' }}>
        <TD style={{ fontWeight: 600 }}>Total</TD><TD>{''}</TD><TD>{''}</TD><TD>{''}</TD><TD>{''}</TD>
        <TD style={{ fontWeight: 600 }}>{fmt(totalKg)}</TD><TD style={{ fontWeight: 600 }}>{pieces}</TD><TD>{''}</TD>
        <TD style={{ fontWeight: 600 }}>{priced.length ? thb(priced.reduce((a, b) => a + b, 0)) : '—'}{priced.length < rows.length ? <span style={{ color: '#92400E', fontWeight: 400 }}>{` (${rows.length - priced.length} no price)`}</span> : null}</TD>
      </div>
    </TableGrid>
  )
}

// The four stored files of each plate (2026-11-06): one row per plate, a download per kind.
const KINDS = ['TXT', 'XLS', 'PDF', 'DXF'] as const
function FileTable({ files }: { files: CuttingPlanFile[] }) {
  if (files.length === 0) return <div style={{ padding: 20, fontSize: 12, color: '#8E8E8E' }}>No files (uploaded before files were kept, 2026-11-06)</div>
  const plates = [...new Set(files.map(f => f.plate_name))]
  const get = async (f: CuttingPlanFile) => {
    try { await downloadCuttingPlanFile(f) } catch (e) { toast.error(getErrorMessage(e, 'Download failed. Please try again.')) }
  }
  return (
    <TableGrid columns="1.4fr 1fr 1fr 1fr 1fr">
      <TH>Plate</TH>{KINDS.map(k => <TH key={k}>.{k.toLowerCase()}</TH>)}
      {plates.map(plate => (
        <div key={plate} style={{ display: 'contents' }}>
          <TD><span style={{ fontFamily: 'monospace' }}>{plate}</span></TD>
          {KINDS.map(k => {
            const f = files.find(x => x.plate_name === plate && x.kind === k)
            return (
              <TD key={k}>
                {f ? (
                  <button onClick={() => get(f)} title={f.file_name}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#0C447C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <Download size={12} />{(f.size_bytes / 1024).toLocaleString('en', { maximumFractionDigits: 0 })} KB
                  </button>
                ) : '—'}
              </TD>
            )
          })}
        </div>
      ))}
    </TableGrid>
  )
}

export function CuttingPlanDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const cuttingPlanId = id ? parseInt(id) : NaN
  const { data: detail, isLoading, isError } = useCuttingPlan(cuttingPlanId)
  const [dataTab, setDataTab] = useState<DataTab>('nesting')
  const kerfs = useKerfs(), prices = usePrices()
  const [kerfOpen, setKerfOpen] = useState(false)
  const kerfOf = (r: CuttingPlanNestingRow) => kerfFor(kerfs.data, r)
  const [thickness, setThickness] = useState<number | null>(null) // filter picked on the thickness chart
  const summary = useMemo(() => (detail ? summarizePlan(detail.nestings, detail.remnants, kerfs.data ? kerfOf : undefined) : null), [detail, kerfs.data]) // eslint-disable-line react-hooks/exhaustive-deps
  // The thickness picked on the chart filters every tab: child rows and files follow their plate by name.
  const shown = useMemo(() => {
    const all = { nestings: detail?.nestings ?? [], order_parts: detail?.order_parts ?? [], plate_usages: detail?.plate_usages ?? [], remnants: detail?.remnants ?? [], files: detail?.files ?? [] }
    if (thickness == null) return all
    const nestings = all.nestings.filter(r => Number(r.thick_mm) === thickness)
    const names = new Set(nestings.map(r => r.cuttingplan_number))
    return {
      nestings,
      order_parts: all.order_parts.filter(r => names.has(r.cuttingplan_number)),
      plate_usages: all.plate_usages.filter(r => names.has(r.cuttingplan_number)),
      remnants: all.remnants.filter(r => names.has(r.cuttingplan_number)),
      files: all.files.filter(f => names.has(f.plate_name)),
    }
  }, [detail, thickness])
  const sheetKg = useMemo(() => sheetKgByPlate(detail?.nestings ?? [], detail?.remnants ?? []), [detail])
  const focus = useMemo(() => summarizePlan(shown.nestings, shown.remnants, kerfs.data ? kerfOf : undefined), [shown, kerfs.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const deleteMut = useDeleteCuttingPlan()
  const confirm = useConfirm()
  const canDelete = usePermission('cutting-plan', 'delete')
  const canWrite = usePermission('cutting-plan', 'update')

  async function handleDelete() {
    if (!detail) return
    const ok = await confirm({
      title: 'Delete this cutting plan upload?',
      message: `"${planLabel(detail)}" and all its parsed plates, order parts, plate usage, and remnants will be permanently deleted.`,
      variant: 'danger',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync(detail.id)
      toast.success('Cutting plan upload deleted')
      navigate('/cutting-plan')
    } catch (e) {
      toast.error(getErrorMessage(e, 'Failed to delete cutting plan upload. Please try again.'))
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
        <div className="bg-white flex items-center gap-3 border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
          <button onClick={() => navigate('/cutting-plan')} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 32, height: 32, color: '#8E8E8E' }}>
            <ArrowLeft size={16} />
          </button>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#C2C2C2' }}>Loading...</span>
        </div>
        <div className="flex items-center justify-center gap-2 flex-1" style={{ color: '#8E8E8E', fontSize: 13 }}>
          <Loader2 size={20} className="animate-spin" />Loading data...
        </div>
      </div>
    )
  }

  if (isError || !detail) {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
        <div className="bg-white flex items-center gap-3 border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
          <button onClick={() => navigate('/cutting-plan')} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 32, height: 32, color: '#8E8E8E' }}>
            <ArrowLeft size={16} />
          </button>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#C8202A' }}>Not found</span>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 flex-1" style={{ color: '#8E8E8E' }}>
          <Scissors size={40} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 14 }}>Cutting plan upload #{id} not found</div>
          <button onClick={() => navigate('/cutting-plan')} style={{ fontSize: 13, color: '#0C447C', textDecoration: 'underline' }}>Back to Cutting Plan</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      <div className="bg-white flex items-center gap-3 border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <button onClick={() => navigate('/cutting-plan')} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 32, height: 32, color: '#8E8E8E' }}>
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* the labelled line is the title; "0X202 · WH" above it only repeated the codes (2026-11-06) */}
          {detail.project
            ? <PlanMeta plan={detail} size="title" />
            : <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>{planLabel(detail)}</span>}
        </div>
        {canDelete && (
          <button
            onClick={handleDelete}
            disabled={deleteMut.isPending}
            className="flex items-center justify-center rounded disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ width: 32, height: 32, color: '#C8202A', background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#FCEBEB')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div className="flex flex-col flex-1" style={{ overflowY: 'auto', minHeight: 0, padding: '20px 24px 24px', background: '#F9FAFB', gap: 20, display: 'flex' }}>
        {detail.plan_type === 'SHAPE' ? <ShapePlanView detail={detail} /> : (<>
        {/* children keep their height: this column scrolls instead of squeezing the tables (2026-11-06) */}
        {/* composition of this one plan (not averages): the row counts moved into the tab labels (2026-11-07) */}
        {summary && detail.nestings.length > 0 && (
          <PlanSummaryCharts summary={summary} focus={focus} thickness={thickness}
            onThickness={setThickness} kerf={canWrite ? <KerfButton onClick={() => setKerfOpen(true)} /> : <span />} />
        )}
        {kerfOpen && <KerfDialog nestings={detail.nestings} kerfs={kerfs.data ?? []} onClose={() => setKerfOpen(false)} />}
        {detail.nestings.length > 0 && <PlateBalanceCard planLabel={planLabel(detail)} nestings={shown.nestings} remnants={shown.remnants} kerfs={kerfs.data} prices={prices.data} />}

        <DataTabsCard tab={dataTab} onTabChange={setDataTab}
          counts={{ nesting: shown.nestings.length, order_parts: shown.order_parts.length, plate_usage: shown.plate_usages.length, remnants: shown.remnants.length, files: shown.files.length }}>
          {dataTab === 'nesting' && (
            <NestingTable rows={shown.nestings} sheetKg={sheetKg} prices={prices.data} canWrite={canWrite}
              viewable={new Set((detail.files ?? []).filter(f => f.kind === 'DXF').map(f => f.plate_name))}
              onView={plate => navigate(`/cutting-plan/${detail.id}/plate/${encodeURIComponent(plate)}`)} />
          )}
          {dataTab === 'order_parts' && <OrderPartTable key={thickness ?? 'all'} rows={shown.order_parts} canWrite={canWrite} />}
          {dataTab === 'plate_usage' && <PlateUsageTable rows={shown.plate_usages} />}
          {dataTab === 'remnants' && <RemnantTable rows={shown.remnants} plates={detail.nestings} prices={prices.data} />}
          {dataTab === 'files' && <FileTable files={shown.files} />}
        </DataTabsCard>
        </>)}
      </div>
    </div>
  )
}
