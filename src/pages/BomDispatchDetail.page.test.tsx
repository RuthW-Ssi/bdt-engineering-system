import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { BomDispatchDetail } from './BomDispatchDetail'

// vi.mock factories are hoisted — top-level values are only read lazily, inside the hooks.
let diffResult: { data: unknown; isLoading: boolean; isError: boolean }
let detailExtra: Record<string, unknown> = {}
vi.mock('../hooks/useBomDispatches', () => ({
  useDispatchDetail: () => ({ data: { id: 7, project_id: 3, zone_id: 23, sub_zone_id: 5, zone: { label: 'Z01' }, ...detailExtra }, isLoading: false, isError: false }),
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

// BOM-page pre-shop revisions have a diff too (2026-11-24, Tao) — the header says which pre-shop rev it is
describe('BomDispatchDetail — pre-shop revision', () => {
  afterEach(() => { detailExtra = {} })
  // only the versions, "v.5 → v.6", for pre-shop and full shop alike (Tao)
  it('the header shows the two versions compared, for pre-shop and for full shop', () => {
    detailExtra = { source: 'PRE_SHOP', revision: 6 }
    diffResult = { data: undefined, isLoading: true, isError: false }
    const { unmount } = renderAt()
    expect(screen.queryByText(/v\./)).toBeNull() // nothing until the diff is in
    unmount()
    // diff in (refetching keeps the body on its spinner, so the test needs no full aggregate)
    diffResult = { data: { prev_no: 5, curr_no: 6 }, isLoading: true, isError: false }
    renderAt()
    expect(screen.getByText('v.5 → v.6')).toBeInTheDocument()
    expect(screen.queryByText(/เทียบกับ/)).toBeNull()
  })

  // a zone's first full shop compares with its last pre-shop (2026-11-24, Tao)
  it('a first full shop compared with the last pre-shop names the pre-shop side', () => {
    detailExtra = { source: 'BOM_UPLOAD', revision: 4 }
    diffResult = { data: { prev_no: 3, curr_no: 1, prev_source: 'PRE_SHOP' }, isLoading: true, isError: false }
    renderAt()
    expect(screen.getByText('Pre-shop v.3 → v.1')).toBeInTheDocument()
  })
})
