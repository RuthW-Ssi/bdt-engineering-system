import { useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, Layers } from 'lucide-react'
import { useProgressOverview } from '../../hooks/useProjectProgress'
import { MobileHeader } from '../../components/mobile/MobileHeader'

export function MobileZoneList() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useProgressOverview(code)
  const zones = data?.zones ?? []

  return (
    <div className="min-h-screen bg-chrome-50 flex flex-col">
      <MobileHeader title={code ?? 'Zones'} subtitle="Select a zone" onBack="/m/projects" />
      <div className="p-3 flex flex-col gap-2">
        {isLoading && <div className="text-center text-chrome-400 text-sm py-10">Loading…</div>}
        {!isLoading && zones.length === 0 && (
          <div className="text-center text-chrome-400 text-sm py-10">No zones found</div>
        )}
        {zones.map(z => (
          <button
            key={z.zone_id}
            onClick={() => navigate(`/m/projects/${code}/zones/${z.zone_id}`)}
            className="flex items-center gap-3 bg-white border border-chrome-100 rounded-xl p-4 text-left active:bg-chrome-50"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-steel-50 flex items-center justify-center">
              <Layers size={18} className="text-steel-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-chrome-900 text-[15px] truncate">{z.zone_label}</div>
              <div className="text-xs text-chrome-400 font-mono">{z.zone_code} · {z.assembly_count} pcs · Fab {Math.round(z.fab_pct)}%</div>
            </div>
            <ChevronRight size={18} className="text-chrome-200 flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  )
}
