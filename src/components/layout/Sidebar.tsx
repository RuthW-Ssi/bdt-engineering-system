import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FolderOpen, Package, GitBranch,
  Workflow, FileWarning, ShieldCheck, BarChart3,
  ChevronLeft, ChevronRight, ChevronDown, Boxes, MapPin, Users, BookOpen, Puzzle, Activity, Cog,
  ClipboardList, Scissors, Cuboid, UserCog,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { canViewAny } from '../../lib/moduleAccess'

interface NavItem {
  label: string
  icon: React.ReactNode
  path: string
  badge?: number
  // Modules that gate this item's visibility (OR semantics) — omit only
  // for pages with no backend module at all (placeholders like ECO/QC).
  viewModules?: string[]
  children?: Omit<NavItem, 'children'>[]
  // Visible but non-interactive — for nav-only placeholders (not yet
  // developed) as opposed to viewModules, which hides the item entirely.
  disabled?: boolean
}

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: '',
    items: [
      { label: 'Dashboard', icon: <LayoutDashboard size={18} />, path: '/dashboard' },
    ],
  },
  {
    title: 'Project Management',
    items: [
      { label: 'Customers', icon: <Users size={18} />, path: '/customers', viewModules: ['customers'] },
      { label: 'Projects', icon: <FolderOpen size={18} />, path: '/projects', viewModules: ['projects'] },
      { label: 'Zones', icon: <MapPin size={18} />, path: '/zones', viewModules: ['project-zones', 'sub-zones'] },
    ],
  },
  {
    title: 'Engineering',
    items: [
      { label: 'Materials', icon: <Boxes size={18} />, path: '/materials', viewModules: ['materials'] },
      { label: 'Engineer Products', icon: <Package size={18} />, path: '/engineer-products', viewModules: ['products'] },
      { label: 'BOM', icon: <GitBranch size={18} />, path: '/bom', viewModules: ['boms'] },
      { label: 'BIM', icon: <Cuboid size={18} />, path: '/bim-viewer', viewModules: ['bim'] },
      {
        label: 'Routings', icon: <Workflow size={18} />, path: '/routings',
        children: [
          { label: 'Routing Template', icon: <Puzzle size={14} />, path: '/routings', viewModules: ['routings'] },
          { label: 'Operation Library', icon: <BookOpen size={14} />, path: '/operation-library', viewModules: ['routings'] },
          { label: 'Activity Library', icon: <Activity size={14} />, path: '/activity-library', viewModules: ['routings'] },
        ],
      },
    ],
  },
  {
    title: 'Supply Chain',
    items: [
      { label: 'Cutting Plan', icon: <Scissors size={18} />, path: '/cutting-plan', viewModules: ['cutting-plan'] },
    ],
  },
  {
    title: 'Production',
    items: [
      { label: 'Order', icon: <ClipboardList size={18} />, path: '/order', viewModules: ['orders'] },
      { label: 'Machine & Resources', icon: <Cog size={18} />, path: '/resources', viewModules: ['machines'] },
    ],
  },
  // Not-yet-developed features (still `<Placeholder>` routes) — grouped
  // separately at the very bottom rather than mixed into their eventual
  // future home (Engineering/Production), so the sidebar doesn't imply
  // they're live today.
  {
    title: 'Unavailable',
    items: [
      { label: 'ECO', icon: <FileWarning size={18} />, path: '/eco', disabled: true },
      { label: 'QC', icon: <ShieldCheck size={18} />, path: '/qc', disabled: true },
      { label: 'Reports', icon: <BarChart3 size={18} />, path: '/reports', disabled: true },
    ],
  },
]

const ADMIN_SECTION: { title: string; items: NavItem[] } = {
  title: 'Admin',
  items: [
    { label: 'Users', icon: <UserCog size={18} />, path: '/admin/users' },
  ],
}

interface Props {
  mobileOpen: boolean
  onClose: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}

function visibleItems(items: NavItem[], user: ReturnType<typeof useAuth>['user']): NavItem[] {
  return items
    .map(item => {
      if (!item.children?.length) return item
      const children = item.children.filter(c => !c.viewModules || canViewAny(user, c.viewModules))
      return { ...item, children }
    })
    .filter(item => {
      if (item.children) return item.children.length > 0
      return !item.viewModules || canViewAny(user, item.viewModules)
    })
}

