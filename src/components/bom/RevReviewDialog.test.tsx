import { vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { RevReviewDialog } from './RevReviewDialog'
import type { RevReviewDto, RevReviewRowDto } from '../../api/dispatches'

const R = (over: Partial<RevReviewRowDto>): RevReviewRowDto => ({
  mark: 'B1', kind: 'changed', prev_rev: 1, suggested_rev: 2, suggested_source: 'MANUAL', dn_rev: null, dn_status: null, in_dn: false,
  warning: 'CHANGED_NO_REV_UP', dn_cancelled_in_files: false, rename_hint: null, editable: true, diff: { fields: [{ field: 'length_mm', old: 650, new: 700 }], parts_added: [], parts_removed: [], parts_changed: [] }, ...over,
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
    expect(screen.getByText('ยังไม่ได้เลือก 2 mark (เปลี่ยน mark หรือ ลบออกจาก BOM)')).toBeInTheDocument()
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
    expect(onConfirm).toHaveBeenCalledWith([], [{ from_mark: 'CO1', to_mark: 'CO1A' }])
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
    expect(onConfirm).toHaveBeenCalledWith([], [{ from_mark: 'CO1', to_mark: 'CO1A' }])
    expect((screen.getByLabelText('ผลของ CO2') as HTMLSelectElement).value).toBe('delete')
  })

  it('warns when marks about to be removed are still in the Dispatch Note', () => {
    render(<RevReviewDialog review={rv([removed('CO1', { in_dn: true }), removed('CO2', { in_dn: true }), removed('CO3', { in_dn: true, dn_status: 'Cancel', dn_cancelled_in_files: true })])} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} allowRename />)
    // count only — listing every mark gets unreadable (Tao, 27 already too many)
    expect(screen.getByText('⚠ 2 mark ที่จะถูกลบยังอยู่ใน Dispatch Note')).toBeInTheDocument()
    expect(screen.queryByText(/CO1, CO2/)).toBeNull()
    expect(screen.getByText(/Assembly List อาจ export ไม่ครบ/)).toBeInTheDocument()
  })

  it('without permission to pair names, only "ลบออกจาก BOM" is offered', () => {
    render(<RevReviewDialog review={rv([removed('CO1'), added('CO1A')])} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} allowRename={false} />)
    expect(within(screen.getByLabelText('ผลของ CO1')).queryByRole('option', { name: /CO1A/ })).toBeNull()
  })
})
