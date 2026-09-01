import { X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

// Touch equivalent of desktop's hover tooltip for delay-status info — no
// hover surface on mobile, so tapping the info trigger opens this instead.
// Same bottom-sheet mechanics as MobileDrawingSheet/MobileNotificationSheet
// (backdrop + slide-up + X close), just auto-height instead of a fixed
// vh since the content here is a few lines of text, not a full panel.
export function MobileDelayInfoSheet({ open, onClose, title, children }: Props) {
  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />}
      <div
        className={[
          'fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl transition-transform duration-200 flex flex-col',
          open ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between border-b border-chrome-100 px-4 py-3.5 flex-shrink-0">
          <span className="text-chrome-900 text-[15px] font-semibold">{title}</span>
          <button onClick={onClose} aria-label="Close" className="flex-shrink-0 text-chrome-400 active:text-chrome-600">
            <X size={20} />
          </button>
        </div>
        <div className="px-4 py-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
          {children}
        </div>
      </div>
    </>
  )
}
