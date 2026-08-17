import { PROGRESS_EXPORT_COLUMNS, sanitizeSheetNames, META_SHEET_NAME, computeColumnGroups, HEADER_ROWS, DATA_START_ROW } from './progress-excel'

describe('PROGRESS_EXPORT_COLUMNS', () => {
  it('has exactly 34 columns in the documented order', () => {
    expect(PROGRESS_EXPORT_COLUMNS).toHaveLength(34)
    expect(PROGRESS_EXPORT_COLUMNS[0].header).toBe('ลำดับ')
    const markIdx = PROGRESS_EXPORT_COLUMNS.findIndex(c => c.kind === 'mark')
    expect(PROGRESS_EXPORT_COLUMNS[markIdx].header).toBe('Number')
    const paymentIdx = PROGRESS_EXPORT_COLUMNS.findIndex(c => c.field === 'payment_status')
    expect(PROGRESS_EXPORT_COLUMNS[paymentIdx].header).toBe('สถานะการเบิกเงิน')
    expect(PROGRESS_EXPORT_COLUMNS[paymentIdx].kind).toBe('status')
    const erectionDateIdx = PROGRESS_EXPORT_COLUMNS.findIndex(c => c.field === 'erection_actual_finish_date')
    expect(PROGRESS_EXPORT_COLUMNS[erectionDateIdx].header).toBe('Actual Erection')
  })

  it('every editable/reference column carries a field name; index/zone/mark/computed do not', () => {
    for (const col of PROGRESS_EXPORT_COLUMNS) {
      if (col.kind === 'index' || col.kind === 'zone' || col.kind === 'mark' || col.kind === 'computed') {
        expect(col.field).toBeUndefined()
      } else {
        expect(col.field).toBeDefined()
      }
    }
  })

  it('every fab_stage column belongs to the fabrication group', () => {
    const fabCols = PROGRESS_EXPORT_COLUMNS.filter(c => c.kind === 'fab_stage')
    expect(fabCols).toHaveLength(10)
    for (const col of fabCols) expect(col.group).toBe('fabrication')
  })
})

describe('computeColumnGroups', () => {
  it('finds the 4 contiguous group blocks at their documented column spans', () => {
    const groups = computeColumnGroups()
    expect(groups).toEqual([
      { group: 'fabrication', label: 'Fabrication', startCol: 11, endCol: 20 },
      { group: 'transport', label: 'Transport', startCol: 23, endCol: 26 },
      { group: 'payment', label: 'การเบิกเงินค่าสินค้า', startCol: 27, endCol: 29 },
      { group: 'erection', label: 'Erection', startCol: 30, endCol: 34 },
    ])
  })
})

describe('header row layout', () => {
  it('reserves 4 header rows, data starting at row 5', () => {
    expect(HEADER_ROWS).toBe(4)
    expect(DATA_START_ROW).toBe(5)
  })
})

describe('sanitizeSheetNames', () => {
  it('passes clean names through unchanged', () => {
    expect(sanitizeSheetNames(['Zone-A', 'Zone-B'])).toEqual(['Zone-A', 'Zone-B'])
  })

  it('strips characters Excel forbids in sheet names', () => {
    expect(sanitizeSheetNames(['Zone: 1/2*3?'])).toEqual(['Zone 123'])
  })

  it('truncates to 31 characters (Excel sheet name limit)', () => {
    const long = 'A'.repeat(50)
    const [result] = sanitizeSheetNames([long])
    expect(result.length).toBe(31)
  })

  it('dedupes names that collide after sanitize/truncate with a numeric suffix', () => {
    expect(sanitizeSheetNames(['Zone A', 'Zone A', 'Zone A'])).toEqual(['Zone A', 'Zone A~1', 'Zone A~2'])
  })

  it('blank/whitespace-only zone labels fall back to a non-empty name', () => {
    expect(sanitizeSheetNames(['   '])).toEqual(['Zone'])
  })
})

describe('META_SHEET_NAME', () => {
  it('is the literal "_meta" (import validates against this exact name)', () => {
    expect(META_SHEET_NAME).toBe('_meta')
  })
})
