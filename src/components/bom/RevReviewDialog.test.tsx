import { vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { RevReviewDialog } from './RevReviewDialog'
import type { PartReviewRowDto, RevReviewDto, RevReviewRowDto } from '../../api/dispatches'

const R = (over: Partial<RevReviewRowDto>): RevReviewRowDto => ({
  mark: 'B1', kind: 'changed', prev_rev: 1, suggested_rev: 2, suggested_source: 'MANUAL', dn_rev: null, dn_status: null, in_dn: false,
  warning: 'CHANGED_NO_REV_UP', dn_cancelled_in_files: false, rename_hint: null, slot: null, editable: true, diff: { fields: [{ field: 'length_mm', old: 650, new: 700 }], parts_added: [], parts_removed: [], parts_changed: [] }, ...over,
})
const review = (over: Partial<RevReviewDto> = {}): RevReviewDto => ({
  base_dispatch_id: 7, has_dn: true, dn_only_marks: [], dn_warnings: [],
  rows: [
    R({}),
    R({ mark: 'N1', kind: 'added', prev_rev: null, suggested_rev: 0, suggested_source: 'NEW', warning: null, editable: false, diff: null }),
    R({ mark: 'G1', kind: 'removed', prev_rev: 3, suggested_rev: null, suggested_source: null, warning: null, editable: false, diff: null, dn_status: 'changed', in_dn: true }),
  ],
  ...over,
})

describe('RevReviewDialog', () => {
  // final review fix 3: no closing the dialog mid-save
  it('while saving, ✕ and ยกเลิก are disabled and do not cancel', () => {
    const onCancel = vi.fn()
    render(<RevReviewDialog review={review()} isUploading onCancel={onCancel} onConfirm={vi.fn()} />)
    const close = screen.getByRole('button', { name: 'ปิด' })
    const cancel = screen.getByRole('button', { name: 'ยกเลิก' })
    expect(close).toBeDisabled()
    expect(cancel).toBeDisabled()
    fireEvent.click(close)
    fireEvent.click(cancel)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('one row per mark: result, Rev old → new, what changed, DN STATUS; only ⚠/changed rows are editable', () => {
    render(<RevReviewDialog review={review()} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('⚠ ข้อมูลเปลี่ยน แต่ไม่มีใน Dispatch Note — ตรวจ rev ใหม่')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Assembly (1)' })) // folded by default
    expect(screen.getByText('L 650 → 700')).toBeInTheDocument()
    expect((screen.getByLabelText('Rev ใหม่ของ B1') as HTMLInputElement).value).toBe('2')
    expect(screen.queryByLabelText('Rev ใหม่ของ N1')).toBeNull()
    expect(screen.getByText('mark ใหม่')).toBeInTheDocument()
    expect(screen.getByText('ถูกลบออกจาก BOM')).toBeInTheDocument()
    expect(screen.getByText('changed')).toBeInTheDocument()
  })

  it('a rev below the current one shows a plain error and blocks save', () => {
    render(<RevReviewDialog review={review()} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Rev ใหม่ของ B1'), { target: { value: '0' } })
    expect(screen.getByText('ต่ำกว่า Rev เดิม (1) ไม่ได้')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'บันทึก' })).toBeDisabled()
  })

  it('changed data with the rev left at the current one is blocked (same rule as the server)', () => {
    render(<RevReviewDialog review={review()} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Rev ใหม่ของ B1'), { target: { value: '1' } })
    expect(screen.getByText('ข้อมูลของ mark นี้เปลี่ยน ต้องใส่ rev มากกว่า 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'บันทึก' })).toBeDisabled()
  })

  it('save sends the editable rows only, as numbers', () => {
    const onConfirm = vi.fn()
    render(<RevReviewDialog review={review()} isUploading={false} onCancel={vi.fn()} onConfirm={onConfirm} />)
    fireEvent.change(screen.getByLabelText('Rev ใหม่ของ B1'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('ผลของ G1'), { target: { value: 'delete' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(onConfirm).toHaveBeenCalledWith([{ mark: 'B1', rev: 4 }], [])
  })

  it('DN says cancelled but the mark is still in the Tekla lists → the row shows the ⚠ and counts as a ⚠ row', () => {
    const rows = [R({ mark: 'C1', kind: 'unchanged', warning: null, editable: false, diff: null, in_dn: true, dn_status: 'cancelled', dn_cancelled_in_files: true })]
    render(<RevReviewDialog review={review({ rows })} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('⚠ Dispatch Note บอกว่ายกเลิก แต่ยังมีในไฟล์ Tekla — ถ้ายกเลิกจริง ให้ลบใน Tekla แล้วอัปโหลดใหม่')).toBeInTheDocument()
    expect(screen.getByText('⚠ มี 1 แถวที่ต้องตรวจ (แถวสีเหลือง) — แก้ Rev ในช่องสีขาว แล้วกด บันทึก')).toBeInTheDocument()
  })

  it('row colours: new mark light green, removed light red, ⚠ amber wins over both', () => {
    const rows = [
      R({ mark: 'N1', kind: 'added', prev_rev: null, suggested_rev: 0, warning: null, editable: false, diff: null }),
      R({ mark: 'G1', kind: 'removed', suggested_rev: null, warning: null, editable: false, diff: null }),
      R({ mark: 'N2', kind: 'added', prev_rev: null, suggested_rev: 0, warning: null, editable: false, diff: null, in_dn: true, dn_status: 'cancelled', dn_cancelled_in_files: true }),
      R({ mark: 'U1', kind: 'unchanged', warning: null, editable: false, diff: null, in_dn: true }),
    ]
    render(<RevReviewDialog review={review({ rows })} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    const bg = (m: string) => (screen.getByText(m).closest('tr') as HTMLElement).style.background
    expect(bg('N1')).toBe('rgb(240, 253, 244)')
    expect(bg('G1')).toBe('rgb(254, 242, 242)')
    expect(bg('N2')).toBe('rgb(255, 251, 235)')
    expect(bg('U1')).toBe('')
  })

  it('rename hint: shown on both rows, the removed row moved under the new one', () => {
    const rows = [
      R({ mark: 'N1', kind: 'added', prev_rev: null, suggested_rev: 1, warning: null, editable: false, diff: null, rename_hint: 'G1' }),
      R({ mark: 'U1', kind: 'unchanged', warning: null, editable: false, diff: null, in_dn: true }),
      R({ mark: 'G1', kind: 'removed', suggested_rev: null, warning: null, editable: false, diff: null, rename_hint: 'N1' }),
    ]
    render(<RevReviewDialog review={review({ rows })} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('อาจเปลี่ยน mark จาก G1')).toBeInTheDocument()
    expect(screen.getByText('อาจเปลี่ยนเป็น N1')).toBeInTheDocument()
    expect(screen.getAllByRole('row').slice(1).map(tr => tr.querySelector('td')!.textContent)).toEqual(['N1', 'G1', 'U1'])
  })

  it('the ⚠ row count is a warning box styled like the file-level ⚠; no ⚠ rows → plain hint; header says Status (DN)', () => {
    render(<RevReviewDialog review={review({ dn_only_marks: ['X9'] })} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    const rowWarn = screen.getByText('⚠ มี 1 แถวที่ต้องตรวจ (แถวสีเหลือง) — แก้ Rev ในช่องสีขาว แล้วกด บันทึก')
    const fileWarn = screen.getByText(/มี mark ใน Dispatch Note แต่ไม่มีในไฟล์ BOM/)
    expect(rowWarn.getAttribute('style')).toBe(fileWarn.getAttribute('style'))
    expect(screen.getByRole('columnheader', { name: 'Status (DN)' })).toBeInTheDocument()
  })

  it('no ⚠ rows → a plain grey hint, not a warning box', () => {
    render(<RevReviewDialog review={review({ rows: [R({ kind: 'added', warning: null, editable: false, prev_rev: null, suggested_rev: 0, diff: null })] })} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('ดูรายการ แล้วกด บันทึก')).toBeInTheDocument()
  })

  it('marks in the Dispatch Note but not in the BOM files → a file-level ⚠', () => {
    render(<RevReviewDialog review={review({ dn_only_marks: ['X9', 'X10'] })} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('⚠ มี mark ใน Dispatch Note แต่ไม่มีในไฟล์ BOM: X9, X10 — ส่งไฟล์ไม่ครบ หรือผิดชุด?')).toBeInTheDocument()
  })
})

// A missing mark is deleted or renamed — the user says which, before save (2026-11-23, Tao)
describe('RevReviewDialog — missing marks', () => {
  const removed = (mark: string, over: Partial<RevReviewRowDto> = {}) =>
    R({ mark, kind: 'removed', prev_rev: 0, suggested_rev: null, suggested_source: null, warning: null, editable: false, diff: null, ...over })
  const added = (mark: string) => R({ mark, kind: 'added', prev_rev: null, suggested_rev: 0, suggested_source: 'NEW', warning: null, editable: false, diff: null })
  const rv = (rows: RevReviewRowDto[]) => review({ rows })

  it('save stays disabled until every missing mark is renamed or deleted', () => {
    render(<RevReviewDialog review={rv([removed('CO1'), removed('CO2'), added('CO1A')])} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} allowRename />)
    const save = screen.getByRole('button', { name: 'บันทึก' })
    expect(save).toBeDisabled()
    expect(screen.getByText('ยังไม่ได้เลือก 2 mark (เปลี่ยน หรือ ลบออกจาก BOM)')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('ผลของ CO1'), { target: { value: 'delete' } })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('ผลของ CO2'), { target: { value: 'delete' } })
    expect(save).toBeEnabled()
  })

  it('a rename is sent as a pair; the suggested new mark comes first', () => {
    const onConfirm = vi.fn()
    render(<RevReviewDialog review={rv([removed('CO1', { rename_hint: 'CO1A' }), added('CO1A'), added('CO9')])} isUploading={false} onCancel={vi.fn()} onConfirm={onConfirm} allowRename />)
    const select = screen.getByLabelText('ผลของ CO1') as HTMLSelectElement
    expect(within(select).getByRole('group', { name: 'ระบบแนะนำ' })).toHaveTextContent('เปลี่ยนเป็น CO1A')
    expect(select).not.toHaveTextContent('เปลี่ยนชื่อ') // it is a mark, not a name (Tao)
    fireEvent.change(select, { target: { value: 'rename:CO1A' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(onConfirm).toHaveBeenCalledWith([], [{ kind: 'ASSEMBLY', from_mark: 'CO1', to_mark: 'CO1A' }])
  })

  it('a new mark can be picked for one missing mark only', () => {
    render(<RevReviewDialog review={rv([removed('CO1'), removed('CO2'), added('CO1A')])} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} allowRename />)
    fireEvent.change(screen.getByLabelText('ผลของ CO1'), { target: { value: 'rename:CO1A' } })
    const opt = within(screen.getByLabelText('ผลของ CO2')).getByRole('option', { name: /CO1A/ }) as HTMLOptionElement
    expect(opt.disabled).toBe(true)
  })

  it('"ที่เหลือทั้งหมด: ลบออกจาก BOM" sets only the undecided rows', () => {
    const onConfirm = vi.fn()
    render(<RevReviewDialog review={rv([removed('CO1'), removed('CO2'), added('CO1A')])} isUploading={false} onCancel={vi.fn()} onConfirm={onConfirm} allowRename />)
    fireEvent.change(screen.getByLabelText('ผลของ CO1'), { target: { value: 'rename:CO1A' } })
    fireEvent.click(screen.getByRole('button', { name: 'ที่เหลือทั้งหมด: ลบออกจาก BOM' }))
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(onConfirm).toHaveBeenCalledWith([], [{ kind: 'ASSEMBLY', from_mark: 'CO1', to_mark: 'CO1A' }])
    expect((screen.getByLabelText('ผลของ CO2') as HTMLSelectElement).value).toBe('delete')
  })

  it('warns when marks about to be removed are still in the Dispatch Note', () => {
    render(<RevReviewDialog review={rv([removed('CO1', { in_dn: true }), removed('CO2', { in_dn: true }), removed('CO3', { in_dn: true, dn_status: 'Cancel', dn_cancelled_in_files: true })])} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} allowRename />)
    // count only — listing every mark gets unreadable (Tao, 27 already too many)
    fireEvent.click(screen.getByRole('button', { name: /^⚠ Assembly List อาจ export ไม่ครบ/ }))
    expect(screen.getByText('2 mark ที่จะถูกลบยังอยู่ใน Dispatch Note')).toBeInTheDocument()
    expect(screen.queryByText(/CO1, CO2/)).toBeNull()
  })

  it('without permission to pair names, only "ลบออกจาก BOM" is offered', () => {
    render(<RevReviewDialog review={rv([removed('CO1'), added('CO1A')])} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} allowRename={false} />)
    expect(within(screen.getByLabelText('ผลของ CO1')).queryByRole('option', { name: /CO1A/ })).toBeNull()
  })

  it('separate mode: a missing MAIN mark is offered new MAIN marks only (not ACC)', () => {
    const add = (mark: string, slot: 'MAIN' | 'ACC') => ({ ...added(mark), slot })
    render(<RevReviewDialog review={rv([removed('CO1', { slot: 'MAIN' }), add('CO1A', 'MAIN'), add('DF1', 'ACC')])} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} allowRename />)
    const select = screen.getByLabelText('ผลของ CO1')
    expect(within(select).getByRole('option', { name: 'เปลี่ยนเป็น CO1A' })).toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: /DF1/ })).toBeNull()
  })
})


// Missing parts get the same decision as missing marks, before save (2026-11-23, Tao)
describe('RevReviewDialog — missing parts', () => {
  const P = (mark: string, kind: 'removed' | 'added', over: Partial<PartReviewRowDto> = {}): PartReviewRowDto => ({ mark, kind, slot: null, rename_hint: null, still_used: false, ...over })
  const rv = (parts: PartReviewRowDto[]) => review({ rows: [], parts })

  it('lists missing parts in their own section; save waits until each is renamed or deleted', () => {
    render(<RevReviewDialog review={rv([P('w1', 'removed'), P('w2', 'removed'), P('Xp5', 'added')])} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} allowRename />)
    expect(screen.getByText('Part ที่หายไป (2)')).toBeInTheDocument()
    expect(screen.queryByLabelText('ผลของ part Xp5')).toBeNull() // new parts are targets, not rows
    const save = screen.getByRole('button', { name: 'บันทึก' })
    expect(save).toBeDisabled()
    expect(screen.getByText('ยังไม่ได้เลือก 2 part (เปลี่ยน หรือ ลบออกจาก BOM)')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('ผลของ part w1'), { target: { value: 'delete' } })
    fireEvent.change(screen.getByLabelText('ผลของ part w2'), { target: { value: 'delete' } })
    expect(save).toBeEnabled()
  })

  it('a part rename is sent with kind PART; suggested part first; one new part per missing part', () => {
    const onConfirm = vi.fn()
    render(<RevReviewDialog review={rv([P('w1', 'removed', { rename_hint: 'w1b' }), P('w2', 'removed'), P('w1b', 'added', { rename_hint: 'w1' })])} isUploading={false} onCancel={vi.fn()} onConfirm={onConfirm} allowRename />)
    const select = screen.getByLabelText('ผลของ part w1') as HTMLSelectElement
    expect(within(select).getByRole('group', { name: 'ระบบแนะนำ' })).toHaveTextContent('เปลี่ยนเป็น w1b')
    fireEvent.change(select, { target: { value: 'rename:w1b' } })
    expect((within(screen.getByLabelText('ผลของ part w2')).getByRole('option', { name: /w1b/ }) as HTMLOptionElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'ที่เหลือทั้งหมด: ลบออกจาก BOM' }))
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(onConfirm).toHaveBeenCalledWith([], [{ kind: 'PART', from_mark: 'w1', to_mark: 'w1b' }])
  })

  it('separate mode: a missing MAIN part is offered new MAIN parts only', () => {
    render(<RevReviewDialog review={rv([P('w1', 'removed', { slot: 'MAIN' }), P('m9', 'added', { slot: 'MAIN' }), P('a9', 'added', { slot: 'ACC' })])} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} allowRename />)
    const select = screen.getByLabelText('ผลของ part w1')
    expect(within(select).getByRole('option', { name: 'เปลี่ยนเป็น m9' })).toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: /a9/ })).toBeNull()
  })

  it('warns (count only) when parts about to be removed are still used by an assembly', () => {
    render(<RevReviewDialog review={rv([P('w1', 'removed', { still_used: true }), P('w2', 'removed', { still_used: true }), P('w3', 'removed')])} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} allowRename />)
    fireEvent.click(screen.getByRole('button', { name: /^⚠ Part List อาจ export ไม่ครบ/ }))
    expect(screen.getByText('2 part ที่จะถูกลบยังถูกใช้ใน assembly')).toBeInTheDocument()
  })

  it('marks and parts that look like an incomplete export share one warning box', () => {
    const removedMark = R({ mark: 'CO1', kind: 'removed', prev_rev: 0, suggested_rev: null, suggested_source: null, warning: null, editable: false, diff: null, in_dn: true })
    render(<RevReviewDialog review={review({ rows: [removedMark], parts: [P('w1', 'removed', { still_used: true })] })} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} allowRename />)
    expect(screen.getAllByText(/อาจ export ไม่ครบ/)).toHaveLength(1)
    expect(screen.getByText('⚠ Assembly List / Part List อาจ export ไม่ครบ')).toBeInTheDocument()
    // folded by default: one line with the counts
    expect(screen.getByText('— 1 mark · 1 part')).toBeInTheDocument()
    expect(screen.queryByText('1 mark ที่จะถูกลบยังอยู่ใน Dispatch Note')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /อาจ export ไม่ครบ/ }))
    expect(screen.getByText('1 mark ที่จะถูกลบยังอยู่ใน Dispatch Note')).toBeInTheDocument()
    expect(screen.getByText('1 part ที่จะถูกลบยังถูกใช้ใน assembly')).toBeInTheDocument()
  })

  it('marks and parts undecided are counted together; one button deletes the rest of both', () => {
    const removedMark = R({ mark: 'CO1', kind: 'removed', prev_rev: 0, suggested_rev: null, suggested_source: null, warning: null, editable: false, diff: null })
    render(<RevReviewDialog review={review({ rows: [removedMark], parts: [P('w1', 'removed')] })} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} allowRename />)
    expect(screen.getByText('ยังไม่ได้เลือก 1 mark, 1 part (เปลี่ยน หรือ ลบออกจาก BOM)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ที่เหลือทั้งหมด: ลบออกจาก BOM' }))
    expect(screen.getByRole('button', { name: 'บันทึก' })).toBeEnabled()
  })
})

