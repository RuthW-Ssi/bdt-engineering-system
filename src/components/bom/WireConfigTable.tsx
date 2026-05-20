import { useRef } from 'react'
import { WireDropdown } from './WireDropdown'
import type { WeldingConfigPartDto, WeldingPartType } from '../../api/welding'

export interface WireCell { material_id: number | null }

interface Props {
  parts: WeldingConfigPartDto[]
  cellState: Map<number, WireCell>
  onCellChange: (partId: number, value: WireCell) => void
  selectedRows: Set<number>
  onRowSelect: (partId: number, checked: boolean, shiftKey?: boolean) => void
  onSelectAll: (checked: boolean) => void
}

const TYPE_STYLE: Record<WeldingPartType, { bg: string; color: string }> = {
  'TA-w': { bg: '#FEF3C7', color: '#92400E' },
  'TA-f': { bg: '#F3F4F6', color: '#6B7280' },
  'TA-m': { bg: '#DBEAFE', color: '#1E40AF' },
  'TA-p': { bg: '#D1FAE5', color: '#065F46' },
  'unknown': { bg: '#FEE2E2', color: '#991B1B' },
}

function estimatePathM(part: WeldingConfigPartDto): string {
  if (part.part_type === 'TA-f') return '—'
  if (part.part_type === 'TA-w') {
    if (!part.length_mm) return '?'
    return (part.length_mm * 4 / 1000).toFixed(3)
  }
  if (part.part_type === 'TA-p') {
    if (!part.length_mm || !part.profile) return '?'
    const w = parseWidthFE(part.profile)
    if (!w) return '?'
    return ((w + part.length_mm) * 2 / 1000 * 0.75).toFixed(3)
  }
  if (part.part_type === 'TA-m') {
    if (!part.profile) return '?'
    const p = parsePerimeterFE(part.profile)
    if (!p) return '?'
    return (p / 1000).toFixed(3)
  }
  return '?'
}

function parseWidthFE(profile: string): number | null {
  const m = profile.trim().toUpperCase().match(/^(?:PL|PLT)\s*\d+(?:\.\d+)?[X*×](\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : null
}

function parsePerimeterFE(profile: string): number | null {
  const p = profile.trim().toUpperCase()
  const hc = p.match(/^[HC]\s*(\d+(?:\.\d+)?)[X*×](\d+(?:\.\d+)?)/)
  if (hc) return 2 * (parseFloat(hc[1]) + parseFloat(hc[2]))
  const angle = p.match(/^L\s*(\d+(?:\.\d+)?)[X*×](\d+(?:\.\d+)?)/)
  if (angle) return 2 * (parseFloat(angle[1]) + parseFloat(angle[2]))
  const chs = p.match(/^(?:CHS|PIPE)\s*(\d+(?:\.\d+)?)/)
  if (chs) return Math.PI * parseFloat(chs[1])
  const rhs = p.match(/^RHS\s*(\d+(?:\.\d+)?)[X*×](\d+(?:\.\d+)?)/)
  if (rhs) return 2 * (parseFloat(rhs[1]) + parseFloat(rhs[2]))
  const shs = p.match(/^SHS\s*(\d+(?:\.\d+)?)/)
  if (shs) return 4 * parseFloat(shs[1])
  return null
}

const TH: React.CSSProperties = { position: 'sticky', top: 0, background: '#F5F5F5', padding: '6px 8px', fontSize: 11, fontWeight: 600, color: '#555', textAlign: 'left', borderBottom: '1px solid #E8E8E8', whiteSpace: 'nowrap', zIndex: 1 }
const TD: React.CSSProperties = { padding: '4px 8px', fontSize: 12, color: '#1A1A1A', verticalAlign: 'middle' }

export function WireConfigTable({ parts, cellState, onCellChange, selectedRows, onRowSelect, onSelectAll }: Props) {
  const lastSelectedRef = useRef<number | null>(null)
  const allSelected = parts.length > 0 && selectedRows.size === parts.length

  const handleRowClick = (partId: number, e: React.MouseEvent) => {
    const isChecked = !selectedRows.has(partId)
    if (e.shiftKey && lastSelectedRef.current !== null) {
      const ids = parts.map(p => p.part_id)
      const a = ids.indexOf(lastSelectedRef.current)
      const b = ids.indexOf(partId)
      const [lo, hi] = a < b ? [a, b] : [b, a]
      for (let i = lo; i <= hi; i++) onRowSelect(ids[i], isChecked)
    } else {
      onRowSelect(partId, isChecked)
    }
    lastSelectedRef.current = partId
  }

  return (
    <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <colgroup>
          <col style={{ width: 32 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 60 }} />
          <col style={{ width: 72 }} />
          <col />
          <col style={{ width: 72 }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...TH, textAlign: 'center' }}>
              <input type="checkbox" checked={allSelected} onChange={e => onSelectAll(e.target.checked)} />
            </th>
            <th style={TH}>Part Mark</th>
            <th style={TH}>Profile</th>
            <th style={TH}>Type</th>
            <th style={{ ...TH, textAlign: 'right' }}>Length (mm)</th>
            <th style={TH}>Wire Material</th>
            <th style={{ ...TH, textAlign: 'right' }}>Est. path_m</th>
          </tr>
        </thead>
        <tbody>
          {parts.map(part => {
            const isSelected = selectedRows.has(part.part_id)
            const cell = cellState.get(part.part_id) ?? { material_id: null }
            const typeStyle = TYPE_STYLE[part.part_type]
            const isFlange = part.part_type === 'TA-f'

            return (
              <tr
                key={part.part_id}
                onClick={e => handleRowClick(part.part_id, e)}
                style={{ background: isSelected ? '#FFF8F8' : undefined, cursor: 'pointer', borderBottom: '1px solid #F5F5F5' }}
              >
                <td style={{ ...TD, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={e => { onRowSelect(part.part_id, e.target.checked); lastSelectedRef.current = part.part_id }}
                  />
                </td>
                <td style={{ ...TD, fontWeight: 500 }}>{part.part_mark}</td>
                <td style={{ ...TD, color: '#555' }}>{part.profile ?? '—'}</td>
                <td style={TD}>
                  <span style={{ ...typeStyle, padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600 }}>
                    {part.part_type}
                  </span>
                </td>
                <td style={{ ...TD, textAlign: 'right', color: '#555' }}>{part.length_mm ?? '—'}</td>
                <td style={TD} onClick={e => e.stopPropagation()}>
                  <WireDropdown
                    value={cell.material_id}
                    onChange={v => onCellChange(part.part_id, { material_id: v })}
                    disabled={isFlange}
                  />
                </td>
                <td style={{ ...TD, textAlign: 'right', color: isFlange ? '#AAAAAA' : '#1A1A1A' }}>
                  {estimatePathM(part)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
