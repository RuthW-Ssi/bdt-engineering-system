// CP-Shape-Test (Tao 2026-11-26): plug-weld holes at a sleeve joint. A sleeve pipe sits inside two pipes at their
// joint; each pipe gets holes over the sleeve, welded full. The model has no holes or welds, so the holes are
// parameters per pipe size, with a suggestion to start from. A suggestion is only that: nothing goes on the cutting
// report until the user confirms the size's numbers (they decide the strength of the joint).
import type { SleeveJoint } from '../../api/cutting-plan-test'

export interface PlugWeld { holeDiaMm: number; holesPerSide: number; fromEndMm: number; startAngleDeg: number }
export type PlugSettings = Record<string, { params: PlugWeld; confirmed: boolean }> // by sizeKey of the pipe, e.g. "PIPE 139.8X5"
// the model writes "PIPE 216.3x4.5", the BOM "PIPE 216.3X4.5": one key
export const sizeKey = (profile: string) => profile.toUpperCase().replace(/\s+/g, ' ').trim()

// Hole: wall + 8 mm (the usual least size of a plug-weld hole), rounded up. Count: 2 on a pipe up to 115 mm, 4 above
// (a starting point, not a standard). Place: half way along the part of the sleeve inside this pipe.
export function suggestPlugWeld(odMm: number, wallMm: number | null, insertMm: number): PlugWeld {
  return { holeDiaMm: wallMm ? Math.ceil(wallMm + 8) : 14, holesPerSide: odMm > 115 ? 4 : 2, fromEndMm: Math.round(insertMm / 2), startAngleDeg: 0 }
}

// Why these numbers cannot be drilled, or null. Holes at least 4 diameters apart round the pipe (centre to centre).
export function plugWeldProblem(p: PlugWeld, odMm: number, insertMm: number): string | null {
  if (!(p.holeDiaMm > 0) || !(p.holesPerSide >= 1) || !Number.isInteger(p.holesPerSide) || !(p.fromEndMm >= 0)) return 'Enter the hole size and how many'
  const r = p.holeDiaMm / 2
  if (p.fromEndMm < r || p.fromEndMm > insertMm - r) return `Holes must sit over the sleeve: ${Math.ceil(r)} to ${Math.floor(insertMm - r)} mm from the pipe end`
  const most = Math.floor((Math.PI * odMm) / (4 * p.holeDiaMm))
  if (p.holesPerSide > most) return `Holes closer than 4 × Ø${p.holeDiaMm} round the pipe: ${most} at most`
  return null
}

export const holeAngles = (p: PlugWeld) => Array.from({ length: p.holesPerSide }, (_, i) => Math.round(((p.startAngleDeg + (360 / p.holesPerSide) * i) % 360) * 10) / 10)
const mmText = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 })
export const plugText = (p: PlugWeld) => `${p.holesPerSide} ${p.holesPerSide === 1 ? 'hole' : 'holes'} Ø${mmText(p.holeDiaMm)}, ${mmText(p.fromEndMm)} mm from the end, at ${holeAngles(p).map(a => `${a}°`).join(' ')}`

// Lines for the cutting report of one size: for each of its marks that is a pipe of a sleeve joint, which end (said by
// the pipe it is joined to — a bar has no left or right once it is on the machine) and the holes. Confirmed sizes only.
export function plugNotes(joints: SleeveJoint[], settings: PlugSettings, marks: string[]): { mark: string; text: string }[] {
  const out: { mark: string; text: string }[] = []
  for (const j of joints) for (const [i, p] of j.pipes.entries()) {
    const s = settings[sizeKey(p.profile)]
    if (!s?.confirmed) continue
    const other = j.pipes.filter((_, k) => k !== i).flatMap(o => o.marks).join(' / ') || 'the other pipe'
    for (const mark of p.marks) {
      if (!marks.includes(mark)) continue
      const text = `End joined to ${other} (sleeve ${j.sleeve.marks.join(' / ') || j.sleeve.profile} goes in ${mmText(p.insertMm)} mm): ${plugText(s.params)}`
      if (!out.some(o => o.mark === mark && o.text === text)) out.push({ mark, text })
    }
  }
  return out
}

// the settings every pipe size of the joints starts from: the suggestion for its smallest sleeve overlap
export function suggestedSettings(joints: SleeveJoint[]): PlugSettings {
  const out: PlugSettings = {}
  for (const j of joints) for (const p of j.pipes) {
    const k = sizeKey(p.profile), s = suggestPlugWeld(p.odMm, p.wallMm, p.insertMm)
    if (!out[k] || s.fromEndMm < out[k].params.fromEndMm) out[k] = { params: s, confirmed: false }
  }
  return out
}
