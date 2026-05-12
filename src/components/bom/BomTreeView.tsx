import { ChevronRight, Package } from 'lucide-react'
import type { AssemblyDto } from '../../api/dispatches'

interface Props {
  assemblies: AssemblyDto[]
  assemblyCount: number | null
  partCount: number | null
}

function AssemblyRow({ asm }: { asm: AssemblyDto }) {
  return (
    <details style={{ borderBottom: '1px solid #F0F0F0' }}>
      <summary style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px', cursor: 'pointer', listStyle: 'none',
        userSelect: 'none',
      }}>
        <ChevronRight
          size={14}
          style={{ color: '#8E8E8E', flexShrink: 0, transition: 'transform 0.15s' }}
          className="details-chevron"
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {asm.assembly_mark}
        </span>
        <span style={{ fontSize: 12, color: '#8E8E8E', flexShrink: 0, marginLeft: 'auto', paddingLeft: 8 }}>
          qty {asm.assembly_qty}
          {asm.total_weight_kg != null && ` · ${asm.total_weight_kg.toFixed(1)} kg`}
        </span>
      </summary>
      <div style={{ paddingLeft: 38, paddingBottom: 4 }}>
        {asm.parts.length === 0 ? (
          <div style={{ fontSize: 12, color: '#C2C2C2', padding: '6px 0' }}>ไม่มีข้อมูล part</div>
        ) : (
          asm.parts.map((p, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 0', borderBottom: i < asm.parts.length - 1 ? '1px solid #F8F8F8' : 'none',
            }}>
              <span style={{ fontSize: 12, color: '#555', flex: 1, fontFamily: 'monospace' }}>{p.part_mark}</span>
              <span style={{ fontSize: 11, color: '#8E8E8E', flexShrink: 0 }}>
                qty {p.part_qty}
                {p.unit_weight_kg != null && ` · ${p.unit_weight_kg.toFixed(2)} kg`}
              </span>
            </div>
          ))
        )}
      </div>
    </details>
  )
}

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
        <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 300 }}>
          Assembly tree จะแสดงเมื่อ endpoint พร้อม
        </div>
      </div>
    )
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      <div style={{ padding: '8px 0', borderBottom: '1px solid #F0F0F0', background: '#FAFAFA' }}>
        <div className="flex items-center gap-3 px-4" style={{ fontSize: 11, color: '#8E8E8E', fontWeight: 600 }}>
          <span style={{ minWidth: 14 }} />
          <span style={{ flex: 1 }}>ASSEMBLY MARK</span>
          <span>QTY · WEIGHT</span>
        </div>
      </div>
      {assemblies.map((asm, i) => <AssemblyRow key={i} asm={asm} />)}
    </div>
  )
}
