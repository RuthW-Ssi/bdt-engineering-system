import React, { useRef } from 'react'
import { PaintBrandDropdown } from './PaintBrandDropdown'
import { WireDropdown } from './WireDropdown'
import { PAINT_TYPES } from '../../api/paint'
import type { PaintType } from '../../api/paint'
import type { AssemblyDto, AssemblyPartDto, MatchStatus } from '../../api/dispatches'
import { usePaintMaterials } from '../../hooks/usePaint'
import { useWireMaterials } from '../../hooks/useWelding'
import { useProducts } from '../../hooks/useProducts'

export type PaintCellKey = `${number}_${PaintType}`
export interface PaintCell { material_id: number | null }
export interface WireCell { material_id: number | null }
export type ProductType = 'standard' | 'custom'

const MATCH_OPTIONS: { value: MatchStatus | ''; label: string; color: string }[] = [
  { value: '',                  label: '—',        color: '#8E8E8E' },
  { value: 'MATCHED_STANDARD',  label: 'Standard', color: '#27500A' },
  { value: 'MATCHED_CUSTOM',    label: 'Custom',   color: '#0C447C' },
]
const MATCH_BG: Record<string, string> = {
  MATCHED_STANDARD: '#EAF3DE',
  MATCHED_CUSTOM: '#E6F1FB',
}
const PAINT_LABELS: Record<PaintType, string> = {
  primer: 'Primer', intermediate: 'Inter.', fireproof: 'Fireproof', topcoat: 'Topcoat',
}

