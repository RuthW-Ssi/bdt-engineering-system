import { render, screen } from '@testing-library/react'
import { RenameHistory } from './RenameHistory'

describe('RenameHistory', () => {
  it('one card per event: type badge, X → Y, who/when, field-level old → new, which set was kept', () => {
    render(<RenameHistory history={[
      { id: 2, kind: 'ASSEMBLY', action: 'UNDO', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18', keep: 'old', changes: [{ field: 'cut', old: 50, new: 20 }], recorded_by: 'tao', recorded_at: '2026-10-21T10:40:00Z' },
      { id: 1, kind: 'ASSEMBLY', action: 'PAIR', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18', keep: 'old', changes: [{ field: 'ชื่อ mark', old: 'BUH1B-18', new: '3BUH1B-18' }, { field: 'cut', old: 0, new: 50 }], recorded_by: 'tao', recorded_at: '2026-10-21T10:30:00Z' },
    ]} />)
    expect(screen.getByText('ยกเลิกคู่')).toBeInTheDocument()
    expect(screen.getByText('จับคู่')).toBeInTheDocument()
    expect(screen.getAllByText('mark BUH1B-18 → 3BUH1B-18')).toHaveLength(2)
    expect(screen.getAllByText(/tao · 21 Oct 2026, 17:\d\d/)).toHaveLength(2)
    expect(screen.getAllByText('ใช้ข้อมูลของชื่อเดิม')).toHaveLength(2)
    expect(screen.getAllByText('Cut')).toHaveLength(2)
  })

  it('renders nothing without history', () => {
    const { container } = render(<RenameHistory history={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
