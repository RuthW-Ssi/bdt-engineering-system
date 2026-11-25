import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { importDispatchNote, importPartList, type PreshopAssembly } from '../../../api/bomPreshop'
import {
  applyMerge, canSave, mergeDispatchNote, mergePartList, removeFileRows, saveErrors, toPayload,
  type EditorState, type MergeResult, type Slot,
} from '../../../lib/bomPreshop'
import { PreshopAssemblyTable } from './PreshopAssemblyTable'
import { PreshopFileSlots, type SlotState } from './PreshopFileSlots'
import { PreshopMergeDialog } from './PreshopMergeDialog'
import { PreshopPartPool } from './PreshopPartPool'

const errText = (err: unknown, fallback: string) => {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? fallback)
}

export function PreshopEditor({ initial, onSave, saving, canWrite = true, uploadMode = 'combined' }: {
  initial: EditorState
  onSave: (assemblies: PreshopAssembly[]) => void
  saving: boolean
  canWrite?: boolean
  uploadMode?: 'combined' | 'separate' // Separate: MAIN/ACC slots (2026-11-25)
}) {
  const [state, setState] = useState<EditorState>(initial)
  // one file state per box: combined uses the MAIN/null pair only; Separate uses all four (2026-11-25)
  const [dn, setDn] = useState<SlotState>({ file: null, loading: false })
  const [pl, setPl] = useState<SlotState>({ file: null, loading: false })
  const [dnAcc, setDnAcc] = useState<SlotState>({ file: null, loading: false })
  const [plAcc, setPlAcc] = useState<SlotState>({ file: null, loading: false })
  const setterOf = (kind: 'dn' | 'pl', box: Slot | null) => (kind === 'dn' ? (box === 'ACC' ? setDnAcc : setDn) : (box === 'ACC' ? setPlAcc : setPl))
  const [dragging, setDragging] = useState<string | null>(null)
  const [pending, setPending] = useState<{ file: string; result: MergeResult; slot: 'dn' | 'pl'; box: Slot | null } | null>(null)
  // File reads are async: merge into the state as it is when the file comes
  // back, not as it was when it was picked (drags made meanwhile must stay).
  const latest = useRef(state)
  useEffect(() => { latest.current = state }, [state])
  const reading = dn.loading || pl.loading || dnAcc.loading || plAcc.loading

  const take = (file: string, slot: 'dn' | 'pl', box: Slot | null, result: MergeResult) => {
    if (result.conflicts.length || result.missing.length) { setPending({ file, result, slot, box }); return }
    setState(result.state)
    setterOf(slot, box)({ file, loading: false })
  }

  const onDispatchNote = async (file: File, box: Slot | null) => {
    const set = setterOf('dn', box)
    set(s => ({ ...s, loading: true }))
    try {
      const res = await importDispatchNote(file)
      res.warnings?.forEach(w => toast.warning(w))
      // a re-picked file merges like any other: same marks keep their links (2026-11-23 review)
      take(res.filename, 'dn', box, mergeDispatchNote(latest.current, res.assemblies, box))
    } catch (err) {
      toast.error(errText(err, 'อ่าน Dispatch Note ไม่ได้'))
    } finally {
      set(s => ({ ...s, loading: false }))
    }
  }

  const onPartList = async (file: File, box: Slot | null) => {
    const set = setterOf('pl', box)
    set(s => ({ ...s, loading: true }))
    try {
      const res = await importPartList(file)
      take(res.filename, 'pl', box, mergePartList(latest.current, res.parts, box))
    } catch (err) {
      toast.error(errText(err, 'อ่าน Part List ไม่ได้'))
    } finally {
      set(s => ({ ...s, loading: false }))
    }
  }

  const errors = saveErrors(state, uploadMode)
  const ready = canWrite && canSave(errors, state) && !saving
  const problems = [
    errors.noSlot.length ? `เลือก MAIN หรือ ACC: ${errors.noSlot.join(', ')}` : '',
    errors.dupMarks.length ? `Assembly mark ซ้ำ: ${errors.dupMarks.join(', ')}` : '',
    errors.blankMarks ? `ยังไม่มี assembly mark ${errors.blankMarks} แถว` : '',
    errors.badSets.length ? `ชุดต้องมากกว่า 0: ${errors.badSets.join(', ')}` : '',
    errors.badQty.length ? `จำนวนต่อชุดต้องมากกว่า 0: ${errors.badQty.join(', ')}` : '',
    errors.incompleteParts.length ? `part ยังไม่ครบ (Part, Profile, L, kg/ชิ้น): ${errors.incompleteParts.join(', ')}` : '',
    errors.dupPartMarks.length ? `Part mark ซ้ำ: ${errors.dupPartMarks.join(', ')}` : '',
  ].filter(Boolean)

  return (
    <div data-upload-mode={uploadMode} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PreshopFileSlots mode={uploadMode} dn={dn} pl={pl} dnAcc={dnAcc} plAcc={plAcc} disabled={!canWrite || reading}
        onDispatchNote={onDispatchNote} onPartList={onPartList}
        onRemoveDn={box => { setState(s => removeFileRows(s, 'dn', box)); setterOf('dn', box)({ file: null, loading: false }) }}
        onRemovePl={box => { setState(s => removeFileRows(s, 'pl', box)); setterOf('pl', box)({ file: null, loading: false }) }} />

      {errors.needsParts.length > 0 && (
        <div className="flex items-start" style={{ gap: 8, border: '1px solid #F3C7C9', background: '#FDF1F1', color: '#A01A22', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 3 }} />
          <span>ใส่ part ให้ครบทุก mark ก่อนบันทึก (Part, Profile, L, kg/ชิ้น, จำนวนต่อชุด — ขนาดประมาณการได้) · ยังไม่มี part: {errors.needsParts.join(', ')}</span>
        </div>
      )}
      {problems.length > 0 && (
        <div style={{ fontSize: 12.5, color: '#A01A22' }}>{problems.map(p => <div key={p}>{p}</div>)}</div>
      )}

      <div className="flex flex-wrap items-start" style={{ gap: 16 }}>
        <PreshopAssemblyTable state={state} onChange={setState} dragging={dragging} uploadMode={uploadMode} />
        <PreshopPartPool state={state} onChange={setState} dragging={dragging} onDragging={setDragging} />
      </div>

      <div className="flex justify-end">
        <button type="button" disabled={!ready} onClick={() => onSave(toPayload(state, { mode: uploadMode, bothPartLists: !!pl.file && !!plAcc.file }))}
          className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#C8202A', border: 'none' }}>
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save pre-shop
        </button>
      </div>

      {pending && (
        <PreshopMergeDialog file={pending.file} result={pending.result}
          onCancel={() => setPending(null)}
          onConfirm={(picks, remove) => {
            setState(applyMerge(pending.result, picks, remove))
            setterOf(pending.slot, pending.box)({ file: pending.file, loading: false })
            setPending(null)
          }} />
      )}
    </div>
  )
}
