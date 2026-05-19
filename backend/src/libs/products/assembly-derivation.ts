import { parseProfile, VariantAttributes } from './profile-parser'

export type PartRow = {
  profile: string | null
  grade: string | null
  length_mm: number | null
  qty: number
}

export type DerivationResult = {
  attrs: VariantAttributes
  flags: string[]
  confidence: 'high' | 'medium' | 'low'
  markPrefix: string
}

// Tekla type code → structural shape family
// Derived from tekla_prefix_mapping seed + mark_prefix_master categories
const TEKLA_TO_SHAPE: Record<string, 'H' | 'L' | 'PIPE' | 'RB' | 'PL' | 'TRUSS' | 'OTHER'> = {
  CO: 'H', SC: 'H', P: 'H', PO: 'H',
  RA: 'H', RF: 'H', B: 'H', BE: 'H', SBE: 'H', SB: 'H',
  CA: 'H', CN: 'H', FR: 'H', MZ: 'H',
  VB: 'H', HB: 'H', ST: 'H',
  PU: 'H', GR: 'H', SG: 'H', GU: 'H',
  FB: 'L', ANGLE: 'L',
  PS: 'PIPE', R: 'RB',
  LP: 'PL', TR: 'TRUSS',
}

// Extract Tekla type from assembly mark
// e.g. "TH-2CO1" → "CO", "CO-001" → "CO", "TH-2FB1" → "FB"
function extractMarkPrefix(assemblyMark: string): string {
  const parts = assemblyMark.split('-')
  if (parts.length < 2) return assemblyMark.replace(/\d/g, '').toUpperCase() || assemblyMark

  // Try last segment: strip leading digit(s), take leading alpha
  const last = parts[parts.length - 1]
  const fromLast = last.replace(/^\d+/, '').match(/^[A-Z]+/i)
  if (fromLast && fromLast[0]) return fromLast[0].toUpperCase()

  // Fallback: first segment if it's all alpha (e.g. "CO-001" → "CO")
  const first = parts[0]
  const fromFirst = first.match(/^[A-Z]+/i)
  return fromFirst ? fromFirst[0].toUpperCase() : assemblyMark.toUpperCase()
}

function majorityGrade(parts: PartRow[]): { grade: string; mixed: boolean } {
  const structural = parts.filter(p => {
    if (!p.profile) return false
    const attrs = parseProfile(p.profile)
    return attrs.shape !== 'ACCESSORY' && attrs.shape !== 'UNKNOWN'
  })

  if (structural.length === 0) return { grade: 'UNKNOWN', mixed: false }

  const tally = new Map<string, number>()
  for (const p of structural) {
    const g = (p.grade ?? 'UNKNOWN').toUpperCase()
    tally.set(g, (tally.get(g) ?? 0) + 1)
  }

  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1])
  const topGrade = sorted[0][0]
  const mixed = sorted.length > 1

  return { grade: mixed ? 'MIXED' : topGrade, mixed }
}

function deriveHShape(
  parts: PartRow[],
): { derived: VariantAttributes | null; flags: string[] } {
  const flags: string[] = []

  const allLengths = parts.map(p => p.length_mm ?? 0).filter(l => l > 0)
  if (allLengths.length === 0) return { derived: null, flags: ['no_part_lengths'] }

  const bboxLength = Math.max(...allLengths)

  // Find plate parts (PL) with length >= 85% of bbox
  const longPlates = parts
    .filter(p => {
      if (!p.profile) return false
      const a = parseProfile(p.profile)
      return a.shape === 'PL' && (p.length_mm ?? 0) >= 0.85 * bboxLength
    })
    .map(p => ({ ...p, attrs: parseProfile(p.profile!) }))
    .sort((a, b) => (b.attrs.width_mm ?? 0) - (a.attrs.width_mm ?? 0))

  if (longPlates.length < 2) {
    flags.push('insufficient_long_plates')
    return { derived: null, flags }
  }

  const web = longPlates[0]
  const flange = longPlates[1]

  const webH = web.attrs.thickness_mm ?? 0
  const webW = web.attrs.width_mm ?? 0  // plate width = web height
  const flangeT = flange.attrs.thickness_mm ?? 0
  const flangeW = flange.attrs.width_mm ?? 0

  if (webW === 0 || flangeW === 0) {
    flags.push('zero_dimension')
    return { derived: null, flags }
  }

  // Sanity: web length should be close to bbox (±30%)
  if (web.length_mm && Math.abs(web.length_mm - bboxLength) / bboxLength > 0.3) {
    flags.push('bbox_geometry_mismatch')
  }

  const profile = `H${webW}x${flangeW}x${webH}x${flangeT}`

  return {
    derived: {
      shape: 'H',
      method: 'BH',
      profile,
      height_mm: webW,
      width_mm: flangeW,
      web_thickness_mm: webH,
      flange_thickness_mm: flangeT,
    },
    flags,
  }
}

export function deriveAssemblyAttrs(assemblyMark: string, parts: PartRow[]): DerivationResult {
  const markPrefix = extractMarkPrefix(assemblyMark)
  const targetShape = TEKLA_TO_SHAPE[markPrefix] ?? 'OTHER'

  const { grade, mixed } = majorityGrade(parts)
  const flags: string[] = []
  if (mixed) flags.push('mixed_grade')

  if (targetShape === 'H') {
    const { derived, flags: hFlags } = deriveHShape(parts)
    const allFlags = [...flags, ...hFlags]

    if (!derived) {
      return {
        attrs: { shape: 'H', method: 'BH' },
        flags: [...allFlags, 'derivation_failed'],
        confidence: 'low',
        markPrefix,
      }
    }

    const confidence = allFlags.length === 0 ? 'high' : 'medium'
    return { attrs: { ...derived, grade }, flags: allFlags, confidence, markPrefix }
  }

  if (targetShape === 'L') {
    const lPart = parts.find(p => p.profile && parseProfile(p.profile).shape === 'L')
    if (lPart) {
      const attrs = parseProfile(lPart.profile!)
      const lFlags = [...flags]
      return {
        attrs: { ...attrs, grade },
        flags: lFlags,
        confidence: lFlags.length === 0 ? 'high' : 'medium',
        markPrefix,
      }
    }
    return {
      attrs: { shape: 'L', method: 'ANG', grade },
      flags: [...flags, 'derivation_failed'],
      confidence: 'low',
      markPrefix,
    }
  }

  if (targetShape === 'PIPE') {
    const pp = parts.find(p => p.profile && parseProfile(p.profile).shape === 'PIPE')
    if (pp) {
      return { attrs: { ...parseProfile(pp.profile!), grade }, flags, confidence: 'high', markPrefix }
    }
  }

  if (targetShape === 'RB') {
    const rp = parts.find(p => p.profile && parseProfile(p.profile).shape === 'RB')
    if (rp) {
      return { attrs: { ...parseProfile(rp.profile!), grade }, flags, confidence: 'high', markPrefix }
    }
  }

  // Fallback: return structural attrs from first non-accessory part
  const first = parts.find(p => {
    if (!p.profile) return false
    const a = parseProfile(p.profile)
    return a.shape !== 'ACCESSORY' && a.shape !== 'UNKNOWN'
  })

  if (first) {
    return {
      attrs: { ...parseProfile(first.profile!), grade },
      flags: [...flags, 'shape_fallback'],
      confidence: 'medium',
      markPrefix,
    }
  }

  return {
    attrs: { shape: 'UNKNOWN', method: 'UNKNOWN', grade },
    flags: [...flags, 'no_structural_parts'],
    confidence: 'low',
    markPrefix,
  }
}
