import { useState } from 'react'
import type { BomVersionStatus, WoDetail as WoDetailT } from '../../api/wo'

/**
 * Small reusable numeric input for "qty reusable" — shown by both the
 * Accept-hold modal (this file) and WoDetail's generic Cancel modal when
 * qty_done already exceeds the target, per the WO BOM-Version Hold feature
 * (Sprint 20, T-WO.08).
 */
export function QtyReusableField({ value, onChange, max }: { value: string; onChange: (v: string) => void; max?: number }) {
  return (
    <div style={{ marginTop: 10 }}>
      <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Qty reusable *</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type="number"
        min={0}
        max={max}
        placeholder={max != null ? `> 0 and ≤ ${max}` : undefined}
        style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }}
      />
      <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>Qty already produced that can still be used after this change.</div>
    </div>
  )
}

export function qtyReusableValid(value: string, max: number): boolean {
  if (value === '') return false
  const n = Number(value)
  return Number.isFinite(n) && n > 0 && n <= max
}

/**
 * Accept-new-version resolution form for an ON_HOLD work order. Requires a
 * non-empty `note`; additionally requires `qty_reusable` when qty_done
 * already exceeds the newly-adopted target qty (delta_details.qty.to).
 * Never rendered when delta_types includes 'REMOVED' — the caller (WoDetail)
 * is responsible for hiding the Accept action entirely in that case, since
 * the backend 409s on accept for a removed assembly (cancel is the only
 * resolution then).
 */
export function WoHoldResolutionModal({
  wo,
  bom,
  isPending,
  onClose,
  onSubmit,
}: {
  wo: WoDetailT
  bom: BomVersionStatus
  isPending: boolean
  onClose: () => void
  onSubmit: (body: { note: string; qty_reusable?: number }) => void
}) {
  const [note, setNote] = useState('')
  const [qtyReusable, setQtyReusable] = useState('')

  const qtyDone = wo.qty_done != null ? Number(wo.qty_done) : 0
  const qtyDelta = bom.delta_types.includes('QTY_CHANGED')
    ? (bom.delta_details as { qty?: { from: number; to: number } } | null)?.qty
    : undefined
  const needsQtyReusable = qtyDelta != null && qtyDone > qtyDelta.to

  const canSubmit = note.trim().length > 0 && (!needsQtyReusable || qtyReusableValid(qtyReusable, qtyDone))

  function handleSubmit() {
    if (!canSubmit) return
    onSubmit({ note: note.trim(), qty_reusable: needsQtyReusable ? Number(qtyReusable) : undefined })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', width: 440 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Accept new BOM version · {wo.wo_code}</h2>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
          This resolves the hold by adopting dispatch #{bom.latest_dispatch_id} ({bom.delta_types.join(' · ') || 'change'}) and returns
          the WO to its status before the hold. A note is required.
        </p>
        <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Note *</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
          rows={3}
          placeholder="Explain how this hold is being resolved…"
          style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, resize: 'vertical' }}
        />
        {needsQtyReusable && <QtyReusableField value={qtyReusable} onChange={setQtyReusable} max={qtyDone} />}
        <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>
            Close
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !canSubmit}
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: '#1E6B36', color: '#fff', cursor: 'pointer', opacity: isPending || !canSubmit ? 0.6 : 1 }}
          >
            {isPending ? 'Accepting…' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}
