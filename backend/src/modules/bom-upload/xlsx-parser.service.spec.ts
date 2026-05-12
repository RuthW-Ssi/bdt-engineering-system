import { BadRequestException } from '@nestjs/common'
import * as XLSX from 'xlsx'
import { XlsxParserService } from './xlsx-parser.service'

const svc = new XlsxParserService()

function makeBuffer(headers: string[], rows: (string | number)[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

// ─── ASSEMBLY_LIST ────────────────────────────────────────────────────────────

describe('XlsxParserService — ASSEMBLY_LIST', () => {
  it('parses standard headers', () => {
    const buf = makeBuffer(
      ['Assembly Mark', 'Name', 'Qty', 'Weight (kg)', 'Surface Area (m2)'],
      [
        ['WH-CO-001', 'Column A', 2, 1500.5, 12.3],
        ['WH-CO-002', 'Column B', 1, 800, 7.5],
      ],
    )
    const result = svc.parse(buf, 'ASSEMBLY_LIST')

    expect(result.assemblies).toHaveLength(2)
    expect(result.assemblies[0]).toMatchObject({
      assembly_mark: 'WH-CO-001',
      name: 'Column A',
      qty: 2,
      weight_kg: 1500.5,
      surface_area_m2: 12.3,
    })
    expect(result.parts).toHaveLength(0)
    expect(result.assemblyParts).toHaveLength(0)
  })

  it('handles missing optional columns gracefully', () => {
    const buf = makeBuffer(
      ['Mark'],
      [['WH-BM-001'], ['WH-BM-002']],
    )
    const result = svc.parse(buf, 'ASSEMBLY_LIST')

    expect(result.assemblies).toHaveLength(2)
    expect(result.assemblies[0].name).toBeUndefined()
    expect(result.assemblies[0].weight_kg).toBeUndefined()
  })

  it('skips completely empty rows', () => {
    const buf = makeBuffer(
      ['Assembly Mark', 'Name'],
      [['WH-CO-001', 'Col A'], ['', ''], ['WH-CO-002', 'Col B']],
    )
    const result = svc.parse(buf, 'ASSEMBLY_LIST')
    expect(result.assemblies).toHaveLength(2)
  })

  it('throws BadRequestException when no assembly mark column found', () => {
    const buf = makeBuffer(['Description', 'Qty'], [['Some item', 1]])
    expect(() => svc.parse(buf, 'ASSEMBLY_LIST')).toThrow(BadRequestException)
  })
})

// ─── PART_LIST ────────────────────────────────────────────────────────────────

describe('XlsxParserService — PART_LIST', () => {
  it('parses standard headers', () => {
    const buf = makeBuffer(
      ['Part Mark', 'Description', 'Profile', 'Grade', 'Qty', 'Length (mm)', 'Weight (kg)'],
      [
        ['WH-CO-001-P01', 'Web Plate', 'PL6x850', 'SS400', 1, 6000, 228.18],
        ['WH-CO-001-P02', 'Top Flange', 'PL8x175', 'SS400', 2, 8000, 92.62],
      ],
    )
    const result = svc.parse(buf, 'PART_LIST')

    expect(result.parts).toHaveLength(2)
    expect(result.parts[0]).toMatchObject({
      part_mark: 'WH-CO-001-P01',
      description: 'Web Plate',
      profile: 'PL6x850',
      grade: 'SS400',
      qty: 1,
      length_mm: 6000,
      weight_kg: 228.18,
    })
    expect(result.assemblies).toHaveLength(0)
    expect(result.assemblyParts).toHaveLength(0)
  })

  it('throws BadRequestException when no part mark column found', () => {
    const buf = makeBuffer(['Description', 'Grade'], [['Plate', 'SS400']])
    expect(() => svc.parse(buf, 'PART_LIST')).toThrow(BadRequestException)
  })
})

// ─── ASSEMBLY_PART_LIST ───────────────────────────────────────────────────────

describe('XlsxParserService — ASSEMBLY_PART_LIST', () => {
  it('parses assembly-part mapping', () => {
    const buf = makeBuffer(
      ['Assembly Mark', 'Part Mark', 'Qty'],
      [
        ['WH-CO-001', 'WH-CO-001-P01', 4],
        ['WH-CO-001', 'WH-CO-001-P02', 2],
        ['WH-CO-002', 'WH-CO-001-P01', 1],
      ],
    )
    const result = svc.parse(buf, 'ASSEMBLY_PART_LIST')

    expect(result.assemblyParts).toHaveLength(3)
    expect(result.assemblyParts[0]).toMatchObject({
      assembly_mark: 'WH-CO-001',
      part_mark: 'WH-CO-001-P01',
      qty: 4,
      sequence: 1,
    })
    expect(result.assemblies).toHaveLength(0)
    expect(result.parts).toHaveLength(0)
  })

  it('throws BadRequestException when assembly_mark or part_mark column missing', () => {
    const buf = makeBuffer(['Assembly Mark', 'Qty'], [['WH-CO-001', 1]])
    expect(() => svc.parse(buf, 'ASSEMBLY_PART_LIST')).toThrow(BadRequestException)
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('XlsxParserService — edge cases', () => {
  it('throws BadRequestException for empty workbook', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Sheet1')
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
    expect(() => svc.parse(buf, 'ASSEMBLY_LIST')).toThrow(BadRequestException)
  })

  it('throws BadRequestException for header-only sheet (no data rows)', () => {
    const buf = makeBuffer(['Assembly Mark', 'Name'], [])
    expect(() => svc.parse(buf, 'ASSEMBLY_LIST')).toThrow(BadRequestException)
  })
})
