import type { NcDetail } from '../../bom-upload/nc-parser'
import type { PartLineInput } from './part-lines'

// NC source (round 3 §A): one MO Part line per part mark. Plates are named
// PL<t>x<width> like the Material List; weight is the per-piece weight from
// the contour (never the NC kg/m² line). Warnings never block.
export function ncDetailsToLines(details: NcDetail[]): { lines: PartLineInput[]; warnings: string[] } {
  const lines: PartLineInput[] = []
  const warnings: string[] = []
  const jobs = new Map<string, number>()
  for (const d of details) if (d.orderNo) jobs.set(d.orderNo, (jobs.get(d.orderNo) ?? 0) + 1)
  const mainJob = [...jobs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]

  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const d of details) {
    if (seen.has(d.partMark)) { dupes.add(d.partMark); continue }
    seen.add(d.partMark)
    if (!(d.qty > 0) || !(Number(d.lengthMm) > 0)) { warnings.push(`${d.partMark}: missing qty or length — skipped`); continue }
    if (mainJob && d.orderNo && d.orderNo !== mainJob) warnings.push(`${d.partMark}: job ${d.orderNo} differs from ${mainJob} (most files)`)
    if (d.pieceWeightKg == null) warnings.push(`${d.partMark}: weight could not be computed — type it`)
    const plate = d.code === 'B' && d.thicknessMm != null && d.widthMm != null
    lines.push({
      mark: null,
      part_mark: d.partMark,
      profile: plate ? `PL${d.thicknessMm}x${d.widthMm}` : (d.profileBase ?? ''),
      grade: d.grade ?? '',
      length_mm: Number(d.lengthMm),
      qty: d.qty,
      unit_weight_kg: d.pieceWeightKg == null ? null : Math.round(d.pieceWeightKg * 1000) / 1000,
      holes: d.holes,
      cut_length_mm: d.cutLengthMm == null ? null : Math.round(d.cutLengthMm * 100) / 100,
    })
  }
  for (const m of dupes) warnings.push(`${m}: appears twice — kept the first file`)
  return { lines, warnings }
}
