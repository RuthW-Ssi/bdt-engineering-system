import { describe, expect, it, vi } from 'vitest'

const get = vi.fn()
vi.mock('./client', () => ({ apiClient: { get: (...a: unknown[]) => get(...a) } }))

import { libraryApi } from './library'

describe('libraryApi.markPrefixMaster', () => {
  it('reads the active mark_prefix_master registry — not only prefixes that have products', async () => {
    // OTH (MO Part) has no product_library entry, so /product-library/mark-prefixes
    // never lists it and the Routing builder could not bind a routing to it.
    get.mockResolvedValue({ data: [{ code: 'OTH', label: 'อื่นๆ', category: 'other', part_type_code: 'o', active: true }] })
    const rows = await libraryApi.markPrefixMaster()
    expect(get).toHaveBeenCalledWith('/mark-prefixes', { params: { active: 'true' } })
    expect(rows).toEqual([{ code: 'OTH', label: 'อื่นๆ', category: 'other', part_type_code: 'o', active: true }])
  })
})
