export interface NcFileParsed {
  partMark: string
  grade: string | null
  qty: number
  profileBase: string | null
  lengthMm: number | null
  widthMm: number | null
  thicknessMm: number | null
  weightKg: number | null
}

/**
 * Parse a Tekla NC1 file.
 *
 * Layout (0-indexed lines):
 *   0: ST
 *   1: ** <filename>
 *   3: <part_mark>
 *   6: <grade>
 *   7: <qty>   ← canonical total (line 8 in 1-indexed docs)
 *   8: <profile base>
 *   B: marker line
 *   B+1: length_mm
 *   B+2: width_mm
 *   B+3: thickness_mm
 *   B+7: weight_kg
 */
export function parseNcFile(filename: string, content: string): NcFileParsed {
  const partMark = filename.replace(/\.nc1$/i, '')
  const lines = content.split('\n').map(l => l.trimEnd())

  const grade = lines[6]?.trim() || null
  const qty = parseInt(lines[7]?.trim() ?? '0', 10) || 0
  const profileBase = lines[8]?.trim() || null

  const bIdx = lines.findIndex(l => l.trim() === 'B')

  const pf = (v: string | undefined): number | null => {
    const n = parseFloat(v?.trim() ?? '')
    return isNaN(n) || n === 0 ? null : n
  }

  let lengthMm: number | null = null
  let widthMm: number | null = null
  let thicknessMm: number | null = null
  let weightKg: number | null = null

  if (bIdx >= 0) {
    lengthMm = pf(lines[bIdx + 1])
    widthMm = pf(lines[bIdx + 2])
    thicknessMm = pf(lines[bIdx + 3])
    weightKg = pf(lines[bIdx + 7])
  }

  return { partMark, grade, qty, profileBase, lengthMm, widthMm, thicknessMm, weightKg }
}
