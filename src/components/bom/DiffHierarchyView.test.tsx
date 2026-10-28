import { vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DiffHierarchyView } from './DiffHierarchyView'
import type { RenamePairDto } from '../../api/dispatches'

const asm = (m: string) => ({ assembly_mark: m, name: 'H', qty: 2, weight_kg: 100, surface_area_m2: 5, length_mm: 1000, width_mm: null, height_mm: null })
const part = (m: string) => ({ part_mark: m, description: null, profile: 'PL', grade: 'SM', qty: 1, length_mm: 1, weight_kg: 1 })
const pairable = (a: string[] = [], p: string[] = []) => ({ ASSEMBLY: new Set(a), PART: new Set(p) })
const pair = (over: Partial<RenamePairDto> = {}): RenamePairDto => ({ id: 1, kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18', keep: 'old', confirmed_by: 'tao', confirmed_at: '2026-10-21T03:00:00Z', used_at: null, undo_blocked: null, ...over })

describe('DiffHierarchyView — renames (2026-10-21)', () => {
  it('a removed mark offers "จับคู่กับ mark ใหม่" only when pairing is allowed', () => {
    const onPair = vi.fn()
    const props = { assembly_diff: [{ status: 'removed' as const, prev: asm('BUH1B-18'), curr: null }], part_diff: [], junction_diff: [] }
    const { rerender } = render(<DiffHierarchyView {...props} canPair pairable={pairable(['BUH1B-18'])} onPair={onPair} />)
    fireEvent.click(screen.getByRole('button', { name: 'จับคู่กับ mark ใหม่' }))
    expect(onPair).toHaveBeenCalledWith('ASSEMBLY', 'BUH1B-18')
    rerender(<DiffHierarchyView {...props} canPair={false} pairable={pairable(['BUH1B-18'])} onPair={onPair} />)
    expect(screen.queryByRole('button', { name: 'จับคู่กับ mark ใหม่' })).not.toBeInTheDocument()
  })

  // final review: a removed row the backend doesn't offer as disappeared
  // (e.g. MAIN rows on an ACC-only re-upload) gets no pair button
  it('no pair button for a removed row missing from the rename candidates', () => {
    const props = { assembly_diff: [{ status: 'removed' as const, prev: asm('BUH1B-18'), curr: null }], part_diff: [{ status: 'removed' as const, prev: part('C-x'), curr: null }], junction_diff: [] }
    render(<DiffHierarchyView {...props} canPair pairable={pairable([], [])} onPair={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'จับคู่กับ mark ใหม่' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'จับคู่กับ part ใหม่' })).not.toBeInTheDocument()
  })

  it('a renamed row shows "เปลี่ยนชื่อ X → Y" even when nothing else changed, with "ยกเลิกคู่"', () => {
    const onUndo = vi.fn()
    render(<DiffHierarchyView assembly_diff={[{ status: 'unchanged', prev: asm('3BUH1B-18'), curr: asm('3BUH1B-18'), renamed_from: 'BUH1B-18', rename_id: 1 }]}
      part_diff={[]} junction_diff={[]} renames={[pair()]} onUndo={onUndo} canPair />)
    expect(screen.getByText('เปลี่ยนชื่อ BUH1B-18 → 3BUH1B-18')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกคู่' }))
    expect(onUndo).toHaveBeenCalledWith(pair())
  })

  // Deviation from the task-9 brief's inline test (which used
  // `screen.getByTitle(...)`): the task's explicit UI rule overrides that —
  // tooltips hang off an ⓘ icon via the app's existing custom hover-tooltip
  // pattern (aria-label + onMouseEnter/Leave + role="tooltip", see
  // DrawingUploadModal.test.tsx), never the native `title` attribute.
  it('an undo that is not allowed explains why on an ⓘ icon instead of a button', () => {
    const reason = 'มี MO หรือ WO ใช้ชื่อ 3BUH1B-18 ตามคู่นี้แล้ว — ยกเลิกคู่ไม่ได้'
    render(<DiffHierarchyView assembly_diff={[{ status: 'unchanged', prev: asm('3BUH1B-18'), curr: asm('3BUH1B-18'), renamed_from: 'BUH1B-18', rename_id: 1 }]}
      part_diff={[]} junction_diff={[]} renames={[pair({ undo_blocked: reason })]} onUndo={vi.fn()} canPair />)
    expect(screen.queryByRole('button', { name: 'ยกเลิกคู่' })).not.toBeInTheDocument()
    const icon = screen.getByLabelText('ทำไมยกเลิกคู่ไม่ได้')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.mouseEnter(icon)
    expect(screen.getByRole('tooltip')).toHaveTextContent(reason)
    fireEvent.mouseLeave(icon)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('a removed part offers "จับคู่กับ part ใหม่"', () => {
    const onPair = vi.fn()
    render(<DiffHierarchyView assembly_diff={[{ status: 'unchanged', prev: asm('K'), curr: asm('K') }]}
      part_diff={[{ status: 'removed', prev: part('C-x'), curr: null }]}
      junction_diff={[{ status: 'removed', prev: { assembly_mark: 'K', part_mark: 'C-x', qty: 1 }, curr: null }]} canPair pairable={pairable([], ['C-x'])} onPair={onPair} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'จับคู่กับ part ใหม่' })[0])
    expect(onPair).toHaveBeenCalledWith('PART', 'C-x')
  })
})

describe('DiffHierarchyView — Standalone Parts (2026-10-27)', () => {
  const J = (a: string, p: string, st: 'removed' | 'added' | 'unchanged') => ({ status: st, prev: st === 'added' ? null : { assembly_mark: a, part_mark: p, qty: 1 }, curr: st === 'removed' ? null : { assembly_mark: a, part_mark: p, qty: 1 } })
  const standalone = () => screen.queryByText(/Standalone Parts/i)

  it('a removed part that sat under a removed assembly shows only under that assembly, not again as standalone', () => {
    render(<DiffHierarchyView assembly_diff={[{ status: 'removed', prev: asm('BR24'), curr: null }]}
      part_diff={[{ status: 'removed', prev: part('m138'), curr: null }]}
      junction_diff={[J('BR24', 'm138', 'removed')]} />)
    expect(screen.getAllByText('m138')).toHaveLength(1)
    expect(standalone()).toBeNull()
  })

  it('still lists real standalone parts: removed with no junction before, and a part that moved out of every assembly', () => {
    render(<DiffHierarchyView assembly_diff={[{ status: 'unchanged', prev: asm('K'), curr: asm('K') }]}
      part_diff={[{ status: 'removed', prev: part('lone'), curr: null }, { status: 'unchanged', prev: part('moved'), curr: part('moved') }]}
      junction_diff={[J('K', 'moved', 'removed')]} />)
    expect(screen.getByText(/Standalone Parts \(2\)/i)).toBeInTheDocument()
  })
})
