import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import type { BoardWorkOrder } from '../../api/schedule'
import { moPickState, toggleMoPick, toggleWoPick, waitsFor, type RunCandidate } from '../../lib/schedule/runScope'

/**
 * ▶ Run · เลือกเอง — tick an MO to take all its schedulable WOs, expand it to drop single
 * WOs. A picked WO whose earlier operation is left out shows "ต้องรอ …" (the scheduler
 * holds it until that operation's plan_finish).
 */
export function RunScopePicker({ candidates, workOrders, picked, onChange }: {
  candidates: RunCandidate[]
  workOrders: BoardWorkOrder[]
  picked: Set<number>
  onChange: (next: Set<number>) => void
}) {
  const [open, setOpen] = useState<Set<number>>(() => new Set())
  const waits = useMemo(() => waitsFor(picked, workOrders), [picked, workOrders])
  const flip = (id: number) => setOpen((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  if (candidates.length === 0) {
    return <div className="text-[#6b7682] pl-5">ไม่มีงานที่จัดได้ (ต้องเป็น WO ที่ยังไม่เริ่มหรือปล่อยงานแล้ว)</div>
  }

  return (
    <div className="flex flex-col gap-1 pl-5">
      <div className="text-[#6b7682]">เลือกแล้ว {picked.size} WO</div>
      <div className="max-h-[260px] overflow-y-auto border border-[#d8dde3] rounded-md">
        {candidates.map((c) => {
          const state = moPickState(picked, c)
          const isOpen = open.has(c.mo.id)
          return (
            <div key={c.mo.id} className="border-b border-[#eef1f5] last:border-b-0">
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <button type="button" onClick={() => flip(c.mo.id)} aria-label={`${isOpen ? 'ย่อ' : 'ดู WO ของ'} ${c.mo.mo_code}`} className="text-[#6b7682]">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <label className="flex items-center gap-1.5 cursor-pointer select-none flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={state === 'all'}
                    ref={(el) => { if (el) el.indeterminate = state === 'some' }}
                    onChange={() => onChange(toggleMoPick(picked, c))}
                  />
                  <span className="font-semibold">{c.mo.mo_code}</span>
                  <span className="text-[#6b7682]">· {c.wos.length} WO</span>
                  {c.wos.some((w) => waits.has(w.id)) && <AlertTriangle size={11} className="text-[#b45309]" aria-label="มีงานต้องรอขั้นก่อนหน้า" />}
                </label>
              </div>
              {isOpen && c.wos.map((w) => (
                <label key={w.id} className="flex items-center gap-1.5 pl-9 pr-2 py-1 cursor-pointer select-none">
                  <input type="checkbox" checked={picked.has(w.id)} onChange={() => onChange(toggleWoPick(picked, w.id))} />
                  <span className="font-mono">{w.wo_code}</span>
                  <span className="text-[#6b7682] truncate">{w.op_label ?? ''}</span>
                  {waits.has(w.id) && (
                    <span className="ml-auto flex items-center gap-1 text-[#b45309] whitespace-nowrap">
                      <AlertTriangle size={11} /> ต้องรอ {waits.get(w.id)}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
