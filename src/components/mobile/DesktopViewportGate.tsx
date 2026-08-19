import { AppShell } from '../layout/AppShell'
import { useViewportGate, MOBILE_BREAKPOINT } from '../../hooks/useViewportGate'

// Wraps AppShell (the desktop Sidebar tree) — the mirror of
// MobileViewportGate. Shrinking the window below the breakpoint while inside
// the desktop app (devtools resize, a tablet rotated to portrait) sends the
// user into the mobile menu instead of leaving them stuck with a Sidebar
// that has no mobile drawer and simply clips off-screen.
export function DesktopViewportGate() {
  useViewportGate(width => width < MOBILE_BREAKPOINT, '/m/projects')
  return <AppShell />
}
