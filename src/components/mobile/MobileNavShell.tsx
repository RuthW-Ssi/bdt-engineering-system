import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { MobileNavDrawer } from './MobileNavDrawer'

export interface MobileOutletContext {
  openMenu: () => void
}

// Nested inside MobileViewportGate (which only handles the viewport-width
// redirect) — this owns the hamburger-drawer open/close state, mirroring
// Sidebar.tsx's own backdrop + sliding-panel mechanics exactly so the
// pattern feels identical to desktop, just triggered from MobileHeader's
// hamburger instead of Topbar's.
export function MobileNavShell() {
  const [open, setOpen] = useState(false)
  const context: MobileOutletContext = { openMenu: () => setOpen(true) }

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setOpen(false)} />}
      <div
        className={[
          'fixed left-0 top-0 h-screen w-[300px] max-w-[85vw] z-50 shadow-xl transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <MobileNavDrawer onClose={() => setOpen(false)} />
      </div>
      <Outlet context={context} />
    </>
  )
}
