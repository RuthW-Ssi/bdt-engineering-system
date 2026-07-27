import { buildAssemblyStatusMap, buildDiffColorMap, buildDiffFocusRequest } from './diffBimMatch'
import { DIFF_STATUS_META } from '../../components/bom/diffStatusMeta'
import type { DiffRowDto, AssemblyDiffItemDto } from '../../api/dispatches'

const asm = (mark: string): AssemblyDiffItemDto => ({
  assembly_mark: mark, name: null, qty: null, weight_kg: null,
  surface_area_m2: null, length_mm: null, width_mm: null, height_mm: null,
})

describe('buildAssemblyStatusMap', () => {
  it('maps mark -> status, preferring curr over prev', () => {
    const rows: DiffRowDto<AssemblyDiffItemDto>[] = [
      { status: 'added', prev: null, curr: asm('TC-BR1') },
      { status: 'removed', prev: asm('TC-CO1'), curr: null },
      { status: 'changed', prev: asm('TC-FB1'), curr: asm('TC-FB1') },
    ]
    const map = buildAssemblyStatusMap(rows)
    expect(map.get('TC-BR1')).toBe('added')
    expect(map.get('TC-CO1')).toBe('removed')
    expect(map.get('TC-FB1')).toBe('changed')
    expect(map.size).toBe(3)
  })
})

describe('buildDiffColorMap', () => {
  const statusByMark = buildAssemblyStatusMap([
    { status: 'added', prev: null, curr: asm('TC-BR1') },
    { status: 'changed', prev: asm('TC-FB1'), curr: asm('TC-FB1') },
  ])

  it('colors every global_id for a mark with a known diff status, using the real palette', () => {
    const map = buildDiffColorMap({ 'TC-BR1': ['g1', 'g2'] }, statusByMark)
    expect(map.get('g1')).toBe(DIFF_STATUS_META.added.color)
    expect(map.get('g2')).toBe(DIFF_STATUS_META.added.color)
  })

  it('skips a mark present in matches but absent from statusByMark', () => {
    const map = buildDiffColorMap({ PU3: ['g-purlin'] }, statusByMark)
    expect(map.has('g-purlin')).toBe(false)
  })

  it('returns an empty map when matches is undefined', () => {
    expect(buildDiffColorMap(undefined, statusByMark).size).toBe(0)
  })
})

describe('buildDiffFocusRequest', () => {
  it('returns null when mark is null', () => {
    expect(buildDiffFocusRequest({ 'TC-FB1': ['g1'] }, null)).toBeNull()
  })

  it('returns the matched global_ids for a known mark', () => {
    expect(buildDiffFocusRequest({ 'TC-FB1': ['g1', 'g2'] }, 'TC-FB1')).toEqual({ globalIds: ['g1', 'g2'], hideRest: false })
  })

  it('returns an empty globalIds array (not null) when the mark has no match in this model — BimViewport treats this as "clear selection / show all"', () => {
    expect(buildDiffFocusRequest({ 'TC-FB1': ['g1'] }, 'TC-BR1')).toEqual({ globalIds: [], hideRest: false })
  })

  it('returns an empty globalIds array when matches itself is undefined', () => {
    expect(buildDiffFocusRequest(undefined, 'TC-FB1')).toEqual({ globalIds: [], hideRest: false })
  })
})
