import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// Single source of truth for the mobile/desktop cutoff — also used by
// LoginPage's one-time decision at sign-in.
export const MOBILE_BREAKPOINT = 768

// Shared by MobileViewportGate and DesktopViewportGate — same breakpoint
// LoginPage uses to decide mobile-vs-desktop at sign-in, kept reactive
// afterward in both directions (devtools resize, a tablet rotating).
// Checked once on mount too, so a direct/typed URL at the "wrong" width
// bounces the same way a resize would.
export function useViewportGate(shouldRedirect: (width: number) => boolean, target: string) {
  const navigate = useNavigate()
  useEffect(() => {
    const check = () => {
      if (shouldRedirect(window.innerWidth)) navigate(target, { replace: true })
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [navigate])
}
