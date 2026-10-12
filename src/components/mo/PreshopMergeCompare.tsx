import { Check } from 'lucide-react'
import type { PreshopAssembly, PreshopPart } from '../../api/mo'
import { ASM_FIELDS, norm, showValue } from '../../lib/asmFields'
import { pickedKind, sameParts, type Existing, type MergeChoice, type PickKind } from '../../lib/preshopMerge'
import { PreshopPartsEditor } from './PreshopPartsEditor'

// Old vs new for a mark the MO already has (2026-10-08). Redesigned the same
// day (user: "ฉันผู้เป็น dev ยังมองยากเลยอันไหนค่าเก่าค่าใหม่"): every value
// that differs is a row of cards — "เดิม (ใน MO)" grey tag, "ใหม่ (จากไฟล์)"
// blue tag, "กำหนดเอง" — and the user clicks the card to use. Values that
// already match collapse into one green line. Sets always ask.

export const TAG = {
  old: { bg: '#F0F0F0', fg: '#555', text: 'เดิม (ใน MO)' },
  new: { bg: '#E6F1FB', fg: '#0C447C', text: 'ใหม่ (จากไฟล์)' },
  lot: { bg: '#EAF3DE', fg: '#27500A', text: 'lot ใหม่ (เดิม + ไฟล์)' },
  own: { bg: '#FAEEDA', fg: '#854F0B', text: 'กำหนดเอง' },
  dn: { bg: '#E6F1FB', fg: '#0C447C', text: 'Dispatch Note' },
  pdf: { bg: '#EAF3DE', fg: '#27500A', text: 'Pre-shop drawing' },
  bom: { bg: '#E6F1FB', fg: '#0C447C', text: 'BOM จริง' },
}

export function Card({ kind, active, onClick, children }: { kind: keyof typeof TAG; active: boolean; onClick: () => void; children: React.ReactNode }) {
  const t = TAG[kind]
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ position: 'relative', flex: 1, minWidth: 150, padding: '8px 10px 10px', borderRadius: 8, cursor: 'pointer', background: '#fff',
        border: active ? '2px solid #C8202A' : '1px solid #D4D4D4', boxShadow: active ? '0 0 0 3px #FCEBEB' : 'none' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: t.bg, color: t.fg }}>{t.text}</span>
        <span style={{ width: 18, height: 18, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: active ? 'none' : '1.5px solid #C2C2C2', background: active ? '#C8202A' : '#fff' }}>
          {active && <Check size={12} color="#fff" strokeWidth={3} />}
        </span>
      </div>
      {children}
    </div>
  )
}

