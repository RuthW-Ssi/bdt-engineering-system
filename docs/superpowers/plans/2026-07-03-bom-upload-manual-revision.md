# BOM Upload Manual Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store an explicit `revision` number on `bom_dispatch`, let the user choose "continue" vs "new" revision at upload time, and rework the BOM diff to compare whole revision-groups (all dispatches sharing a revision number) instead of single dispatches, so a Main-only upload followed by an Acc-only upload can share one revision without producing a nonsense diff between them.

**Architecture:** A new `revision` column replaces today's purely-computed (list-position) versioning. The upload endpoint resolves the actual revision value server-side from a client-expressed intent (`continue`/`new`). `BomDiffService` is reworked from single-dispatch-id lookups to revision-group aggregation (`dispatch_id: { in: [...] }`) on both the "current" and "previous" sides.

**Tech Stack:** NestJS 10 + Prisma 6 + PostgreSQL 16 (backend, Jest test runner exists — TDD applies to backend tasks); React 19 + Vite + TS (frontend, **no test runner** — verification is `npx tsc` + manual/Playwright browser checks, per established project convention).

## Global Constraints

- No data merging, ever — dispatches sharing a revision number remain independent rows; `BomList` still lists them as separate items with the same "vN" label.
- `BomUpload.tsx`'s already-relaxed gate (`hasAllMain || hasAllAcc`, commit `fd9c27f`) stays as-is — not touched by this plan.
- Revision resolution: no prior dispatch for `(project_id, zone_id, sub_zone_id)` → forced to `1` regardless of client intent. Otherwise `continue` → reuse `MAX(revision)`; `new` → `MAX(revision) + 1`. Computed server-side, never trusted from the client directly.
- Paint carry-forward (`carryForwardPaintConfig`) is explicitly **not** touched by this plan — stays "most recent other dispatch by time."
- Do not confuse this new `bom_dispatch.revision` field with the existing, unrelated `GET dispatches/:id/revisions` endpoint / `bom_doc_revision` table — that's a per-file upload-history audit trail on a single dispatch, a different concept from the dispatch-level revision number this plan adds.
- New static route `dispatches/latest-revision` **must** be registered before the existing `@Get('dispatches/:id')` route in the controller — NestJS matches routes in declaration order, and `:id` would otherwise swallow `latest-revision` as a param value.

---

### Task 1: Schema — add `revision` to `bom_dispatch`

**Files:**
- Modify: `backend/prisma/schema.prisma:801-833` (`bom_dispatch` model)

**Interfaces:**
- Produces: `bom_dispatch.revision: number` (Prisma Client field), available to every later backend task.

- [ ] **Step 1: Add the column and index**

In `backend/prisma/schema.prisma`, in the `bom_dispatch` model, add the field right after `upload_mode`:

```prisma
model bom_dispatch {
  id                    Int          @id @default(autoincrement())
  project_id            Int
  project               project      @relation("ProjectDispatches", fields: [project_id], references: [id])
  zone_id               Int
  zone                  project_zone @relation("ZoneDispatches", fields: [zone_id], references: [id])
  sub_zone_id           Int?
  sub_zone              sub_zone?    @relation("SubZoneDispatches", fields: [sub_zone_id], references: [id])
  status                String       @default("draft") @db.VarChar(20) // draft | processing | ready | error
  upload_mode           String       @default("combined") @db.VarChar(20) // combined | separate
  revision              Int          @default(1) // explicit revision number — user-controlled at upload time (see BomUploadService.upload)
  uploaded_at           DateTime     @default(now()) @db.Timestamptz
  // Aggregate counts — cached after processing
  assembly_total        Int?
  part_total            Int?
  // mBOM coverage — saved after welding compute()
  welding_coverage_json Json?
  // Audit
  create_uid            Int
  create_user           res_users    @relation("dispatch_create", fields: [create_uid], references: [id])
  create_date           DateTime     @default(now()) @db.Timestamptz
  write_uid             Int
  write_user            res_users    @relation("dispatch_write", fields: [write_uid], references: [id])
  write_date             DateTime     @default(now()) @db.Timestamptz

  doc_revisions  bom_doc_revision[]
  assemblies     bom_assembly[]
  parts          bom_part[]
  paint_configs  mbom_assembly_paint[] @relation("DispatchPaint")

  @@index([project_id, status])
  @@index([zone_id])
  @@index([uploaded_at])
  @@index([zone_id, sub_zone_id, revision])
}
```

(Only the `revision` field and the new `@@index([zone_id, sub_zone_id, revision])` line are additions — everything else shown is unchanged, included so the diff context is unambiguous.)

- [ ] **Step 2: Run the migration**

Run: `cd backend && npx prisma migrate dev --name add_bom_dispatch_revision`
Expected: migration applies cleanly against the local `bdt_dev` database (currently empty of BOM data — no backfill data to worry about), and regenerates the Prisma Client with `revision: number` on `bom_dispatch`.

- [ ] **Step 3: Verify the backend still builds**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json` (or the project's existing backend build check — confirm the exact command from `backend/package.json`'s `"build"` script if `tsconfig.json` isn't the right target)
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "[bom-upload-manual-revision] schema: add bom_dispatch.revision column"
```

---

### Task 2: Backend — revision resolution on upload + latest-revision endpoint

**Files:**
- Modify: `backend/src/modules/bom-upload/bom-upload.service.ts` (the `upload()` method, and a new `getLatestRevision` method)
- Modify: `backend/src/modules/bom-upload/bom-upload.controller.ts` (accept `revision_choice` in the upload body; add the new `GET dispatches/latest-revision` route)
- Modify: `backend/src/modules/bom-upload/dto/dispatch.dto.ts` (new `QueryLatestRevisionDto`)
- Test: `backend/src/modules/bom-upload/bom-upload.service.spec.ts`

