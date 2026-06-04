import { Package, FileStack, Boxes, Puzzle, AlertTriangle } from 'lucide-react'
import { type KpiScope } from '../../data/dashboardMock'

interface KPIStripProps {
  kpi: KpiScope
}

interface KPICardDef {
  key: keyof KpiScope
  label: string
  icon: React.ReactNode
  color: string
  delta: string
}

const CARDS: KPICardDef[] = [
  { key: 'products',   label: 'Products',        icon: <Package size={20} />,       color: '#185FA5', delta: '↑ 8 this week' },
  { key: 'dispatches', label: 'BOM Dispatches',  icon: <FileStack size={20} />,     color: '#3A3A3A', delta: '↑ 2 this week' },
  { key: 'assemblies', label: 'Assemblies',      icon: <Boxes size={20} />,         color: '#27500A', delta: '↑ 5 this week' },
  { key: 'parts',      label: 'Parts',           icon: <Puzzle size={20} />,        color: '#854F0B', delta: '↑ 12 this week' },
  { key: 'alerts',     label: 'Alerts',          icon: <AlertTriangle size={20} />, color: '',        delta: '' },
]

export function KPIStrip({ kpi }: KPIStripProps) {
  return (
    <div className="flex gap-4 flex-wrap mb-5">
      {CARDS.map(({ key, label, icon, color, delta }) => {
        const value = kpi[key]
        const isAlerts = key === 'alerts'
        const iconColor = isAlerts ? (value > 0 ? '#C8202A' : '#8E8E8E') : color
        return (
          <div
            key={key}
            className="bg-white rounded-xl p-5 shadow-card flex-1 min-w-[160px]"
          >
            <div className="flex items-center justify-between mb-3">
              <span style={{ color: iconColor }}>{icon}</span>
              {!isAlerts && delta && (
                <span className="text-xs text-molten-600">{delta}</span>
              )}
              {isAlerts && value > 0 && (
                <span className="text-xs text-ssi-600 font-medium">Needs attention</span>
              )}
            </div>
            <div className="text-3xl font-bold text-chrome-900 mb-1" style={{ color: isAlerts && value > 0 ? '#C8202A' : undefined }}>
              {value.toLocaleString()}
            </div>
            <div className="text-xs text-chrome-400 uppercase tracking-wide">{label}</div>
          </div>
        )
      })}
    </div>
  )
}
