import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, Layers, LayoutDashboard, Cuboid as CuboidIcon, History } from 'lucide-react'
import { useProgressOverview, useProgressProjectRows, useProgressProjectBimMatch } from '../../hooks/useProjectProgress'
import { useProject } from '../../hooks/useProjects'
import { MobileHeader } from '../../components/mobile/MobileHeader'
import { MobileDateRangeCard } from '../../components/mobile/MobileDateRangeCard'
import { MobileProgressStatCards } from '../../components/mobile/MobileProgressStatCards'
import { MobileBimCard } from '../../components/mobile/MobileBimCard'
import { MobileTabBar } from '../../components/mobile/MobileTabBar'

type Tab = 'overview' | '3d' | 'zones' | 'history'

export function MobileZoneList() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const { data, isLoading } = useProgressOverview(code)
  const { data: project } = useProject(code)
  const { data: projectRows } = useProgressProjectRows(code, true)
  const { data: projectBimMatch } = useProgressProjectBimMatch(code, true)
  const zones = data?.zones ?? []
  const total = data?.total

  // h-dvh, not h-screen (100vh) — 100vh overshoots the real visible viewport
  // on mobile browsers (doesn't subtract the address bar), which pushed the
  // bottom tab bar (and header) below the fold on a real phone. dvh tracks
  // the actually-visible height.
  return (
    <div className="h-dvh flex flex-col bg-chrome-50 overflow-hidden">
      <MobileHeader title="Project Progress" onBack="/m/projects" />

      {/* Overview/Zones panels stay mounted (display:none when inactive) —
          cheap plain DOM, no cost to keep around. The 3D panel is the one
          exception: it's unmounted on tab-away instead, because the
          Autodesk viewer's render loop doesn't pause on display:none — its
          canvas collapses to 0x0 while still ticking, which threw a real
          WebGL crash ("Cannot set properties of null (setting
          'shareDepthFrom')") the moment you switched back to this tab.
          Full reload per visit is the accepted tradeoff for not crashing. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className={tab === 'overview' ? 'p-3 flex flex-col gap-3' : 'hidden'}>
          {project && (
            <MobileDateRangeCard
              title={`${project.project_code} - ${project.name}`}
              start={project.start_date}
              end={project.target_handover}
            />
          )}
          {total && <MobileProgressStatCards total={total} />}
        </div>

        {tab === '3d' && (
          // h-full, not a fixed/capped height — a capped height (tried and
          // reverted) left a visible gap of plain page background between
          // the card and the bottom tab bar on real devices where the
          // available space is taller than the cap. Any empty margin around
          // the model itself inside the canvas is fitToView() preserving
          // the model's own aspect ratio (letterboxing) — inherent to a 3D
          // viewport whose proportions rarely match the container's, not
          // something a container-height change can fully eliminate.
          <div className="h-full p-3">
            <MobileBimCard
              projectCode={code ?? ''}
              bimMatch={projectBimMatch}
              rows={projectRows}
              showPhaseFilter
              overviewTotals={total}
              height="100%"
            />
          </div>
        )}

        <div className={tab === 'zones' ? 'p-3 flex flex-col gap-2' : 'hidden'}>
          {isLoading && <div className="text-center text-chrome-400 text-sm py-10">Loading…</div>}
          {!isLoading && zones.length === 0 && (
            <div className="text-center text-chrome-400 text-sm py-10">No zones found</div>
          )}
          {zones.map(z => (
            <button
              key={z.zone_id}
              onClick={() => navigate(`/m/projects/${code}/zones/${z.zone_id}`)}
              className="flex items-center gap-3 bg-white border border-chrome-100 rounded-xl p-4 text-left active:bg-chrome-50"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-steel-50 flex items-center justify-center">
                <Layers size={18} className="text-steel-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-chrome-900 text-[15px] truncate">{z.zone_label}</div>
                <div className="text-xs text-chrome-400 font-mono">{z.zone_code} · {z.assembly_count} pcs · Fab {Math.round(z.fab_pct)}%</div>
              </div>
              <ChevronRight size={18} className="text-chrome-200 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>

      <MobileTabBar
        active={tab}
        onChange={t => {
          // History is a navigation shortcut, not a panel like the other 3
          // — it's a full standalone screen (own header/back-nav), same as
          // desktop's project-level History button, just relocated into the
          // tab bar per request. Doesn't update local `tab` state since the
          // page navigates away.
          if (t === 'history') navigate(`/m/projects/${code}/history`)
          else setTab(t)
        }}
        tabs={[
          { key: 'overview', label: 'Overview', icon: <LayoutDashboard size={19} /> },
          { key: '3d', label: '3D', icon: <CuboidIcon size={19} /> },
          { key: 'zones', label: 'Zone', icon: <Layers size={19} /> },
          { key: 'history', label: 'History', icon: <History size={19} /> },
        ]}
      />
    </div>
  )
}
