import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Search, ChevronRight } from 'lucide-react'
import { useProgressZoneRows } from '../../hooks/useProjectProgress'
import { MobileHeader } from '../../components/mobile/MobileHeader'

const STATUS_DOT: Record<string, string> = {
  notstart: '#C2C2C2',
  fabrication: '#BA7517',
  load: '#185FA5',
  erection: '#639922',
  done: '#27500A',
}

export function MobileAssemblyList() {
  const { code, zoneId } = useParams<{ code: string; zoneId: string }>()
  const navigate = useNavigate()
  const zoneIdNum = zoneId ? Number(zoneId) : null
  const { data, isLoading } = useProgressZoneRows(code, zoneIdNum)
  const [q, setQ] = useState('')

  const rows = (data ?? []).filter(r => !q.trim() || r.mark.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="min-h-screen bg-chrome-50 flex flex-col">
      <MobileHeader title="Assemblies" subtitle={code} onBack={`/m/projects/${code}/zones`} />
      <div className="p-3 flex flex-col gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-chrome-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search mark..."
            className="w-full bg-white border border-chrome-200 rounded-lg pl-9 pr-3 py-3 text-[15px] focus:outline-none focus:border-ssi-600"
          />
        </div>

        {isLoading && <div className="text-center text-chrome-400 text-sm py-10">Loading…</div>}
        {!isLoading && rows.length === 0 && (
          <div className="text-center text-chrome-400 text-sm py-10">No assemblies found</div>
        )}

        <div className="flex flex-col gap-2">
          {rows.map(r => (
            <button
              key={r.assembly_id}
              onClick={() => navigate(`/m/projects/${code}/zones/${zoneId}/assemblies/${r.assembly_id}`)}
              className="flex items-center gap-3 bg-white border border-chrome-100 rounded-xl p-4 text-left active:bg-chrome-50"
            >
              <span
                className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
                style={{ background: STATUS_DOT[r.status] ?? '#C2C2C2' }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="font-mono font-semibold text-chrome-900 text-[14.5px] truncate">{r.mark}</div>
                <div className="text-xs text-chrome-400">
                  Fab {Math.round(r.fab_pct)}% · Load {r.loaded_pcs}/{r.qty ?? 1} · Erect {r.erected_pcs}/{r.qty ?? 1}
                </div>
              </div>
              <ChevronRight size={18} className="text-chrome-200 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
