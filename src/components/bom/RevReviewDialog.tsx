import { useState, type CSSProperties } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { RevEdit, RevReviewDto } from '../../api/dispatches'
import { diffLines, revError, rowResult } from '../../lib/bom/markRev'
import { InfoTip } from './InfoTip'

// Per-mark Rev review before save (2026-10-26, spec decision 5) — in the style
// of DrawingUploadModal's review table. ⚠ rows are where the Dispatch Note and
// the BOM compare disagree; the user settles each one.
const th: CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#8E8E8E', background: '#FAFAFA', whiteSpace: 'nowrap' }
const td: CSSProperties = { padding: '6px 10px', verticalAlign: 'top', fontSize: 13, borderTop: '1px solid #F0F0F0' }

interface Props { review: RevReviewDto; isUploading: boolean; onCancel: () => void; onConfirm: (revs: RevEdit[]) => void }

export function RevReviewDialog({ review, isUploading, onCancel, onConfirm }: Props) {
  const editable = review.rows.filter(r => r.editable)
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(editable.map(r => [r.mark, String(r.suggested_rev ?? '')])))
  const errors = Object.fromEntries(editable.map(r => [r.mark, revError(r, values[r.mark] ?? '')]))
  const blocked = Object.values(errors).some(Boolean) || isUploading
  const warnCount = review.rows.filter(r => r.warning).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div style={{ background: 'white', borderRadius: 12, width: 'min(980px, 95vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between" style={{ padding: '16px 20px', borderBottom: '1px solid #EEE' }}>
          <div className="flex items-center" style={{ gap: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>ตรวจ Rev ก่อนบันทึก</span>
            <InfoTip label="Rev ขึ้นเมื่อไร" text="Rev ของ mark ขึ้นเมื่อข้อมูล BOM ของ mark นั้นเปลี่ยนเท่านั้น. แถวที่มี ⚠ คือ Dispatch Note กับไฟล์ BOM ไม่ตรงกัน ให้ตรวจแล้วแก้ Rev เอง." />
          </div>
          <button onClick={onCancel} disabled={isUploading} aria-label="ปิด" className="disabled:opacity-40" style={{ background: 'none', border: 'none', cursor: isUploading ? 'default' : 'pointer', color: '#8E8E8E', display: 'flex' }}><X size={16} /></button>
        </div>

        <div style={{ padding: '12px 20px', fontSize: 13, color: '#555' }}>
          {warnCount > 0 ? `ตรวจแถวที่มี ⚠ (${warnCount} แถว). แก้ Rev ได้ในช่องสีขาว. แล้วกด บันทึก` : 'ดูรายการ แล้วกด บันทึก'}
        </div>
        {review.dn_only_marks.length > 0 && (
          <div style={{ margin: '0 20px 8px', padding: '8px 12px', background: '#FFF7E6', color: '#8A5A00', borderRadius: 6, fontSize: 13 }}>
            {`⚠ มี mark ใน Dispatch Note แต่ไม่มีในไฟล์ BOM: ${review.dn_only_marks.join(', ')} — ส่งไฟล์ไม่ครบ หรือผิดชุด?`}
          </div>
        )}
        {review.dn_warnings.map(w => (
          <div key={w} style={{ margin: '0 20px 8px', padding: '6px 12px', background: '#FFF7E6', color: '#8A5A00', borderRadius: 6, fontSize: 12 }}>{`คำเตือนตอนอ่าน Dispatch Note: ${w}`}</div>
        ))}

        <div style={{ overflowY: 'auto', flex: 1, padding: '0 20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Mark</th><th style={th}>ผล</th><th style={th}>Rev เดิม → ใหม่</th><th style={th}>อะไรเปลี่ยน</th>
              {review.has_dn && <th style={th}>STATUS ใน Dispatch Note</th>}
            </tr></thead>
            <tbody>
              {review.rows.map(r => (
                <tr key={r.mark} style={{ background: r.warning ? '#FFFBEB' : undefined }}>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600 }}>{r.mark}</td>
                  <td style={{ ...td, color: r.warning ? '#8A5A00' : '#333' }}>{rowResult(r, review.has_dn)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#888' }}>{r.prev_rev ?? '—'}</span>{' → '}
                    {r.editable ? (
                      <>
                        <input aria-label={`Rev ใหม่ของ ${r.mark}`} inputMode="numeric" value={values[r.mark] ?? ''}
                          onChange={e => setValues(v => ({ ...v, [r.mark]: e.target.value }))}
                          style={{ width: 56, padding: '3px 6px', fontSize: 13, border: `1px solid ${errors[r.mark] ? '#C8202A' : '#C2C2C2'}`, borderRadius: 4 }} />
                        {errors[r.mark] && <div style={{ fontSize: 11.5, color: '#C8202A', marginTop: 2 }}>{errors[r.mark]}</div>}
                      </>
                    ) : <b>{r.suggested_rev ?? '—'}</b>}
                  </td>
                  <td style={{ ...td, fontSize: 12.5, color: '#555' }}>{diffLines(r.diff).map(l => <div key={l}>{l}</div>)}</td>
                  {review.has_dn && <td style={{ ...td, fontSize: 12.5, color: '#888' }}>{r.dn_status ?? '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end" style={{ gap: 8, padding: '14px 20px', borderTop: '1px solid #EEE' }}>
          <button onClick={onCancel} disabled={isUploading} className="disabled:opacity-40" style={{ fontSize: 13, padding: '6px 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: 'white' }}>ยกเลิก</button>
          <button onClick={() => onConfirm(editable.map(r => ({ mark: r.mark, rev: Number(values[r.mark]) })))} disabled={blocked}
            className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40" style={{ height: 34, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#185FA5' }}>
            {isUploading && <Loader2 size={13} className="animate-spin" />}บันทึก
          </button>
        </div>
      </div>
    </div>
  )
}
