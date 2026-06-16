import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plus, Package, Wrench } from 'lucide-react'
import { useMos } from '../hooks/useMo'
import { useWos } from '../hooks/useWo'
import { MoList } from './MoList'
import { WoList } from './WoList'

type HubTab = 'mo' | 'wo'

/**
 * T-WO.08 · Order Hub — single sidebar entry, MO ↔ WO as in-page tabs (US-WO.05).
 * Tab state lives in the URL (?tab=mo|wo) so deep links + the /mo alias work.
 */
export function OrderHub() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const tab: HubTab = params.get('tab') === 'wo' ? 'wo' : 'mo'

  const { data: mos } = useMos({})
  const { data: wos } = useWos({})

  const setTab = (t: HubTab) => {
    const p = new URLSearchParams(params)
    p.set('tab', t)
    setParams(p)
  }

  const tabBtn = (t: HubTab, icon: React.ReactNode, label: string, count: number | undefined) => {
    const active = tab === t
    return (
      <button
        onClick={() => setTab(t)}
        style={{
          height: 56, padding: '0 18px', fontSize: 14, fontWeight: 600, background: 'none', cursor: 'pointer',
          border: 'none', borderBottom: '3px solid ' + (active ? '#C8202A' : 'transparent'),
          color: active ? '#C8202A' : '#888', display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        {icon}{label}
        <span style={{ background: active ? '#C8202A' : '#EEE', color: active ? '#fff' : '#888', padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
          {count ?? '—'}
        </span>
      </button>
    )
  }

  return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Hub header · title + tab switcher */}
      <div className="bg-white border-b border-chrome-100 px-6 flex items-center" style={{ height: 56, flexShrink: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F', marginRight: 20 }}>Order</span>
        {tabBtn('mo', <Package size={16} />, 'Manufacturing Order', mos?.length)}
        {tabBtn('wo', <Wrench size={16} />, 'Work Order', wos?.length)}
        <div style={{ flex: 1 }} />
        {tab === 'mo' && (
          <button
            onClick={() => navigate('/mo/new')}
            className="flex items-center gap-1.5 rounded-md text-white"
            style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A', border: 'none', cursor: 'pointer' }}
          >
            <Plus size={14} />New MO
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'mo' ? <MoList embedded /> : <WoList />}
      </div>
    </div>
  )
}
