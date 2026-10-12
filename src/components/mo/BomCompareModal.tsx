import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { linkBom, type BomCompare, type MoDetail, type PartPair, type PreshopAssembly } from '../../api/mo'
import { ASM_FIELDS, norm, showValue, type AsmValues } from '../../lib/asmFields'
import { getErrorMessage } from '../../lib/getErrorMessage'
import { partErrors } from '../../lib/preshop'
import { autoChoice, choiceErrors, finalAssembly, unchosen, versionDiff, type MergeChoice } from '../../lib/preshopMerge'
import { Card, PartTable, PreshopMergeCompare } from './PreshopMergeCompare'

// An MO vs its zone's real BOM (2026-10-08/09, user: "เอามาเทียบให้ user ดูว่าอะไร
// เปลี่ยนบ้างและให้ user ตัดสินใจเองแก้ไขเองทั้งหมด"). Pre-shop marks: pick every
// value (taking the BOM as is links the mark to the real BOM row). Full shop
// marks: new version or keep. A mark the BOM doesn't have by name may have been
// renamed: the likeliest BOM marks are suggested, the user pairs it (it then
// takes the BOM's name) and confirms how its parts map. Otherwise keep or
// remove. BOM-only marks can be added. Anything can wait ("ไว้ทีหลัง").

type Decision = 'apply' | 'keep' | 'remove' | 'later'
type Row = BomCompare['rows'][number]
type Target = NonNullable<Row['bom']>
const ROW: React.CSSProperties = { border: '1px solid #E8E8E8', borderRadius: 10, padding: '10px 12px', background: '#fff' }
// every value of a version on one line (2026-10-09)
const valuesText = (v: AsmValues) => ASM_FIELDS.map(f => `${f.label} ${showValue(norm(v, f.key))}`).join(' · ')
const MARK: React.CSSProperties = { fontFamily: 'monospace', fontWeight: 800, fontSize: 14 }

function Section({ title, tone, count, children }: { title: string; tone: 'red' | 'amber' | 'green' | 'blue'; count: number; children: React.ReactNode }) {
  const c = { red: ['#FCEBEB', '#C8202A'], amber: ['#FAEEDA', '#854F0B'], green: ['#EAF3DE', '#27500A'], blue: ['#E6F1FB', '#0C447C'] }[tone]
  if (!count) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: c[0], color: c[1] }}>{title} · {count}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

function Choice({ label, active, disabled, title, onClick }: { label: string; active: boolean; disabled?: boolean; title?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      style={{ padding: '5px 12px', fontSize: 12.5, fontWeight: 600, borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        border: `1px solid ${active ? '#C8202A' : '#D4D4D4'}`, background: active ? '#FCEBEB' : '#fff', color: active ? '#C8202A' : '#555' }}>
      {label}
    </button>
  )
}

