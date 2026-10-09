import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { mergePreshop, type AssemblyPickerItem, type MoDetail, type PreshopAssembly } from '../../api/mo'
import { getErrorMessage } from '../../lib/getErrorMessage'
import { partErrors, preshopErrors } from '../../lib/preshop'
import { autoChoice, choiceErrors, finalAssembly, unchosen, type MergeChoice } from '../../lib/preshopMerge'
import { PreshopMergeCompare } from './PreshopMergeCompare'
import { DEFAULT_FILTER } from './AssemblyFilterBar'
import { AssemblyPicker } from './AssemblyPicker'
import { PreshopPanel } from './PreshopPanel'
import type { UploadedFile } from '../../lib/preshopCombine'
import type { UploadMode } from './PreshopPanel'

// Add / fill in a PRE_SHOP MO's assemblies (2026-10-07, user: the MO is created
// empty; before work starts — and any time until DONE — upload a Dispatch Note
// or a pre-shop drawing, or pull from the BOM). The server merges by assembly
// mark (POST /mo/:id/preshop) and logs it in the MO History. A mark the MO
// already has is shown old vs new and the user picks or types every value
// (2026-10-08); what they chose is sent as that mark's final state.
export function PreshopUploadModal({ mo, onClose }: { mo: MoDetail; onClose: () => void }) {
  const qc = useQueryClient()
  const [assemblies, setAssemblies] = useState<PreshopAssembly[]>([])
  const [uploadedFrom, setUploadedFrom] = useState<UploadedFile[]>([])
  const [selected, setSelected] = useState<Record<number, { item: AssemblyPickerItem; qty: number }>>({})
  const [saving, setSaving] = useState(false)
  const filter = { ...DEFAULT_FILTER, projectId: mo.project?.id ?? null, projectName: mo.project?.name ?? null, zoneId: mo.zone?.id ?? null, zoneLabel: mo.zone?.label ?? null }
  const picks = Object.values(selected).filter(s => s.qty > 0)
  // The upload mode is chosen and locked in the panel (2026-10-08) — it is
  // what gets recorded, not guessed from the files.
  // A Full shop MO picks from the BOM; a pre-shop MO uploads files only (its
  // real-BOM data comes through "เทียบกับ BOM", 2026-10-08).
  const isFull = mo.shop_type === 'FULL_SHOP'
  const [mode, setMode] = useState<UploadMode>('DN')
  const source = ({ DN: 'DISPATCH_NOTE', PDF: 'PRESHOP_PDF', BOTH: 'DN_PDF' } as const)[mode]
  const kinds = new Set(uploadedFrom.map(f => f.kind))
  const missingBoth = mode === 'BOTH' && assemblies.length > 0 && !(kinds.has('DN') && kinds.has('PDF'))
  // logged with the upload; the API takes at most 50 × 300 chars
  const allNotes = uploadedFrom.flatMap(f => (f.warnings ?? []).map(w => (w.startsWith(f.name) ? w : `${f.name}: ${w}`)).map(w => w.slice(0, 300)))
  const notes = allNotes.length > 50 ? [...allNotes.slice(0, 49), `… และอีก ${allNotes.length - 49} คำเตือน`] : allNotes
  // Compare with the MO as the user edits (2026-10-08): a repeat mark adds
  // sets (yellow), a changed size blocks saving (red).
  const [debounced, setDebounced] = useState(assemblies)
  useEffect(() => { const t = setTimeout(() => setDebounced(assemblies), 400); return () => clearTimeout(t) }, [assemblies])
  const toSend = (list: PreshopAssembly[]) => list.map(a => ({ ...a, assembly_mark: a.assembly_mark.trim() }))
  const check = useQuery({
    queryKey: ['mo', mo.id, 'preshop-check', source, debounced],
    queryFn: () => mergePreshop(mo.id, { source, dry_run: true, preshop_assemblies: toSend(debounced) }),
    // compare as soon as a file is read — sets may still be blank
    enabled: debounced.length > 0 && debounced.every(a => a.assembly_mark.trim()),
  })
  const compare = new Map((check.data?.rows ?? []).map(r => [r.assembly_mark, r]))
  const checking = assemblies.length > 0 && (debounced !== assemblies || check.isFetching)
  // Old-vs-new choices per mark already in the MO; equal values pre-picked.
  const [choices, setChoices] = useState<Record<string, MergeChoice>>({})
  // A newly read file starts the choices over; removing a wrong file keeps the
  // choices made for the other files' marks.
  const prevFiles = useRef<string[]>([])
  useEffect(() => {
    const now = uploadedFrom.map(f => f.name)
    const onlyRemoved = now.length > 0 && now.length < prevFiles.current.length && now.every(f => prevFiles.current.includes(f))
    if (!onlyRemoved) setChoices({})
    prevFiles.current = now
  }, [uploadedFrom])
  const inMo = assemblies.flatMap(a => {
    const row = compare.get(a.assembly_mark.trim())
    return row?.existing ? [{ a, mark: a.assembly_mark.trim(), existing: row.existing }] : []
  })
  const choiceOf = (mark: string, a: PreshopAssembly) => {
    const e = compare.get(mark)?.existing
    return choices[mark] ?? (e ? autoChoice(e, a) : {})
  }
  const pending = inMo.filter(x => unchosen(choiceOf(x.mark, x.a)).length > 0)
  const mergeErrors = inMo.flatMap(x => {
    const c = choiceOf(x.mark, x.a)
    return [...choiceErrors(x.mark, x.existing, c), ...(c.parts ? partErrors(c.parts).map(e => `${x.mark} · ${e}`) : [])]
  })
  // Row checks for new marks only — a mark in the MO is settled in its compare box.
  const inMoMarks = new Set(inMo.map(x => x.mark))
  const rowErrors = preshopErrors(assemblies.filter(a => !inMoMarks.has(a.assembly_mark.trim())))
  const invalid = rowErrors.length > 0
  // Every new mark needs parts before saving (2026-10-08).
  const needsParts = new Set(assemblies.filter(a => !a.parts.length && !compare.get(a.assembly_mark.trim())?.existing).map(a => a.assembly_mark.trim()))
  const canSave = isFull
    ? !saving && picks.length > 0
    : !saving && !invalid && !checking && !missingBoth && pending.length === 0 && mergeErrors.length === 0 && needsParts.size === 0 && assemblies.length > 0

  function setQty(item: AssemblyPickerItem, qty: number) {
    setSelected(prev => {
      const next = { ...prev }
      if (qty <= 0) delete next[item.id]
      else next[item.id] = { item, qty }
      return next
    })
  }

  async function save() {
    setSaving(true)
    try {
      const warnings: string[] = []
      if (!isFull && assemblies.length) {
        const r = await mergePreshop(mo.id, {
          notes,
          // Typed-in rows (no file) carry sets the same way a Dispatch Note does.
          source,
          filename: uploadedFrom.length ? uploadedFrom.map(f => f.name).join(', ') : 'กรอกเอง',
          preshop_assemblies: toSend(assemblies.map(a => (compare.get(a.assembly_mark.trim())?.existing ? finalAssembly(a, choiceOf(a.assembly_mark.trim(), a)) : a))),
        })
        warnings.push(...(r.warnings ?? []))
      }
      if (isFull && picks.length) {
        const r = await mergePreshop(mo.id, { source: 'BOM', assembly_lines: picks.map(p => ({ bom_assembly_id: p.item.id, qty: p.qty })) })
        warnings.push(...(r.warnings ?? []))
      }
      await qc.invalidateQueries({ queryKey: ['mo'] })
      toast.success('บันทึกข้อมูลเข้า MO แล้ว')
      for (const w of warnings) toast.warning(w)
      onClose()
    } catch (e) {
      toast.error(getErrorMessage(e, 'บันทึกไม่สำเร็จ'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(980px, 94vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
        <div className="flex items-center justify-between" style={{ padding: '14px 18px', borderBottom: '1px solid #EEE' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1A1A' }}>Upload · {mo.mo_code}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              {mo.project?.name ?? '—'} · {mo.zone?.label ?? '—'} — {mo.shop_type === 'FULL_SHOP' ? 'เลือก assembly จาก BOM' : 'เลือกแบบการอัปโหลด: Dispatch Note, Pre-shop drawing หรือทั้ง 2 อย่าง · ข้อมูลจาก BOM จริงใช้ "เทียบกับ BOM" ที่หน้า MO'}
            </div>
          </div>
          <button onClick={onClose} aria-label="ปิด" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', display: 'flex' }}><X size={18} /></button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
          {missingBoth && (
            <div className="flex items-start gap-2 rounded-lg border border-molten-100 bg-molten-50 text-molten-600" style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>แบบ Dispatch Note + Pre-shop ต้องอัปโหลดให้ครบทั้ง 2 อย่าง — ยังขาด {kinds.has('DN') ? 'Pre-shop drawing' : 'Dispatch Note'}</span>
            </div>
          )}
          {needsParts.size > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-ssi-100 bg-ssi-50 text-ssi-600" style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>ใส่ part ให้ครบทุก mark ก่อนบันทึก (Part, Profile, L, kg/ชิ้น, จำนวนต่อชุด — ขนาดประมาณการได้) · ยังไม่มี part: {[...needsParts].join(', ')}</span>
            </div>
          )}
          {pending.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-molten-100 bg-molten-50 text-molten-600" style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>mark ที่มีใน MO แล้ว ต้องเลือกค่าก่อนบันทึก: {pending.map(x => `${x.mark} (${unchosen(choiceOf(x.mark, x.a)).join(', ')})`).join(' · ')}</span>
            </div>
          )}
          {mergeErrors.map(e => (
            <div key={e} className="rounded-lg border border-ssi-100 bg-ssi-50 text-ssi-600" style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{e}</div>
          ))}
          {mo.shop_type === 'FULL_SHOP'
            ? <AssemblyPicker markPrefix={null} selected={selected} onSetQty={setQty} filter={filter} />
            : <PreshopPanel assemblies={assemblies} onChange={setAssemblies} uploadedFrom={uploadedFrom} onUploadedFrom={setUploadedFrom} compare={compare} needsParts={needsParts} errors={rowErrors} mode={mode} onMode={setMode}
                renderCompare={(a, row) => row.existing && (
                  <PreshopMergeCompare existing={row.existing} incoming={a} choice={choiceOf(a.assembly_mark.trim(), a)}
                    onChange={c => setChoices(prev => ({ ...prev, [a.assembly_mark.trim()]: c }))} />
                )} />}
        </div>
        <div className="flex items-center justify-end gap-2" style={{ padding: '12px 18px', borderTop: '1px solid #EEE' }}>
          <button onClick={onClose} style={{ height: 34, padding: '0 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: '1px solid #C2C2C2', background: '#fff', color: '#333', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => void save()} disabled={!canSave}
            style={{ height: 34, padding: '0 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 'none', background: canSave ? '#C8202A' : '#C2C2C2', color: '#fff', cursor: canSave ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {saving && <Loader2 size={13} className="animate-spin" />} Save to MO
          </button>
        </div>
      </div>
    </div>
  )
}