const TH: React.CSSProperties = {
  position: 'sticky', top: 0, background: '#F5F5F5', zIndex: 2,
  padding: '5px 6px', fontSize: 10, fontWeight: 600, color: '#555',
  textAlign: 'left', borderBottom: '2px solid #D0D0D0', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = { padding: '3px 5px', fontSize: 11, verticalAlign: 'middle' }

interface Props {
  assemblies: AssemblyDto[]
  paintState: Map<PaintCellKey, PaintCell>
  wireState: Map<number, WireCell>
  matchState: Map<number, MatchStatus | null>
  productState: Map<number, number | null>
  onPaintChange: (key: PaintCellKey, value: PaintCell) => void
  onWireChange: (asmId: number, value: WireCell) => void
  onMatchChange: (asmId: number, value: MatchStatus | null) => void
  onProductChange: (asmId: number, productId: number | null) => void
  selectedAssemblies: Set<number>
  onAssemblySelect: (id: number, checked: boolean, e: React.MouseEvent) => void
  onSelectAllAssemblies: (checked: boolean) => void
}

// ── Wire path_m helpers (mirrors BE welding-calculator logic) ──
const WIRE_CONSUMPTION_RATE = 0.314
const TAK_INTERVAL_M = 0.5
const TAK_LENGTH_M = 0.05

function parsePerimeterMm(profile: string | null): number | null {
  if (!profile) return null
  const p = profile.trim().toUpperCase()
  const hc = p.match(/^[HC]\s*(\d+(?:\.\d+)?)[X*×](\d+(?:\.\d+)?)/)
  if (hc) return 2 * (parseFloat(hc[1]) + parseFloat(hc[2]))
  const ang = p.match(/^L\s*(\d+(?:\.\d+)?)[X*×](\d+(?:\.\d+)?)/)
  if (ang) return 2 * (parseFloat(ang[1]) + parseFloat(ang[2]))
  const chs = p.match(/^(?:CHS|PIPE)\s*(\d+(?:\.\d+)?)/)
  if (chs) return Math.PI * parseFloat(chs[1])
  const rhs = p.match(/^RHS\s*(\d+(?:\.\d+)?)[X*×](\d+(?:\.\d+)?)/)
  if (rhs) return 2 * (parseFloat(rhs[1]) + parseFloat(rhs[2]))
  const shs = p.match(/^SHS\s*(\d+(?:\.\d+)?)/)
  if (shs) return 4 * parseFloat(shs[1])
  const rod = p.match(/^(?:ROD\s*)?(?:RODRB|RB)\s*(\d+(?:\.\d+)?)/)
  if (rod) return Math.PI * parseFloat(rod[1])
  return null
}

function parseWidthMm(profile: string | null): number | null {
  if (!profile) return null
  const m = profile.trim().toUpperCase().match(/^(?:PL|PLT)\s*\d+(?:\.\d+)?[X*×](\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : null
}

function estimatePartPathM(partMark: string, profile: string | null, lengthMm: number | null): number | null {
  if (/-F-/i.test(partMark)) return null
  if (/-W-/i.test(partMark) || /W\d*$/i.test(partMark)) {
    return lengthMm != null ? lengthMm * 4 / 1000 : null
  }
  if (/-P-/i.test(partMark)) {
    const w = parseWidthMm(profile)
    return (w != null && lengthMm != null) ? (w + lengthMm) * 2 / 1000 * 0.75 : null
  }
  const perim = parsePerimeterMm(profile)
  return perim != null ? perim / 1000 : null
}

function computeAssemblyPathM(parts: AssemblyPartDto[]): number {
  return parts.reduce((sum, p) => {
    const pm = estimatePartPathM(p.part_mark, p.profile, p.length_mm)
    return sum + (pm ?? 0) * (p.part_qty ?? 1)
  }, 0)
}

function PaintCellWidget({ paintType, value, surfaceAreaM2, onChange }: {
  paintType: PaintType
  value: number | null
  surfaceAreaM2: number | null
  onChange: (v: number | null) => void
}) {
  const { data: materials = [] } = usePaintMaterials(paintType)
  const selected = value != null ? materials.find(m => m.id === value) : null
  const gallons = selected && surfaceAreaM2 != null
    ? (surfaceAreaM2 / selected.attributes.coverage_sqm_per_gallon).toFixed(2)
    : null
  const micron = selected?.attributes.paint_micron ?? null

  return (
    <div>
      <PaintBrandDropdown paintType={paintType} value={value} onChange={onChange} />
      {selected && (
        <div style={{ display: 'flex', gap: 5, marginTop: 2, fontSize: 9, color: '#999' }}>
          {gallons != null && <span>{gallons} gal</span>}
          {micron != null && <span>{micron} µm</span>}
        </div>
      )}
    </div>
  )
}

function WireCellWidget({ value, parts, onChange }: {
  value: number | null
  parts: AssemblyPartDto[]
  onChange: (v: number | null) => void
}) {
  const { data: materials = [] } = useWireMaterials()
  const selected = value != null ? materials.find(m => m.id === value) : null
  const attrs = selected ? (selected.attributes as Record<string, unknown>) : null
  const diameter = attrs?.wire_diameter_mm != null ? Number(attrs.wire_diameter_mm) : null
  const pkgKg = attrs?.pkg_kg != null ? Number(attrs.pkg_kg) : null

  const totalPathM = computeAssemblyPathM(parts)
  const estBoxes = (totalPathM > 0 && pkgKg != null)
    ? ((totalPathM + (totalPathM / TAK_INTERVAL_M + 4) * TAK_LENGTH_M) * WIRE_CONSUMPTION_RATE) / pkgKg
    : null

  return (
    <div>
      <WireDropdown value={value} onChange={onChange} />
      {selected && (
        <div style={{ display: 'flex', gap: 5, marginTop: 2, fontSize: 9, color: '#999' }}>
          {estBoxes != null && <span>{estBoxes.toFixed(2)} boxes</span>}
          {diameter != null && <span>⌀{diameter} mm</span>}
        </div>
      )}
    </div>
  )
}

// ── Locked (read-only) cells for Standard type ───────────────
function LockedPaintCell({ paintType, materialId, surfaceAreaM2 }: {
  paintType: PaintType
  materialId: number | null
  surfaceAreaM2: number | null
}) {
  const { data: materials = [] } = usePaintMaterials(paintType)
  const m = materialId != null ? materials.find(x => x.id === materialId) : null
  const gallons = m && surfaceAreaM2 != null
    ? (surfaceAreaM2 / m.attributes.coverage_sqm_per_gallon).toFixed(1)
    : null
  const micron = m?.attributes.paint_micron ?? null

  return (
    <div style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 3, padding: '2px 5px', fontSize: 10, color: '#555' }}>
      <div style={{ fontWeight: 500 }}>{m?.name ?? '—'}</div>
      {m && (
        <div style={{ display: 'flex', gap: 4, fontSize: 9, color: '#999', marginTop: 1 }}>
          {gallons != null && <span>{gallons} gal</span>}
          {micron != null && <span>{micron} µm</span>}
        </div>
      )}
    </div>
  )
}

function LockedWireCell({ materialId, parts }: {
  materialId: number | null
  parts: AssemblyPartDto[]
}) {
  const { data: materials = [] } = useWireMaterials()
  const m = materialId != null ? materials.find(x => x.id === materialId) : null
  const attrs = m ? (m.attributes as Record<string, unknown>) : null
  const diameter = attrs?.wire_diameter_mm != null ? Number(attrs.wire_diameter_mm) : null
  const pkgKg = attrs?.pkg_kg != null ? Number(attrs.pkg_kg) : null
  const totalPathM = computeAssemblyPathM(parts)
  const estBoxes = (totalPathM > 0 && pkgKg != null)
    ? ((totalPathM + (totalPathM / TAK_INTERVAL_M + 4) * TAK_LENGTH_M) * WIRE_CONSUMPTION_RATE) / pkgKg
    : null

  return (
    <div style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 3, padding: '2px 5px', fontSize: 10, color: '#555' }}>
      <div style={{ fontWeight: 500 }}>{m?.name ?? '—'}</div>
      {m && (
        <div style={{ display: 'flex', gap: 4, fontSize: 9, color: '#999', marginTop: 1 }}>
          {estBoxes != null && <span>{estBoxes.toFixed(2)} boxes</span>}
          {diameter != null && <span>⌀{diameter} mm</span>}
        </div>
      )}
    </div>
  )
}

