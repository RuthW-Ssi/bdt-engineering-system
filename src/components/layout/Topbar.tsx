import { useState } from 'react'
import { Search, Bell, ChevronDown, FolderOpen, Check, Plus, User, Settings, Keyboard, LogOut, Menu } from 'lucide-react'

interface Props {
  onMobileMenuToggle: () => void
}

export function Topbar({ onMobileMenuToggle }: Props) {
  const [projectOpen, setProjectOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)

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
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <ellipse cx="14" cy="14" rx="11" ry="6" stroke="#C8202A" strokeWidth="2.5" fill="none" transform="rotate(-15 14 14)" />
            <ellipse cx="14" cy="14" rx="7" ry="3.5" stroke="#8E8E8E" strokeWidth="2" fill="none" transform="rotate(15 14 14)" />
          </svg>
          <div className="hidden md:block leading-none">
            <div className="text-chrome-900" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em' }}>SSI BUILDING TECH</div>
            <div className="text-chrome-400 mt-0.5" style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em' }}>ENGINEER MGMT</div>
          </div>
        </div>
      </div>

      {/* CENTER — project selector */}
      <div className="flex-1 hidden md:flex items-center pl-4">
        <div className="relative">
          <button
            onClick={() => { setProjectOpen(o => !o); setBellOpen(false); setUserOpen(false) }}
            className="flex items-center gap-2 bg-chrome-50 border border-chrome-100 rounded-md hover:bg-chrome-100 hover:border-chrome-200 transition-colors"
            style={{ padding: '6px 12px', maxWidth: 320 }}
          >
            <FolderOpen size={16} className="text-chrome-400 shrink-0" />
            <span className="font-mono text-chrome-900" style={{ fontSize: 13, fontWeight: 500 }}>0X123</span>
            <span className="text-chrome-400">·</span>
            <span className="text-chrome-600 truncate" style={{ fontSize: 13 }}>อาคารโรงงาน A3 — บริษัท ไทยสตีล จำกัด</span>
            <ChevronDown size={14} className="text-chrome-400 shrink-0" />
          </button>

          {projectOpen && (
            <div className="absolute left-0 mt-1 bg-white border border-chrome-100 shadow-dropdown rounded-lg overflow-hidden" style={{ top: '100%', minWidth: 340, padding: 4 }}>
              <button className="w-full flex items-start gap-2.5 text-left rounded-md" style={{ padding: '10px 12px', background: '#FCEBEB' }}>
                <Check size={16} className="mt-0.5 shrink-0" style={{ color: '#C8202A' }} />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-chrome-900" style={{ fontSize: 13, fontWeight: 500 }}>0X123</div>
                  <div className="text-chrome-600 truncate" style={{ fontSize: 12 }}>อาคารโรงงาน A3 — บริษัท ไทยสตีล จำกัด</div>
                </div>
              </button>
              <div className="h-px bg-chrome-100 mx-2 my-1" />
              <button className="w-full flex items-start gap-2.5 text-left rounded-md hover:bg-chrome-50" style={{ padding: '10px 12px' }}>
                <span className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-chrome-900" style={{ fontSize: 13, fontWeight: 500 }}>0X124</div>
                  <div className="text-chrome-600 truncate" style={{ fontSize: 12 }}>โกดังเก็บสินค้า Zone B — ลอจิสติกส์ไทย</div>
                </div>
              </button>
              <div className="h-px bg-chrome-100 mx-2 my-1" />
              <button className="w-full flex items-center gap-2 rounded-md hover:bg-chrome-50 text-chrome-600" style={{ padding: '8px 12px', fontSize: 13 }}>
                <Plus size={14} />ดู project ทั้งหมด
              </button>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <button className="hidden md:flex items-center gap-2 bg-chrome-50 border border-chrome-100 rounded-md hover:bg-chrome-100 transition-colors" style={{ padding: '6px 12px', width: 200 }}>
          <Search size={14} className="text-chrome-400" />
          <span className="text-chrome-400 flex-1 text-left" style={{ fontSize: 13 }}>ค้นหา...</span>
          <kbd className="bg-chrome-100 text-chrome-600 rounded-sm font-mono" style={{ padding: '1px 5px', fontSize: 11 }}>⌘K</kbd>
        </button>

        {/* Bell */}
        <div className="relative">
          <button
            onClick={() => { setBellOpen(o => !o); setProjectOpen(false); setUserOpen(false) }}
            className="relative flex items-center justify-center w-9 h-9 rounded-full text-chrome-600 hover:bg-chrome-50"
          >
            <Bell size={18} />
            <span className="absolute" style={{ top: 6, right: 6, width: 8, height: 8, background: '#C8202A', borderRadius: 999, border: '2px solid white' }} />
          </button>

          {bellOpen && (
            <div className="absolute right-0 mt-2 bg-white border border-chrome-100 shadow-dropdown rounded-xl overflow-hidden" style={{ top: '100%', width: 360 }}>
              <div className="flex items-center justify-between border-b border-chrome-100" style={{ padding: '12px 16px' }}>
                <span className="text-chrome-900" style={{ fontSize: 14, fontWeight: 500 }}>การแจ้งเตือน</span>
                <button className="text-ssi-600 hover:underline" style={{ fontSize: 12 }}>ทำเครื่องหมายว่าอ่านแล้วทั้งหมด</button>
              </div>
              <div className="max-h-96 overflow-y-auto scroll-thin">
                <button className="w-full text-left flex items-start gap-3 border-b border-chrome-100" style={{ padding: '12px 16px', background: '#FAEEDA' }}>
                  <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#FAC77522' }}>
                    <Bell size={16} style={{ color: '#854F0B' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-chrome-900 truncate" style={{ fontSize: 13, fontWeight: 500 }}><span className="font-mono">PP-00099</span> รอตรวจสอบ</div>
                    <div className="text-chrome-600" style={{ fontSize: 12 }}>somchai.k ส่งเมื่อ 15 นาทีที่แล้ว</div>
                  </div>
                  <span className="shrink-0 mt-1.5 w-2 h-2 rounded-full" style={{ background: '#C8202A' }} />
                </button>
                <button className="w-full text-left flex items-start gap-3 border-b border-chrome-100 hover:bg-chrome-50" style={{ padding: '12px 16px' }}>
                  <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#EAF3DE' }}>
                    <Check size={16} style={{ color: '#639922' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-chrome-900 truncate" style={{ fontSize: 13, fontWeight: 500 }}><span className="font-mono">SA-00120</span> อนุมัติแล้ว</div>
                    <div className="text-chrome-600" style={{ fontSize: 12 }}>nuch.p อนุมัติเมื่อ 2 ชั่วโมงที่แล้ว</div>
                  </div>
                </button>
              </div>
              <div className="border-t border-chrome-100 text-center" style={{ padding: 10 }}>
                <button className="text-chrome-600 hover:text-chrome-900" style={{ fontSize: 12 }}>ดูทั้งหมด</button>
              </div>
            </div>
          )}
        </div>

        {/* User */}
        <div className="relative">
          <button
            onClick={() => { setUserOpen(o => !o); setProjectOpen(false); setBellOpen(false) }}
            className="flex items-center gap-2 rounded-md hover:bg-chrome-50 transition-colors"
            style={{ padding: '4px 8px' }}
          >
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-ssi-600" style={{ background: '#FCEBEB', fontSize: 12, fontWeight: 500 }}>SK</span>
            <span className="text-chrome-900 hidden md:block" style={{ fontSize: 13, fontWeight: 500 }}>Somchai K.</span>
            <ChevronDown size={12} className="text-chrome-400 hidden md:block" />
          </button>

          {userOpen && (
            <div className="absolute right-0 mt-1 bg-white border border-chrome-100 shadow-dropdown rounded-lg overflow-hidden" style={{ top: '100%', width: 240, padding: 4 }}>
              <div className="border-b border-chrome-100" style={{ padding: '12px 16px', margin: '-4px -4px 4px' }}>
                <div className="text-chrome-900" style={{ fontSize: 13, fontWeight: 500 }}>Somchai Khajonrat</div>
                <div className="text-chrome-400" style={{ fontSize: 11 }}>somchai.k@ssi-steel.com</div>
                <span className="inline-block mt-2 rounded-full" style={{ background: '#E6F1FB', color: '#185FA5', padding: '1px 8px', fontSize: 11, fontWeight: 500 }}>engineer</span>
              </div>
              <button className="w-full flex items-center gap-2.5 rounded-md hover:bg-chrome-50 text-left" style={{ padding: '8px 12px', fontSize: 13 }}>
                <User size={14} className="text-chrome-400" /><span className="text-chrome-900">โปรไฟล์</span>
              </button>
              <button className="w-full flex items-center gap-2.5 rounded-md hover:bg-chrome-50 text-left" style={{ padding: '8px 12px', fontSize: 13 }}>
                <Settings size={14} className="text-chrome-400" /><span className="text-chrome-900">ตั้งค่า</span>
              </button>
              <button className="w-full flex items-center justify-between gap-2.5 rounded-md hover:bg-chrome-50 text-left" style={{ padding: '8px 12px', fontSize: 13 }}>
                <span className="flex items-center gap-2.5">
                  <Keyboard size={14} className="text-chrome-400" />
                  <span className="text-chrome-900">Keyboard shortcuts</span>
                </span>
                <kbd className="bg-chrome-50 border border-chrome-100 rounded-sm font-mono" style={{ padding: '0 5px', fontSize: 11, color: '#555' }}>?</kbd>
              </button>
              <div className="h-px bg-chrome-100 my-1" />
              <button className="w-full flex items-center gap-2.5 rounded-md hover:bg-ssi-50 text-left" style={{ padding: '8px 12px', fontSize: 13 }}>
                <LogOut size={14} style={{ color: '#C8202A' }} />
                <span style={{ color: '#C8202A' }}>ออกจากระบบ</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
