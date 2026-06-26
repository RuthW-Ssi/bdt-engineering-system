import React, { useRef, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { PaintBrandDropdown } from './PaintBrandDropdown'
import { WireDropdown } from './WireDropdown'
import { PAINT_TYPES } from '../../api/paint'
import type { PaintType } from '../../api/paint'
import type { WeldingSpecValues } from '../../api/welding'
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
  weldingSpecState: Map<number, WeldingSpecValues>
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

function PaintCellWidget({ paintType, value, onChange }: {
  paintType: PaintType
  value: number | null
  surfaceAreaM2: number | null
  assemblyQty: number
  onChange: (v: number | null) => void
}) {
  return <PaintBrandDropdown paintType={paintType} value={value} onChange={onChange} />
}

function WireCellWidget({ value, onChange }: {
  value: number | null
  parts: AssemblyPartDto[]
  assemblyQty: number
  weldingSpec: WeldingSpecValues
  onChange: (v: number | null) => void
}) {
  return <WireDropdown value={value} onChange={onChange} />
}

// ── Locked (read-only) cells for Standard type ───────────────
function LockedPaintCell({ paintType, materialId }: {
  paintType: PaintType
  materialId: number | null
  surfaceAreaM2: number | null
  assemblyQty: number
}) {
  const { data: materials = [] } = usePaintMaterials(paintType)
  const m = materialId != null ? materials.find(x => x.id === materialId) : null
  return (
    <div style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 3, padding: '2px 5px', fontSize: 10, color: '#555' }}>
      <div style={{ fontWeight: 500 }}>{m?.name ?? '—'}</div>
    </div>
  )
}

function LockedWireCell({ materialId }: {
  materialId: number | null
  parts: AssemblyPartDto[]
  assemblyQty: number
  weldingSpec: WeldingSpecValues
}) {
  const { data: materials = [] } = useWireMaterials()
  const m = materialId != null ? materials.find(x => x.id === materialId) : null
  return (
    <div style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 3, padding: '2px 5px', fontSize: 10, color: '#555' }}>
      <div style={{ fontWeight: 500 }}>{m?.name ?? '—'}</div>
    </div>
  )
}

function ProductCodeSelect({ productType, value, onChange }: {
  productType: ProductType
  value: number | null
  onChange: (id: number | null) => void
}) {
  const { data, isLoading } = useProducts({ product_type: productType, limit: 100 })
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
        <option key={p.id} value={p.id}>{p.product_code} — {p.name}</option>
      ))}
    </select>
  )
}

function LockedStandardBadge({ productCode }: { productCode: string | null }) {
  return (
    <div onClick={e => e.stopPropagation()} style={{
      marginTop: 3, padding: '2px 6px', fontSize: 10, fontWeight: 600,
      borderRadius: 3, border: '1px solid #A8D08D',
      background: '#EAF3DE', color: '#27500A',
      display: 'flex', alignItems: 'center', gap: 4,
    }}>
      <span style={{ fontSize: 9, opacity: 0.6 }}>🔒</span>
      {productCode ?? '—'}
    </div>
  )
}


