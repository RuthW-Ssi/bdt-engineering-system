import { AlertTriangle, Loader2 } from 'lucide-react'
import type { PreshopAssembly, PreshopCurrent } from '../../../api/bomPreshop'
import { diffAssemblies } from '../../../lib/bomPreshop'

// Someone saved this zone's pre-shop after this editor opened (2026-11-23, Tao):
// show who/when and what saving now would change, and let the Engineer decide.
// Shared POC accounts → the name may be our own; the time and the diff matter more.
const KIND = {
  changed: { text: 'เปลี่ยน', bg: '#E6F1FB', fg: '#0C447C' },
  removed: { text: 'ของคุณไม่มี (จะถูกเอาออก)', bg: '#FCEBEB', fg: '#A01A22' },
  added: { text: 'ของคุณเพิ่มใหม่', bg: '#EAF3DE', fg: '#27500A' },
}

export function PreshopConflictDialog({ current, baseRevision, mine, saving, onBack, onOverwrite }: {
  current: PreshopCurrent
  baseRevision: number | null
  mine: PreshopAssembly[]
  saving: boolean
  onBack: () => void
  onOverwrite: () => void
}) {
  const diff = diffAssemblies(current.assemblies, mine)
  const when = new Date(current.uploaded_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' })
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,.35)', zIndex: 50 }}>
      <div role="dialog" aria-modal="true" aria-label="Someone saved first" style={{ width: 'min(720px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 64px)', overflowY: 'auto', background: '#fff', borderRadius: 10, padding: '18px 20px' }}>
        <div className="flex items-center" style={{ gap: 8, fontSize: 15, fontWeight: 700, color: '#854F0B' }}>
          <AlertTriangle size={17} /> มีผู้บันทึก pre-shop zone นี้ไปก่อนแล้ว
        </div>
        <div style={{ fontSize: 12.5, color: '#555', margin: '4px 0 14px' }}>
          rev {current.revision} · บันทึกโดย {current.uploader ?? '—'} · {when} (คุณเริ่มแก้จาก {baseRevision == null ? 'หน้าว่าง' : `rev ${baseRevision}`})
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>ถ้าบันทึกตอนนี้ จะเปลี่ยนจาก rev {current.revision} ดังนี้</div>
        {diff.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#27500A', padding: '8px 10px', background: '#F4FAEC', borderRadius: 8 }}>ไม่มีความต่าง — ข้อมูลของคุณตรงกับ rev {current.revision}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {diff.map(d => (
              <div key={d.mark} style={{ border: '1px solid #E8E8E8', borderRadius: 8, padding: '7px 10px' }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13 }}>{d.mark}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 999, background: KIND[d.kind].bg, color: KIND[d.kind].fg }}>{KIND[d.kind].text}</span>
                </div>
                {d.changes.length > 0 && <div style={{ fontSize: 12.5, color: '#333', marginTop: 3 }}>{d.changes.join(' · ')}</div>}
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between" style={{ gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onBack} disabled={saving}
            style={{ height: 34, padding: '0 16px', fontSize: 13, color: '#555', background: '#fff', border: '1px solid #C2C2C2', borderRadius: 6, cursor: 'pointer' }}>กลับไปแก้ต่อ</button>
          <button type="button" onClick={onOverwrite} disabled={saving}
            className="flex items-center gap-1.5 disabled:opacity-40"
            style={{ height: 34, padding: '0 18px', fontSize: 13, fontWeight: 600, color: '#fff', background: '#C8202A', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            {saving && <Loader2 size={14} className="animate-spin" />}บันทึกทับเป็น rev {current.revision + 1}
          </button>
        </div>
      </div>
    </div>
  )
}
