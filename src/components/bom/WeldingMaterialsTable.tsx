import { useNavigate } from 'react-router-dom'
import type { WeldingMbomSummaryDto } from '../../api/welding'

interface Props {
  dispatchId: number
  data: WeldingMbomSummaryDto | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

export function WeldingMaterialsTable({ dispatchId, data, isLoading, isError, onRetry }: Props) {
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        {[1, 2].map(i => (
          <div key={i} style={{ marginBottom: 12, border: '1px solid #E8E8E8', borderRadius: 6, padding: 12 }}>
            <div style={{ height: 14, width: 160, background: '#F0F0F0', borderRadius: 4, marginBottom: 8 }} />
            <div style={{ height: 32, background: '#F5F5F5', borderRadius: 4 }} />
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ padding: '16px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>Failed to load welding mBOM</div>
        <button onClick={onRetry} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 5, border: '1px solid #D9D9D9', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    )
  }

  if (!data || data.items.length === 0) {
    return (
      <div style={{ padding: '16px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>No welding config yet</div>
        <div style={{ fontSize: 11, color: '#8E8E8E', marginBottom: 12 }}>Configure wire first to compute</div>
        <button
          onClick={() => navigate(`/bom/dispatch/${dispatchId}/paint`)}
          style={{ fontSize: 12, padding: '5px 12px', borderRadius: 5, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer' }}
        >
          Configure Welding
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 24px 16px' }}>
      {/* Section header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>
          Welding Wire
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: '#8E8E8E' }}>
            Computed at {data.computed_at ? new Date(data.computed_at).toLocaleString('en-GB') : '—'}
          </span>
          <button
            onClick={() => navigate(`/bom/dispatch/${dispatchId}/paint`)}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, border: '1px solid #2563EB', color: '#2563EB', background: '#fff', cursor: 'pointer' }}
          >
            Reconfigure Wire
          </button>
        </div>
      </div>

      {/* Material cards */}
      {data.items.map(item => (
        <div key={item.material_id} style={{ marginBottom: 12, border: '1px solid #E8E8E8', borderRadius: 6, overflow: 'hidden' }}>
          {/* Card header — material identity */}
          <div style={{ background: '#F5F8FF', padding: '8px 12px', borderBottom: '1px solid #E8E8E8', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#1A1A1A', background: '#E8E8E8', padding: '1px 6px', borderRadius: 3 }}>
                  {item.default_code}
                </span>
                <span style={{ fontSize: 10, color: '#2563EB', background: '#DBEAFE', padding: '1px 6px', borderRadius: 3, fontWeight: 600 }}>
                  welding_wire
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{item.material_name}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#8E8E8E' }}>
              <div>UOM</div>
              <div style={{ fontWeight: 600, color: '#555' }}>{item.uom ?? 'EA'}</div>
            </div>
          </div>

          {/* Card body — computed values */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '8px 0', background: '#fff' }}>
            <div style={{ padding: '4px 12px', borderRight: '1px solid #F0F0F0' }}>
              <div style={{ fontSize: 10, color: '#8E8E8E', marginBottom: 2 }}>welding_path_m</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>{item.total_path_m.toFixed(3)}</div>
              <div style={{ fontSize: 10, color: '#8E8E8E' }}>m</div>
            </div>
            <div style={{ padding: '4px 12px', borderRight: '1px solid #F0F0F0' }}>
              <div style={{ fontSize: 10, color: '#8E8E8E', marginBottom: 2 }}>consumption</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>{item.total_consumption_kg.toFixed(3)}</div>
              <div style={{ fontSize: 10, color: '#8E8E8E' }}>kg</div>
            </div>
            <div style={{ padding: '4px 12px' }}>
              <div style={{ fontSize: 10, color: '#8E8E8E', marginBottom: 2 }}>packages</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#2563EB' }}>{item.total_packages}</div>
              <div style={{ fontSize: 10, color: '#8E8E8E' }}>box</div>
            </div>
          </div>
        </div>
      ))}

      {/* Grand total */}
      <div style={{ borderTop: '2px solid #1A1A1A', paddingTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
        <span style={{ fontSize: 13, color: '#555' }}>
          Total consumption: <strong>{data.grand_total_consumption_kg.toFixed(3)} kg</strong>
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#2563EB' }}>
          {data.grand_total_packages} packages
        </span>
      </div>
    </div>
  )
}
