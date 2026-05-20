import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FolderOpen, Package, GitBranch,
  Workflow, FileWarning, ShieldCheck, BarChart3,
  ChevronLeft, ChevronRight, Boxes, MapPin, Users,
} from 'lucide-react'

interface NavItem {
  label: string
  labelTh: string
  icon: React.ReactNode
  path: string
  badge?: number
}

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: '',
    items: [
      { label: 'Dashboard', labelTh: 'ภาพรวม', icon: <LayoutDashboard size={18} />, path: '/dashboard' },
    ],
  },
  {
    title: 'Project Management',
    items: [
      { label: 'Customers', labelTh: 'ลูกค้า', icon: <Users size={18} />, path: '/customers' },
      { label: 'Projects', labelTh: 'โปรเจกต์', icon: <FolderOpen size={18} />, path: '/projects' },
      { label: 'Zones', labelTh: 'โซน', icon: <MapPin size={18} />, path: '/zones' },
    ],
  },
  {
    title: 'Engineering',
    items: [
      { label: 'Materials', labelTh: 'วัสดุ', icon: <Boxes size={18} />, path: '/materials' },
      { label: 'Engineer Products', labelTh: 'ชิ้นงานวิศวกร', icon: <Package size={18} />, path: '/engineer-products' },
      { label: 'BOM', labelTh: 'BOM', icon: <GitBranch size={18} />, path: '/bom' },
      { label: 'Routings', labelTh: 'ผังการผลิต', icon: <Workflow size={18} />, path: '/routings' },
      { label: 'ECO', labelTh: 'ECO', icon: <FileWarning size={18} />, path: '/eco', badge: 3 },
    ],
  },
  {
    title: 'Production',
    items: [
      { label: 'QC', labelTh: 'ควบคุมคุณภาพ', icon: <ShieldCheck size={18} />, path: '/qc' },
      { label: 'Reports', labelTh: 'รายงาน', icon: <BarChart3 size={18} />, path: '/reports' },
    ],
  },
]

interface Props {
  mobileOpen: boolean
  onClose: () => void
}

export function Sidebar({ mobileOpen, onClose }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const handleNav = (path: string) => {
    navigate(path)
    onClose()
  }

  return (
    <>
      {/* Mobile scrim */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={onClose} />
      )}

      <aside
        className={[
          'fixed left-0 top-0 h-screen bg-white border-r border-chrome-100 z-40 flex flex-col transition-all duration-200',
          collapsed ? 'w-[60px]' : 'w-[240px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
        style={{ paddingTop: 56 }}
      >
        <nav className="flex-1 overflow-y-auto scroll-thin py-2">
          {SECTIONS.map((section, si) => (
            <div key={si} className="mb-1">
              {section.title && !collapsed && (
                <div className="px-5 pb-1 pt-4" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8E8E8E' }}>
                  {section.title}
                </div>
              )}
              {section.title && collapsed && <div style={{ height: 12 }} />}

              {section.items.map((item) => {
                const active = location.pathname.startsWith(item.path)
                return (
                  <div key={item.path} className="relative group px-2">
                    <button
                      onClick={() => handleNav(item.path)}
                      className={[
                        'w-full flex items-center rounded-md transition-colors',
                        collapsed ? 'justify-center' : 'gap-3',
                        active
                          ? 'text-ssi-600'
                          : 'text-chrome-600 hover:bg-chrome-50 hover:text-chrome-900',
                      ].join(' ')}
                      style={{
                        height: 40,
                        padding: collapsed ? 0 : '0 12px',
                        background: active ? '#FCEBEB' : undefined,
                        margin: '1px 0',
                      }}
                    >
                      <span className={active ? 'text-ssi-600' : 'text-chrome-400 group-hover:text-chrome-600'}>
                        {item.icon}
                      </span>
                      {!collapsed && (
                        <span className="flex-1 truncate text-left" style={{ fontSize: 13, fontWeight: active ? 600 : 500 }}>
                          {item.label}
                        </span>
                      )}
                      {!collapsed && item.badge && (
                        <span className="rounded-full" style={{ background: '#FAEEDA', color: '#854F0B', padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                          {item.badge}
                        </span>
                      )}
                      {collapsed && item.badge && (
                        <span className="absolute flex items-center justify-center rounded-full" style={{ top: 2, right: 4, minWidth: 14, height: 14, padding: '0 3px', background: '#FAEEDA', color: '#854F0B', fontSize: 9, fontWeight: 700, border: '1.5px solid white' }}>
                          {item.badge}
                        </span>
                      )}
                    </button>

                    {/* Tooltip when collapsed */}
                    {collapsed && (
                      <div className="absolute left-full top-1/2 -translate-y-1/2 translate-x-2.5 bg-chrome-900 text-white rounded-md whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all z-60"
                        style={{ fontSize: 12, padding: '5px 10px', marginLeft: 2 }}>
                        {item.label}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-chrome-100 p-2">
          <button
            onClick={() => setCollapsed(c => !c)}
            className={[
              'w-full flex items-center rounded-md hover:bg-chrome-50 text-chrome-400 hover:text-chrome-600 transition-colors',
              collapsed ? 'justify-center' : 'gap-2 px-3',
            ].join(' ')}
            style={{ height: 36, fontSize: 12, fontWeight: 500 }}
          >
            {collapsed ? <ChevronRight size={16} /> : (
              <>
                <ChevronLeft size={16} />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  )
}
