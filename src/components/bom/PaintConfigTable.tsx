import type { AssemblyDto } from '../../api/dispatches'
import { PAINT_TYPES } from '../../api/paint'
import type { PaintType } from '../../api/paint'
import { PaintBrandDropdown } from './PaintBrandDropdown'

export type CellKey = `${number}_${PaintType}`
export interface CellValue { material_id: number | null; layers: number }

interface Props {
  assemblies: AssemblyDto[]
  cellState: Map<CellKey, CellValue>
  onCellChange: (key: CellKey, value: CellValue) => void
  selectedRows: Set<number>
  onRowSelect: (id: number, checked: boolean, shiftKey?: boolean) => void
  onSelectAll: (checked: boolean) => void
}

const PAINT_LABELS: Record<PaintType, string> = {
  primer: 'Primer',
  intermediate: 'Inter',
  fireproof: 'Fireproof',
  topcoat: 'Topcoat',
}

const TH: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 12,
  fontWeight: 600,
  color: '#555',
  background: '#FAFAFA',
  borderBottom: '1px solid #E8E8E8',
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
  zIndex: 1,
}

const TD: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 12,
  borderBottom: '1px solid #F0F0F0',
  verticalAlign: 'middle',
}

export function PaintConfigTable({ assemblies, cellState, onCellChange, selectedRows, onRowSelect, onSelectAll }: Props) {
  const allSelected = assemblies.length > 0 && assemblies.every(a => selectedRows.has(a.id))

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 32 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 72 }} />
          {PAINT_TYPES.flatMap((_, i) => [
            <col key={`b${i}`} style={{ width: 140 }} />,
            <col key={`l${i}`} style={{ width: 52 }} />,
          ])}
        </colgroup>
        <thead>
          <tr>
            <th style={TH}>
              <input type="checkbox" checked={allSelected} onChange={e => onSelectAll(e.target.checked)} />
            </th>
            <th style={TH}>Mark</th>
            <th style={{ ...TH, textAlign: 'right' }}>Area (m²)</th>
            {PAINT_TYPES.map(pt => (
              <>
                <th key={`h-${pt}-brand`} style={TH}>{PAINT_LABELS[pt]}</th>
                <th key={`h-${pt}-layers`} style={{ ...TH, textAlign: 'center' }}>Lyr</th>
              </>
            ))}
          </tr>
        </thead>
        <tbody>
          {assemblies.map(asm => {
            const isSelected = selectedRows.has(asm.id)
            return (
              <tr
                key={asm.id}
                style={{ background: isSelected ? '#FFF8F8' : undefined }}
                onClick={e => onRowSelect(asm.id, !isSelected, e.shiftKey)}
              >
                <td style={TD} onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={e => onRowSelect(asm.id, e.target.checked)}
                  />
                </td>
                <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 500 }}>{asm.assembly_mark}</td>
                <td style={{ ...TD, textAlign: 'right', color: '#555' }}>
                  {asm.surface_area_m2 != null ? asm.surface_area_m2.toFixed(3) : '—'}
                </td>
                {PAINT_TYPES.map(pt => {
                  const key: CellKey = `${asm.id}_${pt}`
                  const cell = cellState.get(key) ?? { material_id: null, layers: 1 }
                  return (
                    <>
                      <td key={`${asm.id}-${pt}-brand`} style={TD} onClick={e => e.stopPropagation()}>
                        <PaintBrandDropdown
                          paintType={pt}
                          value={cell.material_id}
                          onChange={mid => onCellChange(key, { ...cell, material_id: mid })}
                        />
                      </td>
                      <td key={`${asm.id}-${pt}-layers`} style={{ ...TD, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={cell.layers}
                          onChange={e => onCellChange(key, { ...cell, layers: Math.max(0, Number(e.target.value)) })}
                          style={{
                            width: 36,
                            textAlign: 'center',
                            border: '1px solid #D9D9D9',
                            borderRadius: 4,
                            padding: '2px 4px',
                            fontSize: 12,
                          }}
                        />
                      </td>
                    </>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
