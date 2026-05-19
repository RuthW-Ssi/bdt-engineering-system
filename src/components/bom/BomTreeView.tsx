import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, Layers, Box, Package } from 'lucide-react'
import type { AssemblyDto, AssemblyPartDto } from '../../api/dispatches'
import { MatchStatusBadge } from './MatchStatusBadge'
import type { MatchStatus } from '../../api/dispatches'

interface Props {
  assemblies: AssemblyDto[]
  assemblyCount: number | null
  partCount: number | null
  orphanParts?: AssemblyPartDto[]
  searchTerm?: string
}

function matches(term: string, ...fields: (string | null | undefined)[]): boolean {
  return fields.some(f => f?.toLowerCase().includes(term))
}

// ── Assembly row ───────────────────────────────────────────────
function AssemblyRow({
  asm, expanded, onToggle, searchTerm,
}: {
  asm: AssemblyDto
  expanded: boolean
  onToggle: () => void
  searchTerm?: string
}) {
  const [hovered, setHovered] = useState(false)
  const hasParts = asm.parts.length > 0
  const term = searchTerm?.trim().toLowerCase() ?? ''
  const highlighted = term !== '' && matches(term, asm.assembly_mark, asm.name)

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px',
        background: highlighted ? '#FFF8E1' : hovered ? '#F5F9FF' : 'white',
        border: `1px solid ${highlighted ? '#FBBF24' : '#C2C2C2'}`,
        borderRadius: 6,
        marginBottom: 2,
        cursor: hasParts ? 'pointer' : 'default',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        transition: 'background 120ms',
      }}
      onClick={() => hasParts && onToggle()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Expand toggle */}
      <span
        className="flex items-center justify-center rounded"
        style={{ width: 18, height: 18, color: '#8E8E8E', flexShrink: 0 }}
      >
        {hasParts
          ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
          : <span style={{ width: 14 }} />}
      </span>

      {/* Assembly icon */}
      <span style={{
        width: 20, height: 20, borderRadius: 999,
        background: '#E8F1FD', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Layers size={11} color="#185FA5" />
      </span>

      {/* Mark */}
      <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F', minWidth: 110, flexShrink: 0 }}>
        {asm.assembly_mark}
      </span>

      {/* Match status */}
      {asm.match_status && <MatchStatusBadge status={asm.match_status as MatchStatus} size="xs" />}

      {/* Name */}
      {asm.name && (
        <span className="flex-1 truncate" style={{ fontSize: 13, color: '#555' }}>
          {asm.name}
        </span>
      )}
      <span className="flex-1" />

      {/* Part count badge */}
      {hasParts && (
        <span style={{
          fontSize: 11, fontWeight: 500, color: '#185FA5',
          background: '#E8F1FD', borderRadius: 999, padding: '2px 8px', flexShrink: 0,
        }}>
          {asm.parts.length} parts
        </span>
      )}

      {/* Qty */}
      <span className="font-mono" style={{ fontSize: 13, fontWeight: 500, color: '#555', minWidth: 40, textAlign: 'right' }}>
        ×{asm.assembly_qty}
      </span>

      {/* Weight */}
      {asm.total_weight_kg != null && (
        <span style={{ fontSize: 12, color: '#8E8E8E', minWidth: 72, textAlign: 'right' }}>
          {asm.total_weight_kg.toFixed(1)} kg
        </span>
      )}
    </div>
  )
}

