import { type ZoneProgressEntry } from '../../data/dashboardMock'

interface ZoneProgressProps {
  zones: ZoneProgressEntry[]
  activeZoneId: number | null
  onZoneClick: (zoneId: number) => void
}

function getProgressTier(pct: number): { bar: string; text: string; label: string } {
  if (pct >= 80) return { bar: '#27500A', text: '#065F46', label: 'On track' }
  if (pct >= 50) return { bar: '#185FA5', text: '#185FA5', label: 'In progress' }
  if (pct >= 25) return { bar: '#BA7517', text: '#854F0B', label: 'Behind' }
  return               { bar: '#C8202A', text: '#C8202A', label: 'At risk' }
}

export function ZoneProgress({ zones, activeZoneId, onZoneClick }: ZoneProgressProps) {
  return (
    <div className="bg-white rounded-xl shadow-card h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-chrome-100">
        <h3 className="text-sm font-semibold text-chrome-800">Zone Progress</h3>
        <span className="text-xs text-chrome-400">{zones.length} zones</span>
      </div>
      <div className="px-5 py-4 space-y-4">
        {zones.length === 0 && (
          <p className="text-sm text-chrome-400 py-4 text-center">No zones found</p>
        )}
        {zones.map((z) => {
          const tier = getProgressTier(z.progress_pct)
          const isActive = activeZoneId === z.zone_id
          return (
            <div
              key={z.zone_id}
              onClick={() => onZoneClick(z.zone_id)}
              className={[
                'cursor-pointer rounded-lg p-2 -mx-2 transition-colors',
                isActive ? 'bg-ssi-50' : 'hover:bg-chrome-50',
              ].join(' ')}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-chrome-800">{z.zone_label}</span>
                <span className="text-xs text-chrome-400 font-mono">
                  {z.dispatched}/{z.total} · {z.progress_pct}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-chrome-100">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${z.progress_pct}%`, background: tier.bar }}
                />
              </div>
              <div className="mt-1 text-xs font-medium" style={{ color: tier.text }}>
                {tier.label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
