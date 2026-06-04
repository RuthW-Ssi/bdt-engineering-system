import { CheckCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { type AlertEntry } from '../../data/dashboardMock'

interface AlertsWidgetProps {
  alerts: AlertEntry[]
}

const SEVERITY_META: Record<string, { dot: string; border: string; bg: string; text: string }> = {
  high:   { dot: '#C8202A', border: '#F5C4C4', bg: '#FCEBEB', text: '#8A1520' },
  medium: { dot: '#BA7517', border: '#FAC775', bg: '#FAEEDA', text: '#5A3500' },
  low:    { dot: '#185FA5', border: '#B5D4F4', bg: '#E6F1FB', text: '#0C447C' },
}

export function AlertsWidget({ alerts }: AlertsWidgetProps) {
  const navigate = useNavigate()
  return (
    <div className="bg-white rounded-xl shadow-card h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-chrome-100">
        <h3 className="text-sm font-semibold text-chrome-800">Needs Attention</h3>
        {alerts.length > 0 && (
          <span className="text-xs bg-ssi-50 text-ssi-600 border border-ssi-100 px-2 py-0.5 rounded-full font-medium">
            {alerts.length}
          </span>
        )}
      </div>
      <div className="px-5 py-4 space-y-3">
        {alerts.length === 0 && (
          <div className="flex flex-col items-center py-8 text-green-600 gap-2">
            <CheckCircle size={28} />
            <span className="text-sm font-medium">All clear</span>
          </div>
        )}
        {alerts.map((a) => {
          const m = SEVERITY_META[a.severity]
          return (
            <div
              key={a.id}
              className="rounded-lg border-l-4 p-3"
              style={{ borderLeftColor: m.dot, background: m.bg, borderColor: m.border + ' ' + m.border + ' ' + m.border + ' ' + m.dot }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold mb-0.5" style={{ color: m.text }}>{a.title}</div>
                  <div className="text-xs text-chrome-500">{a.detail}</div>
                </div>
                <button
                  onClick={() => navigate(a.action_path)}
                  className="text-xs font-medium whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                  style={{ color: m.dot }}
                >
                  {a.action_label} →
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
