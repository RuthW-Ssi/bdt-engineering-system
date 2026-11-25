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

export function PreshopFileSlots({ dn, pl, disabled, onDispatchNote, onPartList, onRemoveDn, onRemovePl }: {
  dn: SlotState
  pl: SlotState
  disabled: boolean
  onDispatchNote: (f: File) => void
  onPartList: (f: File) => void
  onRemoveDn: () => void
  onRemovePl: () => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
      <Slot testId="slot-dn" label="Dispatch Note" hint="ไม่มีไฟล์ก็เพิ่ม assembly เองได้" chip="Dispatch Note" chipBg="#E6F1FB" chipFg="#0C447C"
        slot={dn} disabled={disabled} onFile={onDispatchNote} onRemove={onRemoveDn} />
      <Slot testId="slot-pl" label="Part list (ถ้ามี)" hint="ไม่มีไฟล์ก็เพิ่ม part เองได้" chip="Part list" chipBg="#EAF3DE" chipFg="#27500A"
        slot={pl} disabled={disabled} onFile={onPartList} onRemove={onRemovePl} />
    </div>
  )
}