export function Sidebar({ mobileOpen, onClose, collapsed, onToggleCollapse }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const rawSections = user?.role === 'admin' ? [...SECTIONS, ADMIN_SECTION] : SECTIONS
  const sections = rawSections
    .map(section => ({ ...section, items: visibleItems(section.items, user) }))
    .filter(section => section.items.length > 0)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const section of sections) {
      for (const item of section.items) {
        if (item.children?.some(c => location.pathname.startsWith(c.path))) {
          initial[item.path] = true
        }
      }
    }
    return initial
  })

  const handleNav = (path: string) => {
    navigate(path)
    onClose()
  }

  const toggleGroup = (path: string) =>
    setOpenGroups(g => ({ ...g, [path]: !g[path] }))

  const isChildActive = (item: NavItem) =>
    item.children?.some(c => location.pathname.startsWith(c.path)) ?? false

  return (
    <>
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
          {sections.map((section, si) => (
            <div key={si} className="mb-1">
              {section.title && !collapsed && (
                <div className="px-5 pb-1 pt-4" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8E8E8E' }}>
                  {section.title}
                </div>
              )}
              {section.title && collapsed && <div style={{ height: 12 }} />}

              {section.items.map((item) => {
                const hasChildren = !!item.children?.length
                const childActive = isChildActive(item)
                const parentActive = !hasChildren && location.pathname.startsWith(item.path)
                const active = parentActive || childActive
                const groupOpen = openGroups[item.path] ?? false

                return (
                  <div key={item.path}>
                    {/* Parent row */}
                    <div className="relative group px-2">
                      <button
                        onClick={() => {
                          if (item.disabled) return
                          if (hasChildren) toggleGroup(item.path)
                          else handleNav(item.path)
                        }}
                        disabled={item.disabled}
                        className={[
                          'w-full flex items-center rounded-md transition-colors',
                          collapsed ? 'justify-center' : 'gap-3',
                          item.disabled
                            ? 'text-chrome-200 cursor-not-allowed'
                            : active
                              ? 'text-ssi-600'
                              : 'text-chrome-600 hover:bg-chrome-50 hover:text-chrome-900',
                        ].join(' ')}
                        style={{
                          height: 40,
                          padding: collapsed ? 0 : '0 12px',
                          background: active && !item.disabled ? '#FCEBEB' : undefined,
                          margin: '1px 0',
                        }}
                      >
                        <span className={item.disabled ? 'text-chrome-200' : active ? 'text-ssi-600' : 'text-chrome-400 group-hover:text-chrome-600'}>
                          {item.icon}
                        </span>
                        {!collapsed && (
                          <>
                            <span className="flex-1 truncate text-left" style={{ fontSize: 13, fontWeight: active && !item.disabled ? 600 : 500 }}>
                              {item.label}
                            </span>
                            {item.disabled && (
                              <span className="rounded-full" style={{ background: '#F0F0F0', color: '#ABABAB', padding: '1px 7px', fontSize: 10, fontWeight: 700, letterSpacing: '0.03em' }}>
                                SOON
                              </span>
                            )}
                            {!item.disabled && item.badge && (
                              <span className="rounded-full" style={{ background: '#FAEEDA', color: '#854F0B', padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                                {item.badge}
                              </span>
                            )}
                            {hasChildren && (
                              <ChevronDown size={14} style={{
                                color: '#BDBDBD',
                                transform: groupOpen ? 'none' : 'rotate(-90deg)',
                                transition: 'transform 0.15s',
                                flexShrink: 0,
                              }} />
                            )}
                          </>
                        )}
                        {collapsed && !item.disabled && item.badge && (
                          <span className="absolute flex items-center justify-center rounded-full" style={{ top: 2, right: 4, minWidth: 14, height: 14, padding: '0 3px', background: '#FAEEDA', color: '#854F0B', fontSize: 9, fontWeight: 700, border: '1.5px solid white' }}>
                            {item.badge}
                          </span>
                        )}
                      </button>

                      {collapsed && (
                        <div className="absolute left-full top-1/2 -translate-y-1/2 translate-x-2.5 bg-chrome-900 text-white rounded-md whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all z-60"
                          style={{ fontSize: 12, padding: '5px 10px', marginLeft: 2 }}>
                          {item.label}
                        </div>
                      )}
                    </div>

                    {/* Children */}
                    {hasChildren && !collapsed && groupOpen && (
                      <div style={{ marginLeft: 16, marginBottom: 2 }}>
                        {item.children!.map(child => {
                          const childIsActive = location.pathname === child.path ||
                            (child.path !== '/routings' && location.pathname.startsWith(child.path))
                          return (
                            <div key={child.path} className="relative group px-2">
                              <button
                                onClick={() => handleNav(child.path)}
                                className={[
                                  'w-full flex items-center gap-2 rounded-md transition-colors',
                                  childIsActive
                                    ? 'text-ssi-600'
                                    : 'text-chrome-500 hover:bg-chrome-50 hover:text-chrome-900',
                                ].join(' ')}
                                style={{
                                  height: 34,
                                  padding: '0 10px',
                                  background: childIsActive ? '#FCEBEB' : undefined,
                                  margin: '1px 0',
                                }}
                              >
                                <span style={{ color: childIsActive ? undefined : '#BDBDBD' }}>
                                  {child.icon}
                                </span>
                                <span className="flex-1 truncate text-left" style={{ fontSize: 12, fontWeight: childIsActive ? 600 : 400 }}>
                                  {child.label}
                                </span>
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-chrome-100 p-2">
          <button
            onClick={onToggleCollapse}
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
