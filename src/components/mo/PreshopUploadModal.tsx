import { useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { mergePreshop, type AssemblyPickerItem, type MoDetail, type PreshopAssembly } from '../../api/mo'
import { getErrorMessage } from '../../lib/getErrorMessage'
import { partErrors, preshopErrors } from '../../lib/preshop'
import { autoChoice, choiceErrors, unchosen, type MergeChoice } from '../../lib/preshopMerge'
import { candidateFor, finalRenamedAssembly, pairedLineIds, reconcilePairing, type RenamePairing } from '../../lib/preshopRename'
import { PreshopMergeCompare } from './PreshopMergeCompare'
import { PreshopRenamePair } from './PreshopRenamePair'
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
    // Any edit changes the key; without this `check.data` is undefined while
    // the new dry run is in flight → an EMPTY compare map → every pairing
    // (and every existing-mark compare box) vanished until it returned, and
    // reconcilePairing wrongly dropped them all (live bug 2026-10-22).
    placeholderData: keepPreviousData,
  })
  // Stable reference across renders (only changes when the query actually
  // resolves) — the reconciliation effect below depends on it.
  const compare = useMemo(() => new Map((check.data?.rows ?? []).map(r => [r.assembly_mark, r])), [check.data])
  const checking = assemblies.length > 0 && (debounced !== assemblies || check.isFetching)
  // A COMPLETED dry run for exactly the rows on screen — the only result
  // allowed to drop a pairing. Never a placeholder (previous key's data), an
  // in-flight refetch, or a pending debounce.
  const settledCompare = check.isSuccess && !check.isPlaceholderData && !checking ? compare : undefined
  // Old-vs-new choices per mark already in the MO; equal values pre-picked.
  const [choices, setChoices] = useState<Record<string, MergeChoice>>({})
  // Pair a renamed mark (2026-10-22): a new row paired with an absent PRE_SHOP
  // mark of the MO — keyed by the incoming (trimmed) mark, undefined/absent =
  // "ไม่ใช่ — เพิ่มเป็น mark ใหม่" (the default).
  const [pairing, setPairing] = useState<RenamePairing>({})
  // A fresh dry run just dropped this mark's chosen candidate (reconcilePairing,
  // below) — shown as a notice until the user picks again.
  const [staleNotice, setStaleNotice] = useState<Set<string>>(new Set())
  // A newly read file starts the choices/pairing over; removing a wrong file
  // keeps the choices made for the other files' marks.
  const prevFiles = useRef<string[]>([])
  useEffect(() => {
    const now = uploadedFrom.map(f => f.name)
    const onlyRemoved = now.length > 0 && now.length < prevFiles.current.length && now.every(f => prevFiles.current.includes(f))
    if (!onlyRemoved) { setChoices({}); setPairing({}); setStaleNotice(new Set()) }
    prevFiles.current = now
  }, [uploadedFrom])
  // A later dry run can drop a chosen candidate (e.g. the old mark now
  // appears elsewhere in the batch) — a stale pairing must never keep acting
  // "paired" (stuck qty cell, Save silently dropping rename_from and adding a
  // duplicate mark instead of renaming in place). Reconcile on every fresh
  // dry-run result — and ONLY a completed one (see `settledCompare`).
  useEffect(() => {
    if (!settledCompare) return
    const { pairing: next, dropped } = reconcilePairing(pairing, settledCompare)
    if (!dropped.length) return
    // Reacting to a value that only changes when the server's candidate list
    // actually changes, not a local render loop — same shape as the existing
    // sync-setState-in-effect elsewhere in this app (ProgressAssemblyTable.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPairing(next)
    setChoices(c => { const n = { ...c }; for (const m of dropped) delete n[m]; return n })
    setStaleNotice(s => { const n = new Set(s); for (const m of dropped) n.add(m); return n })
    // Deliberately depends only on `settledCompare` (set only once a fresh
    // dry run has fully resolved) — `pairing` is read fresh from the closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledCompare])
  const candidatesOf = (mark: string) => compare.get(mark)?.rename_candidates
  const chosenCandidateOf = (mark: string) => candidateFor(candidatesOf(mark), pairing[mark])
  // A paired new row's "existing" is the chosen candidate's — it then behaves
  // exactly like a mark the MO already has (same cards/rules, WO floor, etc.).
  const existingOf = (mark: string) => compare.get(mark)?.existing ?? chosenCandidateOf(mark)?.existing
  const takenLineIds = pairedLineIds(pairing)
  function pairRename(mark: string, lineId: number | undefined) {
    setPairing(p => ({ ...p, [mark]: lineId }))
    setChoices(c => { const n = { ...c }; delete n[mark]; return n })
    setStaleNotice(s => { if (!s.has(mark)) return s; const n = new Set(s); n.delete(mark); return n })
  }
  const inMo = assemblies.flatMap(a => {
    const mark = a.assembly_mark.trim()
    const existing = existingOf(mark)
    return existing ? [{ a, mark, existing }] : []
  })
  const choiceOf = (mark: string, a: PreshopAssembly) => {
    const e = existingOf(mark)
    return choices[mark] ?? (e ? autoChoice(e, a) : {})
  }
  const pending = inMo.filter(x => unchosen(choiceOf(x.mark, x.a)).length > 0)
  const mergeErrors = inMo.flatMap(x => {
    const c = choiceOf(x.mark, x.a)
    return [...choiceErrors(x.mark, x.existing, c), ...(c.parts ? partErrors(c.parts).map(e => `${x.mark} · ${e}`) : [])]
  })
  // Row checks for new marks only — a mark in the MO (or paired) is settled in its compare box.
  const inMoMarks = new Set(inMo.map(x => x.mark))
  const rowErrors = preshopErrors(assemblies.filter(a => !inMoMarks.has(a.assembly_mark.trim())))
  const invalid = rowErrors.length > 0
  // Every new mark needs parts before saving (2026-10-08) — a paired one doesn't, its parts come from the compare box.
  const needsParts = new Set(assemblies.filter(a => !a.parts.length && !existingOf(a.assembly_mark.trim())).map(a => a.assembly_mark.trim()))
  // Only a pairing that still RESOLVES against the current candidates counts
  // as paired — never raw key presence in `pairing` (a dropped one must fall
  // back to a plain editable row, not stay stuck on "เลือกด้านล่าง").
  const pairedMarks = new Set(assemblies.map(a => a.assembly_mark.trim()).filter(m => !!chosenCandidateOf(m)))
  const staleMarks = new Set(assemblies.map(a => a.assembly_mark.trim()).filter(m => staleNotice.has(m)))
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
          preshop_assemblies: toSend(assemblies.map(a => {
            const mark = a.assembly_mark.trim()
            const existing = existingOf(mark)
            // paired → rename_from the old mark; otherwise unchanged (incl. a plain new row)
            return existing ? finalRenamedAssembly(a, choiceOf(mark, a), chosenCandidateOf(mark)?.assembly_mark) : a
          })),
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
                pairedMarks={pairedMarks} staleMarks={staleMarks}
                renderCompare={(a, row) => row.existing && (
                  <PreshopMergeCompare existing={row.existing} incoming={a} choice={choiceOf(a.assembly_mark.trim(), a)}
                    onChange={c => setChoices(prev => ({ ...prev, [a.assembly_mark.trim()]: c }))} />
                )}
                renderPairing={(a, row) => {
                  const mark = a.assembly_mark.trim()
                  return (
                    <PreshopRenamePair mark={mark} incoming={a} candidates={row.rename_candidates ?? []} chosenId={pairing[mark]} takenIds={takenLineIds}
                      choice={choiceOf(mark, a)} onPair={id => pairRename(mark, id)} onChoiceChange={c => setChoices(prev => ({ ...prev, [mark]: c }))}
                      notice={staleNotice.has(mark) ? 'mark ที่จับคู่ไว้ไม่อยู่ในรายการแล้ว — เลือกใหม่' : undefined} />
                  )
                }} />}
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
