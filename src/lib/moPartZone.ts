// Warn (never block) when a file's name says "ZONE n" but the MO Part's zone
// is a different number. Leading zeros and spacing are ignored; a zone whose
// code/label has no number can't be compared, so it never warns.
export function fileZoneMismatch(filename: string, zone: { code: string; label: string }): string | null {
  const m = /zone\s*0*(\d+)/i.exec(filename)
  if (!m) return null
  const zoneNumbers = `${zone.code} ${zone.label}`.match(/\d+/g)?.map(n => String(Number(n))) ?? []
  if (!zoneNumbers.length) return null
  return zoneNumbers.includes(m[1]) ? null : m[1]
}