function ProductCodeSelect({ productType, value, onChange }: {
  productType: ProductType
  value: number | null
  onChange: (id: number | null) => void
}) {
  const { data, isLoading } = useProducts({ product_type: productType, state: 'released', limit: 100 })
  const items = data?.items ?? []
  return (
    <select
      value={value ?? ''}
      disabled={isLoading}
      onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
      onClick={e => e.stopPropagation()}
      style={{
        width: '100%', fontSize: 10, padding: '2px 3px', marginTop: 3,
        border: '1px solid #D9D9D9', borderRadius: 3,
        background: value ? (productType === 'standard' ? '#EAF3DE' : '#E6F1FB') : '#fff',
        color: value ? (productType === 'standard' ? '#27500A' : '#0C447C') : '#8E8E8E',
      }}
    >
      <option value="">— Select —</option>
      {items.map(p => (
        <option key={p.id} value={p.id}>{p.product_code}</option>
      ))}
    </select>
  )
}

function TypeDropdown({ asmId, matchState, productState, onMatchChange, onProductChange }: {
  asmId: number
  matchState: Map<number, MatchStatus | null>
  productState: Map<number, number | null>
  onMatchChange: (id: number, v: MatchStatus | null) => void
  onProductChange: (id: number, productId: number | null) => void
}) {
  const current = matchState.get(asmId) ?? null
  const productId = productState.get(asmId) ?? null
  const opt = MATCH_OPTIONS.find(o => o.value === (current ?? ''))

  const handleTypeChange = (v: MatchStatus | null) => {
    onMatchChange(asmId, v)
    if (!v) onProductChange(asmId, null)  // clear product when type cleared
  }

  return (
    <div>
      <select
        value={current ?? ''}
        onChange={e => handleTypeChange((e.target.value as MatchStatus) || null)}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', fontSize: 10, padding: '2px 3px',
          border: '1px solid #D9D9D9', borderRadius: 3,
          background: current ? MATCH_BG[current] ?? '#fff' : '#fff',
          color: opt?.color ?? '#8E8E8E', fontWeight: current ? 600 : 400,
        }}
      >
        {MATCH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {current === 'MATCHED_STANDARD' && (
        <ProductCodeSelect productType="standard" value={productId} onChange={id => onProductChange(asmId, id)} />
      )}
      {current === 'MATCHED_CUSTOM' && (
        <ProductCodeSelect productType="custom" value={productId} onChange={id => onProductChange(asmId, id)} />
      )}
    </div>
  )
}

