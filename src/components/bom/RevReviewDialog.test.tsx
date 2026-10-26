import { vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RevReviewDialog } from './RevReviewDialog'
import type { RevReviewDto, RevReviewRowDto } from '../../api/dispatches'

const R = (over: Partial<RevReviewRowDto>): RevReviewRowDto => ({
  mark: 'B1', kind: 'changed', prev_rev: 1, suggested_rev: 2, suggested_source: 'MANUAL', dn_rev: null, dn_status: null, in_dn: false,
  warning: 'CHANGED_NO_REV_UP', editable: true, diff: { fields: [{ field: 'length_mm', old: 650, new: 700 }], parts_added: [], parts_removed: [], parts_changed: [] }, ...over,
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
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(onConfirm).toHaveBeenCalledWith([{ mark: 'B1', rev: 4 }])
  })

  it('marks in the Dispatch Note but not in the BOM files → a file-level ⚠', () => {
    render(<RevReviewDialog review={review({ dn_only_marks: ['X9', 'X10'] })} isUploading={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('⚠ มี mark ใน Dispatch Note แต่ไม่มีในไฟล์ BOM: X9, X10 — ส่งไฟล์ไม่ครบ หรือผิดชุด?')).toBeInTheDocument()
  })
})
