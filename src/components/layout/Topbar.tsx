import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Bell, ChevronDown, Check, User, Settings, Keyboard, LogOut, Menu } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

interface Props {
  onMobileMenuToggle: () => void
}

export function Topbar({ onMobileMenuToggle }: Props) {
  const [bellOpen, setBellOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-chrome-100 z-50 flex items-center px-5">
      {/* LEFT */}
      <div className="flex items-center" style={{ width: 240, minWidth: 240 }}>
        <button
          onClick={onMobileMenuToggle}
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-md hover:bg-chrome-50 text-chrome-600 mr-2"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2.5">
          <img src="/assets/logo/bdt-logo.png" alt="SSI Building Tech" width={28} height={28} className="shrink-0 object-contain" />
          <div className="hidden md:block leading-none">
            <div className="text-chrome-900" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em' }}>SSI BUILDING TECH</div>
            <div className="text-chrome-400 mt-0.5" style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em' }}>ENGINEER SYSTEMS</div>
          </div>
        </div>
      </div>

      {/* CENTER spacer */}
      <div className="flex-1" />

      {/* RIGHT */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <button className="hidden md:flex items-center gap-2 bg-chrome-50 border border-chrome-100 rounded-md hover:bg-chrome-100 transition-colors" style={{ padding: '6px 12px', width: 200 }}>
          <Search size={14} className="text-chrome-400" />
          <span className="text-chrome-400 flex-1 text-left" style={{ fontSize: 13 }}>Search...</span>
          <kbd className="bg-chrome-100 text-chrome-600 rounded-sm font-mono" style={{ padding: '1px 5px', fontSize: 11 }}>⌘K</kbd>
        </button>

        {/* Bell */}
        <div className="relative">
          <button
            onClick={() => { setBellOpen(o => !o); setUserOpen(false) }}
            className="relative flex items-center justify-center w-9 h-9 rounded-full text-chrome-600 hover:bg-chrome-50"
          >
            <Bell size={18} />
            <span className="absolute" style={{ top: 6, right: 6, width: 8, height: 8, background: '#C8202A', borderRadius: 999, border: '2px solid white' }} />
          </button>

          {bellOpen && (
            <div className="absolute right-0 mt-2 bg-white border border-chrome-100 shadow-dropdown rounded-xl overflow-hidden" style={{ top: '100%', width: 360 }}>
              <div className="flex items-center justify-between border-b border-chrome-100" style={{ padding: '12px 16px' }}>
                <span className="text-chrome-900" style={{ fontSize: 14, fontWeight: 500 }}>Notifications</span>
                <button className="text-ssi-600 hover:underline" style={{ fontSize: 12 }}>Mark all as read</button>
              </div>
              <div className="max-h-96 overflow-y-auto scroll-thin">
                <button className="w-full text-left flex items-start gap-3 border-b border-chrome-100" style={{ padding: '12px 16px', background: '#FAEEDA' }}>
                  <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#FAC77522' }}>
                    <Bell size={16} style={{ color: '#854F0B' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-chrome-900 truncate" style={{ fontSize: 13, fontWeight: 500 }}><span className="font-mono">PP-00099</span> In Review</div>
                    <div className="text-chrome-600" style={{ fontSize: 12 }}>somchai.k submitted 15 minutes ago</div>
                  </div>
                  <span className="shrink-0 mt-1.5 w-2 h-2 rounded-full" style={{ background: '#C8202A' }} />
                </button>
                <button className="w-full text-left flex items-start gap-3 border-b border-chrome-100 hover:bg-chrome-50" style={{ padding: '12px 16px' }}>
                  <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#EAF3DE' }}>
                    <Check size={16} style={{ color: '#639922' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-chrome-900 truncate" style={{ fontSize: 13, fontWeight: 500 }}><span className="font-mono">SA-00120</span> Approved</div>
                    <div className="text-chrome-600" style={{ fontSize: 12 }}>nuch.p approved 2 hours ago</div>
                  </div>
                </button>
              </div>
              <div className="border-t border-chrome-100 text-center" style={{ padding: 10 }}>
                <button className="text-chrome-600 hover:text-chrome-900" style={{ fontSize: 12 }}>View all</button>
              </div>
            </div>
          )}
        </div>

        {/* User */}
        <div className="relative">
          <button
            onClick={() => { setUserOpen(o => !o); setBellOpen(false) }}
            className="flex items-center gap-2 rounded-md hover:bg-chrome-50 transition-colors"
            style={{ padding: '4px 8px' }}
          >
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-ssi-600" style={{ background: '#FCEBEB', fontSize: 12, fontWeight: 500 }}>
              {(user?.name ?? 'U').slice(0, 2).toUpperCase()}
            </span>
            <span className="text-chrome-900 hidden md:block" style={{ fontSize: 13, fontWeight: 500 }}>{user?.name ?? ''}</span>
            <ChevronDown size={12} className="text-chrome-400 hidden md:block" />
          </button>

          {userOpen && (
            <div className="absolute right-0 mt-1 bg-white border border-chrome-100 shadow-dropdown rounded-lg overflow-hidden" style={{ top: '100%', width: 240, padding: 4 }}>
              <div className="border-b border-chrome-100" style={{ padding: '12px 16px', margin: '-4px -4px 4px' }}>
                <div className="text-chrome-900" style={{ fontSize: 13, fontWeight: 500 }}>{user?.name ?? 'Unknown'}</div>
                <div className="text-chrome-400" style={{ fontSize: 11 }}>{user?.login}</div>
                <span className="inline-block mt-2 rounded-full" style={{ background: '#E6F1FB', color: '#185FA5', padding: '1px 8px', fontSize: 11, fontWeight: 500 }}>{user?.role}</span>
              </div>
              <button className="w-full flex items-center gap-2.5 rounded-md hover:bg-chrome-50 text-left" style={{ padding: '8px 12px', fontSize: 13 }}>
                <User size={14} className="text-chrome-400" /><span className="text-chrome-900">Profile</span>
              </button>
              <button className="w-full flex items-center gap-2.5 rounded-md hover:bg-chrome-50 text-left" style={{ padding: '8px 12px', fontSize: 13 }}>
                <Settings size={14} className="text-chrome-400" /><span className="text-chrome-900">Settings</span>
              </button>
              <button className="w-full flex items-center justify-between gap-2.5 rounded-md hover:bg-chrome-50 text-left" style={{ padding: '8px 12px', fontSize: 13 }}>
                <span className="flex items-center gap-2.5">
                  <Keyboard size={14} className="text-chrome-400" />
                  <span className="text-chrome-900">Keyboard shortcuts</span>
                </span>
                <kbd className="bg-chrome-50 border border-chrome-100 rounded-sm font-mono" style={{ padding: '0 5px', fontSize: 11, color: '#555' }}>?</kbd>
              </button>
              <div className="h-px bg-chrome-100 my-1" />
              <button onClick={handleLogout} className="w-full flex items-center gap-2.5 rounded-md hover:bg-ssi-50 text-left" style={{ padding: '8px 12px', fontSize: 13 }}>
                <LogOut size={14} style={{ color: '#C8202A' }} />
                <span style={{ color: '#C8202A' }}>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
