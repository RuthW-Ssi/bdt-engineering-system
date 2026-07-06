# Design — BOM Upload: manual revision control + split main/acc uploads

**Date:** 2026-07-03
**Author:** bdtapp@ssi-steel.com + Claude
**Status:** Approved design, pending implementation plan
**Repo:** `bdt-app` · branch `dev-t-bom-upload-manual-revision`

---

## 1. Context & Problem

An engineer's real BOM upload workflow doesn't always match the app's current assumption. Today:

- `bom_dispatch` has **no stored revision/version number at all**. The "v1, v2, v3..." labels shown in `BomList.tsx`'s sidebar are 100% computed client-side — group dispatches by `zone_id + sub_zone_id`, sort by `uploaded_at`, number by array position (`BomList.tsx:560-578`).
- **Every** call to `POST /bom/upload` unconditionally creates a brand-new `bom_dispatch` row (`bom-upload.service.ts:135`). There is no merge/append path anywhere in the codebase — `UpdateBomModal.tsx` claims "history preserved, new revision added" but sends a `dispatch_id` field the backend never reads; it behaves identically to a fresh upload.
- Until this branch's first commit (`fd9c27f`), the frontend also **forced** `separate` mode to submit all 6 files (3 `MAIN_*` + 3 `ACC_*`) in one request — `bomReady = hasAllMain && hasAllAcc`. The backend never actually required this pairing (`validateFiles()` only checks for duplicates/mixed-mode types), so this was a frontend-only restriction. That commit relaxed it to `hasAllMain || hasAllAcc`, unblocking the real workflow: upload Main now, upload Acc later, as two independent requests.

That relaxation surfaced a real, concrete problem, reproduced live in the local dev DB: uploading Main (28 assemblies) and then Acc (22 assemblies) to the same zone creates two dispatches that today's "count position in the list" versioning treats as **sequential** revisions (v1, v2). Opening the Diff view for the Acc dispatch compares it against the Main dispatch — and since Main parts and Acc parts are entirely different items (no overlapping marks), the diff shows near-total replacement (`+22 added / -28 removed` assemblies, `+32 added / -87 removed` parts) even though nothing was actually "removed" — Main and Acc are complementary subsets of one BOM, not sequential versions of the same content.

**Decision:** rather than treat this as an acceptable quirk of splitting uploads, give the engineer explicit control over the revision number a new upload is assigned to. Two dispatches (Main, Acc) can share one revision number without their underlying data ever being merged into a single record.

---

## 2. Goals / Non-goals

**Goals**
- Store an explicit `revision` number on `bom_dispatch` (replacing the current position-based computation).
- At upload time, let the user choose "Continue revision N" (reuse the latest existing revision for this zone+sub-zone) vs. "Start new revision (N+1)". If no dispatch exists yet for that zone+sub-zone, force revision 1 — no choice shown.
- `BomList`'s sidebar reads the stored `revision` field directly. Two dispatches sharing a revision number display as two separate rows carrying the same "vN" label — no change to how dispatches are listed or browsed individually.
- The Diff view produces a correct comparison when revisions span multiple dispatches: the "current" side is the **union** of all dispatches sharing the viewed dispatch's revision number; the "previous" side is the union of all dispatches at the most recent strictly-lower revision number for that zone+sub-zone. This is an aggregation computed at diff time — it does not change how dispatches are stored or listed.
- Fix `UpdateBomModal.tsx`'s misleading copy ("history preserved") and remove the dead `dispatch_id` field it currently sends (silently ignored by the backend) — it's directly adjacent to what this work touches and actively misleads users about current behavior.

**Non-goals**
- No merging of assembly/part *data* across dispatches, ever. Two dispatches sharing a revision number remain two independent, separately browsable `bom_dispatch` rows with their own `bom_assembly`/`bom_part` rows. "Revision" is a label two dispatches can share, not a container that owns them.
- No change to `BomList`'s per-dispatch tree/detail view (`BomTreeView`, `AssembliesTable`, `PartsTable`) — viewing a single dispatch (not diffing) still shows only that dispatch's own data, exactly as today.
- No change to paint-config carry-forward (`carryForwardPaintConfig`, `bom-upload.service.ts:670`) — it keeps using "the most recent other dispatch by time, regardless of revision." Carrying paint settings from a same-revision sibling (Main → Acc) is desirable continuity, not a diffing concern; this is a deliberately different question from "what did this revision change relative to the last one."
- No change to `useZoneUploadMode`'s combined/separate mode locking (`bom-upload.service.ts` locking logic, `BomUpload.tsx:99-100`) — unrelated to revision numbering, already correctly scoped to file-shape consistency.
- No data backfill migration concern — the local dev DB's BOM/MO/WO data was fully cleared during this session (see prior conversation), so the new `revision` column ships with an empty table locally. (A real backfill strategy for existing staging/production data is out of scope for this spec — flag as follow-on if/when this ships beyond local dev.)

