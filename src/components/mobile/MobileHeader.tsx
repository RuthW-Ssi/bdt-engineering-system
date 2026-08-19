import { useState } from 'react'
import { ChevronLeft, Menu, Bell } from 'lucide-react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { MobileOutletContext } from './MobileNavShell'
import { MobileNotificationSheet } from './MobileNotificationSheet'

interface Props {
  title: string
  subtitle?: string
  // Omit entirely for a root screen (shows the hamburger instead, opening
  // MobileNavShell's drawer) — pass a path or callback for a drill-down
  // screen that has a real "back" destination.
  onBack?: string | (() => void)
}

// Shared header for the /m/* mobile progress-entry flow — no Sidebar/AppShell
// here (those routes sit outside the desktop layout entirely), so every
// mobile page needs its own chrome. Back/hamburger button on the left, title
// centered, notification bell on the right — opens MobileNotificationSheet,
// a bottom-sheet mirror of the desktop Topbar's own (still-mock) dropdown.
// Menu access is root-only (via the hamburger) — not reachable from
// drill-down screens.
export function MobileHeader({ title, subtitle, onBack }: Props) {
  const navigate = useNavigate()
  const { openMenu } = useOutletContext<MobileOutletContext>()
  const [notifOpen, setNotifOpen] = useState(false)

  const handleBack = () => {
    if (typeof onBack === 'function') onBack()
    else if (typeof onBack === 'string') navigate(onBack)
    else navigate(-1)
  }

  return (
    <header className="sticky top-0 z-10 h-14 bg-white border-b border-chrome-100 flex items-center px-3 gap-2">
      <button
        onClick={onBack !== undefined ? handleBack : openMenu}
        aria-label={onBack !== undefined ? 'Back' : 'Open menu'}
        className="flex-shrink-0 -ml-1.5 flex items-center justify-center w-9 h-9 rounded-full text-chrome-600 active:bg-chrome-50"
      >
        {onBack !== undefined ? <ChevronLeft size={22} /> : <Menu size={20} />}
      </button>
      <div className="flex-1 min-w-0 text-center leading-none">
        <div className="text-chrome-900 truncate" style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
        {subtitle && (
          <div className="text-chrome-400 mt-1 truncate" style={{ fontSize: 11, fontWeight: 500 }}>
            {subtitle}
          </div>
        )}
      </div>
      <button
        onClick={() => setNotifOpen(true)}
        aria-label="Notifications"
        className="relative flex-shrink-0 -mr-1.5 flex items-center justify-center w-9 h-9 rounded-full text-chrome-600 active:bg-chrome-50"
      >
        <Bell size={19} />
        <span className="absolute" style={{ top: 7, right: 7, width: 7, height: 7, background: '#C8202A', borderRadius: 999, border: '2px solid white' }} />
      </button>
      <MobileNotificationSheet open={notifOpen} onClose={() => setNotifOpen(false)} />
    </header>
  )
}
