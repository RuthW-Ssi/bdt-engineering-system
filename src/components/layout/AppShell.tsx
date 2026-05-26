import { useState, Component } from 'react'
import { Outlet } from 'react-router-dom'
import { Topbar } from './Topbar'
import { Sidebar } from './Sidebar'
import { AlertCircle } from 'lucide-react'

class PageErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-3" style={{ height: 'calc(100vh - 56px)', color: '#C8202A' }}>
          <AlertCircle size={32} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>An error occurred while rendering</div>
          <pre style={{ fontSize: 12, color: '#555', background: '#F5F5F5', padding: '8px 14px', borderRadius: 6, maxWidth: 600, overflow: 'auto' }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ padding: '6px 16px', fontSize: 12, background: '#F5F5F5', border: '1px solid #C2C2C2', borderRadius: 6, cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-chrome-50">
      <Topbar onMobileMenuToggle={() => setMobileOpen(o => !o)} />
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
      />
      <main
        className="transition-all duration-200"
        style={{ paddingTop: 56, paddingLeft: sidebarCollapsed ? 60 : 240 }}
      >
        <PageErrorBoundary>
          <Outlet />
        </PageErrorBoundary>
      </main>
    </div>
  )
}