**Interfaces:**
- Consumes: `bom_dispatch.revision` from Task 1.
- Produces: `BomUploadService.upload(...)` gains a new parameter `revisionChoice: 'continue' | 'new'` (appended after the existing `uploadMode` param) and stores the resolved integer on the created dispatch. `BomUploadService.getLatestRevision(projectId: number, zoneId: number, subZoneId: number | null): Promise<{ revision: number | null }>` — used by both this task's new route and Task 4's frontend hook.

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/modules/bom-upload/bom-upload.service.spec.ts` (in the existing `describe` block that tests `upload()` — find it and add these `it`s alongside the existing upload tests; the file already has `buildPrisma()`/`buildInnerPrisma()` helpers from the top of the file, shown below for reference):

```typescript
describe('BomUploadService — revision resolution', () => {
  function buildRevisionPrisma(latestRevision: number | null) {
    const dispatch = { id: 1, project_id: 1, zone_id: 2, sub_zone_id: null, status: 'pending', uploaded_at: new Date(), assembly_total: null, part_total: null }
    const innerCreateSpy = jest.fn().mockResolvedValue({ ...dispatch, id: 100 })
    const prisma = {
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb({
        bom_dispatch: {
          findFirst: jest.fn().mockResolvedValue(latestRevision == null ? null : { revision: latestRevision }),
          create: innerCreateSpy,
          update: jest.fn(({ data }: any) => Promise.resolve({ ...dispatch, ...data })),
        },
        bom_doc_revision: { create: jest.fn().mockResolvedValue({ id: 1 }) },
        bom_assembly: { createManyAndReturn: jest.fn().mockResolvedValue([]) },
        bom_part: { createManyAndReturn: jest.fn().mockResolvedValue([]) },
        bom_assembly_part: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      })),
      bom_dispatch: { count: jest.fn().mockResolvedValue(1), findUnique: jest.fn().mockResolvedValue(dispatch) },
    }
    return { prisma, innerCreateSpy }
  }

  const minimalFiles: FileInput[] = [
    { buffer: Buffer.from('x'), originalname: 'assembly list.xlsx', mimetype: 'application/vnd.ms-excel', size: 1, docType: 'ASSEMBLY_LIST' },
    { buffer: Buffer.from('x'), originalname: 'assembly part list.xlsx', mimetype: 'application/vnd.ms-excel', size: 1, docType: 'ASSEMBLY_PART_LIST' },
    { buffer: Buffer.from('x'), originalname: 'part list.xlsx', mimetype: 'application/vnd.ms-excel', size: 1, docType: 'PART_LIST' },
  ]
  const noNcFiles: NcFileInput[] = []

  it('forces revision 1 when no prior dispatch exists for the zone/sub-zone, regardless of choice', async () => {
    const { prisma, innerCreateSpy } = buildRevisionPrisma(null)
    const svc = new BomUploadService(prisma as any, /* other ctor deps mocked as in existing tests */)
    await svc.upload(minimalFiles, noNcFiles, 1, 2, null, 1, 'combined', 'new')
    expect(innerCreateSpy).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revision: 1 }) }))
  })

  it('reuses the latest revision when revisionChoice is "continue"', async () => {
    const { prisma, innerCreateSpy } = buildRevisionPrisma(3)
    const svc = new BomUploadService(prisma as any, /* other ctor deps mocked as in existing tests */)
    await svc.upload(minimalFiles, noNcFiles, 1, 2, null, 1, 'combined', 'continue')
    expect(innerCreateSpy).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revision: 3 }) }))
  })

  it('increments to latest+1 when revisionChoice is "new" and a prior dispatch exists', async () => {
    const { prisma, innerCreateSpy } = buildRevisionPrisma(3)
    const svc = new BomUploadService(prisma as any, /* other ctor deps mocked as in existing tests */)
    await svc.upload(minimalFiles, noNcFiles, 1, 2, null, 1, 'combined', 'new')
    expect(innerCreateSpy).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revision: 4 }) }))
  })
})

describe('BomUploadService — getLatestRevision', () => {
  it('returns null when no dispatch exists for the zone/sub-zone', async () => {
    const prisma = { bom_dispatch: { findFirst: jest.fn().mockResolvedValue(null) } }
    const svc = new BomUploadService(prisma as any, /* other ctor deps mocked as in existing tests */)
    const result = await svc.getLatestRevision(1, 2, null)
    expect(result).toEqual({ revision: null })
  })

  it('returns the max revision for that exact zone/sub-zone scope', async () => {
    const prisma = { bom_dispatch: { findFirst: jest.fn().mockResolvedValue({ revision: 5 }) } }
    const svc = new BomUploadService(prisma as any, /* other ctor deps mocked as in existing tests */)
    const result = await svc.getLatestRevision(1, 2, null)
    expect(result).toEqual({ revision: 5 })
    expect(prisma.bom_dispatch.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { project_id: 1, zone_id: 2, sub_zone_id: null },
      orderBy: { revision: 'desc' },
    }))
  })
})
```

Note: `/* other ctor deps mocked as in existing tests */` — look at how `BomUploadService` is instantiated elsewhere in this same spec file (it takes more constructor dependencies than just `prisma` — parser, storage, etc.) and reuse that exact same construction pattern for consistency; don't guess new mocks for dependencies already mocked elsewhere in the file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest bom-upload.service.spec.ts -t "revision"`
Expected: FAIL — `svc.upload` doesn't accept an 8th `revisionChoice` argument yet, and `svc.getLatestRevision` doesn't exist.

