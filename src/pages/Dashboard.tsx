import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useActiveProject } from '../context/ProjectContext'
import { useDashboardData } from '../hooks/useDashboardData'
import { MOCK_PROJECTS, MOCK_ZONES_BY_PROJECT } from '../data/dashboardMock'
import type { ProjectDTO } from '../api/types'
import { FilterBar } from '../components/dashboard/FilterBar'
import { KPIStrip } from '../components/dashboard/KPIStrip'
import { ZoneProgress } from '../components/dashboard/ZoneProgress'
import { DispatchesWidget } from '../components/dashboard/DispatchesWidget'
import { AlertsWidget } from '../components/dashboard/AlertsWidget'
import { LibraryDonut } from '../components/dashboard/LibraryDonut'
import { RoutingUsage } from '../components/dashboard/RoutingUsage'
import { MaterialsWidget } from '../components/dashboard/MaterialsWidget'
import { ActivityFeed } from '../components/dashboard/ActivityFeed'
import { QuickActions } from '../components/dashboard/QuickActions'

const LS_PROJECT = 'dashboard_project_id'
const LS_ZONE = 'dashboard_zone_id'

export function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { setActiveProject } = useActiveProject()

  // ── Resolve initial project ID ─────────────────────────────────────────────
  function resolveInitialProjectId(): number {
    const urlCode = searchParams.get('project')
    if (urlCode) {
      const found = MOCK_PROJECTS.find((p) => p.project_code === urlCode)
      if (found) return found.id
    }
    const lsId = Number(localStorage.getItem(LS_PROJECT))
    if (lsId && MOCK_PROJECTS.find((p) => p.id === lsId)) return lsId
    return MOCK_PROJECTS[0].id
  }

  function resolveInitialZoneId(projectId: number): number | null {
    const urlCode = searchParams.get('zone')
    const zones = MOCK_ZONES_BY_PROJECT[projectId] ?? []
    if (urlCode) {
      const found = zones.find((z) => z.code === urlCode)
      if (found) return found.id
    }
    const lsId = Number(localStorage.getItem(`${LS_ZONE}_${projectId}`))
    if (lsId && zones.find((z) => z.id === lsId)) return lsId
    return null
  }

  const [activeProjectId, setActiveProjectId] = useState<number>(resolveInitialProjectId)
  const [activeZoneId, setActiveZoneId] = useState<number | null>(() => resolveInitialZoneId(resolveInitialProjectId()))

  // Sync mock project into shared ProjectContext (cast to ProjectDTO shape)
  useEffect(() => {
    const mock = MOCK_PROJECTS.find((p) => p.id === activeProjectId)
    if (mock) setActiveProject(mock as unknown as ProjectDTO)
  }, [activeProjectId, setActiveProject])

  const data = useDashboardData({ projectId: activeProjectId, zoneId: activeZoneId })

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleProjectChange(projectId: number) {
    const p = MOCK_PROJECTS.find((x) => x.id === projectId)!
    setActiveProjectId(projectId)
    setActiveZoneId(null)
    setActiveProject(p as unknown as ProjectDTO)
    setSearchParams({ project: p.project_code })
    localStorage.setItem(LS_PROJECT, String(projectId))
    localStorage.removeItem(`${LS_ZONE}_${projectId}`)
  }

  function handleZoneChange(zoneId: number | null) {
    setActiveZoneId(zoneId)
    const p = MOCK_PROJECTS.find((x) => x.id === activeProjectId)!
    const z = zoneId ? (MOCK_ZONES_BY_PROJECT[activeProjectId] ?? []).find((z) => z.id === zoneId) : null
    setSearchParams({ project: p.project_code, ...(z ? { zone: z.code } : {}) })
    if (zoneId) localStorage.setItem(`${LS_ZONE}_${activeProjectId}`, String(zoneId))
    else localStorage.removeItem(`${LS_ZONE}_${activeProjectId}`)
  }

  function handleZoneProgressClick(zoneId: number) {
    handleZoneChange(activeZoneId === zoneId ? null : zoneId)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-lg font-bold text-chrome-900">Dashboard</h1>
        <p className="text-xs text-chrome-400 mt-0.5">{data.project.name}</p>
      </div>

      <FilterBar
        projects={MOCK_PROJECTS}
        activeProjectId={activeProjectId}
        zones={data.zones}
        activeZoneId={activeZoneId}
        onProjectChange={handleProjectChange}
        onZoneChange={handleZoneChange}
      />

      <KPIStrip kpi={data.kpi} />

      <div className="grid grid-cols-12 gap-5">
        {/* Row 1: Zone progress + Alerts */}
        <div className="col-span-8">
          <ZoneProgress
            zones={data.zoneProgress}
            activeZoneId={activeZoneId}
            onZoneClick={handleZoneProgressClick}
          />
        </div>
        <div className="col-span-4">
          <AlertsWidget alerts={data.alerts} />
        </div>

        {/* Row 2: Dispatches full-width */}
        <div className="col-span-12">
          <DispatchesWidget dispatches={data.dispatches} />
        </div>

        {/* Row 3: Charts */}
        <div className="col-span-6">
          <LibraryDonut data={data.libraryDistribution} />
        </div>
        <div className="col-span-6">
          <RoutingUsage data={data.routingUsage} />
        </div>

        {/* Row 4: Materials + Activity */}
        <div className="col-span-5">
          <MaterialsWidget materials={data.materials} />
        </div>
        <div className="col-span-7">
          <ActivityFeed activities={data.activities} />
        </div>

        {/* Row 5: Quick actions */}
        <div className="col-span-12">
          <QuickActions />
        </div>
      </div>
    </div>
  )
}
