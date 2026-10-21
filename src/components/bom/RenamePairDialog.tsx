import { useState } from 'react'
import { Info, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRenameCandidates, useSaveRenames } from '../../hooks/useBomDispatches'
import type { DisappearedMarkDto, RenameCandidatesDto, RenameKind } from '../../api/dispatches'
import { buildRenamePayload, dataSetChips, keyOf, needsKeep, optionsFor, takenBy, type Choice, type Selections } from '../../lib/bom/renamePairing'
import { getErrorMessage } from '../../lib/getErrorMessage'

// One dialog for "a name disappeared in the new BOM" (2026-10-21, decision 8):
// used right after upload and from the BOM version page (`only` = one row).
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const card: React.CSSProperties = { background: 'white', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }
const chip: React.CSSProperties = { display: 'inline-block', fontSize: 11.5, padding: '2px 8px', borderRadius: 10, background: '#F3F4F6', color: '#374151', marginRight: 4, marginTop: 4 }

export function RenamePairDialog({ dispatchId, only, onClose }: { dispatchId: number; only?: { kind: RenameKind; mark: string }; onClose: () => void }) {
  const { data, isLoading, isError } = useRenameCandidates(dispatchId)
  const save = useSaveRenames(dispatchId)
  const [sel, setSel] = useState<Selections>({})
  const shell = (body: React.ReactNode) => <div role="dialog" aria-label="จับคู่ชื่อที่หายไป" style={overlay}><div style={card}>{body}</div></div>

  if (isLoading) return shell(<div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><Loader2 size={16} className="animate-spin" />กำลังตรวจชื่อที่หายไป…</div>)
  if (isError || !data) {
    return shell(<>
      <div style={{ fontSize: 13 }}>ตรวจชื่อที่หายไปไม่สำเร็จ — จับคู่ทีหลังได้ที่หน้า BOM version</div>
      <button onClick={onClose} style={{ alignSelf: 'flex-end', fontSize: 13 }}>ปิด</button>
    </>)
  }
  const keep = (kind: RenameKind, rows: DisappearedMarkDto[]) => (only ? rows.filter(r => only.kind === kind && r.mark === only.mark) : rows)
  const sections = [
    { kind: 'ASSEMBLY' as const, title: 'mark ที่หายไป', rows: keep('ASSEMBLY', data.assemblies) },
    { kind: 'PART' as const, title: 'part ที่หายไป', rows: keep('PART', data.parts) },
  ].filter(s => s.rows.length)
  const { renames, missingKeep } = buildRenamePayload(data, sel)
  const set = (k: string, c: Choice) => setSel(s => ({ ...s, [k]: c }))

  async function submit() {
    try {
      await save.mutateAsync(renames)
      toast.success(`จับคู่แล้ว ${renames.length} คู่`)
      onClose()
    } catch (e) {
      toast.error(getErrorMessage(e, 'จับคู่ไม่สำเร็จ — ลองใหม่อีกครั้ง'))
    }
  }

  return shell(<>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 600 }}>
      ชื่อที่หายไปใน BOM ใหม่
      <span title="จับคู่แล้ว งานที่กรอกไว้ (Project Progress, สี, MO, WO, Drawing) จะตามไปที่ชื่อใหม่ ถ้าไม่จับคู่ ระบบจะถือว่าเป็นชิ้นใหม่" aria-label="อธิบายการจับคู่" style={{ display: 'inline-flex', color: '#0C447C', cursor: 'help' }}><Info size={14} /></span>
    </div>
    <div style={{ fontSize: 13, color: '#555' }}>BOM ใหม่ไม่มีชื่อเหล่านี้แล้ว ถ้าเป็นชิ้นเดิมที่แค่เปลี่ยนชื่อ ให้เลือกชื่อใหม่ ถ้าไม่ใช่ ให้เลือก &quot;ไม่ใช่ชิ้นเดิม&quot;</div>
    {sections.map(s => (
      <div key={s.kind}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{s.title} ({s.rows.length})</div>
        {s.rows.map(d => <PairRow key={d.mark} kind={s.kind} d={d} c={data} sel={sel} onChange={set} />)}
      </div>
    ))}
    {missingKeep.length > 0 && <div style={{ fontSize: 12.5, color: '#854F0B' }}>เลือกว่าจะใช้ข้อมูลชุดไหนของ {missingKeep.join(', ')} ก่อน</div>}
    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
      <button onClick={onClose} style={{ fontSize: 13, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>{only ? 'ปิด' : 'ข้ามทั้งหมด'}</button>
      <button onClick={submit} disabled={!renames.length || missingKeep.length > 0 || save.isPending}
        style={{ height: 36, padding: '0 18px', fontSize: 13, fontWeight: 600, color: 'white', background: '#C8202A', borderRadius: 6, opacity: !renames.length || missingKeep.length ? 0.4 : 1 }}>
        {`บันทึกการจับคู่ (${renames.length} คู่)`}
      </button>
    </div>
  </>)
}

function PairRow({ kind, d, c, sel, onChange }: { kind: RenameKind; d: DisappearedMarkDto; c: RenameCandidatesDto; sel: Selections; onChange: (k: string, v: Choice) => void }) {
  const k = keyOf(kind, d.mark)
  const choice = sel[k] ?? { to: null, keep: null }
  const taken = takenBy(sel, kind, k)
  const all = optionsFor(c, kind)
  const target = all.find(o => o.mark === choice.to)
  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 10, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{d.mark}</span>
        <span style={{ fontSize: 12, color: '#8E8E8E' }}>เป็นชิ้นเดียวกับ</span>
        <select aria-label={`ชื่อใหม่ของ ${d.mark}`} value={choice.to ?? ''} onChange={e => onChange(k, { to: e.target.value || null, keep: null })} style={{ fontSize: 13, padding: '4px 6px' }}>
          <option value="">ไม่ใช่ชิ้นเดิม (ข้าม)</option>
          {d.suggestions.length > 0 && (
            <optgroup label="ระบบแนะนำ">
              {d.suggestions.map(s => <option key={`s-${s.mark}`} value={s.mark} disabled={taken.has(s.mark)}>{`${s.mark} (เหมือน ${s.score}%)`}</option>)}
            </optgroup>
          )}
          <optgroup label="เลือกชื่ออื่นเอง…">
            {all.map(o => <option key={`o-${o.mark}`} value={o.mark} disabled={taken.has(o.mark)}>{o.mark}</option>)}
          </optgroup>
        </select>
      </div>
      {kind === 'ASSEMBLY' && needsKeep(d, target) && (
        <div style={{ marginTop: 8, fontSize: 12.5 }}>
          <div style={{ color: '#854F0B', marginBottom: 4 }}>ทั้ง 2 ชื่อมีข้อมูลอยู่แล้ว — เลือกใช้ได้ชุดเดียว</div>
          {(['old', 'new'] as const).map(side => {
            const name = side === 'old' ? d.mark : target!.mark
            return (
              <label key={side} style={{ display: 'block', marginBottom: 4 }}>
                <input type="radio" name={`keep-${k}`} aria-label={`ใช้ข้อมูลของชื่อ${side === 'old' ? 'เดิม' : 'ใหม่'} ${name}`} checked={choice.keep === side} onChange={() => onChange(k, { ...choice, keep: side })} />
                {` ใช้ข้อมูลของชื่อ${side === 'old' ? 'เดิม' : 'ใหม่'} ${name}`}
                <div>{dataSetChips(side === 'old' ? d.data : target!.data).map(t => <span key={t} style={chip}>{t}</span>)}</div>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
