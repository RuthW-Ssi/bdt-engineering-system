import { useState } from 'react'
import { ChevronRight, ChevronDown, Layers, Box, Package } from 'lucide-react'
import type { AssemblyDto } from '../../api/dispatches'

interface Props {
  assemblies: AssemblyDto[]
  assemblyCount: number | null
  partCount: number | null
}

// ── Assembly row ───────────────────────────────────────────────
function AssemblyRow({
  asm, expanded, onToggle,
}: {
  asm: AssemblyDto
  expanded: boolean
  onToggle: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const hasParts = asm.parts.length > 0

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px',
        background: hovered ? '#F5F9FF' : 'white',
        border: '1px solid #C2C2C2',
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
function PartRow({ part }: { part: AssemblyDto['parts'][number] }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px',
        marginLeft: 20,
        background: hovered ? '#FAFAFA' : 'white',
        border: '1px solid #E0E0E0',
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
function AssemblyNode({ asm }: { asm: AssemblyDto }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <AssemblyRow asm={asm} expanded={expanded} onToggle={() => setExpanded(e => !e)} />
      {expanded && asm.parts.map((p, i) => <PartRow key={i} part={p} />)}
    </>
  )
}

// ── Main component ─────────────────────────────────────────────
export function BomTreeView({ assemblies, assemblyCount, partCount }: Props) {
  if (assemblies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 64, color: '#8E8E8E' }}>
        <Package size={36} style={{ opacity: 0.2 }} />
        <div style={{ fontSize: 14, fontWeight: 500 }}>
          {assemblyCount != null
            ? `${assemblyCount} assemblies · ${partCount ?? 0} parts`
            : 'ยังไม่มีข้อมูล assembly'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px' }}>
      {assemblies.map((asm, i) => <AssemblyNode key={i} asm={asm} />)}
    </div>
  )
}
