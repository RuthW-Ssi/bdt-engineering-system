import { Link } from 'react-router-dom'
import type { MarkOpProgress } from '../../api/mo'
import { WoStatusPill } from '../wo/WoStatusPill'
import { fmtFinish } from '../wo/progressChanges'

// One mark's production progress on the MO's Assemblies tab (user feedback
// 2026-10-14: "mark นี้ผ่านการทำงานอะไรมาแล้วบ้างมี status อะไรเท่าไหร่").
// Every operation in routing order; an operation is finished (green) once every
// WO of it is Done (user 2026-10-14) and they cover the mark's sets in QC Passed.
export type OpProgress = MarkOpProgress

const seq = (n: number) => String(n).padStart(3, '0')

// Same palette as WoStatusPill: Done / In Progress / Not Started.
const TONE = {
  done: { bg: '#E3F4E8', fg: '#1E6B36' },
  active: { bg: '#FAEEDA', fg: '#854F0B' },
  none: { bg: '#F0F0F0', fg: '#555555' },
}

function chipState(op: OpProgress) {
  if (op.wos.length && op.wos.every(w => w.status === 'DONE') && op.qc_passed >= op.need) return { tone: TONE.done, mark: '✓' }
  if (op.wos.length) return { tone: TONE.active, mark: `${op.qc_passed}/${op.need}` }
  return { tone: TONE.none, mark: '–' }
}

/** The Allocation cell: one chip per operation, linking to its (first) WO. */
export function ProgressChips({ ops }: { ops: OpProgress[] }) {
  if (!ops.length) return <span>—</span>
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {ops.map(op => {
        const { tone, mark } = chipState(op)
        const style: React.CSSProperties = {
          background: tone.bg, color: tone.fg, borderRadius: 999, padding: '1px 8px',
          fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', textDecoration: 'none',
        }
        // a mark can be split across several WOs of one operation (user 2026-10-14)
        const label = `${seq(op.sequence)} ${op.name} ${mark}${op.wos.length > 1 ? ` · ${op.wos.length} WO` : ''}`
        return op.wos.length
          ? <Link key={op.sequence} to={`/order/wo/${op.wos[0].wo_id}`} style={style}>{label}</Link>
          : <span key={op.sequence} style={style}>{label}</span>
      })}
    </span>
  )
}

const th: React.CSSProperties = { padding: '6px 10px' }
const num: React.CSSProperties = { padding: '6px 10px', textAlign: 'right' }
const show = (v: number | null) => (v == null ? '–' : String(v))

/** Under the parts when the row is open: a row per WO, operations in routing order. */
export function ProgressTable({ ops }: { ops: OpProgress[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#FAFAFA', borderRadius: 6 }}>
      <thead>
        <tr style={{ color: '#888', fontSize: 10.5, textTransform: 'uppercase', textAlign: 'left' }}>
          <th style={th}>Op</th>
          <th style={th}>Operation</th>
          <th style={th}>WO</th>
          <th style={th}>Status</th>
          <th style={{ ...th, textAlign: 'right' }}>Qty in WO</th>
          <th style={{ ...th, textAlign: 'right' }}>Not Started</th>
          <th style={{ ...th, textAlign: 'right' }}>In Progress</th>
          <th style={{ ...th, textAlign: 'right' }}>Done</th>
          <th style={{ ...th, textAlign: 'right' }}>QC Passed</th>
          <th style={{ ...th, textAlign: 'right' }}>Rework</th>
          <th style={{ ...th, textAlign: 'right' }}>Renew</th>
          <th style={{ ...th, textAlign: 'right' }}>Finished</th>
        </tr>
      </thead>
      <tbody>
        {ops.flatMap(op => {
          const head = [
            <td key="seq" style={{ ...th, fontFamily: 'monospace', color: '#999' }}>{seq(op.sequence)}</td>,
            <td key="name" style={th}>{op.name}</td>,
          ]
          if (!op.wos.length) {
            return [
              <tr key={op.sequence} style={{ borderTop: '1px solid #EEE' }}>
                {head}
                <td colSpan={10} style={{ ...th, color: '#999' }}>ยังไม่ออก WO</td>
              </tr>,
            ]
          }
          return op.wos.map(w => (
            <tr key={`${op.sequence}-${w.wo_id}`} style={{ borderTop: '1px solid #EEE' }}>
              {head}
              <td style={th}><Link to={`/order/wo/${w.wo_id}`} style={{ color: '#0C447C', textDecoration: 'none', fontFamily: 'monospace' }}>{w.wo_code}</Link></td>
              <td style={th}><WoStatusPill status={w.status} /></td>
              <td style={{ ...num, fontWeight: 700 }}>{w.qty_planned}</td>
              <td style={num}>{show(w.qty_not_started)}</td>
              <td style={num}>{show(w.qty_in_progress)}</td>
              <td style={{ ...num, fontWeight: 600 }}>{show(w.qty_done)}</td>
              <td style={{ ...num, color: '#1E6B36', fontWeight: 600 }}>{show(w.qty_qc_passed)}</td>
              <td style={num}>{show(w.qty_rework)}</td>
              <td style={num}>{show(w.qty_renew)}</td>
              <td style={{ ...num, whiteSpace: 'nowrap' }}>{w.actual_finish ? fmtFinish(w.actual_finish) : '—'}</td>
            </tr>
          ))
        })}
      </tbody>
    </table>
  )
}
