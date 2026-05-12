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
        <ChevronRight size={14} style={{ color: '#8E8E8E', flexShrink: 0, transition: 'transform 0.15s' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F', fontFamily: 'monospace' }}>
          {asm.assembly_mark}
        </span>
        {asm.name && (
          <span style={{ fontSize: 12, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {asm.name}
          </span>
        )}
        <span style={{ fontSize: 11, color: '#8E8E8E', flexShrink: 0, marginLeft: 'auto', paddingLeft: 8, whiteSpace: 'nowrap' }}>
          ×{asm.assembly_qty}
          {asm.total_weight_kg != null && ` · ${asm.total_weight_kg.toFixed(1)} kg`}
          {' · '}{asm.parts.length} parts
        </span>
      </summary>

      <div style={{ background: '#FAFAFA', borderTop: '1px solid #F5F5F5' }}>
        {asm.parts.length === 0 ? (
          <div style={{ fontSize: 12, color: '#C2C2C2', padding: '8px 48px' }}>ไม่มี part</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: '#8E8E8E', fontWeight: 600, fontSize: 11 }}>
                <th style={{ padding: '6px 48px 6px 48px', textAlign: 'left', width: '30%' }}>PART MARK</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>DESCRIPTION</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', width: 80 }}>PROFILE</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', width: 60 }}>GRADE</th>
                <th style={{ padding: '6px 16px 6px 8px', textAlign: 'right', width: 80 }}>QTY · KG</th>
              </tr>
            </thead>
            <tbody>
              {asm.parts.map((p, i) => (
                <tr
                  key={i}
                  style={{ borderTop: '1px solid #F0F0F0', background: i % 2 === 0 ? 'white' : '#FAFAFA' }}
                >
                  <td style={{ padding: '7px 8px 7px 48px', fontFamily: 'monospace', color: '#1F1F1F', fontWeight: 500 }}>
                    {p.part_mark}
                  </td>
                  <td style={{ padding: '7px 8px', color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                    {p.description ?? '—'}
                  </td>
                  <td style={{ padding: '7px 8px', color: '#555' }}>{p.profile ?? '—'}</td>
                  <td style={{ padding: '7px 8px', color: '#555' }}>{p.grade ?? '—'}</td>
                  <td style={{ padding: '7px 16px 7px 8px', textAlign: 'right', color: '#8E8E8E', whiteSpace: 'nowrap' }}>
                    ×{p.part_qty}
                    {p.unit_weight_kg != null && ` · ${p.unit_weight_kg.toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
      </div>
    )
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      <div style={{ padding: '6px 16px', borderBottom: '1px solid #F0F0F0', background: '#F5F5F5' }}>
        <span style={{ fontSize: 11, color: '#8E8E8E', fontWeight: 600 }}>
          {assemblies.length} ASSEMBLIES
        </span>
      </div>
      {assemblies.map((asm, i) => <AssemblyRow key={i} asm={asm} />)}
    </div>
  )
}