export function PartTable({ parts }: { parts: PreshopPart[] }) {
  if (!parts.length) return <div style={{ fontSize: 12, color: '#999' }}>ไม่มี part</div>
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <tbody>
        {parts.map(p => (
          <tr key={p.part_mark} style={{ borderTop: '1px solid #F0F0F0' }}>
            <td style={{ padding: '3px 4px', fontFamily: 'monospace', fontWeight: 700 }}>{p.part_mark}</td>
            <td style={{ padding: '3px 4px' }}>{p.profile}</td>
            <td style={{ padding: '3px 4px', textAlign: 'right' }}>L {p.length_mm}</td>
            <td style={{ padding: '3px 4px', textAlign: 'right', fontWeight: 700 }}>×{p.qty}/ชุด</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Field({ label, pending, children }: { label: string; pending: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div className="flex items-center gap-2" style={{ fontSize: 12.5, fontWeight: 700, color: '#1F1F1F', marginBottom: 5 }}>
        {label}
        {pending && <span className="bg-molten-50 text-molten-600" style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 999 }}>ยังไม่ได้เลือก</span>}
      </div>
      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

const big: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: '#1F1F1F' }
const ownInput: React.CSSProperties = { width: '100%', padding: '4px 8px', fontSize: 14, fontWeight: 600, border: '1px solid #D4D4D4', borderRadius: 5 }

export function PreshopMergeCompare({ existing, incoming, choice, onChange, against = 'file' }: {
  // 'file' = an upload (sets: keep / file / new lot) · 'bom' = the zone's real
  // BOM (its qty is the zone total — shown for reference, no "new lot")
  against?: 'file' | 'bom'
  existing: Existing
  incoming: PreshopAssembly
  choice: MergeChoice
  onChange: (c: MergeChoice) => void
}) {
  const set = (p: Partial<MergeChoice>) => onChange({ ...choice, ...p })
  // a card click remembers which card, not just the value (two cards can hold the same value)
  const pick = (field: string, kind: PickKind, value: unknown) => onChange({ ...choice, [field]: value, from: { ...choice.from, [field]: kind } })
  const NEW = against === 'bom' ? 'bom' as const : 'new' as const
  const canLot = against === 'file' && incoming.qty > 0
  const lot = existing.qty + incoming.qty
  const num = (v: string) => (v === '' ? null : Number(v))

  const qtyKind = pickedKind(choice, 'qty', { old: existing.qty, new: incoming.qty > 0 ? incoming.qty : undefined, lot: canLot ? lot : undefined })
  // every value (2026-10-09): one that matches, or (an upload) that the file doesn't
  // carry, keeps the MO's; the rest are picked here
  const keeps = (k: (typeof ASM_FIELDS)[number]['key']) => norm(existing, k) === norm(incoming, k) || (against === 'file' && norm(incoming, k) == null)
  const differing = ASM_FIELDS.filter(f => !keeps(f.key))
  const matching = ASM_FIELDS.filter(f => keeps(f.key) && norm(existing, f.key) != null)
  const partsDiffer = (incoming.parts.length > 0 || against === 'bom') && !sameParts(existing.parts, incoming.parts)
  const partsKind = choice.parts === undefined ? null : choice.parts === existing.parts ? 'old' : choice.parts === incoming.parts ? 'new' : 'own'

  return (
    <div style={{ background: '#fff', border: '1px solid #FAC775', borderRadius: 10, padding: '10px 12px 12px' }}>
      <div className="text-molten-600" style={{ fontSize: 13, fontWeight: 700 }}>
        {incoming.assembly_mark} {against === 'bom' ? 'ต่างจาก BOM จริง' : 'มีใน MO แล้ว'} — กดเลือกกล่องของค่าที่จะใช้
        {existing.wo_qty > 0 && <span style={{ fontWeight: 500 }}> · ออก WO ไปแล้ว {existing.wo_qty} ชุด</span>}
      </div>
      {matching.length > 0 && (
        <div className="text-green-800" style={{ fontSize: 12, marginTop: 4 }}>
          ✓ ใช้ค่าเดิม: {matching.map(f => `${f.title} ${showValue(norm(existing, f.key))}`).join(' · ')}
        </div>
      )}

      <Field label="จำนวนชุด" pending={choice.qty === undefined}>
        <Card kind="old" active={qtyKind === 'old'} onClick={() => pick('qty', 'old', existing.qty)}><div style={big}>{existing.qty}</div></Card>
        {incoming.qty > 0 && (
          <Card kind={NEW} active={qtyKind === 'new'} onClick={() => pick('qty', 'new', incoming.qty)}>
            <div style={big}>{incoming.qty}</div>
            {against === 'bom' && <div style={{ fontSize: 11.5, color: '#666' }}>ยอดรวมทั้ง zone ใน BOM</div>}
          </Card>
        )}
        {canLot && (
          <Card kind="lot" active={qtyKind === 'lot'} onClick={() => pick('qty', 'lot', lot)}>
            <div style={big}>{lot}</div><div style={{ fontSize: 11.5, color: '#666' }}>เดิม {existing.qty} + ไฟล์ {incoming.qty}</div>
          </Card>
        )}
        <Card kind="own" active={qtyKind === 'own'} onClick={() => { if (qtyKind !== 'own') pick('qty', 'own', 0) }}>
          <input type="number" min={0} placeholder="พิมพ์จำนวน" style={ownInput} value={qtyKind === 'own' && choice.qty ? choice.qty : ''}
            onClick={e => e.stopPropagation()} onFocus={() => { if (qtyKind !== 'own') pick('qty', 'own', 0) }}
            onChange={e => pick('qty', 'own', e.target.value === '' ? 0 : Number(e.target.value))} />
        </Card>
      </Field>

      {differing.map(({ key, title, text }) => {
        const was = norm(existing, key)
        const now = norm(incoming, key)
        const kind = pickedKind({ ...choice, [key]: choice[key] === undefined ? undefined : norm(choice, key) }, key, { old: was, new: now })
        return (
          <Field key={key} label={title} pending={kind === null}>
            <Card kind="old" active={kind === 'old'} onClick={() => pick(key, 'old', was)}><div style={big}>{showValue(was)}</div></Card>
            <Card kind={NEW} active={kind === 'new'} onClick={() => pick(key, 'new', now)}><div style={big}>{showValue(now)}</div></Card>
            <Card kind="own" active={kind === 'own'} onClick={() => { if (kind !== 'own') pick(key, 'own', null) }}>
              <input type={text ? 'text' : 'number'} min={0} placeholder="พิมพ์ค่า" style={ownInput} value={kind === 'own' ? (choice[key] ?? '') : ''}
                onClick={e => e.stopPropagation()} onFocus={() => { if (kind !== 'own') pick(key, 'own', null) }}
                onChange={e => pick(key, 'own', text ? e.target.value : num(e.target.value))} />
            </Card>
          </Field>
        )
      })}

      {partsDiffer && (
        <Field label="Part" pending={choice.parts === undefined}>
          <Card kind="old" active={partsKind === 'old'} onClick={() => set({ parts: existing.parts })}><PartTable parts={existing.parts} /></Card>
          <Card kind={NEW} active={partsKind === 'new'} onClick={() => set({ parts: incoming.parts })}><PartTable parts={incoming.parts} /></Card>
        </Field>
      )}
      {/* Part is always shown (2026-10-08, user: a mark coming in again may or
          may not change its parts) — the list to use, editable. */}
      {!partsDiffer && (
        <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: '#1F1F1F' }}>
          Part <span style={{ fontWeight: 500, color: '#666' }}>— {incoming.parts.length ? 'ตรงกับในไฟล์' : 'ไฟล์ไม่มี part'} ใช้ part เดิมใน MO · แก้ได้ด้านล่าง</span>
        </div>
      )}
      {choice.parts && (
        <div style={{ marginTop: partsDiffer ? 10 : 4, background: '#FAFAFA', border: '1px solid #EEE', borderRadius: 8, padding: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 2 }}>
            part ที่จะใช้{partsKind === 'own' ? ' (แก้แล้ว)' : ''} — แก้เพิ่มได้
          </div>
          <PreshopPartsEditor parts={choice.parts} onChange={parts => set({ parts })} sets={choice.qty || undefined} locked={new Set(existing.wo_parts)} />
        </div>
      )}
    </div>
  )
}
