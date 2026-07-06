import { BadRequestException } from '@nestjs/common'
import * as XLSX from 'xlsx'
import { XlsxParserService, extractContractNo, stripContractPrefix, stripKnownContractPrefix } from './xlsx-parser.service'

const svc = new XlsxParserService()

function makeBuffer(headers: string[], rows: (string | number)[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

// Build a plain (non-Tekla-nested) buffer with preamble rows before the header —
// used to simulate a "ContactNo." line appearing before Assembly List / Part
// List / flat Assembly Part List headers, same as it does for the Tekla APL.
function makeBufferWithPreamble(
  preamble: (string | number)[][],
  headers: string[],
  rows: (string | number)[][],
): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([...preamble, headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

// Build a Tekla-style Assembly Part List buffer with preamble rows before the header
function makeTeklaAsmPartBuffer(
  preamble: (string | number)[][],
  dataRows: (string | number)[][],
): Buffer {
  const allRows = [...preamble, ['AssemblyPart', 'Qty'], ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(allRows)
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

// ─── Contract prefix stripping ────────────────────────────────────────────────

describe('extractContractNo', () => {
  it('extracts 5-char prefix from THEPHA header (0X181)', () => {
    const rows = [['ASSEMBLY PART LIST'], ['ContactNo.0X181Date:01.01.2026']]
    expect(extractContractNo(rows)).toBe('0X181')
  })

  it('extracts 8-char multi-segment prefix from Tennis Court header (00X220-2)', () => {
    const rows = [['ASSEMBLY PART LIST'], ['ContactNo.00X220-2Date:28.04.2026']]
    expect(extractContractNo(rows)).toBe('00X220-2')
  })

  it('returns empty string when no ContactNo row found', () => {
    const rows = [['ASSEMBLY PART LIST'], ['Some other row']]
    expect(extractContractNo(rows)).toBe('')
  })
})

describe('stripContractPrefix', () => {
  it('strips via contractNo when provided (Tennis Court 8-char)', () => {
    expect(stripContractPrefix('00X220-2TC-CO2', '00X220-2')).toBe('TC-CO2')
  })

  it('strips via contractNo when provided (THEPHA 5-char)', () => {
    expect(stripContractPrefix('0X181TH-2CO1', '0X181')).toBe('TH-2CO1')
  })

  it('falls back to regex when contractNo is empty (THEPHA 5-char, no hyphen)', () => {
    expect(stripContractPrefix('0X181TH-2CO1', '')).toBe('TH-2CO1')
  })

  it('falls back to regex when contractNo is empty (Tennis Court 8-char with hyphen)', () => {
    expect(stripContractPrefix('00X220-2TC-CO2', '')).toBe('TC-CO2')
  })

  it('falls back to regex for part mark with hyphen prefix (00X220-2TC-w9)', () => {
    expect(stripContractPrefix('00X220-2TC-w9', '')).toBe('TC-w9')
  })

  it('returns mark unchanged when neither method strips it', () => {
    expect(stripContractPrefix('TC-CO2', '')).toBe('TC-CO2')
  })
})

describe('XlsxParserService — Tekla Assembly Part List contract prefix', () => {
  it('strips 5-char prefix (THEPHA: 0X181TH-2CO1 → TH-2CO1)', () => {
    const buf = makeTeklaAsmPartBuffer(
      [['ASSEMBLY PART LIST'], ['ContactNo.0X181Date:01.01.2026']],
      [
        ['0X181TH-2CO1', ''],
        ['0X181TH-2CO1-P01', 2],
      ],
    )
    const result = svc.parse(buf, 'ASSEMBLY_PART_LIST')
    expect(result.assemblyParts).toHaveLength(1)
    expect(result.assemblyParts[0].assembly_mark).toBe('TH-2CO1')
  })

  it('strips 8-char prefix from BOTH assembly_mark and part_mark (Tennis Court)', () => {
    const buf = makeTeklaAsmPartBuffer(
      [['ASSEMBLY PART LIST'], ['ContactNo.00X220-2Date:28.04.2026']],
      [
        ['00X220-2TC-FB1', ''],        // assembly header row
        ['00X220-2TC-FB1', 1],         // part row (same mark in this file format)
        ['---', ''],
        ['00X220-2TC-FB2', ''],
        ['00X220-2TC-FB2', 1],
      ],
    )
    const result = svc.parse(buf, 'ASSEMBLY_PART_LIST')
    expect(result.assemblyParts).toHaveLength(2)
    expect(result.assemblyParts[0].assembly_mark).toBe('TC-FB1')
    expect(result.assemblyParts[0].part_mark).toBe('TC-FB1')  // part_mark also stripped
    expect(result.assemblyParts[1].assembly_mark).toBe('TC-FB2')
    expect(result.assemblyParts[1].part_mark).toBe('TC-FB2')
  })

  it('falls back to regex when ContactNo not in preamble', () => {
    const buf = makeTeklaAsmPartBuffer(
      [['ASSEMBLY PART LIST']],
      [
        ['0X181TH-2CO1', ''],
        ['0X181TH-2CO1-P01', 2],
      ],
    )
    const result = svc.parse(buf, 'ASSEMBLY_PART_LIST')
    expect(result.assemblyParts).toHaveLength(1)
    expect(result.assemblyParts[0].assembly_mark).toBe('TH-2CO1')
  })
})

// ─── Contract prefix symmetry across file types ───────────────────────────────
// Assembly List / Part List / flat Assembly Part List used to never strip a
// contract-number prefix at all (only the Tekla-nested Assembly Part List did),
// so a mark like "00X220-2TC-FB1" in the Assembly List wouldn't match the
// stripped "TC-FB1" produced from the same physical assembly's Tekla APL row —
// silently dropping the bom_assembly_part junction between them. These three
// parsers now call stripKnownContractPrefix (safe subset of stripContractPrefix,
// no regex fallback) so all files resolve the same mark for the same assembly.

describe('stripKnownContractPrefix', () => {
  it('strips when mark starts with the given contractNo', () => {
    expect(stripKnownContractPrefix('00X220-2TC-FB1', '00X220-2')).toBe('TC-FB1')
  })

  it('leaves mark unchanged when contractNo is empty', () => {
    expect(stripKnownContractPrefix('WH-CO-001', '')).toBe('WH-CO-001')
  })

  it('leaves mark unchanged when mark does not start with contractNo (no regex fallback)', () => {
    expect(stripKnownContractPrefix('WH-CO-001', '00X220-2')).toBe('WH-CO-001')
  })
})

describe('XlsxParserService — contract prefix symmetry across file types', () => {
  it('strips a known contract prefix from ASSEMBLY_LIST marks', () => {
    const buf = makeBufferWithPreamble(
      [['ASSEMBLY LIST'], ['ContactNo.00X220-2Date:28.04.2026']],
      ['Assembly Mark', 'Name'],
      [['00X220-2TC-FB1', 'Footing 1']],
    )
    const result = svc.parse(buf, 'ASSEMBLY_LIST')
    expect(result.assemblies[0].assembly_mark).toBe('TC-FB1')
  })

  it('strips a known contract prefix from PART_LIST marks', () => {
    const buf = makeBufferWithPreamble(
      [['PART LIST'], ['ContactNo.00X220-2Date:28.04.2026']],
      ['Part Mark', 'Description'],
      [['00X220-2TC-FB1-P01', 'Base Plate']],
    )
    const result = svc.parse(buf, 'PART_LIST')
    expect(result.parts[0].part_mark).toBe('TC-FB1-P01')
  })

  it('strips a known contract prefix from both marks in flat ASSEMBLY_PART_LIST', () => {
    const buf = makeBufferWithPreamble(
      [['ASSEMBLY PART LIST'], ['ContactNo.00X220-2Date:28.04.2026']],
      ['Assembly Mark', 'Part Mark', 'Qty'],
      [['00X220-2TC-FB1', '00X220-2TC-FB1-P01', 4]],
    )
    const result = svc.parse(buf, 'ASSEMBLY_PART_LIST')
    expect(result.assemblyParts[0]).toMatchObject({ assembly_mark: 'TC-FB1', part_mark: 'TC-FB1-P01' })
  })

  it('regression: leaves ordinary marks unchanged when no ContactNo preamble is present', () => {
    // Guards against the risky regex-fallback path (only in stripContractPrefix)
    // ever being applied here — stripKnownContractPrefix has no such fallback,
    // so a plain mark like "WH-CO-001" must never be mangled.
    const buf = makeBuffer(['Assembly Mark'], [['WH-CO-001']])
    const result = svc.parse(buf, 'ASSEMBLY_LIST')
    expect(result.assemblies[0].assembly_mark).toBe('WH-CO-001')
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