/** Confirm how the MO mark's parts line up with the BOM's when names differ. */
function PartPairing({ pairs, bomParts, onChange }: { pairs: PartPair[]; bomParts: Target['parts']; onChange: (p: PartPair[]) => void }) {
  const used = new Set(pairs.map(p => p.to).filter(Boolean))
  return (
    <div style={{ marginTop: 8, border: '1px solid #E6F1FB', background: '#F7FAFD', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0C447C', marginBottom: 4 }}>จับคู่ part (ชื่อใน MO → ชื่อใน BOM) — ตรวจและยืนยัน</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {pairs.map((p, i) => (
          <div key={p.from} className="flex items-center" style={{ gap: 8, fontSize: 12.5 }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, minWidth: 90 }}>{p.from}</span>
            <ArrowRight size={13} color="#8E8E8E" />
            <select value={p.to ?? ''} aria-label={`คู่ของ ${p.from}`}
              onChange={e => onChange(pairs.map((x, k) => (k === i ? { ...x, to: e.target.value || null, how: e.target.value ? (e.target.value === x.from ? 'name' : 'spec') : 'none' } : x)))}
              style={{ fontSize: 12.5, padding: '2px 6px', border: '1px solid #D4D4D4', borderRadius: 5, minWidth: 140 }}>
              <option value="">— ไม่มีคู่ (ไม่อยู่ใน BOM) —</option>
              {bomParts.map(b => (
                <option key={b.part_mark} value={b.part_mark} disabled={used.has(b.part_mark) && p.to !== b.part_mark}>
                  {b.part_mark} · {b.profile} L{b.length_mm} ×{b.qty}
                </option>
              ))}
            </select>
            {p.to && p.to !== p.from && <span style={{ fontSize: 11.5, color: '#854F0B', fontWeight: 600 }}>เปลี่ยนชื่อ</span>}
            {!p.to && <span style={{ fontSize: 11.5, color: '#C8202A', fontWeight: 600 }}>จะเอาออก</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

export function BomCompareModal({ mo, data, onClose }: { mo: MoDetail; data: BomCompare; onClose: () => void }) {
  const qc = useQueryClient()
  const pending = data.rows.filter(r => !r.reviewed)
  const done = data.rows.filter(r => r.reviewed)

  const [pairWith, setPairWith] = useState<Record<string, number | null>>({})
  const [partMaps, setPartMaps] = useState<Record<string, PartPair[]>>({})
  const [decision, setDecision] = useState<Record<string, Decision>>(() =>
    Object.fromEntries(pending.map(r => [r.assembly_mark, r.status === 'same' ? 'keep' : r.status === 'changed' && r.kind === 'preshop' ? 'apply' : 'later'])))
  const [choices, setChoices] = useState<Record<string, MergeChoice>>({})
  const [qtyOf, setQtyOf] = useState<Record<string, number>>({})
  const [adds, setAdds] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState(false)

  // the BOM row each mark is compared with: same name, or the one it was paired with
  const poolById = new Map(data.pool.map(p => [p.assembly_id, p]))
  const targetOf = (r: Row): Target | null => r.bom ?? (pairWith[r.assembly_mark] ? poolById.get(pairWith[r.assembly_mark]!) ?? null : null)
  const pairsOf = (r: Row): PartPair[] => partMaps[r.assembly_mark] ?? (r.bom ? r.part_pairs ?? [] : r.candidates?.find(c => c.assembly_id === pairWith[r.assembly_mark])?.part_pairs ?? [])
  const renamedParts = (r: Row) => pairsOf(r).some(p => p.how === 'spec' || (p.to && p.to !== p.from))
  const pairedIds = new Set(Object.values(pairWith).filter((x): x is number => !!x))

  const changed = pending.filter(r => r.status === 'changed' && r.kind === 'preshop')
  const versioned = pending.filter(r => r.status === 'changed' && r.kind === 'bom')
  const same = pending.filter(r => r.status === 'same')
  const missing = pending.filter(r => r.status === 'not_in_bom')

  const asIncoming = (r: Row): PreshopAssembly => {
    const t = targetOf(r)!
    return { assembly_mark: t.assembly_mark, qty: t.qty, name: t.name ?? null, length_mm: t.length_mm, width_mm: t.width_mm ?? null, height_mm: t.height_mm ?? null, weight_kg: t.weight_kg, surface_area_m2: t.surface_area_m2 ?? null, parts: t.parts }
  }
  const choiceOf = (r: Row) => choices[r.assembly_mark] ?? autoChoice(r.existing, asIncoming(r), 'bom')
  const isPicking = (r: Row) => r.kind === 'preshop' && decision[r.assembly_mark] === 'apply' && !!targetOf(r)
  const isVersion = (r: Row) => r.kind === 'bom' && decision[r.assembly_mark] === 'apply' && !!targetOf(r)
  const picking = pending.filter(isPicking)
  const notChosen = picking.filter(r => unchosen(choiceOf(r)).length > 0)
  const errors = [
    ...pending.filter(isVersion).flatMap(r => {
      const q = qtyOf[r.assembly_mark] ?? r.existing.qty
      return !(q > 0) ? [`${r.assembly_mark}: จำนวนชุดต้องมากกว่า 0`] : q < r.existing.wo_qty ? [`${r.assembly_mark}: ออก WO ไปแล้ว ${r.existing.wo_qty} ชุด — ต่ำกว่านี้ไม่ได้`] : []
    }),
    ...picking.flatMap(r => {
      const c = choiceOf(r)
      return [...choiceErrors(r.assembly_mark, r.existing, c), ...(c.parts ? partErrors(c.parts).map(e => `${r.assembly_mark} · ${e}`) : [])]
    }),
  ]
  const addErrors = data.bom_only.filter(b => b.assembly_id in adds && !pairedIds.has(b.assembly_id) && !(adds[b.assembly_id] > 0 && adds[b.assembly_id] <= b.qty)).map(b => `${b.assembly_mark}: จำนวนชุดต้องมากกว่า 0 และไม่เกิน ${b.qty} ตาม BOM`)
  const addList = Object.entries(adds).filter(([id, q]) => q > 0 && !pairedIds.has(Number(id))).map(([id, q]) => ({ bom_assembly_id: Number(id), qty: q }))
  const decided = pending.filter(r => decision[r.assembly_mark] !== 'later')
  const canSave = !saving && notChosen.length === 0 && errors.length === 0 && addErrors.length === 0 && (decided.length > 0 || addList.length > 0)

  function pair(r: Row, id: number | null) {
    setPairWith(p => ({ ...p, [r.assembly_mark]: id }))
    setPartMaps(p => { const n = { ...p }; delete n[r.assembly_mark]; return n })
    setChoices(c => { const n = { ...c }; delete n[r.assembly_mark]; return n })
    setDecision(d => ({ ...d, [r.assembly_mark]: id ? 'apply' : 'later' }))
  }

  async function save() {
    setSaving(true)
    try {
      await linkBom(mo.id, {
        dispatch_id: data.bom!.dispatch_id,
        marks: decided.map(r => {
          const d = decision[r.assembly_mark] as Exclude<Decision, 'later'>
          const pairing = {
            ...(pairWith[r.assembly_mark] ? { pair_with: pairWith[r.assembly_mark]! } : {}),
            // parts move by the map the user saw (names, or confirmed renames)
            ...(targetOf(r) ? { part_map: pairsOf(r).map(p => ({ from: p.from, to: p.to })) } : {}),
          }
          if (d !== 'apply') return { assembly_mark: r.assembly_mark, action: d }
          const t = targetOf(r)!
          if (r.kind === 'bom') {
            return { assembly_mark: r.assembly_mark, action: 'apply', ...pairing, final: { qty: qtyOf[r.assembly_mark] ?? r.existing.qty, length_mm: t.length_mm, weight_kg: t.weight_kg, parts: [] } }
          }
          const f = finalAssembly(asIncoming(r), choiceOf(r))
          return { assembly_mark: r.assembly_mark, action: 'apply', ...pairing, final: { qty: f.qty, name: f.name ?? null, length_mm: f.length_mm, width_mm: f.width_mm ?? null, height_mm: f.height_mm ?? null, weight_kg: f.weight_kg, surface_area_m2: f.surface_area_m2 ?? null, parts: f.parts } }
        }),
        add: addList,
      })
      await qc.invalidateQueries({ queryKey: ['mo'] })
      toast.success('บันทึกผลการเทียบกับ BOM แล้ว')
      onClose()
    } catch (e) {
      toast.error(getErrorMessage(e, 'บันทึกไม่สำเร็จ'))
    } finally {
      setSaving(false)
    }
  }

  const fmt = (d: string) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const setD = (r: Row, d: Decision) => setDecision(x => ({ ...x, [r.assembly_mark]: d }))

  // the compare body for a mark that has a BOM row to compare with (by name or paired)
  const compareBody = (r: Row) => {
    const t = targetOf(r)!
    const renamed = t.assembly_mark !== r.assembly_mark
    return (
      <>
        {renamed && (
          <div className="flex items-center" style={{ gap: 6, fontSize: 12.5, fontWeight: 600, color: '#854F0B', margin: '6px 0' }}>
            จะเปลี่ยนชื่อ <span style={{ fontFamily: 'monospace' }}>{r.assembly_mark}</span> <ArrowRight size={13} /> <span style={{ fontFamily: 'monospace' }}>{t.assembly_mark}</span> ตาม BOM
          </div>
        )}
        {(renamed || renamedParts(r)) && (
          <PartPairing pairs={pairsOf(r)} bomParts={t.parts} onChange={p => setPartMaps(m => ({ ...m, [r.assembly_mark]: p }))} />
        )}
        {r.kind === 'preshop' ? (
          <div style={{ marginTop: 8 }}>
            <PreshopMergeCompare against="bom" existing={r.existing} incoming={asIncoming(r)} choice={choiceOf(r)}
              onChange={c => setChoices(prev => ({ ...prev, [r.assembly_mark]: c }))} />
            <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>เลือก “BOM จริง” ครบทุกช่อง = ผูก mark นี้กับ BOM จริง · มีค่าที่เลือกเองบางช่อง = ข้อมูลยังเป็นของ MO แต่ใช้ชื่อตาม BOM</div>
          </div>
        ) : versionCards(r, t)}
      </>
    )
  }

  const versionCards = (r: Row, t: Target) => {
    const diff = versionDiff(r.existing, t)
    const d = decision[r.assembly_mark]
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
          {diff.map((x, i) => (
            <div key={i} style={{ fontSize: 12.5, color: x.kind === 'remove' ? '#C8202A' : x.kind === 'add' ? '#27500A' : '#854F0B' }}>
              {x.kind === 'remove' ? '− ' : x.kind === 'add' ? '+ ' : '~ '}{x.text}
            </div>
          ))}
        </div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <Card kind="old" active={d === 'keep'} onClick={() => setD(r, 'keep')}>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>คง version เดิม · {valuesText(r.existing)}</div>
            <PartTable parts={r.existing.parts} />
          </Card>
          <Card kind="bom" active={d === 'apply'} onClick={() => setD(r, 'apply')}>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>ใช้ BOM version ใหม่ · {valuesText(t)}</div>
            <PartTable parts={t.parts} />
          </Card>
        </div>
        {d === 'apply' && (
          <div className="flex items-center" style={{ gap: 8, marginTop: 8, fontSize: 12.5, color: '#555' }}>
            จำนวนชุดของ MO
            <input type="number" min={0} value={qtyOf[r.assembly_mark] ?? r.existing.qty}
              onChange={e => setQtyOf(q => ({ ...q, [r.assembly_mark]: Number(e.target.value) || 0 }))}
              style={{ width: 90, padding: '4px 8px', fontSize: 13, border: '1px solid #D4D4D4', borderRadius: 5 }} />
            <span style={{ color: '#888' }}>(เดิม {r.existing.qty} · BOM ทั้ง zone {t.qty})</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(1040px, 95vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: '#F7F7F7', borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
        <div className="flex items-center justify-between" style={{ padding: '14px 18px', borderBottom: '1px solid #E8E8E8', background: '#fff', borderRadius: '10px 10px 0 0' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1A1A' }}>เทียบกับ BOM จริง · {mo.mo_code}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              BOM rev {data.bom!.revision} · อัปโหลด {fmt(data.bom!.uploaded_at)} — ดูว่าอะไรต่าง แล้วเลือกเองทุกค่า · BOM จริงไม่ถูกแก้จากหน้านี้
            </div>
          </div>
          <button onClick={onClose} aria-label="ปิด" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', display: 'flex' }}><X size={18} /></button>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
          {notChosen.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-molten-100 bg-molten-50 text-molten-600" style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>ยังเลือกไม่ครบ: {notChosen.map(r => `${r.assembly_mark} (${unchosen(choiceOf(r)).join(', ')})`).join(' · ')} — หรือกด "ไว้ทีหลัง"</span>
            </div>
          )}
          {[...errors, ...addErrors].map(e => <div key={e} className="rounded-lg border border-ssi-100 bg-ssi-50 text-ssi-600" style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{e}</div>)}

          <Section title="ต่างจาก BOM — เลือกค่าที่จะใช้" tone="amber" count={changed.length}>
            {changed.map(r => (
              <div key={r.assembly_mark} style={ROW}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span style={MARK}>{r.assembly_mark}</span>
                  <span style={{ flex: 1 }} />
                  <Choice label="เลือกค่าและบันทึก" active={decision[r.assembly_mark] === 'apply'} onClick={() => setD(r, 'apply')} />
                  <Choice label="ไว้ทีหลัง" active={decision[r.assembly_mark] === 'later'} onClick={() => setD(r, 'later')} />
                </div>
                {decision[r.assembly_mark] === 'apply' && compareBody(r)}
              </div>
            ))}
          </Section>

          <Section title="BOM เปลี่ยน version — เลือก version ที่จะใช้" tone="amber" count={versioned.length}>
            {versioned.map(r => (
              <div key={r.assembly_mark} style={ROW}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span style={MARK}>{r.assembly_mark}</span>
                  {r.existing.wo_qty > 0 && <span style={{ fontSize: 12, color: '#666' }}>ออก WO แล้ว {r.existing.wo_qty} ชุด — WO จะย้ายตามถ้าใช้ version ใหม่</span>}
                  <span style={{ flex: 1 }} />
                  <Choice label="ไว้ทีหลัง" active={decision[r.assembly_mark] === 'later'} onClick={() => setD(r, 'later')} />
                </div>
                {renamedParts(r) && <PartPairing pairs={pairsOf(r)} bomParts={r.bom!.parts} onChange={p => setPartMaps(m => ({ ...m, [r.assembly_mark]: p }))} />}
                {versionCards(r, r.bom!)}
              </div>
            ))}
          </Section>

          <Section title="ตรงกับ BOM" tone="green" count={same.length}>
            {same.map(r => (
              <div key={r.assembly_mark} className="flex items-center" style={{ ...ROW, gap: 8 }}>
                <CheckCircle2 size={16} className="text-green-800" />
                <span style={MARK}>{r.assembly_mark}</span>
                <span style={{ fontSize: 12.5, color: '#666' }}>ทุกค่าและ part ตรงกันทั้งหมด · MO {r.existing.qty} ชุด (BOM ทั้ง zone {r.bom!.qty})</span>
                <span style={{ flex: 1 }} />
                <Choice label="ยืนยันว่าตรงกัน" active={decision[r.assembly_mark] === 'keep'} onClick={() => setD(r, 'keep')} />
                <Choice label="ไว้ทีหลัง" active={decision[r.assembly_mark] === 'later'} onClick={() => setD(r, 'later')} />
              </div>
            ))}
          </Section>

          <Section title="ชื่อไม่ตรงกับ BOM — จับคู่ เก็บไว้ หรือเอาออก" tone="red" count={missing.length}>
            {missing.map(r => {
              const paired = pairWith[r.assembly_mark] ?? null
              const others = data.pool.filter(p => !r.candidates?.some(c => c.assembly_id === p.assembly_id))
              return (
                <div key={r.assembly_mark} style={ROW}>
                  <div className="flex items-center" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <span style={MARK}>{r.assembly_mark}</span>
                    <span style={{ fontSize: 12.5, color: '#666' }}>MO {r.existing.qty} ชุด{r.existing.wo_qty > 0 && ` · ออก WO แล้ว ${r.existing.wo_qty} ชุด`}</span>
                    <span style={{ flex: 1 }} />
                    <label className="flex items-center" style={{ gap: 6, fontSize: 12.5, color: '#0C447C', fontWeight: 600 }}>
                      จับคู่กับ mark ใน BOM
                      <select value={paired ?? ''} onChange={e => pair(r, e.target.value ? Number(e.target.value) : null)}
                        style={{ fontSize: 12.5, padding: '3px 6px', border: '1px solid #85B7EB', borderRadius: 5, minWidth: 200 }}>
                        <option value="">— ไม่จับคู่ —</option>
                        {r.candidates?.length ? (
                          <optgroup label="น่าจะเป็นชิ้นเดียวกัน">
                            {r.candidates.map(c => <option key={c.assembly_id} value={c.assembly_id} disabled={pairedIds.has(c.assembly_id) && paired !== c.assembly_id}>{c.assembly_mark} · เหมือน {c.score}%</option>)}
                          </optgroup>
                        ) : null}
                        {others.length > 0 && (
                          <optgroup label="mark อื่นใน BOM">
                            {others.map(c => <option key={c.assembly_id} value={c.assembly_id} disabled={pairedIds.has(c.assembly_id) && paired !== c.assembly_id}>{c.assembly_mark}</option>)}
                          </optgroup>
                        )}
                      </select>
                    </label>
                  </div>
                  {paired ? compareBody(r) : (
                    <>
                      {!!r.candidates?.length && <div style={{ fontSize: 12, color: '#0C447C', marginTop: 6 }}>ระบบเจอ mark ใน BOM ที่น่าจะเป็นชิ้นเดียวกัน: {r.candidates.map(c => `${c.assembly_mark} (${c.score}%)`).join(', ')} — เลือกจับคู่ถ้าใช่</div>}
                      <div className="flex items-center" style={{ gap: 8, marginTop: 8 }}>
                        <Choice label="เก็บไว้ (ยังเป็น pre-shop)" active={decision[r.assembly_mark] === 'keep'} onClick={() => setD(r, 'keep')} />
                        <Choice label="เอาออกจาก MO" active={decision[r.assembly_mark] === 'remove'} disabled={r.existing.wo_qty > 0}
                          title={r.existing.wo_qty > 0 ? 'มีใน WO แล้ว — เอาออกไม่ได้' : undefined} onClick={() => setD(r, 'remove')} />
                        <Choice label="ไว้ทีหลัง" active={decision[r.assembly_mark] === 'later'} onClick={() => setD(r, 'later')} />
                      </div>
                      <div style={{ marginTop: 6 }}><PartTable parts={r.existing.parts} /></div>
                    </>
                  )}
                </div>
              )
            })}
          </Section>

          <Section title="มีใน BOM แต่ยังไม่มีใน MO" tone="blue" count={data.bom_only.filter(b => !pairedIds.has(b.assembly_id)).length}>
            {data.bom_only.filter(b => !pairedIds.has(b.assembly_id)).map(b => (
              <div key={b.assembly_id} style={ROW}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span style={MARK}>{b.assembly_mark}</span>
                  <span style={{ fontSize: 12.5, color: '#666' }}>BOM ทั้ง zone {b.qty} ชุด · {valuesText(b)}</span>
                  <span style={{ flex: 1 }} />
                  {/* add = the BOM's sets by default, editable (2026-10-09, user: "ดึงจำนวนใน bom มาเป็นค่า default") */}
                  {b.assembly_id in adds && (
                    <label className="flex items-center" style={{ gap: 6, fontSize: 12.5, color: '#555' }}>
                      จำนวนชุด
                      {/* never more than the BOM has (2026-10-09) */}
                      <input type="number" min={0} max={b.qty} value={adds[b.assembly_id] || ''}
                        onChange={e => setAdds(a => ({ ...a, [b.assembly_id]: Math.min(Number(e.target.value) || 0, b.qty) }))}
                        style={{ width: 90, padding: '4px 8px', fontSize: 13, border: '1px solid #D4D4D4', borderRadius: 5 }} />
                    </label>
                  )}
                  <Choice label="เพิ่มเข้า MO" active={b.assembly_id in adds} onClick={() => setAdds(a => ({ ...a, [b.assembly_id]: a[b.assembly_id] ?? b.qty }))} />
                  <Choice label="ไว้ทีหลัง" active={!(b.assembly_id in adds)} onClick={() => setAdds(a => { const n = { ...a }; delete n[b.assembly_id]; return n })} />
                </div>
                <div style={{ marginTop: 6 }}><PartTable parts={b.parts} /></div>
              </div>
            ))}
          </Section>

          <Section title="เทียบแล้ว" tone="green" count={done.length}>
            <div style={{ ...ROW, fontSize: 12.5, color: '#555' }}>{done.map(r => r.assembly_mark).join(' · ')}</div>
          </Section>
        </div>

        <div className="flex items-center justify-end gap-2" style={{ padding: '12px 18px', borderTop: '1px solid #E8E8E8', background: '#fff', borderRadius: '0 0 10px 10px' }}>
          <span style={{ fontSize: 12.5, color: '#666', marginRight: 'auto' }}>
            จะบันทึก {decided.length} mark{pairedIds.size > 0 && ` · จับคู่ชื่อใหม่ ${pairedIds.size}`}{addList.length > 0 && ` · เพิ่ม ${addList.length} mark จาก BOM`}{pending.length - decided.length > 0 && ` · ไว้ทีหลัง ${pending.length - decided.length}`}
          </span>
          <button onClick={onClose} style={{ height: 34, padding: '0 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: '1px solid #C2C2C2', background: '#fff', color: '#333', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => void save()} disabled={!canSave}
            style={{ height: 34, padding: '0 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 'none', background: canSave ? '#C8202A' : '#C2C2C2', color: '#fff', cursor: canSave ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {saving && <Loader2 size={13} className="animate-spin" />} บันทึกผลการเทียบ
          </button>
        </div>
      </div>
    </div>
  )
}
