import { useNavigate } from 'react-router-dom'
import type { MbomSummaryDto, PaintType } from '../../api/paint'

const PAINT_LABELS: Record<PaintType, string> = {
  primer: 'Primer',
  intermediate: 'Intermediate',
  fireproof: 'Fireproof',
  topcoat: 'Topcoat',
}

interface Props {
  dispatchId: number
  data: MbomSummaryDto | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

export function PaintMaterialsTable({ dispatchId, data, isLoading, isError, onRetry }: Props) {
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ height: 16, width: 120, background: '#F0F0F0', borderRadius: 4, marginBottom: 8 }} />
            <div style={{ height: 36, background: '#F5F5F5', borderRadius: 4 }} />
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 12 }}>Failed to load mBOM</div>
        <button
          onClick={onRetry}
          style={{ fontSize: 13, padding: '6px 16px', borderRadius: 6, border: '1px solid #D9D9D9', cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data || data.by_paint_type.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>No paint config for this dispatch yet</div>
        <div style={{ fontSize: 12, color: '#8E8E8E', marginBottom: 16 }}>Configure paint first to compute mBOM</div>
        <button
          onClick={() => navigate(`/bom/dispatch/${dispatchId}/paint`)}
          style={{ fontSize: 13, padding: '6px 16px', borderRadius: 6, border: 'none', background: '#C8202A', color: '#fff', cursor: 'pointer' }}
        >
          Configure Paint
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#8E8E8E' }}>
          Computed at {data.computed_at ? new Date(data.computed_at).toLocaleString('en-GB') : '—'}
        </div>
        <button
          onClick={() => navigate(`/bom/dispatch/${dispatchId}/paint`)}
          style={{ fontSize: 12, padding: '5px 12px', borderRadius: 5, border: '1px solid #C8202A', color: '#C8202A', background: '#fff', cursor: 'pointer' }}
        >
          Reconfigure Paint
        </button>
      </div>

      {data.by_paint_type.map(group => (
        <div key={group.paint_type} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            {PAINT_LABELS[group.paint_type as PaintType] ?? group.paint_type}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E8E8E8' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#555', fontSize: 12 }}>Material</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600, color: '#555', fontSize: 12 }}>Area (m²)</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600, color: '#555', fontSize: 12 }}>Qty (gal)</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map(item => (
                <tr key={item.material_id} style={{ borderBottom: '1px solid #F5F5F5' }}>
                  <td style={{ padding: '6px 8px', color: '#1A1A1A' }}>{item.material_name}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#555' }}>{item.total_area_m2.toFixed(3)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500 }}>{item.total_qty_gallon.toFixed(3)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid #E8E8E8', background: '#FAFAFA' }}>
                <td style={{ padding: '5px 8px', fontWeight: 600, fontSize: 12 }}>Subtotal</td>
                <td />
                <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#C8202A' }}>
                  {group.subtotal_gallon.toFixed(3)} gal
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      <div style={{ borderTop: '2px solid #1A1A1A', paddingTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Total: {data.grand_total_gallon.toFixed(3)} gallon</span>
      </div>
    </div>
  )
}