export function MbomConfigTable({
  assemblies,
  paintState, wireState, matchState, productState,
  onPaintChange, onWireChange, onMatchChange, onProductChange,
  selectedAssemblies, onAssemblySelect, onSelectAllAssemblies,
}: Props) {
  const lastSelectedRef = useRef<number | null>(null)
  const allSelected = assemblies.length > 0 && selectedAssemblies.size === assemblies.length

  const handleAsmClick = (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    onAssemblySelect(id, !selectedAssemblies.has(id), e)
    lastSelectedRef.current = id
  }

  return (
    <div>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: 820, width: '100%', fontSize: 11 }}>
        <colgroup>
          <col style={{ width: 28 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 64 }} />
          <col style={{ width: 110 }} />
          {PAINT_TYPES.map(pt => <col key={pt} style={{ width: 98 }} />)}
          <col style={{ width: 130 }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...TH, textAlign: 'center' }}>
              <input type="checkbox" checked={allSelected}
                onChange={e => onSelectAllAssemblies(e.target.checked)} />
            </th>
            <th style={TH}>Mark</th>
            <th style={{ ...TH, textAlign: 'right' }}>Area (m²)</th>
            <th style={{ ...TH, borderLeft: '2px solid #E0E0E0' }}>Type</th>
            {PAINT_TYPES.map((pt, i) => (
              <th key={pt} style={{ ...TH, borderLeft: i === 0 ? '1px solid #E0E0E0' : '2px solid #E0E0E0' }}>{PAINT_LABELS[pt]}</th>
            ))}
            <th style={{ ...TH, borderLeft: '2px solid #4B9CD3', color: '#2563EB' }}>Welding Wire</th>
          </tr>
        </thead>
        <tbody>
          {assemblies.map((asm, idx) => {
            const isSelected = selectedAssemblies.has(asm.id)
            const wireCell = wireState.get(asm.id) ?? { material_id: null }
            const isLocked = matchState.get(asm.id) === 'MATCHED_STANDARD' && (productState.get(asm.id) ?? null) != null
            const rowBg = isSelected ? '#FFF0F0' : (idx % 2 === 0 ? '#FFFFFF' : '#F3F6F9')
            return (
              <tr key={asm.id}
                onClick={e => handleAsmClick(asm.id, e)}
                style={{ background: rowBg, cursor: 'pointer', borderTop: '1px solid #E0E0E0' }}
              >
                <td style={{ ...TD, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={isSelected}
                    onChange={e => {
                      onAssemblySelect(asm.id, e.target.checked, e as unknown as React.MouseEvent)
                      lastSelectedRef.current = asm.id
                    }} />
                </td>
                <td style={TD}>
                  <div style={{ fontWeight: 600, color: '#1A1A1A' }}>{asm.assembly_mark}</div>
                  {asm.name && <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>{asm.name}</div>}
                </td>
                <td style={{ ...TD, textAlign: 'right', color: '#555' }}>
                  {asm.surface_area_m2 != null ? asm.surface_area_m2.toFixed(2) : '—'}
                </td>
                <td style={{ ...TD, borderLeft: '2px solid #EEE', verticalAlign: 'top' }} onClick={e => e.stopPropagation()}>
                  <TypeDropdown
                    asmId={asm.id}
                    matchState={matchState}
                    productState={productState}
                    onMatchChange={onMatchChange}
                    onProductChange={onProductChange}
                  />
                </td>
                {PAINT_TYPES.map(pt => {
                  const key: PaintCellKey = `${asm.id}_${pt}`
                  const cell = paintState.get(key) ?? { material_id: null }
                  return (
                    <td key={pt} style={{ ...TD, borderLeft: '2px solid #EEE', verticalAlign: 'top' }} onClick={e => e.stopPropagation()}>
                      {isLocked
                        ? <LockedPaintCell paintType={pt} materialId={cell.material_id} surfaceAreaM2={asm.surface_area_m2} />
                        : <PaintCellWidget paintType={pt} value={cell.material_id} surfaceAreaM2={asm.surface_area_m2} onChange={v => onPaintChange(key, { material_id: v })} />
                      }
                    </td>
                  )
                })}
                <td style={{ ...TD, borderLeft: '2px solid #DBEAFE', verticalAlign: 'top' }} onClick={e => e.stopPropagation()}>
                  {isLocked
                    ? <LockedWireCell materialId={wireCell.material_id} parts={asm.parts} />
                    : <WireCellWidget value={wireCell.material_id} parts={asm.parts} onChange={v => onWireChange(asm.id, { material_id: v })} />
                  }
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
