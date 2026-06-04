import { ArrowUpRight, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { type MockDispatch } from '../../data/dashboardMock'

interface DispatchesWidgetProps {
  dispatches: MockDispatch[]
}

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  complete: { label: 'Complete', bg: '#D1F2E0', text: '#065F46' },
  partial:  { label: 'Partial',  bg: '#FAEEDA', text: '#854F0B' },
  pending:  { label: 'Pending',  bg: '#F5F5F5', text: '#555555' },
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })
}

export function DispatchesWidget({ dispatches }: DispatchesWidgetProps) {
  const navigate = useNavigate()
  return (
    <div className="bg-white rounded-xl shadow-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-chrome-100">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-chrome-800">Recent BOM Dispatches</h3>
          <span className="text-xs bg-chrome-100 text-chrome-600 px-2 py-0.5 rounded-full">{dispatches.length}</span>
        </div>
        <button
          onClick={() => navigate('/bom')}
          className="flex items-center gap-1 text-xs text-steel-600 hover:text-steel-800 cursor-pointer"
        >
          View all <ExternalLink size={12} />
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-chrome-400 uppercase tracking-wide border-b border-chrome-100">
              <th className="px-5 py-3 text-left font-medium">#</th>
              <th className="px-3 py-3 text-left font-medium">Zone</th>
              <th className="px-3 py-3 text-left font-medium">Status</th>
              <th className="px-3 py-3 text-right font-medium">Asm.</th>
              <th className="px-3 py-3 text-right font-medium">Parts</th>
              <th className="px-3 py-3 text-right font-medium">Weight (kg)</th>
              <th className="px-3 py-3 text-left font-medium">Uploaded</th>
              <th className="px-3 py-3 text-left font-medium">By</th>
              <th className="px-5 py-3 text-left font-medium" />
            </tr>
          </thead>
          <tbody>
            {dispatches.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-chrome-400 text-sm">
                  No dispatches in this scope
                </td>
              </tr>
            )}
            {dispatches.map((d) => {
              const s = STATUS_META[d.status]
              return (
                <tr key={d.id} className="border-b border-chrome-50 hover:bg-chrome-50 transition-colors">
                  <td className="px-5 py-3 text-chrome-600 font-mono text-xs">#{d.id}</td>
                  <td className="px-3 py-3 text-chrome-800">{d.zone_label}</td>
                  <td className="px-3 py-3">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: s.bg, color: s.text }}
                    >
                      {s.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-chrome-600 font-mono">{d.assembly_count}</td>
                  <td className="px-3 py-3 text-right text-chrome-600 font-mono">{d.part_count}</td>
                  <td className="px-3 py-3 text-right text-chrome-600 font-mono">{d.total_weight_kg.toLocaleString()}</td>
                  <td className="px-3 py-3 text-chrome-400 text-xs">{fmt(d.uploaded_at)}</td>
                  <td className="px-3 py-3 text-chrome-400 text-xs">{d.uploader_name}</td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => navigate(`/bom/dispatch/${d.id}`)}
                      className="text-chrome-400 hover:text-steel-600 cursor-pointer transition-colors"
                    >
                      <ArrowUpRight size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
