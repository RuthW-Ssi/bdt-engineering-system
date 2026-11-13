// CP-Shape-Test (2026-11-11): which BOM profiles are 1D cuts, under one spelling per size.
// Laid out now: PIPE and ROD (checked against CutLogic). The other linear shapes are listed so they can be switched
// on (enabled: true) once a CutLogic run of that shape has been checked. Plates (PL) and bought items are not 1D cuts.

export interface ProfileFamily { family: string; profile: string; enabled: boolean }

const FAMILIES: { family: string; enabled: boolean; match: RegExp; name: (rest: string) => string }[] = [
  { family: 'PIPE', enabled: true, match: /^PIPE(.+)$/, name: r => `PIPE ${r}` },
  { family: 'ROD', enabled: true, match: /^(?:ROD)?(RB\d.*)$/, name: r => `ROD ${r}` },
  { family: 'BOX', enabled: false, match: /^(?:□|SHS|RHS|BOX)(\d.*)$/, name: r => `BOX ${r}` },
  { family: 'H', enabled: false, match: /^(?:H|WF|IH)(\d.*)$/, name: r => `H ${r}` },
  { family: 'I', enabled: false, match: /^I(\d.*)$/, name: r => `I ${r}` },
  { family: 'C', enabled: false, match: /^(?:C|U|CH)(\d.*)$/, name: r => `C ${r}` },
  { family: 'L', enabled: false, match: /^L(\d.*)$/, name: r => `L ${r}` },
  { family: 'FB', enabled: false, match: /^FB(\d.*)$/, name: r => `FB ${r}` },
]

export function classifyProfile(raw: string | null | undefined): ProfileFamily | null {
  const p = String(raw ?? '').toUpperCase().replace(/\s+/g, '').replace(/Ø/g, '')
  if (!p) return null
  for (const f of FAMILIES) {
    const m = f.match.exec(p)
    if (m) return { family: f.family, profile: f.name(m[1]), enabled: f.enabled }
  }
  return null
}

// "DBN-A3-m49" → "DBN-A3": the mark's area code, which is how CutLogic runs are grouped
export const markGroup = (mark: string) => (mark.includes('-') ? mark.slice(0, mark.lastIndexOf('-')) : mark)
