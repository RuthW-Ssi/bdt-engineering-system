import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Cuboid as CuboidIcon, Loader2 } from 'lucide-react'
import { BimViewport } from '../components/bim/BimViewport'
import type { BimFocusRequest, BimSelection } from '../components/bim/BimViewport'
import { ProgressAssemblyTable } from '../components/progress/ProgressAssemblyTable'
import { WoStatusPanel } from '../components/progress/WoStatusPanel'
import { STATUS_META, STATUS_ORDER } from '../components/progress/statusMeta'
import { useProject } from '../hooks/useProjects'
import {
  useProgressBimMatch, useProgressOverview, useProgressZoneRows, useUpdateAssemblyProgress,
} from '../hooks/useProjectProgress'
import { useBimViewerToken } from '../hooks/useBim'
import type { ProjectZoneDTO } from '../api/types'
import type { ProgressStatus, UpdateAssemblyProgressPayload } from '../api/projectProgress'
import type { ProjectDTO } from '../api/types'

type ProjectDetail = ProjectDTO & { zones?: ProjectZoneDTO[] }

export function ProjectProgress() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()

  const { data: project, isLoading: projectLoading } = useProject(code)
  const zones: ProjectZoneDTO[] = useMemo(() => (project as ProjectDetail | undefined)?.zones ?? [], [project])

  // Selected tab lives in the URL (?zone=<id>), not just component state —
  // otherwise a refresh silently bounces back to Overview (which by design
  // has no per-assembly list, only the zone rollup), reading as "the
  // assembly list disappeared" even though nothing actually broke. Matches
  // this app's established project/zone-scoping convention (searchParams,
  // e.g. useProjectSelection) rather than losing selection on reload.
  const [searchParams, setSearchParams] = useSearchParams()
  const zoneParam = searchParams.get('zone')
  const tab: 'overview' | number = zoneParam ? Number(zoneParam) : 'overview'
  const activeZoneId = tab === 'overview' ? null : tab

  // If the URL names a zone that doesn't belong to this project (stale
  // link, typo'd id), fall back to Overview instead of silently showing an
  // empty table with no explanation.
  useEffect(() => {
    if (zoneParam && zones.length && !zones.some(z => z.id === Number(zoneParam))) {
      setSearchParams(p => { p.delete('zone'); return p }, { replace: true })
    }
  }, [zoneParam, zones, setSearchParams])

  const { data: overview } = useProgressOverview(code)
  const { data: zoneRows } = useProgressZoneRows(code, activeZoneId)
  const { data: bimMatch } = useProgressBimMatch(code, activeZoneId)
  const updateMutation = useUpdateAssemblyProgress(code)

  // bim-match already resolved the latest complete model server-side — its
  // model_id is the single source of truth for which model the viewer loads.
  const { data: viewerToken } = useBimViewerToken(bimMatch?.model_id ?? null)

  const [activeStatus, setActiveStatus] = useState<ProgressStatus | null>(null)
  const [focusRequest, setFocusRequest] = useState<BimFocusRequest | null>(null)
  const [selectedAssemblyId, setSelectedAssemblyId] = useState<number | null>(null)

  const matchByAssembly = useMemo(
    () => new Map((bimMatch?.matches ?? []).map(m => [m.assembly_id, m])),
    [bimMatch],
  )
  const assemblyByGlobalId = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of bimMatch?.matches ?? []) for (const g of m.global_ids) map.set(g, m.assembly_id)
    return map
  }, [bimMatch])

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(STATUS_ORDER.map(s => [s, 0])) as Record<ProgressStatus, number>
    for (const r of zoneRows ?? []) counts[r.status]++
    return counts
  }, [zoneRows])

  const handleUpdate = (assemblyId: number, payload: UpdateAssemblyProgressPayload) =>
    updateMutation.mutate({ assemblyId, payload })

  const handleStatusIsolate = (status: ProgressStatus) => {
    if (activeStatus === status) {
      setActiveStatus(null)
      setFocusRequest({ globalIds: [] }) // empty set = reset/show-all (BimViewport)
      return
    }
    setActiveStatus(status)
    const globalIds = (zoneRows ?? [])
      .filter(r => r.status === status)
      .flatMap(r => matchByAssembly.get(r.assembly_id)?.global_ids ?? [])
    setFocusRequest({ globalIds, hideRest: true })
  }

  const handleClear = () => {
    setActiveStatus(null)
    setFocusRequest({ globalIds: [] })
  }

  const handleViewIn3D = (assemblyId: number) => {
    setSelectedAssemblyId(assemblyId)
    const match = matchByAssembly.get(assemblyId)
    if (match) setFocusRequest({ globalIds: match.global_ids, hideRest: false })
  }

  const handleViewerSelect = (selection: BimSelection | null) => {
    if (!selection) return
    const assemblyId = assemblyByGlobalId.get(selection.globalId)
    if (assemblyId != null) setSelectedAssemblyId(assemblyId)
  }

  const selectedMark = zoneRows?.find(r => r.assembly_id === selectedAssemblyId)?.mark ?? null
  const switchTab = (next: 'overview' | number) => {
    setSearchParams(p => {
      if (next === 'overview') p.delete('zone')
      else p.set('zone', String(next))
      return p
    })
    setActiveStatus(null)
    setFocusRequest(null)
    setSelectedAssemblyId(null)
  }

  if (projectLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <Loader2 size={20} className="animate-spin" style={{ color: '#C2C2C2' }} />
      </div>
    )
  }
  if (!project) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#8E8E8E', fontSize: 14 }}>
        Project {code} not found
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* ── Header — matches BimViewer's page-chrome convention exactly ── */}
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/projects')}
            title="Back to projects"
            className="flex items-center justify-center rounded hover:bg-chrome-50"
            style={{ width: 32, height: 32, color: '#8E8E8E' }}
          >
            <ArrowLeft size={16} />
          </button>
          <span style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 13, fontWeight: 700, color: '#C8202A' }}>{project.project_code}</span>
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>{project.name}</span>
          <span style={{ fontSize: 13, color: '#8E8E8E' }}>— Progress</span>
        </div>
        {overview && (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, background: '#F5F5F5', borderRadius: 999, padding: '5px 14px', fontSize: 12, color: '#8E8E8E' }}>
            Project total <b style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 13.5, color: '#C8202A' }}>{overview.total.pct.toFixed(1)}%</b>
          </span>
        )}
      </div>

      {/* ── Tab bar — same treatment as the filter bar elsewhere (BimViewer/BomList) ── */}
      <div className="flex items-center px-4" style={{ height: 44, background: '#F5F5F5', borderTop: '1px solid #E8E8E8', borderBottom: '1px solid #E8E8E8', flexShrink: 0, gap: 2 }}>
        <TabButton label="Overview" active={tab === 'overview'} onClick={() => switchTab('overview')} />
        {zones.map(z => {
          const rollup = overview?.zones.find(o => o.zone_id === z.id)
          return (
            <TabButton
              key={z.id}
              label={z.label}
              sub={rollup ? `${(rollup.total_weight_kg / 1000).toFixed(1)}t` : undefined}
              active={tab === z.id}
              onClick={() => switchTab(z.id)}
            />
          )
        })}
      </div>

      {/* ── Body ── */}
      {tab === 'overview' ? (
        <OverviewTab overview={overview} onOpenZone={switchTab} />
      ) : (
        <div className="flex flex-col flex-1" style={{ padding: '20px 28px', overflowY: 'auto', minHeight: 0, gap: 16 }}>
          {/* 3D viewport + isolate strip — wrapper mirrors BimViewer's
              `borderRadius:12; overflow:hidden` exactly, no fixed height or
              background override, so BimViewport's own dark frame (not a
              page-chrome gray) is what shows around the model, same as
              BimViewer itself. */}
          <div style={{ borderRadius: 12, overflow: 'hidden', flex: '0 0 340px' }}>
            {bimMatch && bimMatch.model_id == null ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#F0F0F0', border: '0.5px solid #E0E0E0', color: '#ABABAB', gap: 8 }}>
                <CuboidIcon size={28} />
                <span style={{ fontSize: 13 }}>No completed BIM model for this project yet — the table below still works</span>
              </div>
            ) : viewerToken ? (
              <BimViewport
                urn={viewerToken.urn}
                accessToken={viewerToken.access_token}
                onSelect={handleViewerSelect}
                focusRequest={focusRequest}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#F0F0F0', border: '0.5px solid #E0E0E0', color: '#ABABAB' }}>
                <Loader2 size={20} className="animate-spin" />
              </div>
            )}
          </div>

          {/* Isolate strip — same white-card convention as every other panel */}
          <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', flexWrap: 'wrap', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: '#ABABAB', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginRight: 4 }}>Isolate</span>
            {STATUS_ORDER.map(s => {
              const meta = STATUS_META[s]
              const active = activeStatus === s
              return (
                <button
                  key={s}
                  onClick={() => handleStatusIsolate(s)}
                  aria-pressed={active}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    font: 'inherit', fontSize: 12, fontWeight: 600, padding: '6px 12px',
                    borderRadius: 999, cursor: 'pointer',
                    border: `1px solid ${active ? meta.color : '#E0E0E0'}`,
                    background: active ? meta.color : 'white',
                    color: active ? 'white' : '#1A1A1A',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? 'white' : meta.color, flexShrink: 0 }} />
                  {meta.label}
                  <span style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 10.5, opacity: 0.75 }}>{statusCounts[s]}</span>
                </button>
              )
            })}
            <button
              onClick={handleClear}
              style={{ marginLeft: 'auto', font: 'inherit', fontSize: 12, fontWeight: 600, color: '#8E8E8E', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Clear
            </button>
          </div>

          {/* Table + WO panel */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, flex: '1 0 420px', minHeight: 420 }}>
            <ProgressAssemblyTable
              rows={zoneRows ?? []}
              matchedAssemblyIds={new Set(matchByAssembly.keys())}
              selectedAssemblyId={selectedAssemblyId}
              activeStatus={activeStatus}
              onSelectRow={setSelectedAssemblyId}
              onViewIn3D={handleViewIn3D}
              onUpdate={handleUpdate}
              saving={updateMutation.isPending}
            />
            <WoStatusPanel projectId={project.id} zoneId={tab as number} assemblyMark={selectedMark} />
          </div>
        </div>
      )}
    </div>
  )
}

