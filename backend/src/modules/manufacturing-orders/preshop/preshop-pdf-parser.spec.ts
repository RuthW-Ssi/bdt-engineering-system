// Rows below are the Bill of Material rows of Celestica Phase 3 (BUILD UP).pdf
// (Tekla Structures 2024), rebuilt by pdfRows() — page 4 and page 1.
import { parseBomRows, checkPdfUploads } from './preshop-pdf-parser'

const PAGE4 = [
  'ASSEMBLY PART LENGTH WEIGHT (Kg) SURFACE',
  "DESCRIPTION MAT'L Q'TY 2 REMARK",
  'MARK No. (mm.) UNIT TOTAL',
  'AREA(M )',
  'BUH1B-18 FOR 1 UNIT ONLY C-wx',
  'C-f32 PL25x600 13975 SM520 2 1645.56 3291.11 34.998 -',
  'C-p8 PL20x115 550 SM520 8 9.93 79.44 1.225 -',
  'C-wx43 PL20x950 13975 SM520 1 2084.37 2084.37 27.150 -',
  'TOTAL 5454.93 63.372',
  'TOTAL REQUIRED 2 SETS 10909.85 126.744',
  'GRAND TOTAL 10909.9 0.000',
]
const PAGE1 = [
  'BUH1-3 FOR 1 UNIT ONLY C-wx',
  'C-f1 PL25x400 10550 SM520 2 828.17 1656.35 17.975 -',
  'C-wx58 PL20x1150 10550 SM520 1 1904.80 1904.80 24.733 -',
  'TOTAL 3561.15 42.708',
  'TOTAL REQUIRED 6 SETS 21366.91 256.248',
]

describe('parseBomRows', () => {
  // TOTAL REQUIRED is the whole project's count, not this zone's — never used;
  // the user types the sets (2026-10-08). qty 0 = not entered yet.
  it('reads the assembly, its parts per set and the per-set totals — sets left for the user (0)', () => {
    expect(parseBomRows(PAGE4)).toEqual([{
      assembly_mark: 'BUH1B-18', qty: 0, weight_kg: 5454.93, surface_area_m2: 63.372, length_mm: 13975,
      parts: [
        { part_mark: 'C-f32', profile: 'PL25x600', length_mm: 13975, grade: 'SM520', qty: 2, unit_weight_kg: 1645.56 },
        { part_mark: 'C-p8', profile: 'PL20x115', length_mm: 550, grade: 'SM520', qty: 8, unit_weight_kg: 9.93 },
        { part_mark: 'C-wx43', profile: 'PL20x950', length_mm: 13975, grade: 'SM520', qty: 1, unit_weight_kg: 2084.37 },
      ],
    }])
  })

  it('handles several assemblies in one list (pages concatenated)', () => {
    expect(parseBomRows([...PAGE1, ...PAGE4]).map(a => [a.assembly_mark, a.qty, a.parts.length])).toEqual([['BUH1-3', 0, 2], ['BUH1B-18', 0, 3]])
  })

  it('returns nothing for a page with no BOM', () => {
    expect(parseBomRows(['GENERAL NOTES', 'ALL DIMENSIONS IN MM'])).toEqual([])
  })
})


// security review M3 (2026-10-09): bounded PDF uploads — real PDFs only, capped in total
describe('checkPdfUploads', () => {
  const pdf = (name: string, size = 1000) => ({ originalname: name, size, buffer: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(8)]) })
  it('accepts real PDFs within the total cap', () => {
    expect(() => checkPdfUploads([pdf('a.pdf'), pdf('b.PDF')])).not.toThrow()
  })
  it('refuses a non-.pdf name, a file that is not a PDF inside, and too much in one request', () => {
    expect(() => checkPdfUploads([pdf('a.xls')])).toThrow('Not PDF files: a.xls')
    expect(() => checkPdfUploads([{ ...pdf('fake.pdf'), buffer: Buffer.from('<html>') }])).toThrow('Not PDF files: fake.pdf')
    expect(() => checkPdfUploads([pdf('a.pdf', 30 * 1024 * 1024), pdf('b.pdf', 30 * 1024 * 1024)])).toThrow('50 MB')
  })
})
