import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Search, Loader2, Scissors, ChevronRight, Trash2 } from 'lucide-react'
import { useCuttingPlans, useDeleteCuttingPlan } from '../hooks/useCuttingPlan'
import type { CuttingPlanListItem } from '../api/cutting-plan'
import { PaginationBar } from '../components/PaginationBar'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { getErrorMessage } from '../lib/getErrorMessage'

const LIMIT = 10

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function CuttingPlanList() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useCuttingPlans({
    search: search || undefined,
  })
  const items = data ?? []
  const totalPages = Math.max(1, Math.ceil(items.length / LIMIT))
  const pagedItems = items.slice((page - 1) * LIMIT, page * LIMIT)
  const deleteMut = useDeleteCuttingPlan()
  const confirm = useConfirm()

  function handleSearch(q: string) { setSearch(q); setPage(1) }

  async function handleDelete(cp: CuttingPlanListItem) {
    const ok = await confirm({
      title: 'Delete this cutting plan upload?',
      message: `"${cp.tag}" and all its parsed plates, order parts, plate usage, and remnants will be permanently deleted.`,
      variant: 'danger',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync(cp.id)
      toast.success('Cutting plan upload deleted')
    } catch (e) {
      toast.error(getErrorMessage(e, 'Failed to delete cutting plan upload. Please try again.'))
    }
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Cutting Plan</span>
          <span style={{ color: '#C2C2C2' }}>·</span>
          <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
            {isLoading ? '...' : `${items.length} uploads`}
          </span>
        </div>
        <button
          onClick={() => navigate('/cutting-plan/upload')}
          className="flex items-center gap-1.5 rounded-md text-white"
          style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A', border: 'none', cursor: 'pointer' }}
        >
          <Plus size={14} />New Upload
        </button>
      </div>

      <div className="border-b border-chrome-100 px-6 flex items-center gap-3" style={{ minHeight: 48, background: '#F5F5F5', flexShrink: 0, flexWrap: 'wrap', paddingTop: 8, paddingBottom: 8 }}>
        <div className="relative">
          <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search project code / name / tag..."
            style={{ paddingLeft: 32, paddingRight: 12, height: 32, fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', width: 280 }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isLoading ? (
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <Loader2 size={20} className="animate-spin" style={{ color: '#C2C2C2' }} />
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 200, color: '#8E8E8E', fontSize: 14 }}>
            No cutting plan uploads found
          </div>
        ) : (
          pagedItems.map(cp => (
            <div
              key={cp.id}
              onClick={() => navigate(`/cutting-plan/${cp.id}`)}
              className="group"
              style={{
                border: '1px solid #E0E0E0', borderRadius: 8, background: '#fff',
                padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#FAFAFA')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
            >
              <div style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0, background: '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Scissors size={18} style={{ color: '#8E8E8E' }} />
              </div>
              <div style={{ minWidth: 140 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>{cp.tag}</div>
                <div style={{ fontSize: 12, color: '#8E8E8E', marginTop: 2 }}>
                  {cp.description || '—'}
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', gap: 24, fontSize: 12, color: '#666' }}>
                <span><strong style={{ color: '#333' }}>{cp._count.nestings}</strong> plates</span>
                <span><strong style={{ color: '#333' }}>{cp._count.order_parts}</strong> parts</span>
                <span>Uploaded: <strong style={{ color: '#333' }}>{fmtDate(cp.create_date)}</strong></span>
              </div>
              <button
                onClick={e => { e.stopPropagation(); handleDelete(cp) }}
                style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#C8202A', flexShrink: 0 }}
                onMouseEnter={e => (e.currentTarget.style.background = '#FCEBEB')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <Trash2 size={14} />
              </button>
              <ChevronRight size={16} style={{ color: '#C2C2C2', flexShrink: 0 }} />
            </div>
          ))
        )}
      </div>
      <PaginationBar page={page} totalPages={totalPages} total={items.length} limit={LIMIT} onChange={setPage} />
    </div>
  )
}
