import type { ScheduleBoard } from '../../api/schedule'

/**
 * One warning line per PAUSED WO — a paused WO does not hold a line in the scheduler, so the
 * planner sees why it stopped (reason typed at Pause) and that its line may not be free.
 */
export function pausedWarnings(board: ScheduleBoard): string[] {
  const wcCode = new Map(board.work_centers.map((w) => [w.id, w.code]))
  return board.work_orders
    .filter((w) => w.status === 'PAUSED')
    .map((w) => {
      const where = `${w.wo_code} · ${wcCode.get(w.work_center_id) ?? '-'}`
      if (!w.pause?.reason) return `${where} — ไม่ได้ระบุเหตุผล`
      const d = new Date(Date.parse(w.pause.at) + 7 * 3_600_000)
      return `${where} — ${w.pause.reason} (${w.pause.by} · ${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()})`
    })
}
