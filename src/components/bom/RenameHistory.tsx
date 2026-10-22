import type { RenameEventDto } from '../../api/dispatches'
import { FIELD_LABEL } from '../progress/ProgressDiffTable'

// Pair / undo History on a BOM version (2026-10-21) — History standard:
// newest first (caller already sorts), type badge, who/when, field-level
// old → new.
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' })
const text = (v: string | number | null) => (v == null || v === '' ? '—' : String(v))

export function RenameHistory({ history }: { history: RenameEventDto[] }) {
  if (!history.length) return null
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>ประวัติการจับคู่ชื่อ</div>
      {history.map(e => (
        <div key={e.id} style={{ border: '1px solid #F0F0F0', borderRadius: 8, padding: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: e.action === 'PAIR' ? '#D1F2E0' : '#FEE2E2', color: e.action === 'PAIR' ? '#065F46' : '#991B1B' }}>
              {e.action === 'PAIR' ? 'จับคู่' : 'ยกเลิกคู่'}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{`${e.kind === 'ASSEMBLY' ? 'mark' : 'part'} ${e.from_mark} → ${e.to_mark}`}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#8E8E8E' }}>{`${e.recorded_by} · ${when(e.recorded_at)}`}</span>
          </div>
          {e.keep && <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{e.keep === 'old' ? 'ใช้ข้อมูลของชื่อเดิม' : 'ใช้ข้อมูลของชื่อใหม่'}</div>}
          {e.changes.length > 0 && (
            <table style={{ fontSize: 12, marginTop: 6 }}><tbody>
              {e.changes.map((c, i) => (
                <tr key={i}>
                  <td style={{ paddingRight: 12, color: '#555' }}>{FIELD_LABEL[c.field] ?? c.field}</td>
                  <td><s style={{ color: '#C8202A' }}>{text(c.old)}</s>{' → '}<b style={{ color: '#1E6B36' }}>{text(c.new)}</b></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      ))}
    </div>
  )
}