// Matches BomList's content-tab convention (fontSize 12, padding 9px 16px)
// rather than a bespoke one — same visual language app-wide.
function TabButton({ label, sub, active, onClick }: { label: string; sub?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-selected={active}
      style={{
        font: 'inherit', fontSize: 12, fontWeight: active ? 600 : 400,
        color: active ? '#C8202A' : '#555',
        background: 'none', border: 'none',
        padding: '9px 16px', cursor: 'pointer',
        borderBottom: `2px solid ${active ? '#C8202A' : 'transparent'}`,
        marginBottom: -1, whiteSpace: 'nowrap',
      }}
    >
      {label}
      {sub && <span style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 10.5, color: '#ABABAB', marginLeft: 5 }}>{sub}</span>}
    </button>
  )
}

function OverviewTab({
  overview, onOpenZone,
}: {
  overview: ReturnType<typeof useProgressOverview>['data']
  onOpenZone: (zoneId: number) => void
}) {
  if (!overview) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <Loader2 size={18} className="animate-spin" style={{ color: '#C2C2C2' }} />
      </div>
    )
  }
  const thStyle: React.CSSProperties = {
    textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.04em', color: '#ABABAB', padding: '9px 12px', borderBottom: '1px solid #E0E0E0', whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid #EDEFF2' }
  const mono: React.CSSProperties = { fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
      <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 12, overflow: 'hidden', maxWidth: 900 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={thStyle}>Zone</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Weight</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Assemblies</th>
                <th style={thStyle}>Progress</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Not start</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>In progress</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Done</th>
              </tr>
            </thead>
            <tbody>
              {overview.zones.map(z => (
                <tr key={z.zone_id} onClick={() => onOpenZone(z.zone_id)} style={{ cursor: 'pointer' }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{z.zone_label}</td>
                  <td style={{ ...tdStyle, ...mono, textAlign: 'right', color: '#8E8E8E' }}>{(z.total_weight_kg / 1000).toFixed(1)} t</td>
                  <td style={{ ...tdStyle, ...mono, textAlign: 'right' }}>{z.assembly_count}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 120, height: 6, borderRadius: 99, background: '#EDEFF2', overflow: 'hidden' }}>
                        <div style={{ width: `${z.pct}%`, height: '100%', background: '#4A85C4' }} />
                      </div>
                      <b style={{ ...mono, fontSize: 11.5 }}>{z.pct.toFixed(1)}%</b>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, ...mono, textAlign: 'right', color: '#8E8E8E' }}>{z.buckets.notstart}</td>
                  <td style={{ ...tdStyle, ...mono, textAlign: 'right', color: '#4A85C4' }}>{z.buckets.in_progress}</td>
                  <td style={{ ...tdStyle, ...mono, textAlign: 'right', color: '#2E9E5F' }}>{z.buckets.done}</td>
                </tr>
              ))}
              {!overview.zones.length && (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#8E8E8E', padding: 28 }}>
                    No zones defined for this project yet
                  </td>
                </tr>
              )}
            </tbody>
            {overview.zones.length > 0 && (
              <tfoot>
                <tr>
                  <td style={{ ...tdStyle, fontWeight: 700, borderTop: '1px solid #E0E0E0' }}>Total</td>
                  <td style={{ ...tdStyle, ...mono, textAlign: 'right', fontWeight: 700, borderTop: '1px solid #E0E0E0' }}>{(overview.total.total_weight_kg / 1000).toFixed(1)} t</td>
                  <td style={{ ...tdStyle, ...mono, textAlign: 'right', fontWeight: 700, borderTop: '1px solid #E0E0E0' }}>{overview.total.assembly_count}</td>
                  <td style={{ ...tdStyle, borderTop: '1px solid #E0E0E0' }}>
                    <b style={{ ...mono, fontSize: 12 }}>{overview.total.pct.toFixed(1)}%</b>
                  </td>
                  <td style={{ ...tdStyle, ...mono, textAlign: 'right', borderTop: '1px solid #E0E0E0', color: '#8E8E8E' }}>{overview.total.buckets.notstart}</td>
                  <td style={{ ...tdStyle, ...mono, textAlign: 'right', borderTop: '1px solid #E0E0E0', color: '#4A85C4' }}>{overview.total.buckets.in_progress}</td>
                  <td style={{ ...tdStyle, ...mono, textAlign: 'right', borderTop: '1px solid #E0E0E0', color: '#2E9E5F' }}>{overview.total.buckets.done}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: '#ABABAB', marginTop: 10 }}>
        Progress is weighted by assembly weight (kg). Click a zone row to open its detail tab.
      </p>
    </div>
  )
}
