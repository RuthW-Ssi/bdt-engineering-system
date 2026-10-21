import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
  FAMILY_COLOR,
  GANTT,
  LATE_COLOR,
  SCHEDULE_TEXT,
  UI_COLOR,
  cursorAt,
  dayGroups,
  dayHead,
  initialScrollLeft,
  opTooltip,
  type Axis,
  type BarView,
  type DueMarker,
  type GanttLayout,
} from '../../lib/schedule'

// Resource Gantt (port of prod-scheduler.html render()): WC → line tree on the
// left, absolutely positioned bars on a working-time axis on the right
// (off-shift gaps collapsed to 4 / 16 / 30 px bands), MO due diamonds below.

const OFFBAND_BG = 'repeating-linear-gradient(45deg,#E0E0E0 0,#E0E0E0 5px,#F5F5F5 5px,#F5F5F5 10px)'
const TIP_W = 250

type TipState = { uid: number; left: number; top: number } | null
type OnTip = (uid: number | null, clientX?: number, clientY?: number) => void

/** The bars only re-render when the bars change — not on every cursor / tooltip move. */
const GanttBars = memo(function GanttBars({ bars, onSelect, onTip }: { bars: BarView[]; onSelect: (uid: number) => void; onTip: OnTip }) {
  return (
    <>
      {bars.map((b) => (
        <button
          // position-independent: collapsing a WC or a refetch must not remount every bar
          key={`${b.uid}-${b.op.s}`}
          type="button"
          data-uid={b.uid}
          data-late={b.late || undefined}
          aria-label={`${b.op.mark}${b.op.opLabel ? ' · ' + b.op.opLabel : ''}${b.late ? ' · ล่าช้า' : ''}`}
          aria-pressed={b.selected}
          onClick={() => onSelect(b.uid)}
          onMouseMove={(e) => onTip(b.uid, e.clientX, e.clientY)}
          onMouseLeave={() => onTip(null)}
          className="absolute flex items-center px-1.5 rounded-[5px] text-white text-[10.5px] font-semibold whitespace-nowrap overflow-hidden cursor-pointer border border-black/[.12] transition-[left,width,opacity] duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F1F1F]"
          style={{
            left: b.left,
            top: b.top,
            width: b.width,
            height: GANTT.barH,
            background: b.color,
            opacity: b.dim ? 0.16 : b.held ? 0.45 : 1,
            // late = inset ring, so `outline` stays free for the keyboard focus ring
            boxShadow: [
              b.late ? `inset 0 0 0 2px ${LATE_COLOR.border}` : null,
              b.selected ? `0 0 0 2px #fff,0 0 0 4px ${UI_COLOR.accent}` : '0 1px 2px rgba(0,0,0,.18)',
            ]
              .filter(Boolean)
              .join(','),
            zIndex: b.selected ? 6 : undefined,
          }}
        >
          {b.setup && <span className="absolute left-0 top-0 bottom-0 w-[5px] bg-black/45 rounded-l-[5px]" />}
          {b.label && <span className="relative">{b.label}</span>}
        </button>
      ))}
    </>
  )
})

