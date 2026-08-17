import type { ProgressImportChange } from '../../api/projectProgress'

// Field name → display label. Shared by both call sites (import review,
// history detail) so a "cut" diff always reads as "Cut" in either place —
// one label map, not two drifting copies.
const FIELD_LABEL: Record<string, string> = {
  cut: 'Cut', buildup: 'Build-Up', weld1: 'Weld', fitup_drill: 'Fitup/Drill', weld2: 'Weld (2)',
  qc_inspection: 'QC Inspection', primer: 'Primer', fireproof: 'Fireproof', top_coat: 'TOP', qc_final: 'QC Final Inspection',
  plan_load_date: 'PlanLoad', actual_load_date: 'Actual Load', loaded_pcs: 'จำนวนที่โหลด (Pcs.)',
  erected_pcs: 'Erection by Pcs.', erection_actual_finish_date: 'Actual Erection',
  payment_status: 'Payment Status', claimed_weight_kg: 'Claimed Weight (kg)', delivered_weight_kg: 'Delivered Weight (kg)',
}

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.04em', color: '#ABABAB', padding: '7px 10px', borderBottom: '1px solid #E0E0E0', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #EDEFF2', verticalAlign: 'middle' }
const mono: React.CSSProperties = { fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }

function formatValue(v: unknown): string {
  if (v == null || v === '') return '—'
  return String(v)
}

// Renders a { zone, mark, field, old, new }[] diff, grouped by zone then
// mark (matches are pre-sorted by the caller's data source, this just
// groups adjacent rows). Used by BOTH the import review modal (previewing
// what WILL change) and the History detail view (what DID change) — same
// shape, same rendering, so the two never read inconsistently.
export function ProgressDiffTable({ changes, emptyMessage = 'No changes' }: { changes: ProgressImportChange[]; emptyMessage?: string }) {
  if (!changes.length) {
    return <div style={{ padding: 16, textAlign: 'center', color: '#8E8E8E', fontSize: 12.5 }}>{emptyMessage}</div>
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
      <thead>
        <tr>
          <th style={th}>Zone</th>
          <th style={th}>Mark</th>
          <th style={th}>Field</th>
          <th style={th}>Old</th>
          <th style={{ ...th, width: 1 }} />
          <th style={th}>New</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c, i) => (
          <tr key={`${c.zone}-${c.mark}-${c.field}-${i}`}>
            <td style={{ ...td, color: '#8E8E8E' }}>{c.zone}</td>
            <td style={{ ...td, ...mono, fontWeight: 600 }}>{c.mark}</td>
            <td style={td}>{FIELD_LABEL[c.field] ?? c.field}</td>
            <td style={{ ...td, ...mono, color: '#ABABAB' }}>{formatValue(c.old)}</td>
            <td style={{ ...td, color: '#ABABAB' }}>→</td>
            <td style={{ ...td, ...mono, fontWeight: 600, color: '#1A1A1A' }}>{formatValue(c.new)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
