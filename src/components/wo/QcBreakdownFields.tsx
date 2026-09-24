/**
 * QC breakdown of a mark's already-produced output (2026-09-23, replaces the
 * single "qty reusable" field — user: "เอา Scrapped Reusable เปลี่ยนเป็น Qc
 * passed, Rework, Renew"). Shared by every per-mark flow that can leave
 * leftover produced qty behind: remove-mark, cancel (one breakdown per mark
 * with qty_done > 0), and accept-new-version.
 */
export interface QcBreakdown {
  qty_qc_passed: string
  qty_rework: string
  qty_renew: string
}

export const EMPTY_QC_BREAKDOWN: QcBreakdown = { qty_qc_passed: '', qty_rework: '', qty_renew: '' }

function num(s: string): number {
  const n = Number(s)
  return s !== '' && Number.isFinite(n) ? n : 0
}

/** Sum of the three fields, blank fields treated as 0. */
export function qcBreakdownSum(v: Partial<QcBreakdown>): number {
  return num(v.qty_qc_passed ?? '') + num(v.qty_rework ?? '') + num(v.qty_renew ?? '')
}

/**
 * At least one field must be entered (a fully blank breakdown isn't a valid
 * "I looked at this" answer — mirrors qtyReusableValid's old `value === ''`
 * rejection), every entered field must be a non-negative number, and the sum
 * must not exceed `max` (qty_done). Entering exactly 0 in every field is
 * valid — "everything produced so far is worthless" is a legitimate answer,
 * same lesson as qtyReusableValid's own "accepts exactly 0" fix.
 */
export function qcBreakdownValid(v: QcBreakdown, max: number): boolean {
  const anyEntered = v.qty_qc_passed !== '' || v.qty_rework !== '' || v.qty_renew !== ''
  if (!anyEntered) return false
  for (const s of [v.qty_qc_passed, v.qty_rework, v.qty_renew]) {
    if (s === '') continue
    const n = Number(s)
    if (!Number.isFinite(n) || n < 0) return false
  }
  return qcBreakdownSum(v) <= max
}

export function QcBreakdownFields({ value, onChange, max }: { value: QcBreakdown; onChange: (next: QcBreakdown) => void; max?: number }) {
  const sum = qcBreakdownSum(value)
  const overMax = max != null && sum > max
  return (
    <div style={{ marginTop: 10 }}>
      <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>QC breakdown *</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <NumField label="QC Passed" value={value.qty_qc_passed} onChange={(v) => onChange({ ...value, qty_qc_passed: v })} />
        <NumField label="Rework" value={value.qty_rework} onChange={(v) => onChange({ ...value, qty_rework: v })} />
        <NumField label="Renew" value={value.qty_renew} onChange={(v) => onChange({ ...value, qty_renew: v })} />
      </div>
      {max != null && (
        <div style={{ fontSize: 11, color: overMax ? '#C8202A' : '#999', marginTop: 3 }}>
          {sum} / {max} already-produced qty accounted for{overMax ? ' — exceeds qty done' : ''}
        </div>
      )}
    </div>
  )
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ fontSize: 10.5, color: '#888', flex: 1 }}>
      <span style={{ display: 'block', marginBottom: 2 }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type="number"
        min={0}
        placeholder="0"
        style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, boxSizing: 'border-box' }}
      />
    </label>
  )
}
