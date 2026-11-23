import { vi } from 'vitest'
import { dispatchesApi } from './dispatches'

const get = vi.fn()
vi.mock('./client', () => ({ apiClient: { get: (...a: unknown[]) => get(...a) } }))

// A BOM-page pre-shop saves as combined; it must not lock the zone's first real upload (2026-11-23).
describe('getZoneUploadMode', () => {
  it('looks at real BOM uploads only', async () => {
    get.mockResolvedValue({ data: { items: [] } })
    expect(await dispatchesApi.getZoneUploadMode(43, 79)).toBeNull()
    expect(get).toHaveBeenCalledWith('/dispatches', { params: { project_id: 43, zone_id: 79, limit: 1, source: 'BOM_UPLOAD' } })
  })
})
