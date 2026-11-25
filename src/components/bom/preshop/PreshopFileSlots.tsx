import { CheckCircle2, Loader2, X } from 'lucide-react'
import { FileDropzone } from '../FileDropzone'

const XLS = ['.xls', '.xlsx']

export interface SlotState { file: string | null; loading: boolean }

interface SlotProps {
  testId: string
  label: string
  hint: string
  chip: string
  chipBg: string
  chipFg: string
  slot: SlotState
  disabled: boolean
  onFile: (file: File) => void
  onRemove: () => void
}

function Slot({ testId, label, hint, chip, chipBg, chipFg, slot, disabled, onFile, onRemove }: SlotProps) {
  return (
    <div data-testid={testId} style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>
        {label}
        <span style={{ fontSize: 11, fontWeight: 400, color: '#8E8E8E', marginLeft: 6 }}>{hint}</span>
      </div>
      <FileDropzone
        maxFiles={1}
        currentCount={0}
        acceptedFormats={XLS}
        hint=".xls / .xlsx · 1 ไฟล์"
        disabled={disabled || slot.loading}
        onFilesAdded={accepted => { if (accepted[0]) onFile(accepted[0]) }}
      />
      {slot.loading && (
        <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: '#8E8E8E', marginTop: 6 }}>
          <Loader2 size={13} className="animate-spin" /> Reading file…
        </div>
      )}
      {slot.file && (
        <div className="flex items-center gap-2.5" style={{ marginTop: 8, border: '1px solid #E0E0E0', borderRadius: 6, background: '#F9F9F9', padding: '10px 12px' }}>
          <CheckCircle2 size={16} color="#059669" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#1F1F1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slot.file}</div>
            <span style={{ display: 'inline-block', marginTop: 3, background: chipBg, color: chipFg, borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 500 }}>{chip}</span>
          </div>
          <button type="button" aria-label={`Remove ${chip}`} title="เอาไฟล์ออก (รายการที่มาจากไฟล์นี้จะหายไป)" onClick={onRemove}
            className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 24, height: 24, color: '#8E8E8E', border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

type Box = 'MAIN' | 'ACC' | null

/** Combined: one Dispatch Note + one Part List (box null). Separate (2026-11-25): one of each per MAIN / ACC —
 *  one Part List in either box is shared by both, two = each its own, as on the Full shop page. */
export function PreshopFileSlots({ mode = 'combined', dn, pl, dnAcc = EMPTY, plAcc = EMPTY, disabled, onDispatchNote, onPartList, onRemoveDn, onRemovePl }: {
  mode?: 'combined' | 'separate'
  dn: SlotState
  pl: SlotState
  dnAcc?: SlotState
  plAcc?: SlotState
  disabled: boolean
  onDispatchNote: (f: File, box: Box) => void
  onPartList: (f: File, box: Box) => void
  onRemoveDn: (box: Box) => void
  onRemovePl: (box: Box) => void
}) {
  const DN = { chip: 'Dispatch Note', chipBg: '#E6F1FB', chipFg: '#0C447C', hint: 'ไม่มีไฟล์ก็เพิ่ม assembly เองได้' }
  const PL = { chipBg: '#EAF3DE', chipFg: '#27500A' }
  if (mode === 'combined') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <Slot testId="slot-dn" label="Dispatch Note" {...DN} slot={dn} disabled={disabled} onFile={f => onDispatchNote(f, null)} onRemove={() => onRemoveDn(null)} />
        <Slot testId="slot-pl" label="Part list (ถ้ามี)" hint="ไม่มีไฟล์ก็เพิ่ม part เองได้" chip="Part list" {...PL} slot={pl} disabled={disabled} onFile={f => onPartList(f, null)} onRemove={() => onRemovePl(null)} />
      </div>
    )
  }
  const plHint = (mine: SlotState, other: SlotState, otherBox: string) =>
    !mine.file && other.file ? `ใช้ Part List ร่วมจากช่อง ${otherBox}` : 'ไม่มีไฟล์ก็เพิ่ม part เองได้'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
      <Slot testId="slot-dn-main" label="Dispatch Note MAIN" {...DN} chip="Dispatch Note MAIN" slot={dn} disabled={disabled} onFile={f => onDispatchNote(f, 'MAIN')} onRemove={() => onRemoveDn('MAIN')} />
      <Slot testId="slot-dn-acc" label="Dispatch Note ACC" {...DN} chip="Dispatch Note ACC" slot={dnAcc} disabled={disabled} onFile={f => onDispatchNote(f, 'ACC')} onRemove={() => onRemoveDn('ACC')} />
      <Slot testId="slot-pl-main" label="Part list MAIN (ถ้ามี)" hint={plHint(pl, plAcc, 'ACC')} chip="Part list MAIN" {...PL} slot={pl} disabled={disabled} onFile={f => onPartList(f, 'MAIN')} onRemove={() => onRemovePl('MAIN')} />
      <Slot testId="slot-pl-acc" label="Part list ACC (ถ้ามี)" hint={plHint(plAcc, pl, 'MAIN')} chip="Part list ACC" {...PL} slot={plAcc} disabled={disabled} onFile={f => onPartList(f, 'ACC')} onRemove={() => onRemovePl('ACC')} />
    </div>
  )
}

const EMPTY: SlotState = { file: null, loading: false }
