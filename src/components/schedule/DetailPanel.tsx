import { Fragment } from 'react'
import { LATE_COLOR, SCHEDULE_TEXT, UI_COLOR, opDetail, type OrderRow, type SchedOp } from '../../lib/schedule'

/** 📋 WO detail of the selected bar + the order list (MOs in this version or still open). */
export function DetailPanel({ op, orders, onPickOrder }: { op: SchedOp | null; orders: OrderRow[]; onPickOrder: (row: OrderRow) => void }) {
  const d = op ? opDetail(op) : null
  return (
    <div className="p-3.5">
      {d ? (
        <div data-testid="op-detail">
          <div className="text-base font-semibold text-[#1f2733]">
            {d.title} <span className="text-[#6b7682] font-normal">{d.subtitle}</span>
          </div>
          <span
            className="inline-block px-[9px] py-0.5 rounded-full text-[11px] font-bold"
            style={d.late ? { background: '#fde7e7', color: LATE_COLOR.ink } : { background: '#e3f5ea', color: UI_COLOR.green }}
          >
            {d.pill}
          </span>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-[7px] text-xs mt-1.5 mb-0">
            {d.rows.map((r) => (
              <Fragment key={r.label}>
                <dt className="text-[#6b7682]">{r.label}</dt>
                <dd className={`m-0 font-semibold text-right break-words ${r.mono ? 'font-mono' : ''}`}>{r.value}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      ) : (
        <div className="text-[#6b7682] text-center px-2 py-5 text-xs leading-normal">{SCHEDULE_TEXT.detailEmpty}</div>
      )}

      <h4 className="mt-3.5 mb-1 text-xs text-[#6b7682] uppercase font-semibold">คำสั่งผลิต ({orders.length})</h4>
      <div className="max-h-80 overflow-y-auto">
        {orders.map((o) => (
          <button
            key={o.mo.id}
            type="button"
            onClick={() => onPickOrder(o)}
            className={`w-full flex items-center gap-1.5 py-1.5 border-0 border-b border-[#eef1f4] bg-transparent text-xs text-left cursor-pointer hover:bg-[#f8fafc] ${o.firstOp ? '' : 'opacity-70'}`}
          >
            <span className="w-2 h-2 rounded-[2px] flex-[0_0_8px]" style={{ background: o.dotColor }} />
            <span className="font-semibold text-[#1f2733]">{o.mo.mo_code}</span>
            <span className="ml-auto text-[11px] text-[#6b7682]">{o.meta}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
