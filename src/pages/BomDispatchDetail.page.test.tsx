import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { BomDispatchDetail } from './BomDispatchDetail'

// vi.mock factories are hoisted — top-level values are only read lazily, inside the hooks.
let diffResult: { data: unknown; isLoading: boolean; isError: boolean }
vi.mock('../hooks/useBomDispatches', () => ({
  useDispatchDetail: () => ({ data: { id: 7, project_id: 3, zone_id: 23, sub_zone_id: 5, zone: { label: 'Z01' } }, isLoading: false, isError: false }),
  useDispatchDiff: () => diffResult,
  useRenameCandidates: () => ({ data: undefined }),
  useDispatchRenames: () => ({ data: undefined }),
  useUndoRename: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('../hooks/usePermission', () => ({ usePermission: () => true }))

function BomPage() {
  const loc = useLocation()
  const s = loc.state as { selectDispatch?: number; tab?: string } | null
  return <div>{`BOM page ${loc.search} · dispatch ${s?.selectDispatch} · tab ${s?.tab}`}</div>
}

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={['/bom/dispatch/7']}>
      <Routes>
        <Route path="/bom/dispatch/:id" element={<BomDispatchDetail />} />
        <Route path="/bom" element={<BomPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('BomDispatchDetail — first upload (2026-10-28)', () => {
  it('no previous version to compare → goes to the BOM page of this dispatch\'s project/zone, on its Tree tab', () => {
    diffResult = { data: null, isLoading: false, isError: false }
    renderAt()
    expect(screen.getByText('BOM page ?project_id=3&zone_id=23&sub_zone_id=5 · dispatch 7 · tab tree')).toBeInTheDocument()
    expect(screen.queryByText('No previous version')).toBeNull()
  })

  it('stays on the diff page while the diff is still loading', () => {
    diffResult = { data: undefined, isLoading: true, isError: false }
    renderAt()
    expect(screen.queryByText(/BOM page/)).toBeNull()
  })
})