---

## 3. Design

### 3.1 Schema

Add to `bom_dispatch` (`backend/prisma/schema.prisma:801`):
```prisma
revision Int @default(1)
```
Indexed alongside the existing zone/sub-zone/status indexes, since every revision-scoped query filters on `(zone_id, sub_zone_id, revision)`:
```prisma
@@index([zone_id, sub_zone_id, revision])
```

### 3.2 Resolving "what revision should this upload get"

New read path, scoped by **zone + sub-zone** (not just zone, unlike `useZoneUploadMode`'s existing zone-only scope — revision must be sub-zone-aware since `BomList`/diff grouping already is):

- Backend: extend `GET /dispatches` (already supports `project_id`/`zone_id` query params) to accept `sub_zone_id` and return enough to compute `MAX(revision)` for that scope — simplest: a new lightweight endpoint `GET dispatches/latest-revision?project_id&zone_id&sub_zone_id` returning `{ revision: number | null }` (`null` = no dispatch exists yet for this exact zone+sub-zone).
- Frontend: new hook `useLatestRevision(projectId, zoneId, subZoneId)` (`src/hooks/useBomDispatches.ts`, alongside the existing `useZoneUploadMode`) wrapping this endpoint.

### 3.3 Upload UI — revision choice

In both `BomUpload.tsx` and `UpdateBomModal.tsx` (identical gate, identical new control):

- Call `useLatestRevision` for the selected zone/sub-zone.
- If `revision` is `null` (nothing exists yet): no control shown, submit with `revision_choice: 'new'` implicitly (server resolves to 1).
- If `revision` is a number: show two radio options — "Continue revision {revision}" and "Start new revision ({revision + 1})" — defaulting to "Continue" (the common case per the Main-then-Acc workflow this whole feature exists for).
- Submit `revision_choice: 'continue' | 'new'` as a new `FormData` field alongside the existing `project_id`/`zone_id`/`upload_mode`/etc.

### 3.4 Backend upload endpoint

In `BomUploadService.upload()` (`bom-upload.service.ts`, inside the existing `$transaction` before `tx.bom_dispatch.create()`, line ~133):

1. Query `MAX(revision)` for `(project_id, zone_id, sub_zone_id)` within the same transaction.
2. Compute the value to store:
   - No existing dispatch for this zone+sub-zone → `revision = 1` (ignore whatever `revision_choice` was sent — matches the already-confirmed rule "if nothing exists, it's forced to a new revision").
   - `revision_choice === 'continue'` → reuse the existing `MAX(revision)`.
   - `revision_choice === 'new'` (or anything else, existing data present) → `MAX(revision) + 1`.
3. Store on the new `bom_dispatch.revision` column at create time.

Compute this server-side (not trust a client-submitted revision number directly) — the client only ever expresses *intent* (`continue` vs `new`), the server resolves the actual integer, consistent with how `upload_mode` locking is already server-validated elsewhere in this service.

### 3.5 `BomList.tsx` — read stored revision

Add `revision: number` to `DispatchSummaryDto` (`src/api/dispatches.ts:7`) and to the backend's dispatch summary serialization (wherever `DispatchSummaryDto` fields are assembled in the controller/service — mirror the existing `upload_mode`/`assembly_count` fields).

Replace the position-based `versionMap` computation (`BomList.tsx:560-578`) with a direct read: `versionMap.set(item.id, item.revision)`. `latestIdSet` (which flags "the most recent physical dispatch" for the Update-BOM button, etc.) is unaffected — it stays keyed on `uploaded_at` ordering regardless of revision equality, per the earlier confirmed answer that multiple dispatches sharing a revision just render as separate rows with the same label.

### 3.6 Diff service — revision-group aggregation

Rework `BomDiffService` (`backend/src/modules/bom-upload/bom-diff.service.ts`) from single-dispatch-id comparison to revision-group comparison:

- `findPrevious(id)` → `findPreviousRevisionGroup(id)`: load the current dispatch, find all sibling dispatch ids sharing `(project_id, zone_id, sub_zone_id, revision)` (the "current group"), then find the most recent dispatch with `revision < current.revision` for that zone+sub-zone, and from *that* dispatch's revision number, gather **all** dispatches sharing *that* revision number (the "previous group"). Returns `{ currentIds: number[], previousIds: number[] } | null` (null when no earlier revision exists — same "nothing to diff against yet" case as today's "no previous dispatch" state).
- `loadDispatchData(id)` → `loadRevisionGroupData(ids: number[])`: change every `where: { dispatch_id: id }` to `where: { dispatch_id: { in: ids } }` (three call sites: assemblies, parts, junctions-via-assembly-relation).
- `sumWeightArea(dispatchId)` → `sumWeightArea(dispatchIds: number[])`: same `in` change.
- `computeAggregate`/`computeDiff`: thread `currentIds`/`previousIds` arrays through instead of single `currId`/`prevId`.
- `computeWarning(prevStatus, currStatus)`: with groups, a status conflict can occur per-dispatch within a group. Treat a group as "partial" for warning purposes if **any** dispatch within it has `status === 'partial'` — matches the existing "flag it, don't hide it" intent of this check.
- `getDiff` controller route (`bom-upload.controller.ts:130-132`) keeps its existing signature (`dispatch id` in, diff result out) — only the internal resolution changes; no API contract change for the route itself.