// Filter the review by type and result (2026-11-23, Tao: the list is too long to scan)
describe('RevReviewDialog — filters', () => {
  const removedMark = (mark: string) => R({ mark, kind: 'removed', prev_rev: 0, suggested_rev: null, suggested_source: null, warning: null, editable: false, diff: null })
  const P = (mark: string): PartReviewRowDto => ({ mark, kind: 'removed', slot: null, rename_hint: null, still_used: false })
  const rv = () => review({ parts: [P('w1')], rows: [...review().rows, removedMark('CO1'), R({ mark: 'U1', kind: 'unchanged', warning: null, editable: false, diff: null })] })
  const box = (name: RegExp) => screen.getByRole('checkbox', { name })

  it('shows every type and result with counts, all ticked', () => {
    render(<RevReviewDialog review={rv()} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} allowRename />)
    for (const [n, label] of [[/^Assembly \(5\)$/, 'Assembly'], [/^Part \(1\)$/, 'Part'], [/^Added \(1\)$/, 'Added'], [/^Changed \(1\)$/, 'Changed'], [/^Deleted \(3\)$/, 'Deleted'], [/^Unchanged \(1\)$/, 'Unchanged']] as const) {
      expect(box(n), label).toBeChecked()
    }
  })

  it('unticking a result hides those rows; unticking Deleted also hides the missing-part section', () => {
    render(<RevReviewDialog review={rv()} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} allowRename />)
    fireEvent.click(box(/^Deleted/))
    expect(screen.queryByLabelText('ผลของ CO1')).toBeNull()
    expect(screen.queryByText('Part ที่หายไป (1)')).toBeNull()
    expect(screen.getByText('B1')).toBeInTheDocument()
    // still counted: hidden rows must be decided before save
    expect(screen.getByText('ยังไม่ได้เลือก 2 mark, 1 part (เปลี่ยน หรือ ลบออกจาก BOM)')).toBeInTheDocument()
  })

  it('unticking Assembly leaves only parts; unticking Part hides the part section', () => {
    render(<RevReviewDialog review={rv()} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} allowRename />)
    fireEvent.click(box(/^Assembly/))
    expect(screen.queryByText('B1')).toBeNull()
    expect(screen.getByLabelText('ผลของ part w1')).toBeInTheDocument()
    fireEvent.click(box(/^Part/))
    expect(screen.queryByLabelText('ผลของ part w1')).toBeNull()
    expect(screen.getByText('ไม่มีรายการตามตัวกรอง')).toBeInTheDocument()
  })

  it('column headers say Assembly Mark and Part Mark', () => {
    render(<RevReviewDialog review={rv()} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} allowRename />)
    expect(screen.getByRole('columnheader', { name: 'Assembly Mark' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Part Mark' })).toBeInTheDocument()
  })

  it('no unchanged rows → no Unchanged box', () => {
    render(<RevReviewDialog review={review()} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.queryByRole('checkbox', { name: /^Unchanged/ })).toBeNull()
  })
})

