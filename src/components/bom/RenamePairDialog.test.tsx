import { vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RenamePairDialog } from './RenamePairDialog'
import { useRenameCandidates, useSaveRenames } from '../../hooks/useBomDispatches'
import type { RenameCandidatesDto } from '../../api/dispatches'

vi.mock('../../hooks/useBomDispatches', () => ({ useRenameCandidates: vi.fn(), useSaveRenames: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
/* eslint-disable @typescript-eslint/no-explicit-any */
const data = { progress: [{ field: 'cut', value: 50 }], paint: [] }
const cand = (over: Partial<RenameCandidatesDto> = {}): RenameCandidatesDto => ({
  dispatch_id: 9, latest: true,
  assemblies: [{ mark: 'BUH1B-18', ref_id: 1, data: null, suggestions: [{ mark: '3BUH1B-18', ref_id: 11, score: 92, data: null }] }],
  parts: [{ mark: 'C-x', ref_id: 3, data: null, suggestions: [] }],
  new_assemblies: [{ mark: '3BUH1B-18', ref_id: 11, score: null, data: null }, { mark: 'Q7', ref_id: 12, score: null, data: null }],
  new_parts: [{ mark: '3C-x', ref_id: 13, score: null, data: null }],
  ...over,
})
const mutateAsync = vi.fn().mockResolvedValue({ pairs: [], history: [] })
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useSaveRenames).mockReturnValue({ mutateAsync, isPending: false } as any)
  vi.mocked(useRenameCandidates).mockReturnValue({ data: cand(), isLoading: false, isError: false } as any)
})

describe('RenamePairDialog', () => {
  it('two sections; a suggestion with its score; "pick other" lists every new name; skipped by default', () => {
    render(<RenamePairDialog dispatchId={9} onClose={vi.fn()} />)
    expect(screen.getByText('mark ที่หายไป (1)')).toBeInTheDocument()
    expect(screen.getByText('part ที่หายไป (1)')).toBeInTheDocument()
    const select = screen.getByLabelText('ชื่อใหม่ของ BUH1B-18') as HTMLSelectElement
    expect(select.value).toBe('')
    expect([...select.options].map(o => o.text)).toEqual(['ไม่ใช่ชิ้นเดิม (ข้าม)', '3BUH1B-18 (เหมือน 92%)', '3BUH1B-18', 'Q7'])
    expect(screen.getByRole('button', { name: /บันทึกการจับคู่/ })).toBeDisabled()
  })

  it('pick → save sends the pair and closes', async () => {
    const onClose = vi.fn()
    render(<RenamePairDialog dispatchId={9} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('ชื่อใหม่ของ BUH1B-18'), { target: { value: '3BUH1B-18' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกการจับคู่ (1 คู่)' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith([{ kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18' }]))
    expect(onClose).toHaveBeenCalled()
  })

  it('b2: both names have data → shows both sets, save waits for one choice', async () => {
    vi.mocked(useRenameCandidates).mockReturnValue({ isLoading: false, isError: false, data: cand({
      assemblies: [{ mark: 'BUH1B-18', ref_id: 1, data, suggestions: [] }],
      new_assemblies: [{ mark: '3BUH1B-18', ref_id: 11, score: null, data: { progress: [{ field: 'cut', value: 20 }], paint: [] } }],
    }) } as any)
    render(<RenamePairDialog dispatchId={9} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('ชื่อใหม่ของ BUH1B-18'), { target: { value: '3BUH1B-18' } })
    expect(screen.getByText('Cut 50')).toBeInTheDocument()
    expect(screen.getByText('Cut 20')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /บันทึกการจับคู่/ })).toBeDisabled()
    fireEvent.click(screen.getByLabelText('ใช้ข้อมูลของชื่อใหม่ 3BUH1B-18'))
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกการจับคู่ (1 คู่)' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith([{ kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18', keep: 'new' }]))
  })

  it('a new name taken by one row is disabled in the others', () => {
    vi.mocked(useRenameCandidates).mockReturnValue({ isLoading: false, isError: false, data: cand({
      assemblies: [{ mark: 'P1', ref_id: 1, data: null, suggestions: [] }, { mark: 'P2', ref_id: 2, data: null, suggestions: [] }],
    }) } as any)
    render(<RenamePairDialog dispatchId={9} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('ชื่อใหม่ของ P1'), { target: { value: 'Q7' } })
    const other = screen.getByLabelText('ชื่อใหม่ของ P2') as HTMLSelectElement
    expect([...other.options].find(o => o.value === 'Q7')!.disabled).toBe(true)
  })

  it('"ข้ามทั้งหมด" closes without saving; `only` shows just that one row', () => {
    const onClose = vi.fn()
    const { unmount } = render(<RenamePairDialog dispatchId={9} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'ข้ามทั้งหมด' }))
    expect(onClose).toHaveBeenCalled()
    expect(mutateAsync).not.toHaveBeenCalled()
    unmount()
    render(<RenamePairDialog dispatchId={9} only={{ kind: 'PART', mark: 'C-x' }} onClose={vi.fn()} />)
    expect(screen.queryByLabelText('ชื่อใหม่ของ BUH1B-18')).not.toBeInTheDocument()
    expect(screen.getByLabelText('ชื่อใหม่ของ C-x')).toBeInTheDocument()
  })
})
