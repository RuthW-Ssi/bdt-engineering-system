import { AlertTriangle } from 'lucide-react'
import { distinctWoIds, type PrintLang } from '../../api/mo'
import { useMoDrawingRevStatus } from '../../hooks/useMo'

// MO print "drawing rev" warning (2026-10-21, Task 4) — notice at the top of
// PrintSelectModal's body. Compares printed rev vs current rev (never
// dates — Global Constraints #2); a legacy log or a WO whose mark has no
// drawing never produces a row (backend already filters those out). The
// button reprints exactly the affected WOs in one click — not just a
// preselect — with include_manifest=false (don't also reprint the MO
// overview) and the modal's own current language.
export function DrawingRevNotice({
  moId,
  lang,
  printing,
  onPrint,
}: {
  moId: number
  lang: PrintLang
  printing: boolean
  onPrint: (woIds: number[], includeManifest: boolean, lang: PrintLang) => void
}) {
  const { data, isLoading, isError } = useMoDrawingRevStatus(moId)
  const items = data?.items ?? []
  if (isLoading || isError || items.length === 0) return null
  const woIds = distinctWoIds(items)

  return (
    <div className="bg-molten-50" style={{ border: '1px solid #FAC775', borderRadius: 6, padding: '10px 12px', marginBottom: 14 }}>
      <div className="flex items-center gap-2 text-molten-600" style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
        <AlertTriangle size={14} /> มี Drawing rev ใหม่หลังพิมพ์ครั้งก่อน
      </div>
      <div style={{ maxHeight: 110, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        {items.map((it, i) => (
          <div key={`${it.wo_id}-${it.mark}-${i}`} style={{ fontSize: 12, color: '#6B4A12' }}>
            {it.wo_code} · {it.mark} · Rev {it.printed_rev} → Rev {it.current_rev}
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={printing}
        onClick={() => onPrint(woIds, false, lang)}
        className="text-molten-600"
        style={{ fontSize: 12.5, fontWeight: 700, padding: '6px 12px', borderRadius: 5, border: '1px solid #BA7517', background: '#fff', cursor: printing ? 'default' : 'pointer', opacity: printing ? 0.6 : 1 }}
      >
        พิมพ์ WO ที่ Drawing เปลี่ยน
      </button>
    </div>
  )
}
