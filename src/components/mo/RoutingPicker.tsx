import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Info, Loader2, Search } from 'lucide-react'
import { apiClient } from '../../api/client'
import type { RoutingTemplateLite } from '../../api/mo'
import { RoutingCard } from './RoutingSuggestion'
import { RoutingDetailModal } from './RoutingDetailModal'

// Every active routing (2026-10-07: MO type replaced the mark prefix, so
// routings are no longer suggested by prefix — the user picks any of them).
// PRE_SHOP MOs get op 000 "Build-up(Pre-Shop)" in front of the chosen routing.
export function RoutingPicker({ value, onChange, preshop }: { value: number | null; onChange: (id: number, name: string) => void; preshop: boolean }) {
  const [q, setQ] = useState('')
  const [detailId, setDetailId] = useState<number | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['routing-templates', 'all-active'],
    queryFn: async () => (await apiClient.get<{ data: RoutingTemplateLite[] }>('/routing-templates', { params: { limit: 100 } })).data.data,
  })
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (data ?? []).filter(t => !s || t.name.toLowerCase().includes(s) || t.code.toLowerCase().includes(s))
  }, [data, q])

  return (
    <>
      {preshop && (
        <div className="flex items-start gap-1.5" style={{ fontSize: 11.5, color: '#41566F', background: '#EEF2F6', borderRadius: 6, padding: '7px 9px', marginBottom: 10 }}>
          <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Pre-shop: ระบบเพิ่ม <strong>Op 000 · Build-up(Pre-Shop)</strong> ไว้หน้าสุดของ routing ที่เลือก</span>
        </div>
      )}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#AAA' }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา routing…"
          style={{ width: '100%', padding: '6px 8px 6px 28px', fontSize: 12.5, border: '1px solid #D4D4D4', borderRadius: 6 }} />
      </div>
      {isLoading ? (
        <div className="flex items-center" style={{ height: 60, color: '#C2C2C2' }}><Loader2 size={18} className="animate-spin" /></div>
      ) : list.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map(t => <RoutingCard key={t.id} t={t} selected={value === t.id} onClick={() => onChange(t.id, t.name)} onDetail={() => setDetailId(t.id)} />)}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: '#999' }}>ไม่พบ routing</div>
      )}
      {detailId != null && <RoutingDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </>
  )
}
