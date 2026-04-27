import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Topbar } from './Topbar'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-chrome-50">
      <Topbar onMobileMenuToggle={() => setMobileOpen(o => !o)} />
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main
        className="transition-all duration-200"
        style={{ paddingTop: 56, paddingLeft: 240 }}
      >
        <Outlet />
      </main>
    </div>
  )
}
