import { type LibrarySlice } from '../../data/dashboardMock'

interface LibraryDonutProps {
  data: LibrarySlice[]
}

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function buildArcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polarToXY(cx, cy, r, startDeg)
  const end = polarToXY(cx, cy, r, endDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`
}

export function LibraryDonut({ data }: LibraryDonutProps) {
  const total = data.reduce((s, d) => s + d.count, 0)
  const CX = 100, CY = 100, R = 80

  // Build slices from cumulative angles
  let cursor = 0
  const slices = data.map((slice) => {
    const startDeg = cursor
    const spanDeg = (slice.count / total) * 360
    cursor += spanDeg
    return { ...slice, startDeg, endDeg: cursor }
  })

  return (
    <div className="bg-white rounded-xl shadow-card">
      <div className="px-5 py-4 border-b border-chrome-100">
        <h3 className="text-sm font-semibold text-chrome-800">Product Library Distribution</h3>
      </div>
      <div className="px-5 py-4 flex items-center gap-6">
        {/* SVG donut */}
        <div className="shrink-0">
          <svg width={140} height={140} viewBox="0 0 200 200">
            {slices.map((s) => (
              <path key={s.library_code} d={buildArcPath(CX, CY, R, s.startDeg, s.endDeg)} fill={s.color} />
            ))}
            {/* Donut hole */}
            <circle cx={CX} cy={CY} r={50} fill="white" />
            <text x={CX} y={CY - 6} textAnchor="middle" fontSize={22} fontWeight="700" fill="#1F1F1F">{total}</text>
            <text x={CX} y={CY + 12} textAnchor="middle" fontSize={10} fill="#8E8E8E">products</text>
          </svg>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2 min-w-0">
          {data.map((s) => (
            <div key={s.library_code} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                <span className="text-chrome-600 truncate">{s.library_name}</span>
              </div>
              <span className="font-mono text-chrome-400 shrink-0">{s.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
