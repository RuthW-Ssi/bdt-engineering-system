import { X } from 'lucide-react'
import { ProgressDrawingPanel } from '../progress/ProgressDrawingPanel'
import type { ProgressZoneRow } from '../../api/projectProgress'

interface Props {
  open: boolean
  onClose: () => void
  row: ProgressZoneRow | null
}

// Mirrors MobileProgressSheet's shell exactly (same bottom-sheet mechanics) —
// shows the zone-level Drawing (reusing desktop ProjectProgress's
// ProgressDrawingPanel) for the tapped 3D element's zone, opened from the
// same info-pill as "Update progress". No overflow-y-auto on the body (unlike
// the progress form) — the APS viewer owns its own canvas space, scrolling
// the container would just clip/break it.
export function MobileDrawingSheet({ open, onClose, row }: Props) {
  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />}
      <div
        className={[
          'fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl transition-transform duration-200 h-[75vh] flex flex-col',
          open ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between border-b border-chrome-100 px-4 py-3.5 flex-shrink-0">
          <div className="min-w-0">
            <div className="font-mono font-semibold text-chrome-900 text-[15px] truncate">{row?.mark}</div>
            {row?.zone_label && <div className="text-xs text-chrome-400">{row.zone_label}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="flex-shrink-0 text-chrome-400 active:text-chrome-600">
            <X size={20} />
          </button>
        </div>
        {/* Only mounted while open, same as MobileProgressSheet. */}
        {open && row?.zone_id != null && (
          <div className="flex-1 min-h-0 p-3">
            <ProgressDrawingPanel key={row.mark} zoneId={row.zone_id} mark={row.mark} />
          </div>
        )}
      </div>
    </>
  )
}
