import { useState } from 'react'
import { Loader2, Sparkles, Eye } from 'lucide-react'
import { useRoutingSuggestions } from '../../hooks/useMo'
import { RoutingDetailModal } from './RoutingDetailModal'
import type { RoutingTemplateLite } from '../../api/mo'

export function RoutingSuggestion({
  markPrefix,
  value,
  onChange,
}: {
  markPrefix: string
  value: number | null
  onChange: (id: number, name: string) => void
}) {
  const { data, isLoading } = useRoutingSuggestions(markPrefix)
  const [detailId, setDetailId] = useState<number | null>(null)

  if (isLoading) {
    return <div className="flex items-center" style={{ height: 60, color: '#C2C2C2' }}><Loader2 size={18} className="animate-spin" /></div>
  }

  const suggested = data?.suggested ?? []

  return (
    <>
      <div>
        <div className="flex items-center gap-1.5" style={{ fontSize: 11, fontWeight: 700, color: '#C8202A', marginBottom: 8 }}>
          <Sparkles size={12} /> MATCHING "{markPrefix}"
        </div>
        {suggested.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suggested.map(t => (
              <RoutingCard
                key={t.id}
                t={t}
                selected={value === t.id}
                suggested
                onClick={() => onChange(t.id, t.name)}
                onDetail={() => setDetailId(t.id)}
              />
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#999', padding: '4px 0' }}>
            No routing template for mark prefix "{markPrefix}".
          </div>
        )}
      </div>

      {detailId != null && (
        <RoutingDetailModal id={detailId} onClose={() => setDetailId(null)} />
      )}
    </>
  )
}

function RoutingCard({
  t, selected, suggested, onClick, onDetail,
}: {
  t: RoutingTemplateLite
  selected: boolean
  suggested?: boolean
  onClick: () => void
  onDetail: () => void
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onClick}
        style={{
          textAlign: 'left', padding: '10px 44px 10px 14px', borderRadius: 8, width: '100%',
          border: '1.5px solid ' + (selected ? '#C8202A' : '#E8E8E8'),
          background: selected ? '#FCEBEB' : '#fff', cursor: 'pointer',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: selected ? '#C8202A' : '#1A1A1A' }}>{t.name}</div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{t.code} · {t.operation_count} ops</div>
      </button>
      <button
        onClick={e => { e.stopPropagation(); onDetail() }}
        title="View details"
        style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', color: '#BBB', padding: 4,
          display: 'flex', alignItems: 'center',
        }}
      >
        <Eye size={14} />
      </button>
    </div>
  )
}