function PartRows({ parts }: { parts: AssemblyPartDto[] }) {
  const TOTAL_COLS = 9  // checkbox | mark | area | type | primer | inter | fireproof | topcoat | wire
  return (
    <>
      {parts.map(p => {
        const pathM = estimatePartPathM(p.part_mark, p.profile, p.length_mm)
        const partPathTotal = pathM != null ? (pathM * (p.part_qty ?? 1)).toFixed(3) : null
        return (
          <tr key={p.id} style={{ background: '#FAFBFC', borderTop: '1px solid #F0F0F0' }}>
            <td style={{ ...TD, width: 28 }} />
            <td style={{ ...TD, paddingLeft: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#CCC', fontSize: 10 }}>↳</span>
                <span style={{ fontWeight: 500, fontSize: 10, color: '#333' }}>{p.part_mark}</span>
              </div>
            </td>
            <td colSpan={TOTAL_COLS - 2} style={{ ...TD, fontSize: 10, color: '#777' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {p.profile && <span style={{ color: '#555' }}>{p.profile}</span>}
                {p.grade && <span style={{ color: '#888' }}>{p.grade}</span>}
                {p.length_mm != null && <span>{p.length_mm} mm</span>}
                <span style={{ color: '#999' }}>×{p.part_qty ?? 1}</span>
                {p.unit_weight_kg != null && (
                  <span style={{ color: '#AAA' }}>{(p.unit_weight_kg * (p.part_qty ?? 1)).toFixed(1)} kg</span>
                )}
                {partPathTotal != null && (
                  <span style={{ color: '#4B9CD3' }}>{partPathTotal} m weld</span>
                )}
              </div>
            </td>
          </tr>
        )
      })}
    </>
  )
}

function TypeDropdown({ asmId, matchState, productState, productCode, onMatchChange, onProductChange }: {
  asmId: number
  matchState: Map<number, MatchStatus | null>
  productState: Map<number, number | null>
  productCode: string | null
  onMatchChange: (id: number, v: MatchStatus | null) => void
  onProductChange: (id: number, productId: number | null) => void
}) {
  const current = matchState.get(asmId) ?? null
  const productId = productState.get(asmId) ?? null
  const opt = MATCH_OPTIONS.find(o => o.value === (current ?? ''))

  const handleTypeChange = (v: MatchStatus | null) => {
    onMatchChange(asmId, v)
    if (!v) onProductChange(asmId, null)
  }

  const isStandard = current === 'MATCHED_STANDARD'

  return (
    <div>
      <select
        value={current ?? ''}
        disabled={isStandard && productId != null}
        onChange={e => handleTypeChange((e.target.value as MatchStatus) || null)}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', fontSize: 10, padding: '2px 3px',
          border: '1px solid #D9D9D9', borderRadius: 3,
          background: current ? MATCH_BG[current] ?? '#fff' : '#fff',
          color: opt?.color ?? '#8E8E8E', fontWeight: current ? 600 : 400,
          cursor: (isStandard && productId != null) ? 'not-allowed' : undefined,
          opacity: (isStandard && productId != null) ? 0.85 : 1,
        }}
      >
        {MATCH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {isStandard && productId != null && <LockedStandardBadge productCode={productCode} />}
      {isStandard && productId == null && (
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
  paintState, wireState, weldingSpecState, matchState, productState,
  onPaintChange, onWireChange, onMatchChange, onProductChange,
  selectedAssemblies, onAssemblySelect, onSelectAllAssemblies,
}: Props) {
  const lastSelectedRef = useRef<number | null>(null)
  const allSelected = assemblies.length > 0 && selectedAssemblies.size === assemblies.length
  const [expandedAsms, setExpandedAsms] = useState<Set<number>>(new Set())

  const toggleExpand = (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedAsms(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

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
            const weldingSpec = weldingSpecState.get(asm.id) ?? { fillet_mm: null, sides: null, weld_layers: null }
            const isLocked = matchState.get(asm.id) === 'MATCHED_STANDARD' && (productState.get(asm.id) ?? null) != null
            const rowBg = isSelected ? '#FFF0F0' : (idx % 2 === 0 ? '#FFFFFF' : '#F3F6F9')
            const isExpanded = expandedAsms.has(asm.id)
            const hasParts = asm.parts.length > 0
            return (
              <React.Fragment key={asm.id}>
              <tr
                onClick={e => handleAsmClick(asm.id, e)}
                style={{ background: rowBg, cursor: 'pointer', borderTop: '1px solid #E0E0E0' }}
              >
                <td style={{ ...TD, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                  {!isLocked && (
                    <input type="checkbox" checked={isSelected}
                      onChange={e => {
                        onAssemblySelect(asm.id, e.target.checked, e as unknown as React.MouseEvent)
                        lastSelectedRef.current = asm.id
                      }} />
                  )}
                </td>
                <td style={TD}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 3 }}>
                    {hasParts && (
                      <button
                        onClick={e => toggleExpand(asm.id, e)}
                        style={{ flexShrink: 0, marginTop: 1, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#888', lineHeight: 1 }}
                      >
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>
                    )}
                    <div>
                      <div style={{ fontWeight: 600, color: '#1A1A1A' }}>{asm.assembly_mark}</div>
                      {asm.name && <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>{asm.name}</div>}
                      {hasParts && (
                        <div style={{ fontSize: 9, color: '#AAA', marginTop: 1 }}>{asm.parts.length} parts</div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ ...TD, textAlign: 'right', color: '#555' }}>
                  {asm.surface_area_m2 != null ? asm.surface_area_m2.toFixed(2) : '—'}
                </td>
                <td style={{ ...TD, borderLeft: '2px solid #EEE', verticalAlign: 'top' }} onClick={e => e.stopPropagation()}>
                  <TypeDropdown
                    asmId={asm.id}
                    matchState={matchState}
                    productState={productState}
                    productCode={asm.product?.product_code ?? null}
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
                        ? <LockedPaintCell paintType={pt} materialId={cell.material_id} surfaceAreaM2={asm.surface_area_m2} assemblyQty={asm.assembly_qty} />
                        : <PaintCellWidget paintType={pt} value={cell.material_id} surfaceAreaM2={asm.surface_area_m2} assemblyQty={asm.assembly_qty} onChange={v => onPaintChange(key, { material_id: v })} />
                      }
                    </td>
                  )
                })}
                <td style={{ ...TD, borderLeft: '2px solid #DBEAFE', verticalAlign: 'top' }} onClick={e => e.stopPropagation()}>
                  {isLocked
                    ? <LockedWireCell materialId={wireCell.material_id} parts={asm.parts} assemblyQty={asm.assembly_qty} weldingSpec={weldingSpec} />
                    : <WireCellWidget value={wireCell.material_id} parts={asm.parts} assemblyQty={asm.assembly_qty} weldingSpec={weldingSpec} onChange={v => onWireChange(asm.id, { material_id: v })} />
                  }
                </td>
              </tr>
              {isExpanded && hasParts && <PartRows parts={asm.parts} />}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
