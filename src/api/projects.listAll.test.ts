import { afterEach, describe, expect, it, vi } from 'vitest'
import { projectsApi } from './projects'
import type { ProjectDTO } from './types'

const p = (id: number) => ({ id, project_code: `0X${id}` }) as ProjectDTO

describe('projectsApi.listAll', () => {
  afterEach(() => vi.restoreAllMocks())

  // 2026-11-09: project pickers asked for one page of 20, so the 21st project could not be picked
  it('reads every page, not only the first', async () => {
    const list = vi.spyOn(projectsApi, 'list').mockImplementation(async params => {
      const page = params?.page ?? 1
      const all = Array.from({ length: 130 }, (_, i) => p(i + 1))
      return { total: 130, page, limit: 100, pages: 2, items: all.slice((page - 1) * 100, page * 100) }
    })
    const items = await projectsApi.listAll()
    expect(items).toHaveLength(130)
    expect(list).toHaveBeenCalledTimes(2)
    expect(list.mock.calls[0][0]).toMatchObject({ page: 1, limit: 100 })
  })

  it('stops after one call when everything fits on the first page', async () => {
    const list = vi.spyOn(projectsApi, 'list').mockResolvedValue({ total: 3, page: 1, limit: 100, pages: 1, items: [p(1), p(2), p(3)] })
    expect(await projectsApi.listAll()).toHaveLength(3)
    expect(list).toHaveBeenCalledTimes(1)
  })
})