// ── Part row ───────────────────────────────────────────────────
function PartRow({ part, searchTerm }: { part: AssemblyPartDto; searchTerm?: string }) {
  const [hovered, setHovered] = useState(false)
  const term = searchTerm?.trim().toLowerCase() ?? ''
  const highlighted = term !== '' && matches(term, part.part_mark, part.description)

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px',
        marginLeft: 20,
        background: highlighted ? '#FFF8E1' : hovered ? '#FAFAFA' : 'white',
        border: `1px solid ${highlighted ? '#FBBF24' : '#E0E0E0'}`,
        borderRadius: 6,
        marginBottom: 2,
        transition: 'background 120ms',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Indent spacer matching expand button width */}
      <span style={{ width: 18, flexShrink: 0 }} />

      {/* Part icon */}
      <span style={{
        width: 20, height: 20, borderRadius: 999,
        background: '#F0F8F2', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Box size={11} color="#0A6640" />
      </span>

      {/* Part mark */}
      <span className="font-mono" style={{ fontSize: 12, fontWeight: 500, color: '#1F1F1F', minWidth: 110, flexShrink: 0 }}>
        {part.part_mark}
      </span>

      {/* Match status */}
      {part.match_status && <MatchStatusBadge status={part.match_status as MatchStatus} size="xs" />}

      {/* Description */}
      <span className="flex-1 truncate" style={{ fontSize: 12, color: '#555' }}>
        {part.description ?? ''}
      </span>

      {/* Profile */}
      {part.profile && (
        <span style={{
          fontSize: 11, color: '#555', background: '#F5F5F5',
          border: '1px solid #E0E0E0', borderRadius: 4,
          padding: '1px 6px', flexShrink: 0,
        }}>
          {part.profile}
        </span>
      )}

      {/* Grade */}
      {part.grade && (
        <span style={{
          fontSize: 11, color: '#B45309', background: '#FEF3C7',
          border: '1px solid #FDE68A', borderRadius: 4,
          padding: '1px 6px', flexShrink: 0,
        }}>
          {part.grade}
        </span>
      )}

      {/* Qty */}
      <span className="font-mono" style={{ fontSize: 12, fontWeight: 500, color: '#555', minWidth: 40, textAlign: 'right' }}>
        ×{part.part_qty}
      </span>

      {/* Weight */}
      {part.unit_weight_kg != null ? (
        <span style={{ fontSize: 12, color: '#8E8E8E', minWidth: 72, textAlign: 'right' }}>
          {part.unit_weight_kg.toFixed(2)} kg
        </span>
      ) : (
        <span style={{ minWidth: 72 }} />
      )}
    </div>
  )
}

// ── Tree row (assembly + its parts) ───────────────────────────
function AssemblyNode({ asm, searchTerm }: { asm: AssemblyDto; searchTerm?: string }) {
  const [expanded, setExpanded] = useState(false)

  // Auto-expand when searching so matched parts are visible
  useEffect(() => {
    if (searchTerm?.trim()) setExpanded(true)
    else setExpanded(false)
  }, [searchTerm])

  return (
    <>
      <AssemblyRow asm={asm} expanded={expanded} onToggle={() => setExpanded(e => !e)} searchTerm={searchTerm} />
      {expanded && (
        asm.parts.length > 0
          ? asm.parts.map((p, i) => <PartRow key={i} part={p} searchTerm={searchTerm} />)
          : (
            <div style={{ marginLeft: 38, padding: '6px 10px', fontSize: 12, color: '#C2C2C2', fontStyle: 'italic' }}>
              No parts in this assembly yet
            </div>
          )
      )}
    </>
  )
}

// ── Main component ─────────────────────────────────────────────
export function BomTreeView({ assemblies, assemblyCount, partCount, orphanParts, searchTerm }: Props) {
  if (assemblies.length === 0 && (!orphanParts || orphanParts.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 64, color: '#8E8E8E' }}>
        <Package size={36} style={{ opacity: 0.2 }} />
        <div style={{ fontSize: 14, fontWeight: 500 }}>
          {assemblyCount != null
            ? `${assemblyCount} assemblies · ${partCount ?? 0} parts`
            : 'No assembly data yet'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px' }}>
      {assemblies.map((asm, i) => <AssemblyNode key={i} asm={asm} searchTerm={searchTerm} />)}

      {orphanParts && orphanParts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8E8E8E', letterSpacing: '0.05em', marginBottom: 6, padding: '0 2px' }}>
            PARTS WITHOUT ASSEMBLY ({orphanParts.length})
          </div>
          {orphanParts.map((p, i) => <PartRow key={i} part={p} searchTerm={searchTerm} />)}
        </div>
      )}
    </div>
  )
}
