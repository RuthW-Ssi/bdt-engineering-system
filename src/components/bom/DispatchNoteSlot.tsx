import { X } from 'lucide-react'
import { FileDropzone } from './FileDropzone'
import { InfoTip } from './InfoTip'

/** Optional 4th BOM file (2026-10-26): the Dispatch Note gives each mark's Rev. */
export function DispatchNoteSlot({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        Dispatch Note <span style={{ fontWeight: 400, color: '#8E8E8E' }}>(ไม่บังคับ)</span>
        <InfoTip label="Dispatch Note ใช้ทำอะไร" text="ใช้ดู Rev ของแต่ละ mark. ถ้าไม่มีไฟล์นี้ ระบบจะเทียบกับ BOM ครั้งก่อนให้." />
      </label>
      {file ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', border: '1px solid #E0E0E0', borderRadius: 6, fontSize: 12 }}>
          <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
          <button onClick={() => onChange(null)} aria-label="เอาไฟล์ Dispatch Note ออก" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8E8E8E', display: 'flex' }}><X size={13} /></button>
        </div>
      ) : (
        <FileDropzone maxFiles={1} currentCount={0} acceptedFormats={['.xls', '.xlsx']} hint=".xls / .xlsx · 1 ไฟล์" onFilesAdded={accepted => accepted[0] && onChange(accepted[0])} disabled={false} />
      )}
    </div>
  )
}