### 3.7 `UpdateBomModal.tsx` cleanup

- Remove the `formData.append('dispatch_id', ...)` line (`UpdateBomModal.tsx:109`) — dead, backend never reads it, and superseded entirely by the new revision-choice field.
- Replace the static banner copy ("A new revision will be added — existing files are not deleted, history is preserved", line 148) with the same revision-choice control from §3.3 (this modal already knows `zoneId`/`subZoneId` via props, so it can call `useLatestRevision` exactly like `BomUpload.tsx`).

---

## 4. Behavior matrix

| Scenario | Result |
|---|---|
| Fresh zone+sub-zone, first ever upload (Main only or combined) | No revision choice shown; stored as revision 1 |
| Upload Acc afterward, choose "Continue revision 1" | New dispatch, `revision = 1`, sibling of the Main dispatch |
| Upload Acc afterward, choose "Start new revision (2)" | New dispatch, `revision = 2` — Main and Acc are now different revisions (today's default/only behavior, still available) |
| `BomList` sidebar shows Main (rev 1) + Acc (rev 1) | Two separate rows, both labeled "v1" |
| Open diff for the Acc dispatch (rev 1), no rev 0 exists | "Nothing to diff against yet" — same as any first-revision dispatch today |
| Open diff for the Acc dispatch (rev 1), rev 0 exists (combined upload) | Current = union(Main rev1, Acc rev1) assemblies/parts; Previous = union of all rev-0 dispatches; diffed as whole BOMs, not partial subsets |
| Paint config on the Acc dispatch | Still carried forward from "most recent other dispatch by time" (Main, in this case) — unchanged behavior |

---

## 5. Verification (manual — no frontend/backend test runner in this repo)

1. `npx prisma migrate dev` applies cleanly against the local (now-empty) `bdt_dev` database; `npx tsc -p tsconfig.app.json` (frontend) and backend build both clean.
2. Fresh zone, upload Main only → revision 1, no choice UI shown (nothing existed before).
3. Same zone, upload Acc only, choose "Continue revision 1" → `BomList` shows two "v1" rows.
4. Open the Acc dispatch's diff → previous-revision lookup correctly returns null (no rev 0) rather than diffing against the Main sibling.
5. Repeat with a prior combined-mode revision 0 present → diff aggregates Main+Acc (rev 1) as current, diffs against the full rev-0 assembly/part set, and produces a sane (not near-total-replacement) comparison.
6. Same zone, upload Acc only again, choose "Start new revision" → new dispatch gets `revision = 2`, independent of the rev-1 group.
7. `UpdateBomModal` shows the same revision-choice control (not the old static banner) and no longer sends `dispatch_id`.
8. Regression: a normal `combined`-mode upload to a brand-new zone still works exactly as before (revision 1, single dispatch, diff shows "nothing to diff against yet").
