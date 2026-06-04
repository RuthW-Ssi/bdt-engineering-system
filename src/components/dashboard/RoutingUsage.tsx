import { type RoutingTemplateUsage } from '../../data/dashboardMock'

interface RoutingUsageProps {
  data: RoutingTemplateUsage[]
}

export function RoutingUsage({ data }: RoutingUsageProps) {
  return (
    <div className="bg-white rounded-xl shadow-card">
      <div className="px-5 py-4 border-b border-chrome-100">
        <h3 className="text-sm font-semibold text-chrome-800">Routing Template Usage</h3>
      </div>
      <div className="px-5 py-4 space-y-3">
        {data.map((r) => (
          <div key={r.template_code}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-chrome-600">{r.template_name}</span>
              <span className="font-mono text-chrome-400">{r.count}</span>
            </div>
            <div className="h-1.5 rounded-full bg-chrome-100">
              <div
                className="h-1.5 rounded-full bg-steel-600 transition-all"
                style={{ width: `${(r.count / r.max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
