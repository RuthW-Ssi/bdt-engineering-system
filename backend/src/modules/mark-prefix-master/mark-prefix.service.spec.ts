import { MarkPrefixService } from './mark-prefix.service'

// Regression coverage for the live bug: withPendingCount() used to scope
// bom_assembly via MoAllocationService.latestDispatchMap() (one "latest"
// dispatch per project/zone/sub_zone group), which is blind to separate
// Main/Acc uploads landing as two different dispatches for the same group —
// re-superseding the Acc upload alone made the group's "latest" dispatch the
// new Acc dispatch, silently dropping the untouched Main-slot dispatch (and
// its assemblies) out of the count entirely. Task 2 now stamps status
// ACTIVE/INACTIVE directly on bom_assembly, so withPendingCount() filters on
// that instead.

type FakeAssembly = {
  id: number
  assembly_mark: string
  qty: number
  status: string
  dispatch_id: number
  product?: { mark_prefix: string | null } | null
}

function makePrisma(assemblies: FakeAssembly[], prefixes: { code: string; category: string; active: boolean }[]) {
  return {
    mark_prefix_master: {
      findMany: jest.fn().mockResolvedValue(prefixes),
    },
    bom_assembly: {
      // Mirrors real Prisma's status filtering so the test proves the where
      // clause actually does the scoping (not just that counts look right).
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(assemblies.filter((a) => a.status === where.status)),
      ),
    },
  }
}

function makeAlloc(allocMap: Map<number, number> = new Map()) {
  return {
    latestDispatchMap: jest.fn().mockResolvedValue(new Map()),
    allocationMap: jest.fn().mockResolvedValue(allocMap),
    resolvePrefixCode: jest.fn((assembly: any, codes: string[]) => {
      if (assembly.product?.mark_prefix) return assembly.product.mark_prefix
      const mark = (assembly.assembly_mark ?? '').toUpperCase()
      return codes.find((c) => mark.startsWith(c.toUpperCase())) ?? null
    }),
  }
}

describe('MarkPrefixService.withPendingCount', () => {
  it('excludes INACTIVE assemblies from counts even with a valid prefix + positive remaining qty', async () => {
    const prefixes = [{ code: 'RF', category: 'C', active: true }]
    const assemblies: FakeAssembly[] = [
      { id: 1, assembly_mark: 'TC-RF-001', qty: 5, status: 'ACTIVE', dispatch_id: 10, product: { mark_prefix: 'RF' } },
      { id: 2, assembly_mark: 'TC-RF-002', qty: 3, status: 'INACTIVE', dispatch_id: 10, product: { mark_prefix: 'RF' } },
    ]
    const prisma = makePrisma(assemblies, prefixes)
    const alloc = makeAlloc()
    const svc = new MarkPrefixService(prisma as any, alloc as any)

    const result = await svc.withPendingCount()

    expect(prisma.bom_assembly.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE' } }),
    )
    expect(result).toEqual([expect.objectContaining({ code: 'RF', pending_bom_count: 1 })])
  })

  it('bug repro: Main-slot ACTIVE assemblies count correctly even when only Acc-slot was recently re-superseded', async () => {
    const prefixes = [{ code: 'RF', category: 'C', active: true }]
    const assemblies: FakeAssembly[] = [
      // Main upload — dispatch 10 — untouched, still ACTIVE. 16 rows to
      // mirror the live-reproduced "showed 0 instead of 16" scenario.
      ...Array.from({ length: 16 }, (_, i) => ({
        id: 100 + i,
        assembly_mark: `TC-RF-${i}`,
        qty: 1,
        status: 'ACTIVE',
        dispatch_id: 10,
        product: { mark_prefix: 'RF' },
      })),
      // Acc upload v1 — dispatch 11 — superseded by a re-upload, now INACTIVE.
      { id: 200, assembly_mark: 'TC-RF-ACC-001', qty: 2, status: 'INACTIVE', dispatch_id: 11, product: { mark_prefix: 'RF' } },
      // Acc upload v2 (re-upload) — dispatch 12 — the new "latest" dispatch
      // for the group under the old (now-removed) latestDispatchMap() scoping.
      { id: 201, assembly_mark: 'TC-RF-ACC-001', qty: 2, status: 'ACTIVE', dispatch_id: 12, product: { mark_prefix: 'RF' } },
    ]
    const prisma = makePrisma(assemblies, prefixes)
    const alloc = makeAlloc()
    const svc = new MarkPrefixService(prisma as any, alloc as any)

    const result = await svc.withPendingCount()

    // Old dispatch-scoped bug would only see dispatch 12 (1 Acc-slot row) and
    // report RF: 1 — or worse, RF: 0 if the "latest" dispatch for the group
    // resolved to something with no matching prefix at all. Correct behavior
    // counts every ACTIVE row regardless of dispatch: 16 Main + 1 Acc = 17.
    expect(result).toEqual([expect.objectContaining({ code: 'RF', pending_bom_count: 17 })])
    expect(alloc.latestDispatchMap).not.toHaveBeenCalled()
  })
})
