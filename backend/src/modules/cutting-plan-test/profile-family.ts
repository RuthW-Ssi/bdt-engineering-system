// CP-Shape-Test (2026-11-11): which BOM profiles are 1D cuts, under one spelling per size.
// Laid out now: PIPE and ROD (checked against CutLogic); BOX and L (2026-11-26, the other shapes in the uploaded BOMs);
// C and H (2026-11-26, the DNT DR & LADDER part list; Tekla also writes "H-200X100X5.5X8"). No CutLogic run of the
// newer four to check against yet. I and FB are in no BOM: switch them on (enabled: true) once one comes in.
// A sleeve pipe ("PIPE139.8X5SL", Tao 2026-11-26: cut in the shop from the same pipe) is the size of its pipe, flagged.

export interface ProfileFamily { family: string; profile: string; enabled: boolean; sleeve?: boolean }

const FAMILIES: { family: string; enabled: boolean; match: RegExp; name: (rest: string) => string }[] = [
  { family: 'PIPE', enabled: true, match: /^PIPE(.+)$/, name: r => `PIPE ${r}` },
  { family: 'ROD', enabled: true, match: /^(?:ROD)?(RB\d.*)$/, name: r => `ROD ${r}` },
  { family: 'BOX', enabled: true, match: /^(?:□|SHS|RHS|BOX)(\d.*)$/, name: r => `BOX ${r}` },
  { family: 'H', enabled: true, match: /^(?:H|WF|IH)-?(\d.*)$/, name: r => `H ${r}` },
  { family: 'I', enabled: false, match: /^I-?(\d.*)$/, name: r => `I ${r}` },
  { family: 'C', enabled: true, match: /^(?:C|U|CH)-?(\d.*)$/, name: r => `C ${r}` },
  { family: 'L', enabled: true, match: /^L(\d.*)$/, name: r => `L ${r}` },
  { family: 'FB', enabled: false, match: /^FB(\d.*)$/, name: r => `FB ${r}` },
]

const norm = (raw: string | null | undefined) => String(raw ?? '').toUpperCase().replace(/\s+/g, '').replace(/Ø/g, '')

export function classifyProfile(raw: string | null | undefined): ProfileFamily | null {
  const p = norm(raw)
  if (!p) return null
  for (const f of FAMILIES) {
    const m = f.match.exec(p)
    if (!m) continue
    const sleeve = f.family === 'PIPE' && /\dSL$/.test(m[1])
    const rest = sleeve ? m[1].slice(0, -2) : m[1]
    return { family: f.family, profile: f.name(rest), enabled: f.enabled, ...(sleeve ? { sleeve: true } : {}) }
  }
  return null
}

// Plates and bought items (couplings; PD = the turnbuckle / coupling bodies of the rod bracing, marks TURNBUCKLE / TU-1):
// known not to be cut here. Anything else that is not a family above is "unknown" and named in a warning.
export const isNotCut = (raw: string | null | undefined) => /^(PL|COUPLING|PD|TURNBUCKLE)/.test(norm(raw))

// "DBN-A3-m49" → "DBN-A3": the mark's area code, which is how CutLogic runs are grouped
export const markGroup = (mark: string) => (mark.includes('-') ? mark.slice(0, mark.lastIndexOf('-')) : mark)
