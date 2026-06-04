import { type MockProject, type MockZone } from '../../data/dashboardMock'

interface FilterBarProps {
  projects: MockProject[]
  activeProjectId: number
  zones: MockZone[]
  activeZoneId: number | null
  onProjectChange: (projectId: number) => void
  onZoneChange: (zoneId: number | null) => void
}

const STATE_BADGE: Record<string, { label: string; color: string }> = {
  active:    { label: 'Active',    color: '#27500A' },
  planning:  { label: 'Planning',  color: '#185FA5' },
  on_hold:   { label: 'On Hold',   color: '#854F0B' },
  completed: { label: 'Completed', color: '#8E8E8E' },
}

export function FilterBar({ projects, activeProjectId, zones, activeZoneId, onProjectChange, onZoneChange }: FilterBarProps) {
  return (
    <div className="mb-5">
      {/* Project chips */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-xs font-medium text-chrome-400 uppercase tracking-wide mr-1">Project</span>
        {projects.map((p) => {
          const isActive = p.id === activeProjectId
          const badge = STATE_BADGE[p.state]
          return (
            <button
              key={p.id}
              onClick={() => onProjectChange(p.id)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors cursor-pointer',
                isActive
                  ? 'bg-ssi-50 text-ssi-600 border-ssi-200 font-semibold'
                  : 'bg-white text-chrome-600 border-chrome-200 hover:border-chrome-400',
              ].join(' ')}
            >
              {p.project_code}
              <span
                className="text-[10px] font-medium px-1 py-0 rounded"
                style={{ color: badge.color, background: badge.color + '1A' }}
              >
                {badge.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Zone tabs */}
      <div className="flex items-center gap-1 border-b border-chrome-100">
        <button
          onClick={() => onZoneChange(null)}
          className={[
            'px-4 py-2 text-sm border-b-2 -mb-px transition-colors cursor-pointer',
            activeZoneId === null
              ? 'border-ssi-600 text-ssi-600 font-semibold'
              : 'border-transparent text-chrome-400 hover:text-chrome-800',
          ].join(' ')}
        >
          All Zones
        </button>
        {zones.map((z) => (
          <button
            key={z.id}
            onClick={() => onZoneChange(z.id)}
            className={[
              'px-4 py-2 text-sm border-b-2 -mb-px transition-colors cursor-pointer',
              activeZoneId === z.id
                ? 'border-ssi-600 text-ssi-600 font-semibold'
                : 'border-transparent text-chrome-400 hover:text-chrome-800',
            ].join(' ')}
          >
            {z.code}
          </button>
        ))}
      </div>
    </div>
  )
}