describe('RevReviewDialog — what changed folds by assembly / part', () => {
  it('both groups folded by default: assembly names the changed fields, part shows counts; both toggle', () => {
    const diff = { fields: [{ field: 'length_mm', old: 650, new: 700 }], parts_added: [{ part_mark: 'Xp5' }], parts_removed: [{ part_mark: 'w2' }, { part_mark: 'f7' }], parts_changed: [] } as unknown as RevReviewRowDto['diff']
    render(<RevReviewDialog review={review({ rows: [R({ diff })] })} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('เพิ่ม 1 · ลบ 2')).toBeInTheDocument()
    expect(screen.queryByText('ลบ part w2')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Part (3)' }))
    expect(screen.getByText('ลบ part w2')).toBeInTheDocument()
    const asm = screen.getByRole('button', { name: 'Assembly (1)' })
    expect(asm).toHaveAttribute('aria-expanded', 'false')
    expect(within(asm).getByText('L')).toBeInTheDocument() // folded line names the changed field
    fireEvent.click(asm)
    expect(asm).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('RevReviewDialog — same part in both Part Lists with different data', () => {
  it('a folded ⚠ box says MAIN is used; expanded, each mark lists MAIN vs ACC per field; save is not blocked', () => {
    render(<RevReviewDialog review={review({ rows: [], part_conflicts: [
      { mark: 'ESB-p12', fields: [{ field: 'length_mm', main: 650, acc: 700 }] },
      { mark: 'ESB-w3', fields: [{ field: 'profile', main: 'PL6x850', acc: 'PL8x850' }] },
    ] })} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    const head = screen.getByRole('button', { name: '⚠ 2 part อยู่ทั้งใน Part List MAIN และ ACC แต่ข้อมูลไม่ตรงกัน — ระบบจะใช้ของ MAIN' })
    expect(screen.queryByText('ESB-p12')).toBeNull()
    fireEvent.click(head)
    expect(screen.getByText('ESB-p12').parentElement).toHaveTextContent('L MAIN 650 · ACC 700')
    expect(screen.getByText('ESB-w3').parentElement).toHaveTextContent('Profile MAIN PL6x850 · ACC PL8x850')
    expect(screen.getByRole('button', { name: 'บันทึก' })).toBeEnabled()
  })
})

describe('RevReviewDialog — plate thickness in Part List ≠ NC file', () => {
  it('a folded ⚠ box says the Part List is used; expanded, each mark shows both profiles; save is not blocked', () => {
    render(<RevReviewDialog review={review({ rows: [], nc_profile_mismatches: [{ mark: 'ESB-px1', part_list: 'PL16x200', nc: 'PL12' }] })}
      isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    const head = screen.getByRole('button', { name: '⚠ 1 part ความหนาใน Part List ไม่ตรงกับไฟล์ NC — ระบบจะใช้ของ Part List' })
    expect(screen.queryByText('ESB-px1')).toBeNull()
    fireEvent.click(head)
    expect(screen.getByText('ESB-px1').parentElement).toHaveTextContent('Part List PL16x200 · NC PL12')
    expect(screen.getByRole('button', { name: 'บันทึก' })).toBeEnabled()
  })
})
