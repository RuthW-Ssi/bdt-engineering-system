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
  buildAxis,
  buildOps,
  dueMarkers,
  footSummary,
  headerInfo,
  heatGrid,
  hiddenOpCount,
  idleWcIds,
  indexBoard,
  kpis,
  layoutRows,
  orderList,
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
export function ProductionSchedule() {
  const [versionId, setVersionId] = useState<number | null>(null)
  const [lateOnly, setLateOnly] = useState(false)
  const [pxh, setPxh] = useState<number>(ZOOM.initial)
  const [selUid, setSelUid] = useState<number | null>(null)
  const [reloadN, setReloadN] = useState(0)
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

  const layout = useMemo(() => layoutRows(groups, collapsed), [groups, collapsed])
  const bars = useMemo(() => barViews(ops, axis, layout.rowY, { lateOnly, selUid }), [ops, axis, layout, lateOnly, selUid])
  const dues = useMemo(() => dueMarkers(ops, axis), [ops, axis])
  const heat = useMemo(() => (ix ? heatGrid(ix, ops, axis) : null), [ix, ops, axis])
  const bn = useMemo(() => (ix ? bottleneck(ix, ops, axis) : null), [ix, ops, axis])
  const bl = useMemo(() => (ix ? backlog(ix, ops, now) : null), [ix, ops, now])
  const tiles = useMemo(() => (ix ? kpis(ix, ops) : []), [ix, ops])
  const orders = useMemo(() => (ix ? orderList(ix, ops) : []), [ix, ops])
  const versions = useMemo(() => (board ? usableVersions(board) : []), [board])

  const selected = ops.find((o) => o.uid === selUid) ?? null
  const version = ix?.version ?? null
  const header = headerInfo(version)
  const foot = footSummary(ops, hiddenOpCount(ops, layout.rowY, collapsed), version)

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
          <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white" style={{ background: '#e8590c' }}>
            {header.badge}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {canUpdate && <RunSchedulePanel onRan={onRan} />}
      </div>

      <div className="flex-1 overflow-auto bg-[#eef1f5] p-4">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#6b7682]">
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
            <KpiTiles tiles={tiles} />
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

            {/* 3 columns from the content width (container query), not the window: the app sidebar eats 60–240 px.
                1040 keeps 3 columns on a 1440 px laptop with the sidebar open (gantt ≈ 640 px, it scrolls inside). */}
            <div className="grid gap-3 items-start grid-cols-1 @min-[1040px]:grid-cols-[206px_minmax(0,1fr)_280px]">
              <SchedCard icon="📥" title="Backlog" tag={bl.countLabel}>
                <BacklogPanel view={bl} />
              </SchedCard>

              <div className="flex flex-col gap-3 min-w-0">
                <SchedCard icon="🏭" title="Resource Gantt" tag="rows = line · bars = scheduled op">
                  <ResourceGantt
                    axis={axis}
                    layout={layout}
                    bars={bars}
                    dues={dues}
                    opCount={ops.length}
                    onToggleWc={toggleWc}
                    onSelect={setSelUid}
                    autoScrollKey={seedKey}
                    scrollTarget={scrollTarget}
                  />
                </SchedCard>
                <SchedCard icon="🔥" title="Utilization Heatmap" tag="load ÷ (available × OEE)">
                  <UtilizationHeatmap grid={heat} />
                </SchedCard>
                <SchedCard icon="⚡" title="Bottleneck Load" tag={bn?.tag}>
                  <BottleneckLoad data={bn} />
                </SchedCard>
              </div>

              <SchedCard icon="📋" title="รายละเอียด" className="self-start">
                <DetailPanel op={selected} orders={orders} onPickOrder={pickOrder} />
              </SchedCard>
            </div>

            <FourMSection
              ix={ix}
              ops={ops}
              data={fourm.data}
              isError={fourm.isError}
              error={fourm.error}
              onRetry={() => void fourm.refetch()}
            />

            <div className="text-[11px] text-[#6b7682] leading-relaxed">
              {foot.map((l) => <div key={l}>{l}</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
