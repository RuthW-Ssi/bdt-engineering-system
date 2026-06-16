import { Loader2, Sparkles } from 'lucide-react'
import { useRoutingSuggestions } from '../../hooks/useMo'
import type { RoutingTemplateLite } from '../../api/mo'

/** Section 3 · routings that MATCH the selected mark prefix. */
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

  if (isLoading) {
    return <div className="flex items-center" style={{ height: 60, color: '#C2C2C2' }}><Loader2 size={18} className="animate-spin" /></div>
  }

  const suggested = data?.suggested ?? []

  return (
    <div>
      <div className="flex items-center gap-1.5" style={{ fontSize: 11, fontWeight: 700, color: '#1E6B36', marginBottom: 8 }}>
        <Sparkles size={12} /> MATCHING “{markPrefix}”
      </div>
      {suggested.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {suggested.map(t => <RoutingCard key={t.id} t={t} selected={value === t.id} suggested onClick={() => onChange(t.id, t.name)} />)}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: '#999', padding: '4px 0' }}>
          No routing template for mark prefix “{markPrefix}”.
        </div>
      )}
    </div>
  )
}

function RoutingCard({ t, selected, suggested, onClick }: { t: RoutingTemplateLite; selected: boolean; suggested?: boolean; onClick: () => void }) {
  const accent = suggested ? '#1E6B36' : '#888'
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left', padding: '10px 14px', borderRadius: 8, width: '100%',
        border: '1.5px solid ' + (selected ? '#C8202A' : suggested ? '#9BCBA8' : '#D8D8D8'),
        background: selected ? '#FCEBEB' : suggested ? '#F2FAF4' : '#fff', cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: selected ? '#C8202A' : '#1A1A1A' }}>{t.name}</div>
      <div style={{ fontSize: 11, color: accent, marginTop: 2 }}>{t.code} · {t.operation_count} ops</div>
    </button>
  )
}
