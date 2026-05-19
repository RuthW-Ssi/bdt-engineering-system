export type VariantAttributes = {
  shape: string
  method: string
  profile?: string
  grade?: string
  height_mm?: number
  width_mm?: number
  web_thickness_mm?: number
  flange_thickness_mm?: number
  thickness_mm?: number
  diameter_mm?: number
  outer_diameter_mm?: number
  leg_a_mm?: number
  leg_b_mm?: number
  _raw?: string
}

// H{h}x{w}x{tw}x{tf}  e.g. H300x300x10x15
const RE_H = /^H(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i
// PL{t}x{w}  e.g. PL6x950
const RE_PL = /^PL(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i
// L{a}x{b}x{t}  e.g. L75x75x6
const RE_L = /^L(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i
// PIPE{od}x{t}  e.g. PIPE139.8x2.5
const RE_PIPE = /^PIPE(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i
// RB{d} or RODRB{d}  e.g. RB22 RODRB22
const RE_RB = /^(?:ROD)?RB(\d+(?:\.\d+)?)$/i
// COUPLING or *THREAD* patterns
const RE_ACCESSORY = /^COUPLING|THREAD/i

export function parseProfile(profile: string): VariantAttributes {
  const s = profile.trim()

  if (RE_ACCESSORY.test(s)) {
    return { shape: 'ACCESSORY', method: 'ACCESSORY' }
  }

  let m: RegExpMatchArray | null

  m = s.match(RE_H)
  if (m) {
    const [, h, w, tw, tf] = m.map(Number)
    return {
      shape: 'H',
      method: 'HR',
      profile: `H${h}x${w}x${tw}x${tf}`,
      height_mm: h,
      width_mm: w,
      web_thickness_mm: tw,
      flange_thickness_mm: tf,
    }
  }

  m = s.match(RE_PL)
  if (m) {
    const [, t, w] = m.map(Number)
    return { shape: 'PL', method: 'PL', profile: `PL${t}x${w}`, thickness_mm: t, width_mm: w }
  }

  m = s.match(RE_L)
  if (m) {
    const [, a, b, t] = m.map(Number)
    return { shape: 'L', method: 'ANG', profile: `L${a}x${b}x${t}`, leg_a_mm: a, leg_b_mm: b, thickness_mm: t }
  }

  m = s.match(RE_PIPE)
  if (m) {
    const [, od, t] = m.map(Number)
    return { shape: 'PIPE', method: 'PIPE', profile: `PIPE${od}x${t}`, outer_diameter_mm: od, thickness_mm: t }
  }

  m = s.match(RE_RB)
  if (m) {
    const d = Number(m[1])
    return { shape: 'RB', method: 'BAR', profile: `RB${d}`, diameter_mm: d }
  }

  return { shape: 'UNKNOWN', method: 'UNKNOWN', _raw: s }
}
