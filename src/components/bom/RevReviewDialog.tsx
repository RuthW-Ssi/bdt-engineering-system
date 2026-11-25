import { useState, type CSSProperties, type ReactNode } from 'react'
import { X, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import type { PartReviewRowDto, RenamePairInput, RevEdit, RevReviewDto } from '../../api/dispatches'
import { PART_FIELD_LABEL, showValue, cancelledNote, diffGroups, missingDecisions, orderReviewRows, removedStillInDn, renameNote, renamesFrom, revError, rowResult, type MissingDecision } from '../../lib/bom/markRev'
import { InfoTip } from './InfoTip'

// Per-mark Rev review before save (2026-10-26, spec decision 5) — in the style
// of DrawingUploadModal's review table. ⚠ rows are where the Dispatch Note and
// the BOM compare disagree; the user settles each one.
const th: CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#8E8E8E', background: '#FAFAFA', verticalAlign: 'bottom', position: 'sticky', top: 0, zIndex: 1 }
// One style for every ⚠ box above the table (row count + file-level), so they read as the same kind of message.
const warnBox: CSSProperties = { margin: '0 20px 8px', padding: '8px 12px', background: '#FFF7E6', color: '#8A5A00', borderRadius: 6, fontSize: 13 }
const td: CSSProperties = { padding: '6px 10px', verticalAlign: 'top', fontSize: 13, borderTop: '1px solid #F0F0F0' }

// Row tint: ⚠ amber wins; else new = light green, removed = light red (lighter tints of the
// BOM diff badges' #D1FAE5 / #FEE2E2, text #065F46 / #991B1B).
const ROW_TINT = { warn: { bg: '#FFFBEB', fg: '#8A5A00' }, added: { bg: '#F0FDF4', fg: '#065F46' }, removed: { bg: '#FEF2F2', fg: '#991B1B' } }

// A missing mark or part is deleted or renamed — the user says which before save (2026-11-23, Tao):
// no default, save waits until every removed row has a choice. Renames go to the
// rename-pair endpoint right after the upload (needs boms:update → `allowRename`).
export type RenameChoice = RenamePairInput
interface Props { review: RevReviewDto; isUploading: boolean; onCancel: () => void; onConfirm: (revs: RevEdit[], renames: RenameChoice[]) => void; allowRename?: boolean }

type Slot = 'MAIN' | 'ACC' | null

/** A ⚠ box folded to its title by default (Tao 2026-11-23); `summary` shows only while folded. */
function FoldWarning({ title, summary, children }: { title: string; summary?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={warnBox}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="flex items-center" style={{ gap: 6, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', fontSize: 'inherit', textAlign: 'left' }}>
        {open ? <ChevronDown size={14} style={{ flexShrink: 0 }} /> : <ChevronRight size={14} style={{ flexShrink: 0 }} />}
        <span>{title}</span>
        {!open && summary && <span style={{ opacity: 0.8 }}>{summary}</span>}
      </button>
      {open && <div style={{ paddingLeft: 20, marginTop: 4, lineHeight: 1.6 }}>{children}</div>}
    </div>
  )
}

/** One foldable group in the "อะไรเปลี่ยน" cell. */
function DiffGroup({ label, summary, lines }: { label: string; summary: string; lines: string[] }) {
  const [open, setOpen] = useState(false)
  if (!lines.length) return null
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={`${label} (${lines.length})`}
        className="flex items-center" style={{ gap: 4, background: 'none', border: 'none', padding: '1px 0', cursor: 'pointer', fontSize: 12, color: '#555', textAlign: 'left' }}>
        {open ? <ChevronDown size={13} color="#8E8E8E" /> : <ChevronRight size={13} color="#8E8E8E" />}
        <span style={{ fontWeight: 600, color: '#1F1F1F' }}>{label}</span>
        {!open && <span style={{ color: '#8E8E8E' }}>{summary}</span>}
      </button>
      {open && <div style={{ paddingLeft: 17 }}>{lines.map(l => <div key={l}>{l}</div>)}</div>}
    </div>
  )
}

// Both groups folded by default — the part list can run to dozens of lines (Tao 2026-11-23)
function DiffCell({ diff }: { diff: RevReviewDto['rows'][number]['diff'] }) {
  const g = diffGroups(diff)
  return (
    <>
      <DiffGroup label="Assembly" summary={g.assemblySummary} lines={g.assembly} />
      <DiffGroup label="Part" summary={g.partSummary} lines={g.part} />
    </>
  )
}
/** Decisions for one kind (marks or parts) — same rules for both. */
function useMissingDecisions(removed: { mark: string; kind: 'removed' | 'added' | 'changed' | 'unchanged' }[]) {
  const [decisions, setDecisions] = useState<Record<string, MissingDecision>>({})
  const undecided = missingDecisions(removed, decisions)
  const takenBy = (except: string) => new Set(Object.entries(decisions).filter(([m, d]) => m !== except && typeof d === 'object').map(([, d]) => (d as { rename: string }).rename))
  const valueOf = (mark: string) => { const d = decisions[mark]; return !d ? '' : d === 'delete' ? 'delete' : `rename:${d.rename}` }
  const choose = (mark: string, v: string) => setDecisions(ds => {
    const next = { ...ds }
    if (!v) delete next[mark]
    else next[mark] = v === 'delete' ? 'delete' : { rename: v.slice('rename:'.length) }
    return next
  })
  const deleteRest = () => setDecisions(ds => ({ ...ds, ...Object.fromEntries(undecided.map(m => [m, 'delete' as const])) }))
  return { decisions, undecided, takenBy, valueOf, choose, deleteRest }
}

/** Separate mode: a missing MAIN row can only become a new MAIN one (and ACC → ACC); combined has no slot. */
const sameSlot = (a: Slot, b: Slot) => a == null || b == null || a === b

function DecisionSelect({ label, mark, slot, hint, added, allowRename, unit, d }: {
  label: string; mark: string; slot: Slot; hint: string | null; added: { mark: string; slot: Slot }[]; allowRename: boolean; unit: string
  d: ReturnType<typeof useMissingDecisions>
}) {
  const taken = d.takenBy(mark)
  const targets = added.filter(a => sameSlot(slot, a.slot)).map(a => a.mark)
  const suggested = allowRename && hint && targets.includes(hint) ? hint : null
  const others = allowRename ? targets.filter(m => m !== suggested) : []
  return (
    <select aria-label={label} value={d.valueOf(mark)} onChange={e => d.choose(mark, e.target.value)}
      style={{ display: 'block', width: '100%', marginTop: 6, fontSize: 12.5, padding: '3px 4px', color: '#1F1F1F', border: `1px solid ${d.decisions[mark] ? '#C2C2C2' : '#C8202A'}`, borderRadius: 4, background: 'white' }}>
      <option value="">— เลือก —</option>
      <option value="delete">ลบออกจาก BOM</option>
      {suggested && <optgroup label="ระบบแนะนำ"><option value={`rename:${suggested}`} disabled={taken.has(suggested)}>{`เปลี่ยนเป็น ${suggested}`}</option></optgroup>}
      {others.length > 0 && (
        <optgroup label={`เปลี่ยนเป็น ${unit}…`}>
          {others.map(m => <option key={m} value={`rename:${m}`} disabled={taken.has(m)}>{`เปลี่ยนเป็น ${m}`}</option>)}
        </optgroup>
      )}
    </select>
  )
}

export function RevReviewDialog({ review, isUploading, onCancel, onConfirm, allowRename = false }: Props) {
  const editable = review.rows.filter(r => r.editable)
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(editable.map(r => [r.mark, String(r.suggested_rev ?? '')])))
  const errors = Object.fromEntries(editable.map(r => [r.mark, revError(r, values[r.mark] ?? '')]))
  const marks = useMissingDecisions(review.rows.filter(r => r.kind === 'removed'))
  const addedMarks = review.rows.filter(r => r.kind === 'added')
  const stillInDn = removedStillInDn(review.rows)
  const allParts: PartReviewRowDto[] = review.parts ?? []
  const removedParts = allParts.filter(p => p.kind === 'removed')
  const addedParts = allParts.filter(p => p.kind === 'added')
  const parts = useMissingDecisions(removedParts)
  const partsStillUsed = removedParts.filter(p => p.still_used).length
  const [partsOpen, setPartsOpen] = useState(true)
  const conflicts = review.part_conflicts ?? []
  const thickness = review.nc_profile_mismatches ?? []
  // Filters (2026-11-23, Tao): they only hide rows — hidden undecided rows still block save and are still counted
  type Kind = RevReviewDto['rows'][number]['kind']
  const [show, setShow] = useState({ asm: true, part: true, added: true, changed: true, removed: true, unchanged: true })
  const toggle = (k: keyof typeof show) => setShow(v => ({ ...v, [k]: !v[k] }))
  const kindCount = (k: Kind) => review.rows.filter(r => r.kind === k).length + (k === 'removed' ? removedParts.length : 0)
  const visibleRows = show.asm ? orderReviewRows(review.rows).filter(r => show[r.kind]) : []
  const showParts = show.part && show.removed && removedParts.length > 0
  type Filter = { key: keyof typeof show; label: string; count: number }
  const filters: Filter[][] = ([
    [{ key: 'asm', label: 'Assembly', count: review.rows.length }, { key: 'part', label: 'Part', count: removedParts.length }],
    [{ key: 'added', label: 'Added', count: kindCount('added') }, { key: 'changed', label: 'Changed', count: kindCount('changed') },
     { key: 'removed', label: 'Deleted', count: kindCount('removed') }, { key: 'unchanged', label: 'Unchanged', count: kindCount('unchanged') }],
  ] as Filter[][]).map(g => g.filter(f => f.key !== 'unchanged' || f.count > 0))
  const undecidedText = [marks.undecided.length && `${marks.undecided.length} mark`, parts.undecided.length && `${parts.undecided.length} part`].filter(Boolean).join(', ')
  const deleteRest = () => { marks.deleteRest(); parts.deleteRest() }
  const renames: RenameChoice[] = [
    ...renamesFrom(marks.decisions).map(r => ({ kind: 'ASSEMBLY' as const, ...r })),
    ...renamesFrom(parts.decisions).map(r => ({ kind: 'PART' as const, ...r })),
  ]
  const blocked = Object.values(errors).some(Boolean) || isUploading || !!undecidedText
  const warns = (r: RevReviewDto['rows'][number]) => !!r.warning || r.dn_cancelled_in_files
  const warnCount = review.rows.filter(warns).length
  const tintOf = (r: RevReviewDto['rows'][number]) => (warns(r) ? ROW_TINT.warn : r.kind === 'added' ? ROW_TINT.added : r.kind === 'removed' ? ROW_TINT.removed : null)

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

        <div style={{ height: 12 }} />
        {warnCount > 0
          ? <div style={warnBox}>{`⚠ มี ${warnCount} แถวที่ต้องตรวจ (แถวสีเหลือง) — แก้ Rev ในช่องสีขาว แล้วกด บันทึก`}</div>
          : <div style={{ padding: '0 20px 12px', fontSize: 13, color: '#555' }}>ดูรายการ แล้วกด บันทึก</div>}
        {review.dn_only_marks.length > 0 && (
          <div style={warnBox}>
            {`⚠ มี mark ใน Dispatch Note แต่ไม่มีในไฟล์ BOM: ${review.dn_only_marks.join(', ')} — ส่งไฟล์ไม่ครบ หรือผิดชุด?`}
          </div>
        )}
        {(stillInDn.length > 0 || partsStillUsed > 0) && (
          // one box for both incomplete-export signs (Tao: two boxes is cluttered); counts only — the rows show which
          <FoldWarning title={`⚠ ${[stillInDn.length > 0 && 'Assembly List', partsStillUsed > 0 && 'Part List'].filter(Boolean).join(' / ')} อาจ export ไม่ครบ`}
            summary={`— ${[stillInDn.length > 0 && `${stillInDn.length} mark`, partsStillUsed > 0 && `${partsStillUsed} part`].filter(Boolean).join(' · ')}`}>
            {stillInDn.length > 0 && <div>{`${stillInDn.length} mark ที่จะถูกลบยังอยู่ใน Dispatch Note`}</div>}
            {partsStillUsed > 0 && <div>{`${partsStillUsed} part ที่จะถูกลบยังถูกใช้ใน assembly`}</div>}
          </FoldWarning>
        )}
        {conflicts.length > 0 && (
          // same mark in both Part Lists, different data — MAIN's row is kept (2026-11-23, Tao); warn only, save not blocked
          <FoldWarning title={`⚠ ${conflicts.length} part อยู่ทั้งใน Part List MAIN และ ACC แต่ข้อมูลไม่ตรงกัน — ระบบจะใช้ของ MAIN`}>
            {conflicts.map(c => (
              <div key={c.mark}>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, marginRight: 10 }}>{c.mark}</span>
                {c.fields.map(f => `${PART_FIELD_LABEL[f.field] ?? f.field} MAIN ${showValue(f.main)} · ACC ${showValue(f.acc)}`).join(', ')}
              </div>
            ))}
          </FoldWarning>
        )}
        {thickness.length > 0 && (
          // Part List profile is kept (2026-11-25, Tao); warn only, save not blocked
          <FoldWarning title={`⚠ ${thickness.length} part ความหนาใน Part List ไม่ตรงกับไฟล์ NC — ระบบจะใช้ของ Part List`}>
            {thickness.map(t => (
              <div key={t.mark}>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, marginRight: 10 }}>{t.mark}</span>
                {`Part List ${t.part_list} · NC ${t.nc}`}
              </div>
            ))}
          </FoldWarning>
        )}
        {review.dn_warnings.map(w => (
          <div key={w} style={{ margin: '0 20px 8px', padding: '6px 12px', background: '#FFF7E6', color: '#8A5A00', borderRadius: 6, fontSize: 12 }}>{`คำเตือนตอนอ่าน Dispatch Note: ${w}`}</div>
        ))}

        {/* app theme: red accent checkbox (Progress table), uppercase control label (Schedule toolbar) */}
        <div className="flex flex-wrap items-center" style={{ gap: '6px 0', margin: '4px 20px 10px', padding: '7px 12px', border: '1px solid #E0E0E0', borderRadius: 8, background: 'white' }}>
          {filters.map((g, i) => (
            <div key={i} className="flex items-center" style={{ gap: 14, paddingLeft: i ? 14 : 0, marginLeft: i ? 14 : 0, borderLeft: i ? '1px solid #E0E0E0' : 'none' }}>
              <span className="text-[11px] text-[#555555] uppercase tracking-[.5px]">{i === 0 ? 'Type' : 'Result'}</span>
              {g.map(f => (
                <label key={f.key} className="flex items-center select-none" style={{ gap: 6, cursor: 'pointer', fontSize: 13, color: '#1F1F1F' }}>
                  <input type="checkbox" checked={show[f.key]} onChange={() => toggle(f.key)} aria-label={`${f.label} (${f.count})`}
                    style={{ width: 14, height: 14, accentColor: '#C8202A', cursor: 'pointer', margin: 0 }} />
                  <span>{f.label} <span style={{ color: '#8E8E8E' }}>{f.count}</span></span>
                </label>
              ))}
            </div>
          ))}
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '0 20px' }}>
          {!visibleRows.length && !showParts && <div style={{ padding: '16px 0', fontSize: 13, color: '#8E8E8E' }}>ไม่มีรายการตามตัวกรอง</div>}
          {visibleRows.length > 0 && (
          /* Fixed widths so a long ⚠ wraps inside ผล instead of squeezing Mark or pushing the table wide */
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 150 }} /><col style={{ width: 240 }} /><col style={{ width: 120 }} /><col />
              {review.has_dn && <col style={{ width: 110 }} />}
            </colgroup>
            <thead><tr>
              <th style={th}>Assembly Mark</th><th style={th}>ผล</th><th style={th}>Rev เดิม → ใหม่</th><th style={th}>อะไรเปลี่ยน</th>
              {review.has_dn && <th style={th}>Status (DN)</th>}
            </tr></thead>
            <tbody>
              {visibleRows.map(r => (
                <tr key={r.mark} style={{ background: tintOf(r)?.bg }}>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.mark}>{r.mark}</td>
                  <td style={{ ...td, color: r.warning || r.kind === 'added' || r.kind === 'removed' ? tintOf(r)!.fg : '#333', overflowWrap: 'anywhere' }}>
                    {rowResult(r, review.has_dn)}
                    {cancelledNote(r) && <div style={{ color: '#8A5A00', marginTop: 4, fontSize: 12, lineHeight: 1.4 }}>{cancelledNote(r)}</div>}
                    {renameNote(r) && <div style={{ color: '#555', marginTop: 4, fontSize: 12, lineHeight: 1.4 }}>{renameNote(r)}</div>}
                    {r.kind === 'removed' && (
                      <DecisionSelect label={`ผลของ ${r.mark}`} mark={r.mark} slot={r.slot} hint={r.rename_hint} added={addedMarks} allowRename={allowRename} unit="mark" d={marks} />
                    )}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#888' }}>{r.prev_rev ?? '—'}</span>{' → '}
                    {r.editable ? (
                      <>
                        <input aria-label={`Rev ใหม่ของ ${r.mark}`} inputMode="numeric" value={values[r.mark] ?? ''}
                          onChange={e => setValues(v => ({ ...v, [r.mark]: e.target.value }))}
                          style={{ width: 56, padding: '3px 6px', margin: '-4px 0', fontSize: 13, lineHeight: '18px', verticalAlign: 'baseline', border: `1px solid ${errors[r.mark] ? '#C8202A' : '#C2C2C2'}`, borderRadius: 4 }} />
                        {errors[r.mark] && <div style={{ fontSize: 11.5, color: '#C8202A', marginTop: 2, whiteSpace: 'normal', lineHeight: 1.35 }}>{errors[r.mark]}</div>}
                      </>
                    ) : <b>{r.suggested_rev ?? '—'}</b>}
                  </td>
                  <td style={{ ...td, fontSize: 12.5, color: '#555', overflowWrap: 'anywhere' }}><DiffCell diff={r.diff} /></td>
                  {review.has_dn && <td style={{ ...td, fontSize: 12.5, color: '#888', overflowWrap: 'anywhere' }}>{r.dn_status ?? '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          )}

          {showParts && (
            <div style={{ margin: '16px 0 12px' }}>
              <button onClick={() => setPartsOpen(o => !o)} aria-expanded={partsOpen}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: '#1F1F1F' }}>
                {partsOpen ? <ChevronDown size={14} color="#8E8E8E" /> : <ChevronRight size={14} color="#8E8E8E" />}{`Part ที่หายไป (${removedParts.length})`}
              </button>
              {partsOpen && (
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', marginTop: 4 }}>
                  <colgroup><col style={{ width: 150 }} /><col style={{ width: 240 }} /><col /></colgroup>
                  <thead><tr><th style={th}>Part Mark</th><th style={th}>ผล</th><th style={th} /></tr></thead>
                  <tbody>
                    {removedParts.map(p => (
                      <tr key={p.mark} style={{ background: ROW_TINT.removed.bg }}>
                        <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.mark}>{p.mark}</td>
                        <td style={{ ...td, color: ROW_TINT.removed.fg }}>
                          ถูกลบออกจาก BOM
                          {p.still_used && <div style={{ color: '#8A5A00', marginTop: 4, fontSize: 12, lineHeight: 1.4 }}>⚠ ยังถูกใช้ใน assembly</div>}
                          <DecisionSelect label={`ผลของ part ${p.mark}`} mark={p.mark} slot={p.slot} hint={p.rename_hint} added={addedParts} allowRename={allowRename} unit="part" d={parts} />
                        </td>
                        <td style={td} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end" style={{ gap: 8, padding: '14px 20px', borderTop: '1px solid #EEE' }}>
          {undecidedText && (
            <>
              <span style={{ marginRight: 'auto', fontSize: 12.5, color: '#991B1B' }}>{`ยังไม่ได้เลือก ${undecidedText} (เปลี่ยน หรือ ลบออกจาก BOM)`}</span>
              <button onClick={deleteRest} disabled={isUploading} style={{ fontSize: 13, padding: '6px 12px', borderRadius: 6, border: '1px solid #F3C7C9', background: '#FDF1F1', color: '#991B1B' }}>ที่เหลือทั้งหมด: ลบออกจาก BOM</button>
            </>
          )}
          <button onClick={onCancel} disabled={isUploading} className="disabled:opacity-40" style={{ fontSize: 13, padding: '6px 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: 'white' }}>ยกเลิก</button>
          <button onClick={() => onConfirm(editable.map(r => ({ mark: r.mark, rev: Number(values[r.mark]) })), renames)} disabled={blocked}
            className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40" style={{ height: 34, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#185FA5' }}>
            {isUploading && <Loader2 size={13} className="animate-spin" />}บันทึก
          </button>
        </div>
      </div>
    </div>
  )
}