export function ResourceGantt({
  axis,
  layout,
  bars,
  dues,
  opCount,
  onToggleWc,
  onSelect,
  autoScrollKey,
  scrollTarget,
}: {
  axis: Axis & { s0: number }
  layout: GanttLayout
  bars: BarView[]
  dues: DueMarker[]
  opCount: number
  onToggleWc: (wcId: number) => void
  onSelect: (uid: number) => void
  /** Changes per version / reload → scroll the axis so the first op sits 40 px in. */
  autoScrollKey: string
  /** Scroll this op's bar into view (order-list click); `n` makes a repeat click re-scroll. */
  scrollTarget: { uid: number; n: number } | null
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const scrolledKey = useRef<string | null>(null)
  const [cursor, setCursor] = useState<{ px: number; label: string } | null>(null)
  const [tip, setTip] = useState<TipState>(null)

  const days = useMemo(() => dayGroups(axis), [axis])

  useEffect(() => {
    if (scrolledKey.current === autoScrollKey) return
    scrolledKey.current = autoScrollKey
    if (wrapRef.current && opCount) wrapRef.current.scrollLeft = initialScrollLeft(axis, opCount)
  }, [autoScrollKey, axis, opCount])

  useEffect(() => {
    if (!scrollTarget) return
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-uid="${scrollTarget.uid}"]`)
    el?.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'smooth' })
  }, [scrollTarget])

  const onTip = useCallback<OnTip>((uid, x = 0, y = 0) => {
    if (uid == null) return setTip(null)
    setTip({ uid, left: Math.min(window.innerWidth - TIP_W, x + 14), top: Math.min(window.innerHeight - 96, y + 14) })
  }, [])

  const onBodyMove = (e: MouseEvent<HTMLDivElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left
    const c = cursorAt(axis, px)
    setCursor(c.visible ? { px, label: c.label } : null)
  }

  const tipOp = tip ? bars.find((b) => b.uid === tip.uid)?.op : undefined
  const tipView = tipOp ? opTooltip(tipOp) : null
  const width = axis.totalW

  return (
    <div className="flex">
      {/* WC → line tree */}
      <div className="flex-[0_0_150px] border-r border-[#E0E0E0] bg-[#FAFAFA] min-w-0">
        <div className="h-[34px] border-b border-[#E0E0E0] flex items-center px-3 text-[11px] text-[#555555] uppercase">Work Center · Line</div>
        {layout.rows.map((r) =>
          r.kind === 'wc' ? (
            <button
              key={r.key}
              type="button"
              aria-expanded={!r.collapsed}
              onClick={() => onToggleWc(r.group.wcId)}
              className="w-full flex items-center gap-1.5 px-2 text-[11px] font-semibold text-[#1F1F1F] bg-[#F5F5F5] hover:bg-[#F5F5F5] border-0 border-b border-[#F5F5F5] cursor-pointer uppercase tracking-[.3px] whitespace-nowrap overflow-hidden text-left"
              style={{ height: r.h }}
              title={r.group.wc.name ?? r.group.wc.code}
            >
              <span className="w-2.5 flex-[0_0_10px] text-[#555555] text-[10px]">{r.collapsed ? '▸' : '▾'}</span>
              <span className="w-2 h-2 rounded-[2px] flex-[0_0_8px]" style={{ background: FAMILY_COLOR[r.group.family] }} />
              <span className="truncate">{r.group.code}</span>
              <span className="ml-auto font-mono text-[9px] text-[#555555] font-normal normal-case">{r.group.countLabel}</span>
            </button>
          ) : (
            <div
              key={r.key}
              className="flex items-center gap-1.5 pl-6 pr-3 text-xs font-medium border-b border-[#F5F5F5] whitespace-nowrap overflow-hidden"
              style={{ height: r.h }}
            >
              L{r.line.line_no}
              {r.line.name && <small className="text-[#555555] font-normal truncate">{r.line.name}</small>}
            </div>
          ),
        )}
      </div>

      {/* timeline */}
      <div ref={wrapRef} data-testid="gantt-scroll" className="flex-1 min-w-0 overflow-x-auto">
        <div className="relative h-[34px] border-b border-[#E0E0E0] bg-[#FAFAFA] min-w-full" style={{ width }}>
          {days.map((d) => {
            const h = dayHead(d.day)
            return (
              <div
                key={d.day}
                className="absolute top-0 h-[34px] border-l border-[#E0E0E0] px-2 py-[5px] text-[11px] text-[#555555] whitespace-nowrap overflow-hidden"
                style={{ left: d.x0, width: d.x1 - d.x0 }}
              >
                <b className="text-[#1F1F1F] font-semibold">{h.weekday}</b> {h.date}
              </div>
            )
          })}
        </div>

        <div
          ref={bodyRef}
          className="relative min-w-full"
          style={{ width, height: layout.height }}
          onMouseMove={onBodyMove}
          onMouseLeave={() => {
            setCursor(null)
            setTip(null)
          }}
        >
          {layout.rows.map((r) =>
            r.kind === 'wc' ? (
              <div key={r.key} className="absolute left-0 right-0 bg-[#F5F5F5] border-b border-[#F5F5F5]" style={{ top: r.y, height: r.h }} />
            ) : (
              <div
                key={r.key}
                className={`absolute left-0 right-0 border-b border-[#F5F5F5] ${r.alt ? 'bg-[#FAFAFA]' : ''}`}
                style={{ top: r.y, height: r.h }}
              />
            ),
          )}
          {axis.seg.map((g) =>
            g.t === 'o' ? (
              <div
                key={`o-${g.s}`}
                className="absolute top-0 bottom-0 border-x border-[#E0E0E0]"
                style={{ left: g.x0, width: g.x1 - g.x0, backgroundImage: OFFBAND_BG }}
              />
            ) : null,
          )}
          {opCount === 0 && (
            <div className="absolute left-4 top-1.5 z-[3] bg-white border border-[#E0E0E0] rounded-md px-2.5 py-1.5 text-xs text-[#555555]">
              {SCHEDULE_TEXT.ganttEmpty}
            </div>
          )}
          <GanttBars bars={bars} onSelect={onSelect} onTip={onTip} />
          {cursor && (
            <>
              <div className="absolute top-0 bottom-0 w-px pointer-events-none z-[8]" style={{ left: cursor.px, background: UI_COLOR.now }} />
              <div
                data-testid="gantt-cursor"
                className="absolute top-0.5 -translate-x-1/2 text-white text-[10px] px-1.5 py-px rounded-md pointer-events-none whitespace-nowrap font-mono z-[9] shadow-[0_1px_4px_rgba(0,0,0,.25)]"
                style={{ left: cursor.px, background: UI_COLOR.now }}
              >
                {cursor.label}
              </div>
            </>
          )}
        </div>

        {/* due lane: one diamond per MO at its plan_finish */}
        <div className="relative h-[30px] border-t border-dashed border-[#E0E0E0] bg-[#FAFAFA] min-w-full" style={{ width }}>
          {dues.map((m) => (
            <div
              key={m.moId}
              title={m.title}
              className="absolute top-1.5 -translate-x-1/2 flex flex-col items-center text-[9px] whitespace-nowrap"
              style={{ left: m.left, color: m.late ? LATE_COLOR.ink : UI_COLOR.muted, fontWeight: m.late ? 700 : undefined }}
            >
              <span className="w-2.5 h-2.5 rotate-45 mb-0.5" style={{ background: m.late ? LATE_COLOR.border : UI_COLOR.onTime }} />
              {m.edge}
              {m.code}
            </div>
          ))}
        </div>
      </div>

      {tip && tipView && (
        <div
          role="tooltip"
          className="fixed pointer-events-none bg-[#1F1F1F] text-white px-[9px] py-[7px] rounded-[7px] text-[11px] z-50 max-w-[240px] shadow-[0_4px_14px_rgba(0,0,0,.3)]"
          style={{ left: tip.left, top: tip.top }}
        >
          <b>{tipView.title}</b>
          {tipView.lines.map((l, i) => <div key={i}>{l}</div>)}
          {tipView.late && <div style={{ color: '#fca5a5' }}>⚠ งานล่าช้า</div>}
        </div>
      )}
    </div>
  )
}
