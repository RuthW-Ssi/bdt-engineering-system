import { NotFoundException } from '@nestjs/common'
import { WorkOrdersService } from './work-orders.service'

// Scoped narrowly to bomVersionStatus()/specOf() (T-WO.04 · BOM Version Alert) —
// this is the only part of WorkOrdersService with any test coverage today.

function makeWo(overrides: Partial<{
  bom_dispatch_id_snapshot: number
  bom_assembly: Record<string, unknown>
}> = {}) {
  return {
    id: 1,
    bom_dispatch_id_snapshot: 10,
    bom_assembly: {
      id: 100,
      assembly_mark: 'WH-CO-001',
      qty: 2,
      weight_kg: 100,
      surface_area_m2: 5,
      length_mm: 1000,
      width_mm: 200,
      height_mm: 50,
      attributes: {},
    },
    ...overrides,
  }
}

function makeDispatch(id: number, uploaded_at: Date) {
  return { id, project_id: 1, zone_id: 1, sub_zone_id: null, uploaded_at }
}

describe('WorkOrdersService.bomVersionStatus', () => {
  it('returns is_outdated: false when the snapshot dispatch is already the latest', async () => {
    const wo = makeWo()
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(snap),
        findFirst: jest.fn().mockResolvedValue(snap), // latestDispatchForGroup — same dispatch
      },
      bom_assembly: { findFirst: jest.fn() },
    }
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.bomVersionStatus(1)

    expect(result).toMatchObject({ is_outdated: false, delta_types: [], delta_details: null })
    expect(prisma.bom_assembly.findFirst).not.toHaveBeenCalled()
  })

  it('returns is_outdated: false when the snapshot dispatch row no longer exists', async () => {
    const wo = makeWo()
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(null), // snapshot row deleted
        findFirst: jest.fn(),
      },
      bom_assembly: { findFirst: jest.fn() },
    }
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.bomVersionStatus(1)

    expect(result).toMatchObject({ is_outdated: false, delta_types: [], delta_details: null })
    expect(prisma.bom_dispatch.findFirst).not.toHaveBeenCalled()
  })

  it('classifies REMOVED when the assembly mark no longer exists in the latest dispatch', async () => {
    const wo = makeWo()
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const latest = makeDispatch(20, new Date('2026-02-01'))
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(snap),
        findFirst: jest.fn().mockResolvedValue(latest),
      },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(null) }, // mark not found in latest
    }
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.bomVersionStatus(1)

    expect(result.is_outdated).toBe(true)
    expect(result.delta_types).toEqual(['REMOVED'])
    expect(result.delta_details).toBeNull()
  })

  it('classifies QTY_CHANGED with delta_details.qty when only qty differs', async () => {
    const wo = makeWo()
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const latest = makeDispatch(20, new Date('2026-02-01'))
    const latestAsm = { ...wo.bom_assembly, id: 200, qty: 5 } // qty 2 -> 5, spec unchanged
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(snap),
        findFirst: jest.fn().mockResolvedValue(latest),
      },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(latestAsm) },
    }
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.bomVersionStatus(1)

    expect(result.is_outdated).toBe(true)
    expect(result.delta_types).toEqual(['QTY_CHANGED'])
    expect(result.delta_details).toEqual({ qty: { from: 2, to: 5 } })
  })

  it('classifies SPEC_CHANGED with delta_details.spec when only a dimension (length_mm) differs', async () => {
    const wo = makeWo()
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const latest = makeDispatch(20, new Date('2026-02-01'))
    const latestAsm = { ...wo.bom_assembly, id: 200, length_mm: 1200 } // qty unchanged, length resized
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(snap),
        findFirst: jest.fn().mockResolvedValue(latest),
      },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(latestAsm) },
    }
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.bomVersionStatus(1)

    expect(result.is_outdated).toBe(true)
    expect(result.delta_types).toEqual(['SPEC_CHANGED'])
    expect(result.delta_details).toEqual({
      spec: {
        from: { weight_kg: 100, surface_area_m2: 5, length_mm: 1000, width_mm: 200, height_mm: 50, attributes: {} },
        to: { weight_kg: 100, surface_area_m2: 5, length_mm: 1200, width_mm: 200, height_mm: 50, attributes: {} },
      },
    })
  })

  it('classifies both QTY_CHANGED and SPEC_CHANGED when qty and a dimension both differ', async () => {
    const wo = makeWo()
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const latest = makeDispatch(20, new Date('2026-02-01'))
    const latestAsm = { ...wo.bom_assembly, id: 200, qty: 3, width_mm: 250 }
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(snap),
        findFirst: jest.fn().mockResolvedValue(latest),
      },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(latestAsm) },
    }
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.bomVersionStatus(1)

    expect(result.is_outdated).toBe(true)
    expect(result.delta_types).toEqual(['QTY_CHANGED', 'SPEC_CHANGED'])
    expect(result.delta_details).toMatchObject({
      qty: { from: 2, to: 3 },
      spec: { from: expect.objectContaining({ width_mm: 200 }), to: expect.objectContaining({ width_mm: 250 }) },
    })
  })

  it('throws NotFoundException when the work order does not exist', async () => {
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(null) },
      bom_dispatch: { findUnique: jest.fn(), findFirst: jest.fn() },
      bom_assembly: { findFirst: jest.fn() },
    }
    const svc = new WorkOrdersService(prisma as any)

    await expect(svc.bomVersionStatus(999)).rejects.toThrow(NotFoundException)
  })
})
