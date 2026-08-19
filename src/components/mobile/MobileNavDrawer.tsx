import { useNavigate } from 'react-router-dom'
import { ChevronRight, LogOut, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABELS } from '../../api/users'
import { SECTIONS, ADMIN_SECTION, visibleItems, type NavItem } from '../layout/Sidebar'

// Every feature that actually has a mobile-ready screen — desktop nav path
// -> mobile route. Anything in SECTIONS/ADMIN_SECTION NOT listed here (i.e.
// almost everything except progress entry, today) is collected into one
// dedicated "Not available on mobile" group instead of being interleaved
// with the working items or silently omitted.
const MOBILE_READY: Record<string, string> = {
  '/projects': '/m/projects',
}

// A child-menu item (Routings' sub-items) shown in the unavailable list
// gets its parent's label prefixed so it's still identifiable out of context.
interface FlatUnavailable { key: string; label: string; icon: React.ReactNode }

function ReadyRow({ item, onNavigate }: { item: NavItem; onNavigate: (path: string) => void }) {
  return (
    <button
      onClick={() => onNavigate(MOBILE_READY[item.path])}
      className="w-full flex items-center gap-3 bg-white border border-chrome-100 rounded-xl p-3.5 text-left active:bg-chrome-50"
    >
      <span className="flex-shrink-0 text-chrome-600">{item.icon}</span>
      <span className="flex-1 text-[14.5px] font-medium text-chrome-900">{item.label}</span>
      <ChevronRight size={17} className="text-chrome-200 flex-shrink-0" />
    </button>
  )
}

function UnavailableRow({ item }: { item: FlatUnavailable }) {
  return (
    <div className="w-full flex items-center gap-3 bg-chrome-50 border border-chrome-100 rounded-xl p-3.5 opacity-70">
      <span className="flex-shrink-0 text-chrome-400">{item.icon}</span>
      <span className="flex-1 text-[14px] font-medium text-chrome-400">{item.label}</span>
      <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-chrome-400 bg-white border border-chrome-200 rounded px-1.5 py-0.5">
        Unavailable
      </span>
    </div>
  )
}

// Same hamburger-drawer pattern as the desktop Sidebar (fixed left panel +
// dark backdrop, sliding in/out) — opened via the hamburger button in
// MobileHeader on any screen with no back action, closed by tapping the
// backdrop, the X, or navigating to a menu item. Rendered by
// MobileNavShell, which owns the open/close state.
export function MobileNavDrawer({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const rawSections = user?.role === 'admin' ? [...SECTIONS, ADMIN_SECTION] : SECTIONS
  const sections = rawSections
    .map(section => ({ ...section, items: visibleItems(section.items, user) }))
    .filter(section => section.items.length > 0)

  // Split every leaf item (flattening children) into ready-and-grouped vs.
  // unavailable-and-flat. A parent with at least one ready child stays as a
  // group showing only its ready children; a parent with none becomes a
  // single unavailable row for the parent itself.
  const readySections: { title: string; items: NavItem[] }[] = []
  const unavailable: FlatUnavailable[] = []

  for (const section of sections) {
    const readyItems: NavItem[] = []
    for (const item of section.items) {
      if (item.children?.length) {
        const readyChildren = item.children.filter(c => !c.disabled && MOBILE_READY[c.path])
        if (readyChildren.length) {
          readyItems.push({ ...item, children: readyChildren })
          for (const c of item.children) {
            if (!readyChildren.includes(c)) unavailable.push({ key: c.path, label: `${item.label} — ${c.label}`, icon: c.icon })
          }
        } else {
          unavailable.push({ key: item.path, label: item.label, icon: item.icon })
        }
        continue
      }
      if (!item.disabled && MOBILE_READY[item.path]) readyItems.push(item)
      else unavailable.push({ key: item.path, label: item.label, icon: item.icon })
    }
    if (readyItems.length) readySections.push({ title: section.title, items: readyItems })
  }

  const department = user ? (ROLE_LABELS[user.role] ?? user.role) : ''

  const go = (path: string) => { navigate(path); onClose() }

  return (
    <div className="h-full flex flex-col bg-chrome-50">
      <div className="relative bg-white border-b border-chrome-100 px-4 pt-4 pb-5">
        <button onClick={onClose} aria-label="Close menu" className="absolute top-3 right-3 p-1.5 rounded-full text-chrome-400 active:bg-chrome-50">
          <X size={20} />
        </button>
        <div className="flex flex-col items-start gap-3">
          <span
            className="flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center text-ssi-600"
            style={{ background: '#FCEBEB', fontSize: 22, fontWeight: 700 }}
          >
            {(user?.name ?? 'U').slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="text-chrome-900 font-bold truncate" style={{ fontSize: 19 }}>{user?.name}</div>
            {user?.job_title && (
              <div className="text-chrome-600 truncate mt-0.5" style={{ fontSize: 13 }}>{user.job_title}</div>
            )}
            <div className="text-chrome-400 mt-0.5 truncate" style={{ fontSize: 12.5 }}>{department}</div>
          </div>
        </div>
      </div>
      <div className="p-3 flex flex-col gap-5 flex-1 overflow-y-auto">
        {readySections.map(section => (
          <div key={section.title || 'root'}>
            {section.title && (
              <div className="text-[11px] font-bold uppercase tracking-wide text-chrome-400 mb-2 px-1">
                {section.title}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {section.items.map(item =>
                item.children?.length ? (
                  <div key={item.path} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-1 text-[13px] font-semibold text-chrome-600">
                      {item.icon} {item.label}
                    </div>
                    {item.children.map(child => <ReadyRow key={child.path} item={child} onNavigate={go} />)}
                  </div>
                ) : (
                  <ReadyRow key={item.path} item={item} onNavigate={go} />
                ),
              )}
            </div>
          </div>
        ))}

        {unavailable.length > 0 && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-chrome-400 mb-2 px-1">
              Not Available on Mobile
            </div>
            <div className="flex flex-col gap-2">
              {unavailable.map(item => <UnavailableRow key={item.key} item={item} />)}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={logout}
        className="flex items-center justify-center gap-2 py-4 text-sm font-medium text-chrome-400 border-t border-chrome-100 bg-white active:bg-chrome-50"
      >
        <LogOut size={15} /> Sign out
      </button>
    </div>
  )
}
