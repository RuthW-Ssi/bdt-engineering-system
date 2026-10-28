import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkRevHistoryDialog } from './MarkRevHistoryDialog'
import { useMarkRevHistory } from '../../hooks/useBomDispatches'
import type { MarkRevHistoryDto } from '../../api/dispatches'

vi.mock('../../hooks/useBomDispatches', () => ({ useMarkRevHistory: vi.fn() }))
/* eslint-disable @typescript-eslint/no-explicit-any */
const part = (m: string) => ({ part_mark: m, qty: 1, description: null, profile: 'L50x50', grade: 'SS400', length_mm: 650, weight_kg: 5.8 })
const data: MarkRevHistoryDto = {
  assembly_id: 30, mark: '3B1', current_rev: 2,
  entries: [
    { rev: 2, mark: '3B1', renamed_from: 'B1', rev_source: 'MANUAL', dn_status: null, upload_no: 3, dispatch_id: 9, uploaded_at: '2026-10-26T03:00:00Z', uploaded_by: 'tao', first: false, values: null,
      diff: { fields: [{ field: 'length_mm', old: 650, new: 700 }], parts_added: [part('p2')], parts_removed: [], parts_changed: [] } },
    { rev: 1, mark: 'B1', renamed_from: null, rev_source: 'DISPATCH_NOTE', dn_status: 'changed', upload_no: 2, dispatch_id: 5, uploaded_at: '2026-10-20T03:00:00Z', uploaded_by: 'som', first: false, values: null,
      diff: { fields: [], parts_added: [], parts_removed: [], parts_changed: [] } },
    { rev: 0, mark: 'B1', renamed_from: null, rev_source: 'NEW', dn_status: null, upload_no: 1, dispatch_id: 1, uploaded_at: '2026-10-01T03:00:00Z', uploaded_by: 'som', first: true,
      values: { mark: 'B1', qty: 2, name: 'BRACE', length_mm: 650, width_mm: null, height_mm: null, weight_kg: 104.44, surface_area_m2: null, parts: [part('p1')] }, diff: null },
  ],
}

describe('MarkRevHistoryDialog', () => {
  it('newest first: Rev badge, upload number + who/when, rename, field old → new, parts table, "กำหนด rev เอง"', () => {
    vi.mocked(useMarkRevHistory).mockReturnValue({ data, isLoading: false, isError: false } as any)
    render(<MarkRevHistoryDialog assemblyId={30} mark="3B1" onClose={vi.fn()} />)
    const revs = screen.getAllByTestId('rev-badge').map(e => e.textContent)
    expect(revs).toEqual(['Rev 2', 'Rev 1', 'Rev 0'])
    expect(screen.getByText(/v\.3 · tao/)).toBeInTheDocument()
    expect(screen.getByText('เปลี่ยนชื่อ B1 → 3B1')).toBeInTheDocument()
    expect(screen.getByText('กำหนด rev เอง')).toBeInTheDocument()
    expect(screen.getByText('650')).toBeInTheDocument() // struck-through old value
    expect(screen.getByText('700')).toBeInTheDocument()
    expect(screen.getByText('เพิ่ม')).toBeInTheDocument()
    expect(screen.getByText('ข้อมูล BOM ไม่เปลี่ยน')).toBeInTheDocument() // Rev 1: rev only
    expect(screen.getByText('ใหม่')).toBeInTheDocument() // first entry lists its values
    expect(screen.getByText('STATUS ใน Dispatch Note: changed')).toBeInTheDocument()
  })

  it('loading and error states read plainly', () => {
    vi.mocked(useMarkRevHistory).mockReturnValue({ data: undefined, isLoading: true, isError: false } as any)
    const { rerender } = render(<MarkRevHistoryDialog assemblyId={30} mark="3B1" onClose={vi.fn()} />)
    expect(screen.getByText('กำลังโหลด…')).toBeInTheDocument()
    vi.mocked(useMarkRevHistory).mockReturnValue({ data: undefined, isLoading: false, isError: true } as any)
    rerender(<MarkRevHistoryDialog assemblyId={30} mark="3B1" onClose={vi.fn()} />)
    expect(screen.getByText('โหลดประวัติ Rev ไม่สำเร็จ')).toBeInTheDocument()
  })

  it('a mark with no upload history (PRE_SHOP / BIM placeholder) says so plainly', () => {
    vi.mocked(useMarkRevHistory).mockReturnValue({ data: { assembly_id: 31, mark: 'C1', current_rev: 0, entries: [] }, isLoading: false, isError: false } as any)
    render(<MarkRevHistoryDialog assemblyId={31} mark="C1" onClose={vi.fn()} />)
    expect(screen.getByText('ยังไม่มีประวัติการอัปโหลด')).toBeInTheDocument()
    expect(screen.queryAllByTestId('rev-badge')).toHaveLength(0)
  })
})
