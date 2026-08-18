import { ChevronLeft, Menu } from 'lucide-react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import type { MobileOutletContext } from './MobileNavShell'

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
// mobile page needs its own chrome. Styled to match Topbar.tsx (the desktop
// app bar) exactly — same h-14/white/border-chrome-100 bar, same logo, same
// avatar badge colors — so the mobile flow reads as the same app, not a
// bolted-on separate tool.
export function MobileHeader({ title, subtitle, onBack }: Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { openMenu } = useOutletContext<MobileOutletContext>()

  const handleBack = () => {
    if (typeof onBack === 'function') onBack()
    else if (typeof onBack === 'string') navigate(onBack)
    else navigate(-1)
  }

  return (
    <header className="sticky top-0 z-10 h-14 bg-white border-b border-chrome-100 flex items-center px-3 gap-2.5">
      <button
        onClick={onBack !== undefined ? handleBack : openMenu}
        aria-label={onBack !== undefined ? 'Back' : 'Open menu'}
        className="flex-shrink-0 -ml-1 flex items-center justify-center w-9 h-9 rounded-full text-chrome-600 active:bg-chrome-50"
      >
        {onBack !== undefined ? <ChevronLeft size={22} /> : <Menu size={20} />}
      </button>
      <img src="/assets/logo/powerkeychain-logo.png" alt="" width={24} height={24} className="flex-shrink-0 object-contain" />
      <div className="min-w-0 flex-1 leading-none">
        <div className="text-chrome-900 truncate" style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        <div className="text-chrome-400 mt-1 truncate" style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.06em' }}>
          {subtitle ?? 'SSI BUILDING TECH'}
        </div>
      </div>
      {user && (
        <span
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-ssi-600"
          style={{ background: '#FCEBEB', fontSize: 12, fontWeight: 500 }}
        >
          {user.name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </header>
  )
}
