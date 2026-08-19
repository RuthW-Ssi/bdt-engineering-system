import { Outlet } from 'react-router-dom'
import { useViewportGate, MOBILE_BREAKPOINT } from '../../hooks/useViewportGate'

// Wraps the whole /m/* route tree. Login only decides mobile-vs-desktop
// once, at sign-in — this keeps it reactive afterward: widening the window
// (devtools resize, a tablet rotated to landscape) back past the breakpoint
// sends the user out to the desktop app instead of leaving them stuck in a
// phone-sized layout at a size it was never designed for.
export function MobileViewportGate() {
  useViewportGate(width => width >= MOBILE_BREAKPOINT, '/dashboard')
  return <Outlet />
}
