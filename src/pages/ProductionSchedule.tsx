import { useMemo, useState } from 'react'
import { CalendarClock, Loader2 } from 'lucide-react'
import type { ScheduleRunResult } from '../api/schedule'
import { useScheduleBoard, useScheduleFourM } from '../hooks/useSchedule'
import { usePermission } from '../hooks/usePermission'
import { getErrorMessage } from '../lib/getErrorMessage'
import {
  ZOOM,
  activeLines,
  backlog,
  barViews,
  bottleneck,
  busyGroups,
  buildAxis,
  buildOps,
  dueMarkers,
  hiddenOpsNote,
  headerInfo,
  heatGrid,
  hiddenOpCount,
  idleWcIds,
  indexBoard,
  kpis,
  layoutRows,
  orderList,
  pausedWarnings,
  usableVersions,
  wcGroups,
  zoomIn,
  zoomOut,
  type OrderRow,
} from '../lib/schedule'
import { KpiTiles } from '../components/schedule/KpiTiles'
import { ScheduleToolbar } from '../components/schedule/ScheduleToolbar'
import { SchedCard } from '../components/schedule/SchedCard'
import { BacklogPanel } from '../components/schedule/BacklogPanel'
import { ResourceGantt } from '../components/schedule/ResourceGantt'
import { UtilizationHeatmap } from '../components/schedule/UtilizationHeatmap'
import { BottleneckLoad } from '../components/schedule/BottleneckLoad'
import { DetailPanel } from '../components/schedule/DetailPanel'
import { RunSchedulePanel } from '../components/schedule/RunSchedulePanel'
import { ActivateVersionControl } from '../components/schedule/ActivateVersionControl'
import { FourMSection } from '../components/schedule/fourm/FourMSection'
import { BTN, ERROR_BOX } from '../components/schedule/styles'

const NO_HOLIDAYS: ReadonlySet<string> = new Set()

/**
 * Production Schedule (S37 · P4a) — read-only board of one prod_schedule
 * version: KPI tiles, Backlog, Resource Gantt (WC → line), Utilization
 * Heatmap, Bottleneck Load, the WO detail / order list and, below them, the
 * 📊 4M + WIP analysis (its own query, loaded after the board). Port of
 * the retired HTML cockpit (git history: backend-schedule/cockpit/prod-scheduler.html); all logic in lib/schedule.
 * Users with orders:update can also run the scheduler and activate a version.
 */
type ScheduleTab = 'gantt' | 'load' | 'fourm'
const TABS: { key: ScheduleTab; label: string }[] = [
  { key: 'gantt', label: 'ตาราง Gantt' },
  { key: 'load', label: 'ภาระงาน' },
  { key: 'fourm', label: '4M + WIP' },
]

// ?tab=load opens a tab directly; kept in the URL (replaceState) so a refresh stays on it.
function tabFromUrl(): ScheduleTab {
  const t = new URLSearchParams(window.location.search).get('tab')
  return TABS.some((x) => x.key === t) ? (t as ScheduleTab) : 'gantt'
}

