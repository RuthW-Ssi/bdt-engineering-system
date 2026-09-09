import { ProjectZonesService } from './project-zones.service'

describe('ProjectZonesService.findAll', () => {
  it('excludes placeholder zones by default', async () => {
    const prisma = { project_zone: { findMany: jest.fn().mockResolvedValue([]) } }
    const svc = new ProjectZonesService(prisma as any)
    await svc.findAll(1)
    expect(prisma.project_zone.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { project_id: 1, active: true, is_placeholder: false },
    }))
  })
})
