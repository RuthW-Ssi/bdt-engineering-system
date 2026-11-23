import { vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BomList } from './BomList'

// Pre-shop on the BOM page (2026-11-23): read-only, tagged, edited from Upload BOM → Pre-shop.
const navigate = vi.fn()
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }))

const item = {
  id: 94, project_id: 43, zone_id: 80, sub_zone_id: null, status: 'complete', upload_mode: 'combined', revision: 2, source: 'PRE_SHOP',
  doc_count: 0, uploaded_at: '2026-11-23T03:00:00Z', zone: { id: 80, code: 'Z02', label: 'Pre-shop test' }, sub_zone: null,
  uploader: { id: 1, name: 'Admin' }, assembly_count: 2, part_count: 2, total_weight_kg: null, upload_no: 2,
}
vi.mock('../hooks/useBomDispatches', () => ({
  useDispatches: () => ({ data: { items: [item] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useDispatchDetail: () => ({ data: { ...item, assemblies: [], orphan_parts: [], doc_revisions: [] }, isLoading: false }),
}))
vi.mock('../hooks/usePaint', () => ({ usePaintConfig: () => ({ data: undefined, isLoading: false }) }))
vi.mock('../hooks/useProjectZones', () => ({ useProjectZones: () => ({ data: [{ id: 80, code: 'Z02', label: 'Pre-shop test' }] }) }))
vi.mock('../hooks/useSubZones', () => ({ useSubZones: () => ({ data: [] }) }))
vi.mock('../hooks/useProjectSelection', () => ({
  useProjectSelection: () => ({ activeProject: { id: 43, project_code: 'TEST-PS', name: 'Test' }, projects: [{ id: 43, project_code: 'TEST-PS', name: 'Test' }], selectProject: vi.fn() }),
}))
vi.mock('../hooks/usePermission', () => ({ usePermission: () => true }))

describe('BomList — pre-shop dispatch', () => {
  it('tags it as pre-shop, hides Paint and Update BOM, and opens the pre-shop editor', () => {
    render(<MemoryRouter><BomList /></MemoryRouter>)
    expect(screen.getAllByText('Pre-shop rev 2').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Paint' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Update BOM/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Edit pre-shop/ }))
    expect(navigate).toHaveBeenCalledWith('/bom/upload?project_id=43&zone_id=80&type=preshop')
  })

  it('opened with the Paint tab asked for, a pre-shop falls back to Tree', () => {
    render(<MemoryRouter initialEntries={[{ pathname: '/bom', state: { selectDispatch: 94, tab: 'paint' } }]}><BomList /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Tree' })).toHaveStyle({ fontWeight: '600' })
  })
})

