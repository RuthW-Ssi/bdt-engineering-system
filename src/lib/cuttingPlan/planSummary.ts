// What one cutting plan is made of (2026-11-07): where its steel goes and which plate thicknesses
// it uses. One plan = one project zone, so this is composition (parts of a whole), never averages.
import type { CuttingPlanNestingRow, CuttingPlanRemnantRow } from '../../api/cutting-plan'

export interface ThicknessGroup { thick: number; plates: number; kg: number; minutes: number }
export interface PlateSize { thick: number; width: number; length: number; plates: number }
export interface RemnantSize { thick: number; width: number; length: number; pieces: number } // thick from its plate
export interface PlanSummary {
  plates: number
  // Whole sheets = partsKg + scrapKg + remnantKg. A plate's report weight covers only the nested piece
  // (Nesting Dim.); the rest of the sheet is that plate's remnants. Checked 2026-11-07 on 254 real plates:
  // weight + remnants = thickness × width × length × 7.85 on every one.
  steelKg: number
  partsKg: number // nested piece × nesting % (= the report's net)
  scrapKg: number // nested piece − parts (= gross − net: kerf, skeleton, offcuts)
  remnantKg: number
  byThickness: ThicknessGroup[] // thinnest first: thickness is an ordered scale, not a ranking
  machineMin: number // planned machine time from each plate's report
  plateSizes: PlateSize[] // stock plates to pick, most used first
  remnantPieces: number
  remnantM2: number
  remnantSizes: RemnantSize[] // most common first
}

const n = (v: number | string | null | undefined) => (v == null || v === '' ? 0 : Number(v) || 0)

export function summarizePlan(nestings: CuttingPlanNestingRow[], remnants: CuttingPlanRemnantRow[]): PlanSummary {
  let pieceKg = 0, partsKg = 0, plates = 0, machineMin = 0
  const groups = new Map<number, ThicknessGroup>()
  const stock = new Map<string, PlateSize>()
  const thickOf = new Map<string, number>() // plate name → thickness, for its remnants
  for (const r of nestings) {
    const count = r.count ?? 1
    const kg = n(r.weight_kg)
    plates += count
    pieceKg += kg
    partsKg += (kg * n(r.nesting_percent)) / 100
    const minutes = n(r.total_time_min)
    machineMin += minutes
    const thick = n(r.thick_mm)
    thickOf.set(r.cuttingplan_number, thick)
    const g = groups.get(thick) ?? { thick, plates: 0, kg: 0, minutes: 0 }
    g.plates += count
    g.kg += kg
    g.minutes += minutes
    groups.set(thick, g)
    const width = n(r.width_mm), length = n(r.length_mm)
    const key = `${thick}x${width}x${length}`
    const size = stock.get(key) ?? { thick, width, length, plates: 0 }
    size.plates += count
    stock.set(key, size)
  }

  let remnantKg = 0, remnantPieces = 0, remnantM2 = 0
  const sizes = new Map<string, RemnantSize>()
  for (const r of remnants) {
    const count = r.count ?? 1
    remnantKg += n(r.weight_kg)
    remnantPieces += count
    remnantM2 += n(r.area_m2)
    const width = n(r.width_mm), length = n(r.length_mm), thick = thickOf.get(r.cuttingplan_number) ?? 0
    const g = thickOf.has(r.cuttingplan_number) ? groups.get(thick) : undefined
    if (g) g.kg += n(r.weight_kg) // the sheet's steel includes its remnants
    const key = `${thick}x${width}x${length}`
    const s = sizes.get(key) ?? { thick, width, length, pieces: 0 }
    s.pieces += count
    sizes.set(key, s)
  }

  return {
    plates,
    steelKg: pieceKg + remnantKg,
    partsKg,
    scrapKg: Math.max(0, pieceKg - partsKg),
    remnantKg,
    byThickness: [...groups.values()].sort((a, b) => a.thick - b.thick),
    machineMin,
    plateSizes: [...stock.values()].sort((a, b) => b.plates - a.plates || a.thick - b.thick || a.length - b.length),
    remnantPieces,
    remnantM2,
    remnantSizes: [...sizes.values()].sort((a, b) => b.pieces - a.pieces || b.length - a.length),
  }
}

// Whole-sheet weight per plate name: the report's plate weight covers only the nested piece, the rest
// of the sheet is that plate's remnants (see PlanSummary.steelKg).
export function sheetKgByPlate(nestings: CuttingPlanNestingRow[], remnants: CuttingPlanRemnantRow[]): Map<string, number> {
  const out = new Map(nestings.map(r => [r.cuttingplan_number, n(r.weight_kg)]))
  for (const r of remnants) {
    const kg = out.get(r.cuttingplan_number)
    if (kg != null) out.set(r.cuttingplan_number, kg + n(r.weight_kg))
  }
  return out
}
