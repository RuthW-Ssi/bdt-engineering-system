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
          // h-dvh, not h-screen (100vh) — on real mobile browsers 100vh is
          // taller than the actually-visible viewport (doesn't account for
          // the address bar/toolbar), which pushed the Sign out button
          // below the fold. dvh tracks the real visible height.
          'fixed left-0 top-0 h-dvh w-[300px] max-w-[85vw] z-50 shadow-xl transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <MobileNavDrawer onClose={() => setOpen(false)} />
      </div>
      <Outlet context={context} />
    </>
  )
}
