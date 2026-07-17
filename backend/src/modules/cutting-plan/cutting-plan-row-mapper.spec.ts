import { BadRequestException } from '@nestjs/common'
import {
  mapNestingRow, mapOrderPartRow, mapPlateUsageRow, mapRemnantRow,
  dedupRemnants, buildNestingIdMap, resolveNestingId,
} from './cutting-plan-row-mapper'

// Fixtures below are a real response captured live from the Cutting Plan API
// (bdt-cuttingplan-etl-v3), file X197-Z0-5-1.txt, single plate — not guessed.
const NESTING_ROW = [
  'smoketest1', '0X197', 'Smoke Test', 'ZONE1', 'main-structure', 1, 0,
  '00009430.cld', '26.08.2025', 3870, 1465, 'JirarojS', '26.08.2025', '23:01', 'Plasma [PlainCuttingUnit]',
  'X197-Z0-5-1',
  1, 1, 11341, 'X197-Z0-5-1', 'HY370', 5, 1480, 6000, 5.75, 226, 75.37,
  'Total', 57.7, 1854, 92.7, 150.4,
]

const ORDER_PART_ROW = [
  'smoketest1', '0X197', 'Smoke Test', 'ZONE1', 'main-structure', 1, 0,
  1, '0X197', 51, 52, 52, '26.8.2025', 'A-p53 ', 140, 140, 0.6,
  'X197-Z0-5-1',
]

const PLATE_USAGE_ROW = [
  'smoketest1', '0X197', 'Smoke Test', 'ZONE1', 'main-structure', 1, 0,
  '0X197', 170.24, 225.87,
  'X197-Z0-5-1',
]

const REMNANT_ROW = [
  'smoketest1', '0X197', 'Smoke Test', 'ZONE1', 'main-structure', 1, 0,
  'R3715', 2112, 1480, 3.1, 123, 1, 11341, '11341-1',
  'X197-Z0-5-1',
]

describe('mapNestingRow', () => {
  it('maps a real captured row correctly, dropping the 7 project-meta columns', () => {
    expect(mapNestingRow(NESTING_ROW)).toEqual({
      cuttingplan_number: 'X197-Z0-5-1',
      nc_file: '00009430.cld',
      need_date: '26.08.2025',
      nesting_length_mm: 3870,
      nesting_width_mm: 1465,
      changer: 'JirarojS',
      gen_date: '26.08.2025',
      gen_time: '23:01',
      technology: 'Plasma [PlainCuttingUnit]',
      article_number: '1',
      count: 1,
      plate_number: '11341',
      charge: 'X197-Z0-5-1',
      quality: 'HY370',
      thick_mm: 5,
      width_mm: 1480,
      length_mm: 6000,
      area_m2: 5.75,
      weight_kg: 226,
      nesting_percent: 75.37,
      path_type: 'Total',
      time_min: 57.7,
      quantity: 1854,
      start_time_min: 92.7,
      total_time_min: 150.4,
    })
  })

  it('throws BadRequestException on unexpected column count (API shape drift)', () => {
    expect(() => mapNestingRow(NESTING_ROW.slice(0, -1))).toThrow(BadRequestException)
  })
})

describe('mapOrderPartRow', () => {
  it('maps a real captured row correctly', () => {
    expect(mapOrderPartRow(ORDER_PART_ROW)).toEqual({
      cuttingplan_number: 'X197-Z0-5-1',
      tag_part: 1,
      order_number: '0X197',
      item: 51,
      nested: 52,
      ordered: 52,
      due_date: '26.8.2025',
      drawing_part_no_version_no: 'A-p53',
      length_mm: 140,
      width_mm: 140,
      weight_kg: 0.6,
    })
  })
})

describe('mapPlateUsageRow', () => {
  it('maps a real captured row correctly', () => {
    expect(mapPlateUsageRow(PLATE_USAGE_ROW)).toEqual({
      cuttingplan_number: 'X197-Z0-5-1',
      order_number: '0X197',
      net_kg: 170.24,
      gross_kg: 225.87,
    })
  })
})

describe('mapRemnantRow', () => {
  it('maps a real captured row correctly', () => {
    expect(mapRemnantRow(REMNANT_ROW)).toEqual({
      cuttingplan_number: 'X197-Z0-5-1',
      plate_number: 'R3715',
      length_mm: 2112,
      width_mm: 1480,
      area_m2: 3.1,
      weight_kg: 123,
      count: 1,
      ref_plate: '11341',
      ref_plate_seq: '11341-1',
    })
  })
})

describe('dedupRemnants', () => {
  it('collapses the known double-concat bug: 2 identical rows -> 1', () => {
    const row = mapRemnantRow(REMNANT_ROW)
    expect(dedupRemnants([row, row])).toEqual([row])
  })

  it('keeps a single genuine remnant (no duplicate) as-is', () => {
    const row = mapRemnantRow(REMNANT_ROW)
    expect(dedupRemnants([row])).toEqual([row])
  })

  it('degrades gracefully on an odd count (keeps at least 1, does not drop everything)', () => {
    const row = mapRemnantRow(REMNANT_ROW)
    expect(dedupRemnants([row, row, row])).toEqual([row])
  })

  it('keeps genuinely distinct remnants separate', () => {
    const a = mapRemnantRow(REMNANT_ROW)
    const b = { ...a, plate_number: 'R9999' }
    expect(dedupRemnants([a, b])).toEqual([a, b])
  })
})

describe('nesting_id resolution', () => {
  it('resolves a matching cuttingplan_number to its nesting id', () => {
    const map = buildNestingIdMap([{ id: 42, cuttingplan_number: 'X197-Z0-5-1' }])
    expect(resolveNestingId('X197-Z0-5-1', map)).toBe(42)
  })

  it('returns null when there is no match', () => {
    const map = buildNestingIdMap([{ id: 42, cuttingplan_number: 'X197-Z0-5-1' }])
    expect(resolveNestingId('unknown-mark', map)).toBeNull()
  })
})
