import { X } from 'lucide-react'
import { MobileProgressFormFields } from './MobileProgressFormFields'
import type { ProgressZoneRow } from '../../api/projectProgress'

interface Props {
  open: boolean
  onClose: () => void
  projectCode: string
  row: ProgressZoneRow | null
}

// Lets a tapped 3D element be updated right where it was tapped (MobileBimCard's
// info pill) without leaving the 3D tab — same field set and save mutation as
// the full-page MobileProgressForm route, shared via MobileProgressFormFields
// rather than duplicated.
export function MobileProgressSheet({ open, onClose, projectCode, row }: Props) {
  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />}
      <div
        className={[
          'fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl transition-transform duration-200 max-h-[85vh] flex flex-col',
          open ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between border-b border-chrome-100 px-4 py-3.5 flex-shrink-0">
          <div className="min-w-0">
            <div className="font-mono font-semibold text-chrome-900 text-[15px] truncate">{row?.mark}</div>
            {row && <div className="text-xs text-chrome-400">Qty {row.qty ?? 1}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="flex-shrink-0 text-chrome-400 active:text-chrome-600">
            <X size={20} />
          </button>
        </div>
        {/* Only mounted while open — closing drops any in-progress draft
            rather than carrying it over to the next tapped element. */}
        {open && row && (
          <div className="flex-1 overflow-y-auto scroll-thin flex flex-col">
            <MobileProgressFormFields code={projectCode} row={row} variant="sheet" onSaved={onClose} />
          </div>
        )}
      </div>
    </>
  )
}
