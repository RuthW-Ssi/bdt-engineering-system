import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Search, ChevronRight, LayoutDashboard, Cuboid as CuboidIcon, Boxes } from 'lucide-react'
import { useProgressZoneRows, useProgressOverview, useProgressBimMatch } from '../../hooks/useProjectProgress'
import { useProject } from '../../hooks/useProjects'
import { useProjectZones } from '../../hooks/useProjectZones'
import { MobileHeader } from '../../components/mobile/MobileHeader'
import { MobileDateRangeCard } from '../../components/mobile/MobileDateRangeCard'
import { MobileProgressStatCards } from '../../components/mobile/MobileProgressStatCards'
import { MobileBimCard } from '../../components/mobile/MobileBimCard'
import { MobileTabBar } from '../../components/mobile/MobileTabBar'

const STATUS_DOT: Record<string, string> = {
  notstart: '#C2C2C2',
  fabrication: '#BA7517',
  load: '#185FA5',
  erection: '#639922',
  done: '#27500A',
}

type Tab = 'overview' | '3d' | 'assembly'

export function MobileAssemblyList() {
  const { code, zoneId } = useParams<{ code: string; zoneId: string }>()
  const navigate = useNavigate()
  const zoneIdNum = zoneId ? Number(zoneId) : null
  const [tab, setTab] = useState<Tab>('overview')
  const { data, isLoading } = useProgressZoneRows(code, zoneIdNum)
  const [q, setQ] = useState('')

  const { data: overview } = useProgressOverview(code)
  const { data: project } = useProject(code)
  const { data: projectZones } = useProjectZones(project?.id)
  const { data: zoneBimMatch } = useProgressBimMatch(code, zoneIdNum)
  const zoneRollup = overview?.zones.find(z => z.zone_id === zoneIdNum)
  const zoneDetail = projectZones?.find(z => z.id === zoneIdNum)

  const rows = (data ?? []).filter(r => !q.trim() || r.mark.toLowerCase().includes(q.trim().toLowerCase()))

  // h-dvh, not h-screen (100vh) — 100vh overshoots the real visible viewport
  // on mobile browsers (doesn't subtract the address bar), which pushed the
  // bottom tab bar (and header) below the fold on a real phone. dvh tracks
  // the actually-visible height.
  return (
    <div className="h-dvh flex flex-col bg-chrome-50 overflow-hidden">
      <MobileHeader title="Zone Progress" onBack={`/m/projects/${code}/zones`} />

      {/* Overview/Assembly panels stay mounted (display:none when inactive)
          — cheap plain DOM, no cost to keep around. The 3D panel is the one
          exception: it's unmounted on tab-away instead, because the
          Autodesk viewer's render loop doesn't pause on display:none — its
          canvas collapses to 0x0 while still ticking, which threw a real
          WebGL crash ("Cannot set properties of null (setting
          'shareDepthFrom')") the moment you switched back to this tab.
          Full reload per visit is the accepted tradeoff for not crashing. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className={tab === 'overview' ? 'p-3 flex flex-col gap-3' : 'hidden'}>
          {zoneDetail && (
            <MobileDateRangeCard
              title={`${zoneDetail.code} - ${zoneDetail.label}`}
              start={zoneDetail.target_erection_start}
              end={zoneDetail.target_erection_end}
            />
          )}
          {zoneRollup && <MobileProgressStatCards total={zoneRollup} />}
        </div>

        {tab === '3d' && (
          // Fill the tab's full available height, flush to the bottom tab
          // bar — see MobileZoneList.tsx's identical comment for why an
          // earlier capped-height version was reverted.
          <div className="h-full p-3">
            <MobileBimCard
              projectCode={code ?? ''}
              bimMatch={zoneBimMatch}
              rows={data}
              zoneLabel={zoneDetail?.label}
              showPhaseFilter
              overviewTotals={zoneRollup}
              height="100%"
            />
          </div>
        )}

        <div className={tab === 'assembly' ? 'p-3 flex flex-col gap-3' : 'hidden'}>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-chrome-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search mark..."
              className="w-full bg-white border border-chrome-200 rounded-lg pl-9 pr-3 py-3 text-[15px] focus:outline-none focus:border-ssi-600"
            />
          </div>

          {isLoading && <div className="text-center text-chrome-400 text-sm py-10">Loading…</div>}
          {!isLoading && rows.length === 0 && (
            <div className="text-center text-chrome-400 text-sm py-10">No assemblies found</div>
          )}

          <div className="flex flex-col gap-2">
            {rows.map(r => (
              <button
                key={r.assembly_id}
                onClick={() => navigate(`/m/projects/${code}/zones/${zoneId}/assemblies/${r.assembly_id}`)}
                className="flex items-center gap-3 bg-white border border-chrome-100 rounded-xl p-4 text-left active:bg-chrome-50"
              >
                <span
                  className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
                  style={{ background: STATUS_DOT[r.status] ?? '#C2C2C2' }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="font-mono font-semibold text-chrome-900 text-[14.5px] truncate">{r.mark}</div>
                  <div className="text-xs text-chrome-400">
                    Fab {Math.round(r.fab_pct)}% · Load {r.loaded_pcs}/{r.qty ?? 1} · Erect {r.erected_pcs}/{r.qty ?? 1}
                  </div>
                </div>
                <ChevronRight size={18} className="text-chrome-200 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <MobileTabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: 'Overview', icon: <LayoutDashboard size={19} /> },
          { key: '3d', label: '3D', icon: <CuboidIcon size={19} /> },
          { key: 'assembly', label: 'Assembly', icon: <Boxes size={19} /> },
        ]}
      />
    </div>
  )
}
