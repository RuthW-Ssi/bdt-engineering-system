import type { ApsPropertyItem } from './aps-client.service'

export interface ExtractedElement {
  viewerId: number
  externalId: string
  parentExternalId: string | null // set on part-level rows only — used to look up the owning assembly's mark
  mark: string | null
  globalId: string | null
  ifcType: string | null
  phase: string | null
  position: string | null // assembly-level only
  weightKg: number | null
  areaM2: number | null
  lengthMm: number | null
  widthMm: number | null
  heightMm: number | null
  properties: Record<string, unknown>
}

const PATTERNS = {
  weight: /weight/i,
  area: /^area\b|surface.?area/i,
  length: /^length\b/i,
  width: /^width\b/i,
  height: /^height\b/i,
}

// Confirmed against a real Tekla→IFC→APS translation, and cross-checked
// against a previously-built internal BIM service that already solved this
// (2026-07-20): Autodesk routes IFC through a Navisworks loader, and the
// scene-graph *depth* of `item.externalId` (a Navisworks node path like
// "0/0/0/0/12345", not the IFC GUID) is the reliable signal for what kind of
// node a collection item is:
//   depth 4 → assembly (IfcElementAssembly)
//   depth 5 → part (IfcBeam/IfcColumn/IfcPlate/IfcMechanicalfastener/...)
//   depth 6+ → geometry/representation duplicates of the depth-5 part — not
//              real distinct elements, discard (verified: depth-6 count
//              exactly equals depth-5 count, i.e. one dup per part)
// Field groups (also confirmed against the same prior service): identity
// (GLOBALID/TAG) lives in the "IFC" group; Tekla puts its own quantities in
// "Tekla Quantity" and phase in "Tekla Common" — prefer those over the
// generic IFC "Quantities" group, which the prior service never even reads.
const ASSEMBLY_DEPTH = 4
const PART_DEPTH = 5

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const n = parseFloat(value.replace(/[^\d.-]/g, ''))
    return isNaN(n) ? null : n
  }
  return null
}

function depthOf(externalId: string): number {
  return externalId ? externalId.split('/').length - 1 : -1
}

// Truncates a part's externalId down to its parent assembly's externalId
// (e.g. "0/0/0/0/12345/67" → "0/0/0/0/12345").
function parentExternalIdOf(externalId: string): string {
  return externalId.split('/').slice(0, ASSEMBLY_DEPTH + 1).join('/')
}

export function extractElement(item: ApsPropertyItem): ExtractedElement | null {
  const externalId = item.externalId ?? ''
  const depth = depthOf(externalId)
  if (depth !== ASSEMBLY_DEPTH && depth !== PART_DEPTH) return null

  const groups = item.properties ?? {}
  const ifcGroup = (groups['IFC'] ?? {}) as Record<string, unknown>
  const teklaQuantity = groups['Tekla Quantity'] as Record<string, unknown> | undefined
  const teklaCommon = groups['Tekla Common'] as Record<string, unknown> | undefined
  const teklaAssembly = groups['Tekla Assembly'] as Record<string, unknown> | undefined

  // Fallback flatten for exports that don't use Tekla's group naming (no
  // "Tekla Quantity"/"Tekla Common") — scan every group for the same keys.
  const flat: Record<string, unknown> = {}
  for (const group of Object.values(groups)) {
    if (group && typeof group === 'object') Object.assign(flat, group)
  }
  const findByPattern = (pattern: RegExp): unknown => {
    const key = Object.keys(flat).find(k => pattern.test(k))
    return key ? flat[key] : undefined
  }
  const quantitySource = teklaQuantity ?? flat
  const find = (source: Record<string, unknown>, pattern: RegExp) => {
    const key = Object.keys(source).find(k => pattern.test(k))
    return key ? source[key] : undefined
  }

  const itemType = (groups['Item'] as Record<string, unknown> | undefined)?.['Type'] as string | undefined
  const ifcType = depth === ASSEMBLY_DEPTH
    ? 'IfcElementAssembly'
    : itemType && /^IFC[A-Z]+$/.test(itemType)
      ? `Ifc${itemType.slice(3).toLowerCase().replace(/^./, c => c.toUpperCase())}`
      : null

  return {
    viewerId: item.objectid,
    externalId,
    parentExternalId: depth === PART_DEPTH ? parentExternalIdOf(externalId) : null,
    mark: (ifcGroup['TAG'] as string | undefined) ?? item.name ?? null,
    globalId: (ifcGroup['GLOBALID'] as string | undefined) ?? null,
    ifcType,
    phase: (teklaCommon?.['Phase'] as string | undefined) ?? (findByPattern(/^phase$/i) as string | undefined) ?? null,
    position: depth === ASSEMBLY_DEPTH ? (teklaAssembly?.['Assembly/Cast unit position code'] as string | undefined) ?? null : null,
    weightKg: toNumber(find(quantitySource, PATTERNS.weight)),
    areaM2: toNumber(find(quantitySource, PATTERNS.area)),
    lengthMm: toNumber(find(quantitySource, PATTERNS.length)),
    widthMm: toNumber(find(quantitySource, PATTERNS.width)),
    heightMm: toNumber(find(quantitySource, PATTERNS.height)),
    properties: groups,
  }
}
