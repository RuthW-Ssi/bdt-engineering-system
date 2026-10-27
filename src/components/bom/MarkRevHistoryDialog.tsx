import { X } from 'lucide-react'
import { useMarkRevHistory } from '../../hooks/useBomDispatches'
import type { MarkRevEntryDto, PartLineDto } from '../../api/dispatches'
import { MARK_FIELD_LABEL, PART_FIELD_LABEL, REV_SOURCE_LABEL, showValue, uploadLabel } from '../../lib/bom/markRev'

// A mark's BOM Rev history (2026-10-26, spec decision 7) — History standard
// (wiki tech/frontend/history-design.md): newest first, one card per rev,
// who/when top-right, ~~old~~ → **new**, parts as a small table.
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' })
const partText = (p: PartLineDto) => [p.profile, p.grade, p.length_mm != null ? `L${p.length_mm}` : null, p.qty != null ? `×${p.qty}/ชุด` : null, p.weight_kg != null ? `${p.weight_kg} kg/ชิ้น` : null].filter(Boolean).join(' ')
const OldNew = ({ old, now }: { old: string | number | null; now: string | number | null }) => (
  <><s style={{ color: '#C8202A' }}>{showValue(old)}</s>{' → '}<b style={{ color: '#1E6B36' }}>{showValue(now)}</b></>
)
const Badge = ({ text, bg, fg }: { text: string; bg: string; fg: string }) => (
  <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 10, background: bg, color: fg }}>{text}</span>
)

function Entry({ e }: { e: MarkRevEntryDto }) {
  const d = e.diff
  const noChange = !!d && !d.fields.length && !d.parts_added.length && !d.parts_removed.length && !d.parts_changed.length
  return (
    <div style={{ border: '1px solid #EEE', borderRadius: 8, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span data-testid="rev-badge" style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 10, background: '#E3EEF8', color: '#0C447C' }}>{`Rev ${e.rev}`}</span>
        {e.first && <Badge text="ใหม่" bg="#D1F2E0" fg="#065F46" />}
        {e.rev_source === 'MANUAL' && <Badge text={REV_SOURCE_LABEL.MANUAL} bg="#FEF3C7" fg="#92400E" />}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#8E8E8E' }}>{`${uploadLabel(e.upload_no)} · ${e.uploaded_by} · ${when(e.uploaded_at)}`}</span>
      </div>
      {e.renamed_from && <div style={{ fontSize: 12.5, color: '#0C447C', marginTop: 6 }}>{`เปลี่ยนชื่อ ${e.renamed_from} → ${e.mark}`}</div>}
      {e.dn_status && <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{`STATUS ใน Dispatch Note: ${e.dn_status}`}</div>}
      {e.values && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, fontSize: 12 }}>
          {Object.entries(MARK_FIELD_LABEL).map(([k, label]) => {
            const v = (e.values as unknown as Record<string, string | number | null>)[k]
            return v == null ? null : <span key={k} style={{ background: '#F5F5F5', borderRadius: 4, padding: '1px 6px' }}>{`${label} ${v}`}</span>
          })}
          {e.values.parts.map(p => <span key={p.part_mark} style={{ background: '#F5F5F5', borderRadius: 4, padding: '1px 6px' }}>{`${p.part_mark} ${partText(p)}`}</span>)}
        </div>
      )}
      {noChange && <div style={{ fontSize: 12.5, color: '#555', marginTop: 6 }}>ข้อมูล BOM ไม่เปลี่ยน</div>}
      {d && d.fields.length > 0 && (
        <table style={{ fontSize: 12.5, marginTop: 6 }}><tbody>
          {d.fields.map(c => <tr key={c.field}><td style={{ paddingRight: 12, color: '#555' }}>{MARK_FIELD_LABEL[c.field] ?? c.field}</td><td><OldNew old={c.old} now={c.new} /></td></tr>)}
        </tbody></table>
      )}
      {d && d.parts_added.length + d.parts_removed.length + d.parts_changed.length > 0 && (
        <table style={{ fontSize: 12, marginTop: 6, borderCollapse: 'collapse' }}><tbody>
          {d.parts_added.map(p => <tr key={`a${p.part_mark}`}><td style={{ paddingRight: 8 }}><Badge text="เพิ่ม" bg="#D1F2E0" fg="#065F46" /></td><td style={{ fontFamily: 'monospace' }}>{p.part_mark}</td><td style={{ paddingLeft: 8, color: '#555' }}>{partText(p)}</td></tr>)}
          {d.parts_removed.map(p => <tr key={`r${p.part_mark}`}><td style={{ paddingRight: 8 }}><Badge text="ลบ" bg="#FEE2E2" fg="#991B1B" /></td><td style={{ fontFamily: 'monospace' }}><s>{p.part_mark}</s></td><td style={{ paddingLeft: 8, color: '#555' }}>{partText(p)}</td></tr>)}
          {d.parts_changed.map(p => <tr key={`c${p.part_mark}`}><td style={{ paddingRight: 8 }}><Badge text="แก้" bg="#FEF3C7" fg="#92400E" /></td><td style={{ fontFamily: 'monospace' }}>{p.part_mark}</td>
            <td style={{ paddingLeft: 8 }}>{p.changes.map((c, i) => <span key={c.field}>{i > 0 && ', '}{`${PART_FIELD_LABEL[c.field] ?? c.field} `}<OldNew old={c.old} now={c.new} /></span>)}</td></tr>)}
        </tbody></table>
      )}
    </div>
  )
}

export function MarkRevHistoryDialog({ assemblyId, mark, onClose }: { assemblyId: number; mark: string; onClose: () => void }) {
  const { data, isLoading, isError } = useMarkRevHistory(assemblyId)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, width: 'min(720px, 95vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between" style={{ padding: '14px 18px', borderBottom: '1px solid #EEE' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{`ประวัติ Rev · ${mark}`}</span>
          <button onClick={onClose} aria-label="ปิด" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8E8E8E', display: 'flex' }}><X size={16} /></button>
        </div>
        <div style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {isLoading && <div style={{ color: '#8E8E8E', fontSize: 13 }}>กำลังโหลด…</div>}
          {isError && <div style={{ color: '#C8202A', fontSize: 13 }}>โหลดประวัติ Rev ไม่สำเร็จ</div>}
          {data && data.entries.length === 0 && <div style={{ color: '#8E8E8E', fontSize: 13 }}>ยังไม่มีประวัติการอัปโหลด</div>}
          {data?.entries.map(e => <Entry key={`${e.dispatch_id}-${e.rev}-${e.mark}`} e={e} />)}
        </div>
      </div>
    </div>
  )
}
