import { fireEvent, render, screen } from '@testing-library/react'
import type { DrawingRevStatusItem } from '../../api/mo'
import { DrawingRevNotice } from './DrawingRevNotice'

// Task 4 (MO print — drawing rev): the amber notice inside PrintSelectModal.
// The hook is mocked, same precedent as DrawingRevBadge.test.tsx.
let items: DrawingRevStatusItem[] = []
vi.mock('../../hooks/useMo', () => ({
  useMoDrawingRevStatus: () => ({ data: { items }, isLoading: false, isError: false }),
}))

const row = (over: Partial<DrawingRevStatusItem> = {}): DrawingRevStatusItem => ({
  wo_id: 1, wo_code: 'WO-00000001', mark: 'CTR1', printed_rev: 1, current_rev: 2, ...over,
})

afterEach(() => { items = [] })

describe('DrawingRevNotice', () => {
  it('renders nothing when there are no stale items', () => {
    items = []
    const { container } = render(<DrawingRevNotice moId={5} lang="en" onPrint={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists one row per (WO, mark) pair as "WO-code · MARK · Rev a → Rev b"', () => {
    items = [row(), row({ wo_id: 2, wo_code: 'WO-00000002', mark: 'CTR2', printed_rev: 2, current_rev: 3 })]
    render(<DrawingRevNotice moId={5} lang="en" onPrint={vi.fn()} />)
    expect(screen.getByText('มี Drawing rev ใหม่หลังพิมพ์ครั้งก่อน')).toBeInTheDocument()
    expect(screen.getByText('WO-00000001 · CTR1 · Rev 1 → Rev 2')).toBeInTheDocument()
    expect(screen.getByText('WO-00000002 · CTR2 · Rev 2 → Rev 3')).toBeInTheDocument()
  })

  it('prints only the affected (distinct) WO ids with include_manifest=false, using the given lang', () => {
    items = [row({ wo_id: 1 }), row({ wo_id: 1, mark: 'CTR2' }), row({ wo_id: 2, wo_code: 'WO-00000002' })]
    const onPrint = vi.fn()
    render(<DrawingRevNotice moId={5} lang="th" onPrint={onPrint} />)
    fireEvent.click(screen.getByRole('button', { name: 'พิมพ์ WO ที่ Drawing เปลี่ยน' }))
    expect(onPrint).toHaveBeenCalledTimes(1)
    expect(onPrint).toHaveBeenCalledWith([1, 2], false, 'th')
  })
})
