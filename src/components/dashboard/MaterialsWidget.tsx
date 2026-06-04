import { ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { type MaterialSummary } from '../../data/dashboardMock'

interface MaterialsWidgetProps {
  materials: MaterialSummary
}

const STATE_STYLE: Record<string, { bg: string; text: string }> = {
  confirmed:  { bg: '#D1F2E0', text: '#065F46' },
  to_approve: { bg: '#FAEEDA', text: '#854F0B' },
  draft:      { bg: '#F5F5F5', text: '#555555' },
}

export function MaterialsWidget({ materials }: MaterialsWidgetProps) {
  const navigate = useNavigate()
  return (
    <div className="bg-white rounded-xl shadow-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-chrome-100">
        <h3 className="text-sm font-semibold text-chrome-800">Materials Catalog</h3>
        <button
          onClick={() => navigate('/materials')}
          className="flex items-center gap-1 text-xs text-steel-600 hover:text-steel-800 cursor-pointer"
        >
          View all <ExternalLink size={12} />
        </button>
      </div>

      {/* Stat badges */}
      <div className="flex gap-3 px-5 py-4 border-b border-chrome-50">
        {[
          { label: 'Total',   value: materials.total,   color: '#3A3A3A' },
          { label: 'Paint',   value: materials.paint,   color: '#C8202A' },
          { label: 'Welding', value: materials.welding, color: '#185FA5' },
        ].map((s) => (
          <div key={s.label} className="flex-1 text-center">
            <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-chrome-400 uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Recent rows */}
      <div className="px-5 py-3 space-y-2">
        {materials.recent.map((m) => {
          const s = STATE_STYLE[m.state] ?? STATE_STYLE.draft
          return (
            <div key={m.code} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-xs font-mono text-chrome-400 mr-1.5">{m.code}</span>
                <span className="text-xs text-chrome-700 truncate">{m.name}</span>
              </div>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                style={{ background: s.bg, color: s.text }}
              >
                {m.state.replace('_', ' ')}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
