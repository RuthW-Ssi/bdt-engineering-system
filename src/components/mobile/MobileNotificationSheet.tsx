import { Bell, Check } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

// Mirrors Topbar.tsx's notification dropdown content exactly (same 2 mock
// items, same colors/copy) — still a static mock, no real notification data
// or backend wired up on either platform yet. Presented as a bottom sheet
// instead of an anchored dropdown since the desktop's 360px-wide floating
// panel doesn't translate to a phone-width screen.
export function MobileNotificationSheet({ open, onClose }: Props) {
  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />}
      <div
        className={[
          'fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl transition-transform duration-200 max-h-[70vh] flex flex-col',
          open ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between border-b border-chrome-100 px-4 py-3.5">
          <span className="text-chrome-900" style={{ fontSize: 15, fontWeight: 600 }}>Notifications</span>
          <button className="text-ssi-600" style={{ fontSize: 12.5 }}>Mark all as read</button>
        </div>
        <div className="flex-1 overflow-y-auto scroll-thin">
          <button className="w-full text-left flex items-start gap-3 border-b border-chrome-100 px-4 py-3.5" style={{ background: '#FAEEDA' }}>
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#FAC77522' }}>
              <Bell size={16} style={{ color: '#854F0B' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-chrome-900 truncate" style={{ fontSize: 13.5, fontWeight: 500 }}>
                <span className="font-mono">PP-00099</span> In Review
              </div>
              <div className="text-chrome-600 mt-0.5" style={{ fontSize: 12 }}>somchai.k submitted 15 minutes ago</div>
            </div>
            <span className="flex-shrink-0 mt-1.5 w-2 h-2 rounded-full" style={{ background: '#C8202A' }} />
          </button>
          <button className="w-full text-left flex items-start gap-3 border-b border-chrome-100 px-4 py-3.5 active:bg-chrome-50">
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#EAF3DE' }}>
              <Check size={16} style={{ color: '#639922' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-chrome-900 truncate" style={{ fontSize: 13.5, fontWeight: 500 }}>
                <span className="font-mono">SA-00120</span> Approved
              </div>
              <div className="text-chrome-600 mt-0.5" style={{ fontSize: 12 }}>nuch.p approved 2 hours ago</div>
            </div>
          </button>
        </div>
        <div className="border-t border-chrome-100 text-center py-2.5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.625rem)' }}>
          <button className="text-chrome-600" style={{ fontSize: 12.5 }}>View all</button>
        </div>
      </div>
    </>
  )
}
