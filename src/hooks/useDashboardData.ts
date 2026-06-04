// Synchronous hook — no React Query, no network calls.
// Data is in-memory mock; intentionally different from API hooks (no isLoading/isError).
import {
  MOCK_PROJECTS,
  MOCK_ZONES_BY_PROJECT,
  KPI_BY_SCOPE,
  ZONE_PROGRESS_BY_PROJECT,
  MOCK_DISPATCHES,
  MOCK_ACTIVITIES,
  MOCK_ALERTS,
  LIBRARY_DISTRIBUTION,
  ROUTING_USAGE,
  MATERIALS_SUMMARY,
  type MockProject,
  type MockZone,
  type KpiScope,
  type ZoneProgressEntry,
  type MockDispatch,
  type ActivityEntry,
  type AlertEntry,
  type LibrarySlice,
  type RoutingTemplateUsage,
  type MaterialSummary,
} from '../data/dashboardMock'

export interface DashboardData {
  project: MockProject
  zones: MockZone[]
  kpi: KpiScope
  zoneProgress: ZoneProgressEntry[]
  dispatches: MockDispatch[]
  activities: ActivityEntry[]
  alerts: AlertEntry[]
  libraryDistribution: LibrarySlice[]
  routingUsage: RoutingTemplateUsage[]
  materials: MaterialSummary
}

const DEFAULT_KPI: KpiScope = { products: 0, dispatches: 0, assemblies: 0, parts: 0, alerts: 0 }

export function useDashboardData({
  projectId,
  zoneId,
}: {
  projectId: number
  zoneId: number | null
}): DashboardData {
  const project = MOCK_PROJECTS.find((p) => p.id === projectId) ?? MOCK_PROJECTS[0]
  const zones = MOCK_ZONES_BY_PROJECT[projectId] ?? []
  const kpi = KPI_BY_SCOPE[`${projectId}:${zoneId ?? 'all'}`] ?? DEFAULT_KPI
  const zoneProgress = ZONE_PROGRESS_BY_PROJECT[projectId] ?? []

  const dispatches = MOCK_DISPATCHES.filter(
    (d) => d.project_id === projectId && (zoneId === null || d.zone_id === zoneId),
  )

  // Global activities (zone_id: null) always show; scoped activities filter by project + optional zone
  const activities = MOCK_ACTIVITIES.filter(
    (a) =>
      a.project_id === null ||
      (a.project_id === projectId && (zoneId === null || a.zone_id === null || a.zone_id === zoneId)),
  )

  const alerts = MOCK_ALERTS.filter(
    (a) =>
      a.project_id === null ||
      (a.project_id === projectId && (zoneId === null || a.zone_id === null || a.zone_id === zoneId)),
  )

  return {
    project,
    zones,
    kpi,
    zoneProgress,
    dispatches,
    activities,
    alerts,
    libraryDistribution: LIBRARY_DISTRIBUTION,
    routingUsage: ROUTING_USAGE,
    materials: MATERIALS_SUMMARY,
  }
}
