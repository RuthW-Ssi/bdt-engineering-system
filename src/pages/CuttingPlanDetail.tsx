import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Scissors, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCuttingPlan, useBulkAssignOrderPartProjectCode, useDeleteCuttingPlan } from '../hooks/useCuttingPlan'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { getErrorMessage } from '../lib/getErrorMessage'
import type {
  CuttingPlanNestingRow, CuttingPlanOrderPartRow, CuttingPlanPlateUsageRow, CuttingPlanRemnantRow,
} from '../api/cutting-plan'

type DataTab = 'nesting' | 'order_parts' | 'plate_usage' | 'remnants'

const DATA_TABS: { id: DataTab; label: string }[] = [
  { id: 'nesting', label: 'Plates' },
  { id: 'order_parts', label: 'Order Parts' },
  { id: 'plate_usage', label: 'Plate Usage' },
  { id: 'remnants', label: 'Remnants' },
]

function fmt(v: number | string | null): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString('en', { maximumFractionDigits: 2 }) : String(v)
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#111827', lineHeight: 1, marginTop: 9 }}>{value}</div>
    </div>
  )
}

// Tab bar mirrors BomList.tsx's CONTENT_TABS pattern — one table visible at a
// time instead of stacking all 4 (nesting rows in particular can run long).
function DataTabsCard({ tab, onTabChange, children }: {
  tab: DataTab
  onTabChange: (tab: DataTab) => void
  children: React.ReactNode
}) {
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
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
            {t.label}
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
  return (
    <div style={{
      padding: '8px 16px', fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.03em',
      borderBottom: '1px solid #F0F0F0', background: '#fff', position: 'sticky', top: 0, zIndex: 1,
    }}>
      {children}
    </div>
  )
}

function TD({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ padding: '8px 16px', fontSize: 12, color: '#1F1F1F', borderBottom: '1px solid #F5F5F5', ...style }}>{children}</div>
}

function NestingTable({ rows }: { rows: CuttingPlanNestingRow[] }) {
  if (rows.length === 0) return <div style={{ padding: 20, fontSize: 12, color: '#8E8E8E' }}>No plates</div>
  return (
    <TableGrid columns="1fr 1fr 1.5fr 1fr 1fr 0.8fr">
      <TH>Plate Number</TH><TH>Mark</TH><TH>Quality / Dimensions</TH><TH>Weight (kg)</TH><TH>Nesting %</TH><TH>Parts</TH>
      {rows.map(r => (
        <div key={r.id} style={{ display: 'contents' }}>
          <TD>{r.plate_number ?? '—'}</TD>
          <TD style={{ fontFamily: 'monospace' }}>{r.cuttingplan_number}</TD>
          <TD>{r.quality ?? '—'} · {fmt(r.thick_mm)}×{fmt(r.width_mm)}×{fmt(r.length_mm)} mm</TD>
          <TD>{fmt(r.weight_kg)}</TD>
          <TD>{r.nesting_percent != null ? `${fmt(r.nesting_percent)}%` : '—'}</TD>
          <TD>{r.count ?? '—'}</TD>
        </div>
      ))}
    </TableGrid>
  )
}

function OrderPartTable({ rows }: { rows: CuttingPlanOrderPartRow[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkCode, setBulkCode] = useState('')
  const bulkAssign = useBulkAssignOrderPartProjectCode()

  if (rows.length === 0) return <div style={{ padding: 20, fontSize: 12, color: '#8E8E8E' }}>No order parts</div>

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
      {selected.size > 0 && (
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
      <TableGrid columns="32px 1.5fr 1fr 1fr 1fr 1fr 1fr 1fr">
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #F0F0F0', background: '#fff', position: 'sticky', top: 0, zIndex: 1 }}>
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
        </div>
        <TH>Drawing</TH><TH>Order Number</TH><TH>Project Code</TH><TH>Nested</TH><TH>Ordered</TH><TH>Dimensions (mm)</TH><TH>Weight (kg)</TH>
        {rows.map(r => (
          <div key={r.id} style={{ display: 'contents' }}>
            <TD><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} /></TD>
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

function RemnantTable({ rows }: { rows: CuttingPlanRemnantRow[] }) {
  if (rows.length === 0) return <div style={{ padding: 20, fontSize: 12, color: '#8E8E8E' }}>No remnants</div>
  return (
    <TableGrid columns="1fr 1fr 1fr 1fr 0.6fr">
      <TH>Plate Number</TH><TH>Dimensions (mm)</TH><TH>Area (m²)</TH><TH>Weight (kg)</TH><TH>Count</TH>
      {rows.map(r => (
        <div key={r.id} style={{ display: 'contents' }}>
          <TD>{r.plate_number ?? '—'}</TD>
          <TD>{fmt(r.length_mm)} × {fmt(r.width_mm)}</TD>
          <TD>{fmt(r.area_m2)}</TD>
          <TD>{fmt(r.weight_kg)}</TD>
          <TD>{r.count ?? '—'}</TD>
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
  const deleteMut = useDeleteCuttingPlan()
  const confirm = useConfirm()

  async function handleDelete() {
    if (!detail) return
    const ok = await confirm({
      title: 'Delete this cutting plan upload?',
      message: `"${detail.tag}" and all its parsed plates, order parts, plate usage, and remnants will be permanently deleted.`,
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
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>{detail.tag}</span>
        </div>
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
      </div>

      <div className="flex flex-col flex-1" style={{ overflowY: 'auto', minHeight: 0, padding: '20px 24px 24px', background: '#F9FAFB', gap: 20, display: 'flex' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <StatCard label="Plates" value={detail.nestings.length} />
          <StatCard label="Order Parts" value={detail.order_parts.length} />
          <StatCard label="Plate Usage" value={detail.plate_usages.length} />
          <StatCard label="Remnants" value={detail.remnants.length} />
        </div>

        <DataTabsCard tab={dataTab} onTabChange={setDataTab}>
          {dataTab === 'nesting' && <NestingTable rows={detail.nestings} />}
          {dataTab === 'order_parts' && <OrderPartTable rows={detail.order_parts} />}
          {dataTab === 'plate_usage' && <PlateUsageTable rows={detail.plate_usages} />}
          {dataTab === 'remnants' && <RemnantTable rows={detail.remnants} />}
        </DataTabsCard>
      </div>
    </div>
  )
}
