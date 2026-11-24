import { describe, expect, it } from 'vitest'
import { formatHoles } from './JobSheetModal'

// "พิมพ์ใบงานต่อชิ้น" modal spec (partly todo; not yet run under Vitest).
// Follow DrawingRevNotice.test.tsx for the render + mocked-API pattern
// when the todos are filled in.
describe('JobSheetModal', () => {
  it('formatHoles: unknown hole data is not the same as zero holes', () => {
    expect(formatHoles([], false)).toBe('ไม่มีข้อมูล')
    expect(formatHoles([{ diameter_mm: 22, count: 4 }, { diameter_mm: 18, count: 2 }], true)).toBe('4×Ø22, 2×Ø18')
  })

  it.todo('loads the preview on open and shows the totals line (sheets · part marks · pieces · kg)')
  it.todo('switching รูปแบบ to "1 ใบต่อ Part Mark" refetches the preview with mode=part')
  it.todo('woIds scopes the request (wo_ids=…) and the subtitle says it is for that WO')
  it.todo('409 JOB_SHEET_TOO_MANY shows the server message and disables both PDF buttons')
  it.todo('ดูตัวอย่าง PDF renders the blob in an iframe; changing language drops it')
  it.todo('พิมพ์ใบงานต่อชิ้น opens the blob in a new tab')
  it.todo('warning strip appears when any sheet lacks hole data / drawing / routing')
  it.todo('zoneId (zone batch) calls /mo/job-sheets/zone/:zoneId/preview, shows the MO column and the MO / skipped-MO line')
  it.todo('zone batch with subZones shows the Sub-zone select; choosing one refetches with sub_zone_id and drops an open PDF; no subZones = no select')
})
