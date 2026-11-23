import { vi } from 'vitest'
import { getPreshop } from './bomPreshop'

const get = vi.fn()
vi.mock('./client', () => ({ apiClient: { get: (...a: unknown[]) => get(...a) } }))

describe('getPreshop', () => {
  it('reads an empty body (no pre-shop yet) as null', async () => {
    get.mockResolvedValue({ data: '' })
    expect(await getPreshop({ project_id: 43, zone_id: 79, sub_zone_id: null })).toBeNull()
  })
})