- [ ] **Step 3: Implement `getLatestRevision`**

In `backend/src/modules/bom-upload/bom-upload.service.ts`, add this method (near `getRevisions`, but note this is a *different* concept — don't merge them):

```typescript
async getLatestRevision(projectId: number, zoneId: number, subZoneId: number | null): Promise<{ revision: number | null }> {
  const latest = await this.prisma.bom_dispatch.findFirst({
    where: { project_id: projectId, zone_id: zoneId, sub_zone_id: subZoneId },
    orderBy: { revision: 'desc' },
    select: { revision: true },
  })
  return { revision: latest?.revision ?? null }
}
```

- [ ] **Step 4: Implement revision resolution inside `upload()`**

In `upload()`, add the new parameter and resolve the revision inside the existing transaction, right before `tx.bom_dispatch.create(...)`:

```typescript
async upload(
  files: FileInput[],
  ncFiles: NcFileInput[],
  projectId: number,
  zoneId: number,
  subZoneId: number | null,
  uid: number,
  uploadMode: 'combined' | 'separate' = 'combined',
  revisionChoice: 'continue' | 'new' = 'new',
) {
```

Then, inside the `$transaction` callback, immediately before the existing `const d = await tx.bom_dispatch.create({...})` call:

```typescript
        const latest = await tx.bom_dispatch.findFirst({
          where: { project_id: projectId, zone_id: zoneId, sub_zone_id: subZoneId },
          orderBy: { revision: 'desc' },
          select: { revision: true },
        })
        const revision = !latest ? 1 : revisionChoice === 'continue' ? latest.revision : latest.revision + 1

        // bom_dispatch
        const d = await tx.bom_dispatch.create({
          data: {
            project_id: projectId,
            zone_id: zoneId,
            sub_zone_id: subZoneId,
            status: 'pending',
            upload_mode: uploadMode,
            revision,
            create_uid: uid,
            write_uid: uid,
          },
        })
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx jest bom-upload.service.spec.ts -t "revision"`
Expected: PASS (5/5 new tests), and run the full file (`npx jest bom-upload.service.spec.ts`) to confirm no existing tests broke.

- [ ] **Step 6: Wire the controller — accept `revision_choice`, add the new route**

In `backend/src/modules/bom-upload/dto/dispatch.dto.ts`, add:

```typescript
export class QueryLatestRevisionDto {
  @ApiPropertyOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1)
  project_id!: number

  @ApiPropertyOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1)
  zone_id!: number

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value != null ? Number(value) : undefined) @IsInt() @Min(1)
  sub_zone_id?: number
}
```

In `backend/src/modules/bom-upload/bom-upload.controller.ts`:

1. Import the new DTO: add `QueryLatestRevisionDto` to the existing `import { QueryDispatchDto } from './dto/dispatch.dto'` line.
2. In `upload()`, read the new field and pass it through:

```typescript
    const revisionChoice = (body['revision_choice'] === 'continue' ? 'continue' : 'new') as 'continue' | 'new'

    return this.svc.upload(fileInputs, ncInputs, projectId, zoneId, subZoneId, user.sub, uploadMode, revisionChoice)
```

3. Add the new route **before** `@Get('dispatches/:id')` (route order matters — see Global Constraints):

```typescript
  @Get('dispatches/latest-revision')
  @ApiOperation({ summary: 'Get the latest revision number for a zone/sub-zone (null if none exists yet)' })
  getLatestRevision(@Query() query: QueryLatestRevisionDto) {
    return this.svc.getLatestRevision(query.project_id, query.zone_id, query.sub_zone_id ?? null)
  }

  @Get('dispatches/:id')
  @ApiOperation({ summary: 'Get BOM dispatch detail' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }
```

Also update the existing `@ApiBody` schema block for `upload()` to document the new field (add alongside the existing `upload_mode` property):
```typescript
        revision_choice: { type: 'string', enum: ['continue', 'new'] },
```

- [ ] **Step 7: Run the full backend test suite for this module**

Run: `cd backend && npx jest bom-upload.service.spec.ts`
Expected: all tests pass (existing + new).

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/bom-upload/bom-upload.service.ts backend/src/modules/bom-upload/bom-upload.controller.ts backend/src/modules/bom-upload/dto/dispatch.dto.ts backend/src/modules/bom-upload/bom-upload.service.spec.ts
git commit -m "[bom-upload-manual-revision] backend: resolve revision on upload + latest-revision endpoint"
```

---

### Task 3: Backend — diff service rework for revision-group aggregation

**Files:**
- Modify: `backend/src/modules/bom-upload/bom-diff.service.ts`
- Test: `backend/src/modules/bom-upload/bom-diff.service.spec.ts`

**Interfaces:**
- Consumes: `bom_dispatch.revision` from Task 1.
- Produces: `BomDiffService.computeDiff(id: number)` keeps its exact existing external signature and return shape (`DispatchDiffResult | null`) — only its internal resolution changes from single-dispatch to revision-group. No caller (the controller's `getDiff` route) needs to change.

- [ ] **Step 1: Update the existing mocks to support `findMany`-by-array and revision fields**

The existing spec file's Prisma mocks use direct equality checks like `where.dispatch_id === 1`. Since the reworked service will query with `dispatch_id: { in: [...] }`, update every `bom_assembly`/`bom_part`/`bom_assembly_part` mock `findMany` in `backend/src/modules/bom-upload/bom-diff.service.spec.ts` to match on the `in` array instead. In the fixture-based `buildPrisma` function, change:

```typescript
    bom_assembly: {
      findMany: jest.fn(({ where }: any) => {
        const ids: number[] = where.dispatch_id.in
        if (ids.includes(1)) return Promise.resolve(asm0Rows)
        if (ids.includes(2)) return Promise.resolve(asm1Rows)
        return Promise.resolve([])
      }),
    },
    bom_part: {
      findMany: jest.fn(({ where }: any) => {
        const ids: number[] = where.dispatch_id.in
        if (ids.includes(1)) return Promise.resolve(part0Rows)
        if (ids.includes(2)) return Promise.resolve(part1Rows)
        return Promise.resolve([])
      }),
    },
    bom_assembly_part: {
      findMany: jest.fn(({ where }: any) => {
        const ids: number[] = where?.assembly?.dispatch_id?.in ?? []
        if (ids.includes(1)) return Promise.resolve(junctions0)
        if (ids.includes(2)) return Promise.resolve(junctions1)
        return Promise.resolve([])
      }),
    },
```

Apply the identical `where.dispatch_id.in` / `where?.assembly?.dispatch_id?.in` pattern to the other two mock-building helpers in this file (`makeMinimalPrisma` in the "algorithm unit tests" describe block, and the inline mocks in the "returns null when no previous dispatch exists" / "throws NotFoundException" tests). Also add `revision: 1` to every mock dispatch object in this file (`dispatch0`, `dispatch1`, and the inline dispatch objects in `makeMinimalPrisma` and the two edge-case tests) — the new `findPreviousRevisionGroup` needs this field on every dispatch row it reads. Also add a `bom_dispatch.findMany` mock (used to resolve sibling ids within a revision group) to every one of these Prisma mocks — for the two-dispatch fixture cases, it should return `[dispatch0]` when queried for revision-1's group and `[dispatch1]` when queried for revision-2's group (adapt based on each test's specific dispatch/revision setup).

- [ ] **Step 2: Write the new failing test for revision-group aggregation**

Add to `backend/src/modules/bom-upload/bom-diff.service.spec.ts`, in a new `describe` block:

```typescript
describe('BomDiffService — revision-group aggregation', () => {
  function buildGroupedPrisma() {
    // Revision 0: one combined dispatch (id 1) with assemblies B1, B2
    // Revision 1: two dispatches sharing revision 1 — Main (id 2, assembly M1) and Acc (id 3, assembly A1)
    const dispatches = [
      { id: 1, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-01-01'), revision: 0 },
      { id: 2, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-02-01'), revision: 1 },
      { id: 3, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-02-02'), revision: 1 },
    ]
    const assembliesByDispatch: Record<number, any[]> = {
      1: [
        { assembly_mark: 'B1', name: 'Base 1', qty: 1, weight_kg: 100, surface_area_m2: 5 },
        { assembly_mark: 'B2', name: 'Base 2', qty: 1, weight_kg: 50, surface_area_m2: 3 },
      ],
      2: [{ assembly_mark: 'M1', name: 'Main 1', qty: 1, weight_kg: 80, surface_area_m2: 4 }],
      3: [{ assembly_mark: 'A1', name: 'Acc 1', qty: 1, weight_kg: 20, surface_area_m2: 1 }],
    }
    return {
      bom_dispatch: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(dispatches.find(d => d.id === where.id) ?? null)),
        findMany: jest.fn(({ where }: any) => {
          // resolve sibling ids sharing a revision, or the latest-prior-revision lookup
          if (where.revision != null) {
            return Promise.resolve(dispatches.filter(d => d.zone_id === where.zone_id && d.sub_zone_id === where.sub_zone_id && d.revision === where.revision))
          }
          return Promise.resolve(dispatches.filter(d => d.zone_id === where.zone_id && d.sub_zone_id === where.sub_zone_id && d.revision < where.revision.lt))
        }),
        findFirst: jest.fn(({ where }: any) =>
          Promise.resolve(
            dispatches
              .filter(d => d.zone_id === where.zone_id && d.sub_zone_id === where.sub_zone_id && d.revision < where.revision.lt)
              .sort((a, b) => b.revision - a.revision)[0] ?? null,
          ),
        ),
      },
      bom_assembly: {
        findMany: jest.fn(({ where }: any) => {
          const ids: number[] = where.dispatch_id.in
          return Promise.resolve(ids.flatMap(id => assembliesByDispatch[id] ?? []))
        }),
      },
      bom_part: { findMany: jest.fn().mockResolvedValue([]) },
      bom_assembly_part: { findMany: jest.fn().mockResolvedValue([]) },
    }
  }

  it('diffs the union of a same-revision group (Main+Acc) against the true prior revision, not against each other', async () => {
    const svc = new BomDiffService(buildGroupedPrisma() as any)
    const result = await svc.computeDiff(3) // dispatch 3 = Acc, revision 1

    expect(result).not.toBeNull()
    const marks = result!.assembly_diff.map(r => (r.curr ?? r.prev)!.assembly_mark).sort()
    // current group = {M1, A1} (dispatch 2 + 3, both revision 1), previous = {B1, B2} (revision 0)
    expect(marks).toEqual(['A1', 'B1', 'B2', 'M1'])
    expect(result!.assembly_diff.find(r => r.curr?.assembly_mark === 'M1')!.status).toBe('added')
    expect(result!.assembly_diff.find(r => r.curr?.assembly_mark === 'A1')!.status).toBe('added')
    expect(result!.assembly_diff.find(r => r.prev?.assembly_mark === 'B1')!.status).toBe('removed')
    expect(result!.assembly_diff.find(r => r.prev?.assembly_mark === 'B2')!.status).toBe('removed')
  })

  it('returns null when the dispatch is the first-ever revision for its zone/sub-zone (no earlier revision, sibling or not)', async () => {
    const soloPrisma = buildGroupedPrisma()
    // Simulate viewing dispatch 1 itself (revision 0, nothing earlier than 0)
    const svc = new BomDiffService(soloPrisma as any)
    const result = await svc.computeDiff(1)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && npx jest bom-diff.service.spec.ts -t "revision-group"`
Expected: FAIL — current `findPrevious` finds "the most recent other dispatch by time" (would incorrectly return dispatch 2 as "previous" for dispatch 3), not a revision-group-aware result.

- [ ] **Step 4: Rework `BomDiffService`**

Replace the `findPrevious` method and the body of `computeDiff`, and update the three helper methods, in `backend/src/modules/bom-upload/bom-diff.service.ts`:

```typescript
  private async findRevisionGroupIds(projectId: number, zoneId: number, subZoneId: number | null, revision: number): Promise<number[]> {
    const rows = await this.prisma.bom_dispatch.findMany({
      where: { project_id: projectId, zone_id: zoneId, sub_zone_id: subZoneId, revision },
      select: { id: true },
    })
    return rows.map(r => r.id)
  }

  async findPreviousRevisionGroup(id: number): Promise<{ currentIds: number[]; previousIds: number[] } | null> {
    const current = await this.prisma.bom_dispatch.findUnique({ where: { id } })
    if (!current) throw new NotFoundException(`Dispatch ${id} not found`)

    const currentIds = await this.findRevisionGroupIds(current.project_id, current.zone_id, current.sub_zone_id, current.revision)

    const previousDispatch = await this.prisma.bom_dispatch.findFirst({
      where: {
        project_id: current.project_id,
        zone_id: current.zone_id,
        sub_zone_id: current.sub_zone_id,
        revision: { lt: current.revision },
      },
      orderBy: { revision: 'desc' },
    })
    if (!previousDispatch) return null

    const previousIds = await this.findRevisionGroupIds(current.project_id, current.zone_id, current.sub_zone_id, previousDispatch.revision)
    return { currentIds, previousIds }
  }

  async computeDiff(id: number): Promise<DispatchDiffResult | null> {
    const groups = await this.findPreviousRevisionGroup(id)
    if (!groups) return null
    const { currentIds, previousIds } = groups

    const [currDetail, prevDetail] = await Promise.all([
      this.loadRevisionGroupData(currentIds),
      this.loadRevisionGroupData(previousIds),
    ])

    const currDispatches = await this.prisma.bom_dispatch.findMany({ where: { id: { in: currentIds } } })
    const prevDispatches = await this.prisma.bom_dispatch.findMany({ where: { id: { in: previousIds } } })

    const warning = this.computeWarning(
      prevDispatches.map(d => d.status),
      currDispatches.map(d => d.status),
    )

    const assembly_diff = diffEntities(
      prevDetail.assemblies, currDetail.assemblies,
      a => a.assembly_mark, assembliesEqual,
    )

    const part_diff = diffEntities(
      prevDetail.parts, currDetail.parts,
      p => p.part_mark, partsEqual,
    )

    const junction_diff = diffEntities(
      prevDetail.junctions, currDetail.junctions,
      j => `${j.assembly_mark}__${j.part_mark}`, junctionsEqual,
    )

    const aggregate = await this.computeAggregate(previousIds, currentIds, assembly_diff, part_diff)

    return {
      prev_id: previousIds[0],
      curr_id: currentIds[0],
      warning,
      aggregate,
      assembly_diff,
      part_diff,
      junction_diff,
    }
  }
```

Update `loadDispatchData` → `loadRevisionGroupData` (rename, change every `where: { dispatch_id: id }` to `where: { dispatch_id: { in: ids } }`, and the junction query's nested filter to `where: { assembly: { dispatch_id: { in: ids } } }`):

```typescript
  private async loadRevisionGroupData(ids: number[]) {
    const [assemblies, parts, junctions] = await Promise.all([
      this.prisma.bom_assembly.findMany({
        where: { dispatch_id: { in: ids } },
        select: { assembly_mark: true, name: true, qty: true, weight_kg: true, surface_area_m2: true },
      }),
      this.prisma.bom_part.findMany({
        where: { dispatch_id: { in: ids } },
        select: { part_mark: true, description: true, profile: true, grade: true, qty: true, length_mm: true, weight_kg: true },
      }),
      this.prisma.bom_assembly_part.findMany({
        where: { assembly: { dispatch_id: { in: ids } } },
        select: {
          qty: true,
          assembly: { select: { assembly_mark: true } },
          part: { select: { part_mark: true } },
        },
      }),
    ])

    return {
      assemblies: assemblies.map(a => ({
        assembly_mark: a.assembly_mark,
        name: a.name ?? null,
        qty: toNum(a.qty),
        weight_kg: toNum(a.weight_kg),
        surface_area_m2: toNum(a.surface_area_m2),
      })) as AssemblyDiffItem[],

      parts: parts.map(p => ({
        part_mark: p.part_mark,
        description: p.description ?? null,
        profile: p.profile ?? null,
        grade: p.grade ?? null,
        qty: toNum(p.qty),
        length_mm: toNum(p.length_mm),
        weight_kg: toNum(p.weight_kg),
      })) as PartDiffItem[],

      junctions: junctions.map(j => ({
        assembly_mark: j.assembly.assembly_mark,
        part_mark: j.part.part_mark,
        qty: toNum(j.qty) ?? 1,
      })) as JunctionDiffItem[],
    }
  }
```

Update `computeAggregate` and `sumWeightArea` to take arrays:

```typescript
  private async computeAggregate(
    prevIds: number[], currIds: number[],
    assemblyDiff: DiffRow<AssemblyDiffItem>[],
    partDiff: DiffRow<PartDiffItem>[],
  ): Promise<DiffAggregate> {
    const [prevWeightArea, currWeightArea] = await Promise.all([
      this.sumWeightArea(prevIds),
      this.sumWeightArea(currIds),
    ])

    const asmPrev = assemblyDiff.filter(r => r.prev != null).length
    const asmCurr = assemblyDiff.filter(r => r.curr != null).length

    const [prevPartCount, currPartCount] = await Promise.all([
      this.prisma.bom_part.count({ where: { dispatch_id: { in: prevIds } } }),
      this.prisma.bom_part.count({ where: { dispatch_id: { in: currIds } } }),
    ])

    const countChanges = <T>(rows: DiffRow<T>[]) => ({
      added:   rows.filter(r => r.status === 'added').length,
      removed: rows.filter(r => r.status === 'removed').length,
      changed: rows.filter(r => r.status === 'changed').length,
    })

    return {
      weight_kg: metric(prevWeightArea.weight_kg, currWeightArea.weight_kg),
      area_m2: metric(prevWeightArea.area_m2, currWeightArea.area_m2),
      assembly_count: metric(asmPrev, asmCurr),
      assembly_changes: countChanges(assemblyDiff),
      part_total: metric(prevPartCount, currPartCount),
      part_changes: countChanges(partDiff),
    }
  }

  private async sumWeightArea(dispatchIds: number[]) {
    const rows = await this.prisma.bom_assembly.findMany({
      where: { dispatch_id: { in: dispatchIds } },
      select: { weight_kg: true, surface_area_m2: true },
    })
    let weight_kg = 0, area_m2 = 0
    for (const r of rows) {
      if (r.weight_kg != null) weight_kg += Number(r.weight_kg)
      if (r.surface_area_m2 != null) area_m2 += Number(r.surface_area_m2)
    }
    return {
      weight_kg: rows.length ? weight_kg : null,
      area_m2: rows.length ? area_m2 : null,
    }
  }
```

Update `computeWarning` to accept arrays of statuses (any-partial-in-group triggers the warning):

```typescript
  private computeWarning(prevStatuses: string[], currStatuses: string[]): string | null {
    const prevPartial = prevStatuses.some(s => s === 'partial')
    const currPartial = currStatuses.some(s => s === 'partial')
    if (prevPartial && currPartial) {
      return 'ทั้งสอง dispatch มีสถานะ partial — ข้อมูลอาจไม่ครบถ้วน'
    }
    if (prevPartial) return 'เวอร์ชันก่อนหน้ามีสถานะ partial — ข้อมูลอาจไม่ครบถ้วน'
    if (currPartial) return 'เวอร์ชันปัจจุบันมีสถานะ partial — ข้อมูลอาจไม่ครบถ้วน'
    return null
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx jest bom-diff.service.spec.ts`
Expected: all tests pass — the new revision-group tests, and every pre-existing test in this file (now updated in Step 1 to use the `.in` mock pattern).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/bom-upload/bom-diff.service.ts backend/src/modules/bom-upload/bom-diff.service.spec.ts
git commit -m "[bom-upload-manual-revision] backend: diff service compares revision groups, not single dispatches"
```

---

### Task 4: Frontend — `DispatchSummaryDto.revision` + `useLatestRevision` hook

**Files:**
- Modify: `src/api/dispatches.ts`
- Modify: `src/hooks/useBomDispatches.ts`
- Also confirm: the backend's dispatch summary serialization (wherever `DispatchSummaryDto`-shaped objects are assembled — check `BomUploadService.list()`/`findOne()` in `bom-upload.service.ts`, alongside the existing `upload_mode`/`assembly_count` fields) includes `revision` in its response — add it there if the mapping is explicit field-by-field rather than a spread.

**Interfaces:**
- Consumes: `bom_dispatch.revision` (Task 1), `GET dispatches/latest-revision` (Task 2).
- Produces: `DispatchSummaryDto.revision: number` (consumed by Task 7's `BomList.tsx`). `useLatestRevision(projectId: number | undefined, zoneId: number | undefined, subZoneId: number | undefined): { data: { revision: number | null } | undefined }` (a `useQuery` wrapper, consumed by Tasks 5 and 6's upload UIs).

- [ ] **Step 1: Add `revision` to the DTO and confirm backend serialization**

In `src/api/dispatches.ts`, add to `DispatchSummaryDto` (right after `upload_mode`):

```typescript
export interface DispatchSummaryDto {
  id: number
  project_id: number
  zone_id: number
  sub_zone_id: number | null
  status: DispatchStatus
  upload_mode: 'combined' | 'separate'
  revision: number
  doc_count: number
  uploaded_at: string
  zone: { id: number; code: string; label: string }
  sub_zone: { id: number; name: string; code: string | null } | null
  uploader: { id: number; name: string }
  assembly_count: number | null
  part_count: number | null
  total_weight_kg: number | null
}
```

Read `backend/src/modules/bom-upload/bom-upload.service.ts`'s `list()` and `findOne()` methods — find where the response objects mapping to `DispatchSummaryDto` are built (look for where `upload_mode` is assigned in the returned object shape) and add `revision: d.revision` (or equivalent field name matching whatever the mapped source variable is called) alongside it, in both methods.

- [ ] **Step 2: Add the API client call and hook**

In `src/api/dispatches.ts`, add:

```typescript
  getLatestRevision(projectId: number, zoneId: number, subZoneId: number | null): Promise<number | null> {
    return apiClient
      .get('/dispatches/latest-revision', { params: { project_id: projectId, zone_id: zoneId, sub_zone_id: subZoneId ?? undefined } })
      .then(r => r.data.revision)
  },
```
(Add this inside the same exported object literal that already contains `getZoneUploadMode` — match its existing structure exactly.)

In `src/hooks/useBomDispatches.ts`, add (alongside the existing `useZoneUploadMode`):

```typescript
export function useLatestRevision(projectId: number | undefined, zoneId: number | undefined, subZoneId: number | null | undefined) {
  return useQuery({
    queryKey: ['latest-revision', projectId, zoneId, subZoneId],
    queryFn: () => dispatchesApi.getLatestRevision(projectId!, zoneId!, subZoneId ?? null),
    enabled: !!projectId && !!zoneId,
  })
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Manual verification**

With `npm run dev` and the backend running: hit `GET http://localhost:3000/api/v1/dispatches/latest-revision?project_id=<id>&zone_id=<id>` directly (e.g. via `curl` with an auth token, or through the browser network tab while navigating the app) and confirm it returns `{ "revision": null }` for a zone with no dispatches, or `{ "revision": N }` for one that has some.

- [ ] **Step 5: Commit**

```bash
git add src/api/dispatches.ts src/hooks/useBomDispatches.ts
git commit -m "[bom-upload-manual-revision] frontend: DispatchSummaryDto.revision + useLatestRevision hook"
```

---

### Task 5: Frontend — `BomUpload.tsx` revision-choice UI

**Files:**
- Modify: `src/pages/BomUpload.tsx`

**Interfaces:**
- Consumes: `useLatestRevision` (Task 4).

- [ ] **Step 1: Add the hook call and local state**

In `src/pages/BomUpload.tsx`, import `useLatestRevision` from `../hooks/useBomDispatches` (add to the existing `import { useUploadBom, useZoneUploadMode } from '../hooks/useBomDispatches'` line). Add state and the hook call near the existing `useZoneUploadMode` call:

```typescript
  const [revisionChoice, setRevisionChoice] = useState<'continue' | 'new'>('continue')

  const { data: latestRevision } = useLatestRevision(
    activeProject?.id,
    zoneId ? parseInt(zoneId) : undefined,
    subZoneId ? parseInt(subZoneId) : null,
  )
```

- [ ] **Step 2: Render the choice control**

Add this block to the form, after the Sub-zone field and before the BOM Files dropzone section (find the existing JSX structure — insert as a new sibling `<div>` in the same `style={{ display: 'flex', flexDirection: 'column', gap: 20 }}` form container):

```tsx
        {zoneId && latestRevision != null && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Revision</label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="radio" checked={revisionChoice === 'continue'} onChange={() => setRevisionChoice('continue')} />
                Continue revision {latestRevision}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="radio" checked={revisionChoice === 'new'} onChange={() => setRevisionChoice('new')} />
                Start new revision ({latestRevision + 1})
              </label>
            </div>
          </div>
        )}
```

- [ ] **Step 3: Submit the choice**

In `handleSubmit`, add the field to the `FormData` alongside the existing `upload_mode` append:

```typescript
    formData.append('upload_mode', effectiveMode)
    formData.append('revision_choice', zoneId && latestRevision != null ? revisionChoice : 'new')
```

(When `latestRevision` is `null` — no prior dispatch for this zone/sub-zone — the choice is always `'new'`, matching the "force revision 1" rule; the radio control isn't shown in that case per Step 2's `latestRevision != null` guard.)

- [ ] **Step 4: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Manual browser verification**

With `npm run dev` and backend running (use a browser-driving tool if available):
1. Go to `/bom/upload`, select a zone with **no** existing dispatches. Expected: no revision control shown.
2. Upload Main files only (per the already-relaxed gate) → succeeds, creates revision 1 (confirm via the dispatch's detail page or DB query).
3. Return to `/bom/upload`, same zone, select Acc files only. Expected: revision control now shows "Continue revision 1" / "Start new revision (2)", defaulting to "Continue revision 1".
4. Submit with "Continue revision 1" selected → confirm the new dispatch has `revision = 1` (matches the Main dispatch).
5. Repeat, this time selecting "Start new revision (2)" → confirm the new dispatch has `revision = 2`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/BomUpload.tsx
git commit -m "[bom-upload-manual-revision] BomUpload: add Continue/New revision choice"
```

---

### Task 6: Frontend — `UpdateBomModal.tsx` revision-choice UI + cleanup

**Files:**
- Modify: `src/components/bom/UpdateBomModal.tsx`

**Interfaces:**
- Consumes: `useLatestRevision` (Task 4), same shape as Task 5.

- [ ] **Step 1: Remove the dead field and misleading banner**

In `src/components/bom/UpdateBomModal.tsx`, remove this line from `handleSubmit` (around line 109):

```typescript
    formData.append('dispatch_id', String(dispatchId))
```

Remove the static banner block (around line 147-149):

```tsx
        <div style={{ fontSize: 13, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '8px 12px' }}>
          A new revision will be added — existing files are not deleted, history is preserved
        </div>
```

- [ ] **Step 2: Add the same revision-choice control as Task 5**

Import `useLatestRevision` from `../../hooks/useBomDispatches` (add to the existing `import { useUploadBom } from '../../hooks/useBomDispatches'` line). Add state and the hook call (this component already receives `projectId`/`zoneId`/`subZoneId` as props):

```typescript
  const [revisionChoice, setRevisionChoice] = useState<'continue' | 'new'>('continue')
  const { data: latestRevision } = useLatestRevision(projectId, zoneId, subZoneId)
```

Replace the removed banner block with the same choice control from Task 5 Step 2 (identical JSX, since this modal always has a zone already selected — the `latestRevision != null` guard still applies for the "very first upload to this exact zone/sub-zone" edge case, unlikely but possible if this modal is somehow opened before any dispatch exists):

```tsx
        {latestRevision != null && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Revision</label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="radio" checked={revisionChoice === 'continue'} onChange={() => setRevisionChoice('continue')} />
                Continue revision {latestRevision}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="radio" checked={revisionChoice === 'new'} onChange={() => setRevisionChoice('new')} />
                Start new revision ({latestRevision + 1})
              </label>
            </div>
          </div>
        )}
```

- [ ] **Step 3: Submit the choice**

In `handleSubmit`, add alongside the existing `upload_mode` append:

```typescript
    formData.append('revision_choice', latestRevision != null ? revisionChoice : 'new')
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Manual browser verification**

From `/bom`, select a dispatch, open "Update BOM" → confirm the new revision-choice control renders (not the old static banner), and that submitting with each choice produces the expected `revision` value on the created dispatch (same two scenarios as Task 5 Step 5, but reached via this modal).

- [ ] **Step 6: Commit**

```bash
git add src/components/bom/UpdateBomModal.tsx
git commit -m "[bom-upload-manual-revision] UpdateBomModal: replace stale banner with revision choice, drop dead dispatch_id field"
```

---

### Task 7: Frontend — `BomList.tsx` reads stored revision

**Files:**
- Modify: `src/pages/BomList.tsx:560-578` (the `versionMap`/`latestIdSet`/`groupedItems` `useMemo`)

**Interfaces:**
- Consumes: `DispatchSummaryDto.revision` (Task 4).

- [ ] **Step 1: Replace the position-based version computation**

Change the `useMemo` block (currently building `versionMap` by reversing time-order and numbering by array index) to read `item.revision` directly:

```typescript
  const { latestIdSet, versionMap, groupedItems } = useMemo(() => {
    const groups = new Map<string, DispatchSummaryDto[]>()
    for (const item of allItems) {
      const key = `${item.zone_id}-${item.sub_zone_id ?? ''}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }

    const latestIdSet = new Set<number>()
    const versionMap = new Map<number, number>()
    for (const group of groups.values()) {
      // API returns desc order — group[0] is the most recently uploaded physical dispatch,
      // regardless of which revision number it carries.
      latestIdSet.add(group[0].id)
      for (const item of group) versionMap.set(item.id, item.revision)
    }
    return { latestIdSet, versionMap, groupedItems: groups }
  }, [allItems])
```

(Confirm the exact current variable names/shape of this `useMemo`'s other consumers by reading the surrounding code in `BomList.tsx` before editing — this replaces the body of the memo, not its consumers.)

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Manual browser verification**

Navigate to `/bom` for a zone that has a Main dispatch and an Acc dispatch sharing revision 1 (from Task 5's manual verification). Confirm the dispatch history sidebar shows **two separate rows**, both labeled "v1" — not "v1"/"v2" by upload order.

- [ ] **Step 4: Commit**

```bash
git add src/pages/BomList.tsx
git commit -m "[bom-upload-manual-revision] BomList: read revision from stored field, not list position"
```

---

### Task 8: Full regression pass

**Files:** none (verification only, per spec §5)

- [ ] **Step 1: Run the full scenario checklist from the design spec**

With `npm run dev` (frontend) and the backend running:

1. `npx prisma migrate status` (backend) shows the new migration applied; `npx tsc -p tsconfig.app.json` (frontend) clean; `cd backend && npx jest bom-upload.service.spec.ts bom-diff.service.spec.ts` clean.
2. Fresh zone, upload Main only (combined or separate mode, main-only) → revision 1, no choice UI shown (nothing existed before).
3. Same zone, upload Acc only, choose "Continue revision 1" → `BomList` shows two "v1" rows for that zone/sub-zone.
4. Open the Acc dispatch's diff page → confirm it shows "nothing to diff against yet" (no rev 0 exists) rather than diffing against the Main sibling.
5. Upload a brand-new combined-mode dispatch to a **different**, fresh zone (this becomes that zone's revision 1), then upload Main-only + Acc-only (both "continue revision 2") to simulate a true second revision split across two dispatches — open either dispatch's diff and confirm it aggregates Main+Acc as "current" and diffs against the full first combined dispatch as "previous," producing a sane comparison (not near-total replacement).
6. Same zone, upload Acc only again, choose "Start new revision" → new dispatch gets the next integer revision, independent of the earlier group.
7. `UpdateBomModal` (via the "Update BOM" button in `BomList`) shows the same revision-choice control, not the old static banner, and the network request no longer includes a `dispatch_id` field.
8. Regression: a normal `combined`-mode upload to a brand-new zone still works exactly as before (revision 1, single dispatch, diff shows "nothing to diff against yet").
9. Paint config carry-forward still works unchanged (upload Main, set a paint config, upload Acc as the same revision, confirm the Acc dispatch's paint config still carries forward from Main — this behavior is untouched by this plan, just confirming no regression).

- [ ] **Step 2: Note results**

If every scenario passes, no further changes are needed — this closes the plan. If anything fails, fix it in the task it belongs to and re-run the affected scenarios.
