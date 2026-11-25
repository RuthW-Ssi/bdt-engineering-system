import { vi } from 'vitest'
import { dispatchesApi } from './dispatches'

const get = vi.fn()
vi.mock('./client', () => ({ apiClient: { get: (...a: unknown[]) => get(...a) } }))

// One upload type per zone (2026-11-25): a Full shop or a BOM-page pre-shop sets it.
describe('getZoneUploadMode', () => {
  beforeEach(() => get.mockReset())

  it('full shop zone → its mode, hasFullShop true (pre-shop not asked)', async () => {
    get.mockResolvedValue({ data: { items: [{ upload_mode: 'separate' }] } })
    expect(await dispatchesApi.getZoneUploadMode(43, 79)).toEqual({ mode: 'separate', hasFullShop: true })
    expect(get).toHaveBeenCalledWith('/dispatches', { params: { project_id: 43, zone_id: 79, limit: 1, source: 'BOM_UPLOAD' } })
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('pre-shop only zone → mode from the pre-shop, hasFullShop false', async () => {
    get.mockImplementation((url: string) => Promise.resolve({ data: url === '/dispatches' ? { items: [] } : { upload_mode: 'separate' } }))
    expect(await dispatchesApi.getZoneUploadMode(43, 79)).toEqual({ mode: 'separate', hasFullShop: false })
    expect(get).toHaveBeenCalledWith('/bom/preshop', { params: { project_id: 43, zone_id: 79 } })
  })

  it('empty zone → { mode: null, hasFullShop: false }', async () => {
    get.mockImplementation((url: string) => Promise.resolve({ data: url === '/dispatches' ? { items: [] } : null }))
    expect(await dispatchesApi.getZoneUploadMode(43, 79)).toEqual({ mode: null, hasFullShop: false })
  })
})
