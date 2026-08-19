import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronRight, FolderOpen } from 'lucide-react'
import { useProjects } from '../../hooks/useProjects'
import { MobileHeader } from '../../components/mobile/MobileHeader'

// Project picker reached from MobileMenu — then MobileZoneList →
// MobileAssemblyList → MobileProgressForm. Deliberately its own small query
// (not useActiveProject/ProjectContext, which assumes the desktop shell's
// navigation state) — this flow is a self-contained route tree with no
// AppShell/Sidebar.
export function MobileProjectList() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  // No state filter — matches desktop ProjectList's default (all states
  // shown unless the user explicitly picks one); a hardcoded 'active' filter
  // here was hiding every project sitting in Lead/Won/In Design etc.
  const { data, isLoading } = useProjects({ q: q.trim() || undefined, limit: 100 })
  const projects = data?.items ?? []

  return (
    <div className="min-h-screen bg-chrome-50 flex flex-col">
      <MobileHeader title="Projects" />
      <div className="p-3 flex flex-col gap-3 flex-1">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-chrome-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search project name or code..."
            className="w-full bg-white border border-chrome-200 rounded-lg pl-9 pr-3 py-3 text-[15px] focus:outline-none focus:border-ssi-600"
          />
        </div>

        {isLoading && <div className="text-center text-chrome-400 text-sm py-10">Loading…</div>}
        {!isLoading && projects.length === 0 && (
          <div className="text-center text-chrome-400 text-sm py-10">No projects found</div>
        )}

        <div className="flex flex-col gap-2">
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => navigate(`/m/projects/${p.project_code}/zones`)}
              className="flex items-center gap-3 bg-white border border-chrome-100 rounded-xl p-4 text-left active:bg-chrome-50"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-ssi-50 flex items-center justify-center">
                <FolderOpen size={18} className="text-ssi-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-chrome-900 text-[15px] truncate">{p.name}</div>
                <div className="text-xs text-chrome-400 font-mono">{p.project_code}</div>
              </div>
              <ChevronRight size={18} className="text-chrome-200 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
