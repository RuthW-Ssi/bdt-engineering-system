import { type ActivityEntry } from '../../data/dashboardMock'

interface ActivityFeedProps {
  activities: ActivityEntry[]
}

const ENTITY_COLOR: Record<string, string> = {
  dispatch: '#185FA5',
  product:  '#27500A',
  routing:  '#854F0B',
  material: '#C8202A',
  zone:     '#8E8E8E',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <div className="bg-white rounded-xl shadow-card">
      <div className="px-5 py-4 border-b border-chrome-100">
        <h3 className="text-sm font-semibold text-chrome-800">Recent Activity</h3>
      </div>
      <div className="px-5 py-4">
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-chrome-100" />

          <div className="space-y-4">
            {activities.length === 0 && (
              <p className="text-sm text-chrome-400 py-4 text-center">No recent activity</p>
            )}
            {activities.map((a) => (
              <div key={a.id} className="flex items-start gap-3 pl-5 relative">
                {/* Dot */}
                <div
                  className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white"
                  style={{ background: ENTITY_COLOR[a.entity_type] ?? '#8E8E8E' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-chrome-600">
                    <span className="font-medium text-chrome-800">{a.actor}</span>
                    {' '}{a.action}{' '}
                    <span className="font-medium" style={{ color: ENTITY_COLOR[a.entity_type] }}>
                      {a.entity_label}
                    </span>
                  </div>
                  <div className="text-[10px] text-chrome-400 mt-0.5">{relativeTime(a.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
