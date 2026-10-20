// Tekla shop-drawing export names: "<mark> - <name> - Rev <n>.pdf"
// (CELESTICA: "2BUH1A-1 - BEAM - Rev 2.pdf"; Smash golf:
// "DBN-B1-CTR1 - 1 -  - Rev 1.pdf"). Mark = before the first " - " — the
// same split markDrawingVersions/mark-drawing-match always used, so CTR1
// never matches CTR10. Rev: blank "Rev " = first issue = 0; a missing Rev
// token is unparsed (the upload review table makes the user type it).
// Twin of the backfill regex in migration *_drawing_mark_rev — keep in sync.
const REV_TAIL = /(?:^|[\s-])rev\.?\s*(?:rev\.?\s*)?(\d*)\s*$/i

export function parseDrawingFileName(fileName: string): { mark: string | null; rev: number | null } {
  const base = fileName.replace(/\.[^.]+$/, '')
  const mark = base.includes(' - ') ? base.split(' - ')[0].trim() || null : null
  const m = REV_TAIL.exec(base)
  const rev = !m ? null : m[1] === '' ? 0 : Number(m[1])
  return { mark, rev }
}
