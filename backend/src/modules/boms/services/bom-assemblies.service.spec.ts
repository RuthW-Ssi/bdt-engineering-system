import { BomAssembliesService } from './bom-assemblies.service'

// Regression coverage for the live bug: byMarkPrefix() used to scope
// bom_assembly via MoAllocationService.latestDispatchMap() (one "latest"
// dispatch per project/zone/sub_zone group), which is blind to separate
// Main/Acc uploads landing as two different dispatches for the same group —
// re-superseding the Acc upload alone made the group's "latest" dispatch the
// new Acc dispatch, silently dropping the untouched Main-slot dispatch (and
// its assemblies) out of the /mo/new Step 3 "Assemblies" picker entirely.
// Task 2 now stamps status ACTIVE/INACTIVE directly on bom_assembly, so
// byMarkPrefix() filters on that instead (same fix class as Task 4's
// MarkPrefixService.withPendingCount()).
//
// Also covers the bom_version display label switching from the meaningless
// latestDispatchMap() upload-order counter to BomDiffService
// .computeVersionLabels()'s "revision.minor" string label.

type FakeAssembly = {
  id: number
  assembly_mark: string
  name: string | null
  qty: number
  status: string
  dispatch_id: number
  product?: { mark_prefix: string | null } | null
  dispatch: {
    project: { name: string; target_handover: Date | null } | null
    zone: { label: string; target_erection_end: Date | null } | null
    sub_zone: { name: string; due_date: Date | null } | null
  }
}

function makePrisma(assemblies: FakeAssembly[], prefixes: { code: string }[] = []) {
  return {
    mark_prefix_master: {
      findMany: jest.fn().mockResolvedValue(prefixes),
    },
    bom_assembly: {
      // Mirrors real Prisma's status filtering so the test proves the where
      // clause actually does the scoping (not just that results look right).
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(assemblies.filter((a) => a.status === where.status)),
      ),
    },
  }
}

function makeAlloc(allocMap: Map<number, number> = new Map()) {
  return {
    allocationMap: jest.fn().mockResolvedValue(allocMap),
    allocationBreakdownMap: jest.fn().mockResolvedValue(new Map()),
    resolvePrefixCode: jest.fn((assembly: any, codes: string[]) => {
      if (assembly.product?.mark_prefix) return assembly.product.mark_prefix
      const mark = (assembly.assembly_mark ?? '').toUpperCase()
      return codes.find((c) => mark.startsWith(c.toUpperCase())) ?? null
    }),
    latestDispatchMap: jest.fn().mockResolvedValue(new Map()),
  }
}

function makeBomDiff(labels: Map<number, string> = new Map()) {
  return {
    computeVersionLabels: jest.fn().mockResolvedValue(labels),
  }
}

function dispatchStub() {
  return {
    project: { name: 'Project A', target_handover: null },
    zone: { label: 'Zone 1', target_erection_end: null },
    sub_zone: { name: 'Sub 1', due_date: null },
  }
}

describe('BomAssembliesService.byMarkPrefix', () => {
  it('excludes INACTIVE assemblies from the picker', async () => {
    const assemblies: FakeAssembly[] = [
      { id: 1, assembly_mark: 'TC-RF-001', name: null, qty: 5, status: 'ACTIVE', dispatch_id: 10, product: { mark_prefix: 'RF' }, dispatch: dispatchStub() },
      { id: 2, assembly_mark: 'TC-RF-002', name: null, qty: 3, status: 'INACTIVE', dispatch_id: 10, product: { mark_prefix: 'RF' }, dispatch: dispatchStub() },
    ]
    const prisma = makePrisma(assemblies, [{ code: 'RF' }])
    const alloc = makeAlloc()
    const bomDiff = makeBomDiff()
    const svc = new BomAssembliesService(prisma as any, alloc as any, bomDiff as any)

    const result = await svc.byMarkPrefix({})

    expect(prisma.bom_assembly.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE' } }),
    )
    expect(result.total).toBe(1)
    expect(result.groups[0].items.map((i) => i.id)).toEqual([1])
  })

  it('bom_version reflects computeVersionLabels() output for the assembly dispatch id', async () => {
    const assemblies: FakeAssembly[] = [
      { id: 1, assembly_mark: 'TC-RF-001', name: null, qty: 5, status: 'ACTIVE', dispatch_id: 10, product: { mark_prefix: 'RF' }, dispatch: dispatchStub() },
    ]
    const prisma = makePrisma(assemblies, [{ code: 'RF' }])
    const alloc = makeAlloc()
    const bomDiff = makeBomDiff(new Map([[10, '2.1']]))
    const svc = new BomAssembliesService(prisma as any, alloc as any, bomDiff as any)

    const result = await svc.byMarkPrefix({})

    expect(bomDiff.computeVersionLabels).toHaveBeenCalledWith([10])
    expect(result.groups[0].items[0].bom_version).toBe('2.1')
  })

  it('falls back to "1.0" when computeVersionLabels() has no label for the dispatch', async () => {
    const assemblies: FakeAssembly[] = [
      { id: 1, assembly_mark: 'TC-RF-001', name: null, qty: 5, status: 'ACTIVE', dispatch_id: 10, product: { mark_prefix: 'RF' }, dispatch: dispatchStub() },
    ]
    const prisma = makePrisma(assemblies, [{ code: 'RF' }])
    const alloc = makeAlloc()
    const bomDiff = makeBomDiff(new Map()) // no label for dispatch 10
    const svc = new BomAssembliesService(prisma as any, alloc as any, bomDiff as any)

    const result = await svc.byMarkPrefix({})

    expect(result.groups[0].items[0].bom_version).toBe('1.0')
  })

  it('bug repro: Main-slot ACTIVE assemblies are not hidden when only Acc-slot was recently re-superseded', async () => {
    const assemblies: FakeAssembly[] = [
      // Main upload — dispatch 10 — untouched, still ACTIVE.
      ...Array.from({ length: 16 }, (_, i) => ({
        id: 100 + i,
        assembly_mark: `TC-RF-${i}`,
        name: null,
        qty: 1,
        status: 'ACTIVE',
        dispatch_id: 10,
        product: { mark_prefix: 'RF' },
        dispatch: dispatchStub(),
      })),
      // Acc upload v1 — dispatch 11 — superseded by a re-upload, now INACTIVE.
      { id: 200, assembly_mark: 'TC-RF-ACC-001', name: null, qty: 2, status: 'INACTIVE', dispatch_id: 11, product: { mark_prefix: 'RF' }, dispatch: dispatchStub() },
      // Acc upload v2 (re-upload) — dispatch 12 — the new "latest" dispatch
      // for the group under the old (now-removed) latestDispatchMap() scoping.
      { id: 201, assembly_mark: 'TC-RF-ACC-001', name: null, qty: 2, status: 'ACTIVE', dispatch_id: 12, product: { mark_prefix: 'RF' }, dispatch: dispatchStub() },
    ]
    const prisma = makePrisma(assemblies, [{ code: 'RF' }])
    const alloc = makeAlloc()
    const bomDiff = makeBomDiff()
    const svc = new BomAssembliesService(prisma as any, alloc as any, bomDiff as any)

    const result = await svc.byMarkPrefix({ mark_prefix_id: 'RF' })

    // Old dispatch-scoped bug would only see dispatch 12 (1 Acc-slot row).
    // Correct behavior keeps every ACTIVE row regardless of dispatch:
    // 16 Main + 1 Acc = 17.
    expect(result.total).toBe(17)
    expect(alloc.latestDispatchMap).not.toHaveBeenCalled()
  })
})