export function ProductionSchedule() {
  const [versionId, setVersionId] = useState<number | null>(null)
  const [lateOnly, setLateOnly] = useState(false)
  const [pxh, setPxh] = useState<number>(ZOOM.initial)
  const [selUid, setSelUid] = useState<number | null>(null)
  const [reloadN, setReloadN] = useState(0)
  const [tab, setTabState] = useState<ScheduleTab>(tabFromUrl)
  const [showPaused, setShowPaused] = useState(false)
  // Gantt side panel (order list / WO detail + Backlog); hiding it gives the Gantt the full width
  const [sideOpen, setSideOpen] = useState(true)
  const [backlogOpen, setBacklogOpen] = useState(true)
  const setTab = (t: ScheduleTab) => {
    setTabState(t)
    const url = new URL(window.location.href)
    if (t === 'gantt') url.searchParams.delete('tab')
    else url.searchParams.set('tab', t)
    window.history.replaceState(window.history.state, '', url)
  }
  // User toggles of the WC tree, valid for one seed (version + reload) only.
  const [collapseState, setCollapseState] = useState<{ key: string; set: Set<number> } | null>(null)
  const [scrollTarget, setScrollTarget] = useState<{ uid: number; n: number } | null>(null)

  const canUpdate = usePermission('orders', 'update')
  const { data: board, isLoading, isError, error, refetch, isFetching, isPlaceholderData } = useScheduleBoard(versionId)
  // 4M of the version the board shows (also while it is a placeholder), only once a board is in
  const fourm = useScheduleFourM(board?.version_id, { enabled: !!board })

  const ix = useMemo(() => (board ? indexBoard(board) : null), [board])
  const ops = useMemo(() => (ix ? buildOps(ix) : []), [ix])
  const groups = useMemo(() => (ix ? wcGroups(ix, activeLines(ix), ops) : []), [ix, ops])
  // server time of the board — the axis fallback / "due < 2 days" reference
  const now = board ? Date.parse(board.generated_at) : 0
  const axis = useMemo(() => buildAxis(ops, ix?.holidays ?? NO_HOLIDAYS, pxh, now), [ops, ix, pxh, now])

  // Per version / reload: idle WCs start collapsed and the axis scrolls to the first op.
  const seedKey = `${board?.version_id ?? '-'}|${reloadN}`
  const autoCollapsed = useMemo(() => idleWcIds(groups, ops), [groups, ops])
  const collapsed = collapseState?.key === seedKey ? collapseState.set : autoCollapsed

  // "แสดงเฉพาะที่มีงาน" hides WCs / lines with no op in the shown version
  const [busyOnly, setBusyOnly] = useState(false)
  const shownGroups = useMemo(() => (busyOnly ? busyGroups(groups, ops) : groups), [busyOnly, groups, ops])
  const layout = useMemo(() => layoutRows(shownGroups, collapsed), [shownGroups, collapsed])
  const bars = useMemo(() => barViews(ops, axis, layout.rowY, { lateOnly, selUid }), [ops, axis, layout, lateOnly, selUid])
  const dues = useMemo(() => dueMarkers(ops, axis), [ops, axis])
  const heat = useMemo(() => (ix ? heatGrid(ix, ops, axis) : null), [ix, ops, axis])
  const bn = useMemo(() => (ix ? bottleneck(ix, ops, axis) : null), [ix, ops, axis])
  const bl = useMemo(() => (ix ? backlog(ix, ops, now) : null), [ix, ops, now])
  const tiles = useMemo(() => (ix ? kpis(ix, ops) : []), [ix, ops])
  const orders = useMemo(() => (ix ? orderList(ix, ops) : []), [ix, ops])
  const versions = useMemo(() => (board ? usableVersions(board) : []), [board])
  const paused = useMemo(() => (board ? pausedWarnings(board) : []), [board])

  const selected = ops.find((o) => o.uid === selUid) ?? null
  const version = ix?.version ?? null
  const header = headerInfo(version)
  const hiddenNote = hiddenOpsNote(hiddenOpCount(ops, layout.rowY, collapsed))

  const setCollapsed = (next: Set<number>) => setCollapseState({ key: seedKey, set: next })

  const toggleWc = (wcId: number) => {
    const next = new Set(collapsed)
    if (next.has(wcId)) next.delete(wcId)
    else next.add(wcId)
    setCollapsed(next)
  }

  const selectVersion = (id: number | null) => {
    setVersionId(id)
    setSelUid(null)
  }

  const reload = () => {
    setReloadN((n) => n + 1)
    void refetch()
    if (board) void fourm.refetch() // "apply migration … แล้วกด Reload" — the WIP view may exist now
  }

  // order list → select the MO's first op, open its WC, scroll the bar into view
  // picking a bar shows its detail, so a hidden side panel opens again
  const selectOp = (uid: number | null) => {
    setSelUid(uid)
    if (uid != null) setSideOpen(true)
  }
  const pickOrder = (row: OrderRow) => {
    const o = row.firstOp
    if (!o) return
    setSelUid(o.uid)
    if (o.line && collapsed.has(o.line.workcenter_id)) {
      const next = new Set(collapsed)
      next.delete(o.line.workcenter_id)
      setCollapsed(next)
    }
    setScrollTarget((t) => ({ uid: o.uid, n: (t?.n ?? 0) + 1 }))
  }

  const onRan = (res: ScheduleRunResult) => {
    if (res.version_id != null) selectVersion(res.version_id)
  }

  const shownVersionId = isPlaceholderData ? versionId : (board?.version_id ?? null)

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      <div className="bg-white border-b border-chrome-100 px-6 flex items-center gap-3 flex-wrap" style={{ minHeight: 56, flexShrink: 0 }}>
        <CalendarClock size={18} className="text-chrome-600" />
        <div className="min-w-0">
          <div style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F', lineHeight: 1.2 }}>Production Schedule</div>
          <div className="text-[11px] text-chrome-400 truncate">{header.sub}</div>
        </div>
        {board && (
          <span className="rounded-full border border-ssi-100 bg-ssi-50 px-2.5 py-1 text-[11px] font-semibold text-ssi-600">
            {header.badge}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {canUpdate && <RunSchedulePanel onRan={onRan} mos={board?.mos ?? []} workOrders={board?.work_orders ?? []} />}
      </div>

      <div className="flex-1 overflow-auto bg-[#F5F5F5] p-4">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#555555]">
            <Loader2 size={18} className="animate-spin" /> กำลังโหลดตาราง…
          </div>
        ) : !board || !ix || !bl ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <div role="alert" className={ERROR_BOX}>
              โหลดไม่สำเร็จ: {getErrorMessage(error, 'Failed to load the schedule board.')}
            </div>
            <div className="flex gap-2">
              <button type="button" className={BTN} onClick={reload}>↻ ลองใหม่</button>
              {/* a picked version that fails to load must not trap the user on it */}
              {versionId != null && (
                <button type="button" className={BTN} onClick={() => selectVersion(null)}>กลับไป version ที่ใช้งาน</button>
              )}
            </div>
          </div>
        ) : (
          <div className="@container flex flex-col gap-3">
            {isError && (
              <div role="alert" className={ERROR_BOX}>
                Reload ไม่สำเร็จ — แสดงข้อมูลเดิม: {getErrorMessage(error, 'Failed to load the schedule board.')}
              </div>
            )}
            <div className="bg-white border border-[#E0E0E0] rounded-lg px-3.5 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
              <KpiTiles tiles={tiles} />
              {paused.length > 0 && (
                <button
                  type="button"
                  aria-expanded={showPaused}
                  onClick={() => setShowPaused((v) => !v)}
                  className="ml-auto rounded-full border border-[#FAC775] bg-[#FAEEDA] text-[#854F0B] text-xs font-semibold px-3 py-1 cursor-pointer"
                >
                  ⏸ หยุดชั่วคราว {paused.length} WO
                </button>
              )}
            </div>
            {showPaused && paused.length > 0 && (
              <div role="status" className="rounded-lg border border-[#FAC775] bg-[#FAEEDA] text-[#854F0B] text-xs px-3 py-2">
                <div className="font-semibold">⏸ หยุดชั่วคราว {paused.length} WO — ไม่ได้กันไลน์ไว้ ไลน์อาจไม่ว่าง</div>
                <ul className="mt-1 mb-0 pl-4 list-disc">
                  {paused.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>
            )}
            <ScheduleToolbar
              versions={versions}
              currentId={shownVersionId}
              onSelectVersion={selectVersion}
              lateOnly={lateOnly}
              onLateOnly={setLateOnly}
              pxh={pxh}
              onZoom={(dir) => setPxh((p) => (dir === 'in' ? zoomIn(p) : zoomOut(p)))}
              onReload={reload}
              reloading={isFetching}
              actions={
                // only for the version actually on screen — not the placeholder board while another one loads
                canUpdate && version && !version.is_active && version.id === shownVersionId ? (
                  <ActivateVersionControl key={version.id} version={version} />
                ) : null
              }
            />

            <div role="tablist" aria-label="มุมมอง" className="flex gap-1 border-b border-[#E0E0E0]">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3.5 py-2 text-[13px] border-0 border-b-2 -mb-px bg-transparent cursor-pointer ${
                    tab === t.key ? 'border-[#C8202A] text-[#C8202A] font-semibold' : 'border-transparent text-[#555555] hover:text-[#1F1F1F]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'gantt' && (
              <div role="tabpanel" aria-label="ตาราง Gantt" className={`grid gap-3 items-start grid-cols-1 ${sideOpen ? '@min-[1040px]:grid-cols-[minmax(0,1fr)_300px]' : ''}`}>
                <SchedCard
                  icon="🏭"
                  title="Resource Gantt"
                  tag={
                    <span className="inline-flex items-center gap-3">
                      <label className="inline-flex items-center gap-1.5 font-sans text-[12px] text-[#1F1F1F] cursor-pointer select-none">
                        <input type="checkbox" checked={busyOnly} onChange={(e) => setBusyOnly(e.target.checked)} />
                        แสดงเฉพาะ work center / line ที่มีงาน
                      </label>
                      <span>rows = line · bars = scheduled op</span>
                      <button
                        type="button"
                        aria-pressed={sideOpen}
                        title={sideOpen ? 'ซ่อนแผงคำสั่งผลิต / Backlog' : undefined}
                        onClick={() => setSideOpen((v) => !v)}
                        className="font-sans text-[12px] text-[#555555] border border-[#E0E0E0] rounded-md bg-white px-2 py-0.5 cursor-pointer hover:bg-[#FAFAFA]"
                      >
                        {sideOpen ? 'ซ่อน ▸' : '◂ คำสั่งผลิต / Backlog'}
                      </button>
                    </span>
                  }
                >
                  <ResourceGantt
                    axis={axis}
                    layout={layout}
                    bars={bars}
                    dues={dues}
                    opCount={ops.length}
                    onToggleWc={toggleWc}
                    onSelect={selectOp}
                    autoScrollKey={seedKey}
                    scrollTarget={scrollTarget}
                  />
                </SchedCard>
                {sideOpen && (
                  <div className="flex flex-col gap-3 min-w-0">
                    {selected ? (
                      <SchedCard
                        icon="📋"
                        title="รายละเอียด"
                        tag={<button type="button" aria-label="ปิดรายละเอียด" onClick={() => setSelUid(null)} className="border-0 bg-transparent cursor-pointer font-sans text-[12px] text-[#555555]">← คำสั่งผลิต</button>}
                      >
                        <DetailPanel op={selected} orders={orders} onPickOrder={pickOrder} show="detail" />
                      </SchedCard>
                    ) : (
                      <SchedCard icon="📋" title="คำสั่งผลิต" tag={`${orders.length} MO · กดเพื่อดูใน Gantt`}>
                        <DetailPanel op={null} orders={orders} onPickOrder={pickOrder} show="orders" />
                      </SchedCard>
                    )}
                    <SchedCard
                      icon="📥"
                      title="Backlog"
                      tag={
                        <button
                          type="button"
                          aria-expanded={backlogOpen}
                          onClick={() => setBacklogOpen((v) => !v)}
                          className="border-0 bg-transparent cursor-pointer font-mono text-[10px] text-[#555555]"
                        >
                          {bl.countLabel} {backlogOpen ? '▾' : '▸'}
                        </button>
                      }
                    >
                      {backlogOpen && <BacklogPanel view={bl} />}
                    </SchedCard>
                  </div>
                )}
              </div>
            )}

            {tab === 'load' && (
              <div role="tabpanel" aria-label="ภาระงาน" className="flex flex-col gap-3">
                <SchedCard icon="⚡" title="Bottleneck Load" tag={bn?.tag}>
                  <BottleneckLoad data={bn} />
                </SchedCard>
                <SchedCard icon="🔥" title="Utilization Heatmap" tag="load ÷ (available × OEE)">
                  <UtilizationHeatmap grid={heat} />
                </SchedCard>
              </div>
            )}

            {tab === 'fourm' && (
              <div role="tabpanel" aria-label="4M + WIP">
                <FourMSection
                  ix={ix}
                  ops={ops}
                  data={fourm.data}
                  isError={fourm.isError}
                  error={fourm.error}
                  onRetry={() => void fourm.refetch()}
                />
              </div>
            )}

            {hiddenNote && <div role="status" className="text-[11px] text-[#854F0B]">{hiddenNote}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
