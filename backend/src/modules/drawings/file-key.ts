// Mirrors the frontend's drawingKey() (src/api/drawings.ts) EXACTLY — same
// sanitisation, same "sub-zone without a code drops the segment entirely"
// behaviour — so DrawingsService.create can rebuild the file_key its own
// upload flow would have produced and reject anything else BEFORE touching
// storage with a client-supplied key (security review, 2026-10-20: the DTO's
// file_key regex only checks shape, so an authenticated user could otherwise
// point create() at another project/zone's object by file_key alone).
const sanitizeKeySegment = (s: string) => s.replace(/[/\\]/g, '_')

export function buildExpectedFileKey(
  scope: { projectCode: string; zoneCode: string; subZoneCode: string | null },
  mark: string,
  rev: number,
  fileName: string,
): string {
  const safeMark = sanitizeKeySegment(mark)
  const safeName = sanitizeKeySegment(fileName)
  const subZoneSegment = scope.subZoneCode ? `${scope.subZoneCode}/` : ''
  return `drawings/${scope.projectCode}/${scope.zoneCode}/${subZoneSegment}${safeMark}/rev${rev}/${safeName}`
}
