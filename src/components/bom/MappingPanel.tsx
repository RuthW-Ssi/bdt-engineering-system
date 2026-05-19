import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, ExternalLink } from 'lucide-react'
import { useDispatchMapping } from '../../hooks/useBomDispatches'
import { MatchStatusBadge } from './MatchStatusBadge'
import type { MappedRowDto, MatchStatus } from '../../api/dispatches'

// ── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({ summary }: { summary: { total_assemblies: number; total_parts: number; MATCHED_STANDARD: number; MATCHED_CUSTOM: number; AUTO_CREATED: number; UNMATCHED: number } }) {
  const chips: { label: string; count: number; status: MatchStatus | null }[] = [
    { label: 'Standard',  count: summary.MATCHED_STANDARD, status: 'MATCHED_STANDARD' },
    { label: 'Custom',    count: summary.MATCHED_CUSTOM,   status: 'MATCHED_CUSTOM' },
    { label: 'Auto',      count: summary.AUTO_CREATED,     status: 'AUTO_CREATED' },
    { label: 'Unmatched', count: summary.UNMATCHED,        status: null },
  ]

  return (
    <div style={{ padding: '12px 20px', borderBottom: '1px solid #E8E8E8', background: '#FAFAFA', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>
        Assemblies {summary.total_assemblies} · Parts {summary.total_parts}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        {chips.map(c => (
          <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MatchStatusBadge status={c.status} size="xs" />
            <span style={{ fontSize: 11, color: '#555', fontWeight: 600 }}>{c.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Mapping Table ─────────────────────────────────────────────────────────────

function MappingTable({ rows, markKey }: { rows: MappedRowDto[]; markKey: 'assembly_mark' | 'part_mark' }) {
  const navigate = useNavigate()

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ background: '#F5F5F5', borderBottom: '1px solid #E8E8E8' }}>
          <th style={{ textAlign: 'left', padding: '6px 12px', color: '#555', fontWeight: 600 }}>Mark</th>
          <th style={{ textAlign: 'left', padding: '6px 12px', color: '#555', fontWeight: 600 }}>Status</th>
          <th style={{ textAlign: 'left', padding: '6px 12px', color: '#555', fontWeight: 600 }}>Product</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => {
          const mark = markKey === 'assembly_mark' ? row.assembly_mark : row.part_mark
          return (
            <tr key={row.id} style={{ borderBottom: '1px solid #F0F0F0' }}>
              <td style={{ padding: '5px 12px', fontFamily: 'monospace', color: '#1F1F1F' }}>{mark}</td>
              <td style={{ padding: '5px 12px' }}>
                <MatchStatusBadge status={row.match_status} size="xs" />
              </td>
              <td style={{ padding: '5px 12px' }}>
                {row.product_code ? (
                  <button
                    onClick={() => navigate(`/engineer-products/${row.product_code}`)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#0C447C', fontFamily: 'monospace', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    {row.product_code}
                    <ExternalLink size={10} />
                  </button>
                ) : (
                  <span style={{ color: '#C2C2C2' }}>—</span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── MappingPanel ──────────────────────────────────────────────────────────────

interface Props {
  dispatchId: number | undefined
}

export function MappingPanel({ dispatchId }: Props) {
  const [tab, setTab] = useState<'assemblies' | 'parts'>('assemblies')
  const { data, isLoading, isError } = useDispatchMapping(dispatchId)

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 24, color: '#8E8E8E', fontSize: 13 }}>
        <Loader2 size={16} className="animate-spin" /> Loading mapping...
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div style={{ padding: 24, color: '#C8202A', fontSize: 13 }}>
        Failed to load mapping data
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid #E8E8E8', borderRadius: 8, overflow: 'hidden', margin: '16px 0' }}>
      {/* Panel header */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #E8E8E8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>eBOM ↔ mBOM Mapping</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['assemblies', 'parts'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: tab === t ? '#1F1F1F' : 'transparent',
                color: tab === t ? '#FFF' : '#8E8E8E',
              }}
            >
              {t === 'assemblies' ? `Assemblies (${data.assemblies.length})` : `Parts (${data.parts.length})`}
            </button>
          ))}
        </div>
      </div>

      <SummaryCard summary={data.summary} />

      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        <MappingTable
          rows={tab === 'assemblies' ? data.assemblies : data.parts}
          markKey={tab === 'assemblies' ? 'assembly_mark' : 'part_mark'}
        />
      </div>
    </div>
  )
}
