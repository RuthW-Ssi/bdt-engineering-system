import { useState } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { useReviewQueue, useConfirmAssembly, usePatchVariantAttrs } from '../../hooks/useReviewQueue'
import type { ReviewQueueItem, VariantAttributes } from '../../api/productDerivation'

interface Props {
  dispatchId: number
}

function ConfidenceBadge({ confidence }: { confidence: 'medium' | 'low' }) {
  const isLow = confidence === 'low'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
      background: isLow ? '#FEE2E2' : '#FEF9C3',
      color: isLow ? '#991B1B' : '#92400E',
    }}>
      <AlertCircle size={11} />
      {isLow ? 'Needs review' : 'Confirm'}
    </span>
  )
}

function FlagsCell({ flags }: { flags: string[] }) {
  if (flags.length === 0) return <span style={{ color: '#C2C2C2', fontSize: 11 }}>—</span>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {flags.map(f => (
        <span key={f} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#F3F4F6', color: '#374151', fontFamily: 'monospace' }}>
          {f}
        </span>
      ))}
    </div>
  )
}

function AttrsCell({ attrs }: { attrs: VariantAttributes }) {
  const parts: string[] = []
  if (attrs.profile) parts.push(attrs.profile)
  else {
    if (attrs.shape) parts.push(attrs.shape)
    if (attrs.height_mm) parts.push(`h${attrs.height_mm}`)
    if (attrs.width_mm) parts.push(`w${attrs.width_mm}`)
    if (attrs.web_thickness_mm) parts.push(`tw${attrs.web_thickness_mm}`)
    if (attrs.flange_thickness_mm) parts.push(`tf${attrs.flange_thickness_mm}`)
    if (attrs.diameter_mm) parts.push(`ø${attrs.diameter_mm}`)
    if (attrs.outer_diameter_mm) parts.push(`OD${attrs.outer_diameter_mm}`)
    if (attrs.leg_a_mm) parts.push(`${attrs.leg_a_mm}x${attrs.leg_b_mm}x${attrs.thickness_mm}`)
  }
  if (attrs.grade) parts.push(attrs.grade)
  return <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{parts.join(' · ') || '—'}</span>
}

function EditRow({
  item, onSave, onCancel,
}: {
  item: ReviewQueueItem
  onSave: (attrs: VariantAttributes) => void
  onCancel: () => void
}) {
  const [raw, setRaw] = useState(JSON.stringify(item.derived_attrs, null, 2))
  const [error, setError] = useState('')

  function handleSave() {
    try {
      const parsed = JSON.parse(raw) as VariantAttributes
      onSave(parsed)
    } catch {
      setError('Invalid JSON')
    }
  }

  return (
    <tr>
      <td colSpan={6} style={{ padding: '12px 16px', background: '#F9FAFB' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
          Edit variant_attributes for {item.assembly_mark}
        </div>
        <textarea
          value={raw}
          onChange={e => { setRaw(e.target.value); setError('') }}
          rows={8}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 8, border: '1px solid #D1D5DB', borderRadius: 4, resize: 'vertical', boxSizing: 'border-box' }}
        />
        {error && <div style={{ color: '#DC2626', fontSize: 11, marginTop: 4 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={handleSave} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 5, border: 'none', background: '#C8202A', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            Save
          </button>
          <button onClick={onCancel} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 5, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </td>
    </tr>
  )
}

export function ReviewQueuePanel({ dispatchId }: Props) {
  const { data: queue, isLoading, isError, refetch } = useReviewQueue(dispatchId)
  const confirmMutation = useConfirmAssembly(dispatchId)
  const patchMutation = usePatchVariantAttrs(dispatchId)
  const [editingId, setEditingId] = useState<number | null>(null)

  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ marginBottom: 8, height: 40, background: '#F5F5F5', borderRadius: 4 }} />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>Failed to load Review Queue</div>
        <button onClick={() => refetch()} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 5, border: '1px solid #D9D9D9', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    )
  }

  if (!queue || queue.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: 48, gap: 8 }}>
        <CheckCircle2 size={36} style={{ color: '#16A34A' }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>No assemblies need review</div>
        <div style={{ fontSize: 12, color: '#9CA3AF' }}>All assemblies have high confidence</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 0', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#F9FAFB' }}>
            {['Assembly Mark', 'Shape', 'Dimensions / Profile', 'Grade', 'Confidence', 'Flags', 'Actions'].map(h => (
              <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {queue.map(item => [
            <tr key={item.assembly_id} style={{ borderBottom: '1px solid #F3F4F6' }}>
              <td style={{ padding: '10px 16px', fontWeight: 600, color: '#1F2937', whiteSpace: 'nowrap' }}>{item.assembly_mark}</td>
              <td style={{ padding: '10px 16px', fontFamily: 'monospace' }}>{item.derived_attrs.shape ?? '—'}</td>
              <td style={{ padding: '10px 16px' }}><AttrsCell attrs={item.derived_attrs} /></td>
              <td style={{ padding: '10px 16px', fontFamily: 'monospace' }}>{item.derived_attrs.grade ?? '—'}</td>
              <td style={{ padding: '10px 16px' }}><ConfidenceBadge confidence={item.confidence} /></td>
              <td style={{ padding: '10px 16px' }}><FlagsCell flags={item.derivation_flags} /></td>
              <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => confirmMutation.mutate(item.assembly_id)}
                    disabled={confirmMutation.isPending}
                    style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 4, border: 'none', background: '#DCFCE7', color: '#166534', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <CheckCircle2 size={12} /> Confirm
                  </button>
                  <button
                    onClick={() => setEditingId(editingId === item.assembly_id ? null : item.assembly_id)}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                </div>
              </td>
            </tr>,
            editingId === item.assembly_id && (
              <EditRow
                key={`edit-${item.assembly_id}`}
                item={item}
                onSave={attrs => {
                  patchMutation.mutate({ productId: item.product_id, attrs }, {
                    onSuccess: () => setEditingId(null),
                  })
                }}
                onCancel={() => setEditingId(null)}
              />
            ),
          ])}
        </tbody>
      </table>
    </div>
  )
}
