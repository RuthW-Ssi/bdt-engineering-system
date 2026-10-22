import { render, screen } from '@testing-library/react'
import type { DrawingRevStatusItem } from '../../api/mo'
import { DrawingRevBadge } from './DrawingRevBadge'

// Task 4 (MO print — drawing rev): header Print button badge. The hook is
// mocked — this is a pure presentational test, same precedent as
// WoDetail.page.test.tsx mocking '../hooks/useWo'.
let items: DrawingRevStatusItem[] = []
let isLoading = false
let isError = false
vi.mock('../../hooks/useMo', () => ({
  useMoDrawingRevStatus: () => ({ data: { items }, isLoading, isError }),
}))

const row = (over: Partial<DrawingRevStatusItem> = {}): DrawingRevStatusItem => ({
  wo_id: 1, wo_code: 'WO-00000001', mark: 'CTR1', printed_rev: 1, current_rev: 2, ...over,
})

afterEach(() => {
  items = []
  isLoading = false
  isError = false
})

describe('DrawingRevBadge', () => {
  it('shows the count of DISTINCT WOs with a stale drawing, not the row count', () => {
    items = [row({ wo_id: 1 }), row({ wo_id: 1, mark: 'CTR2' }), row({ wo_id: 2 })]
    render(<DrawingRevBadge moId={5} />)
    expect(screen.getByText('Drawing ใหม่ 2')).toBeInTheDocument()
  })

  it('shows nothing when there are no stale items', () => {
    items = []
    render(<DrawingRevBadge moId={5} />)
    expect(screen.queryByText(/Drawing ใหม่/)).not.toBeInTheDocument()
  })

  it('shows nothing while loading', () => {
    isLoading = true
    items = [row()]
    render(<DrawingRevBadge moId={5} />)
    expect(screen.queryByText(/Drawing ใหม่/)).not.toBeInTheDocument()
  })

  it('shows nothing on error', () => {
    isError = true
    items = [row()]
    render(<DrawingRevBadge moId={5} />)
    expect(screen.queryByText(/Drawing ใหม่/)).not.toBeInTheDocument()
  })
})
