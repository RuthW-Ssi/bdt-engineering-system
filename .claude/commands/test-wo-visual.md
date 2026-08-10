---
description: E2E test — WO Detail Visual tab (Sprint 28): isolated 3D view of a WO's assembly mark via GET /wo/:id/bim-match
---

# /test-wo-visual — WO Visual Tab E2E

Verifies the Sprint 28 "Visual" tab on WO Detail (`/order/wo/:id`): a new
ungated `GET /wo/:id/bim-match` endpoint resolves a WO's assembly mark to
a single isolated BIM element, rendered via the existing `BimViewport`
component (reused unchanged from BIM Viewer / Progress Tracking), side by
side with a static "Coming soon" Drawing placeholder.

## 1. Environment verification

```bash
docker ps --format '{{.Names}} {{.Status}}' | grep bdt-postgres
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"login":"admin","password":"BdtDev2026!"}'   # expect 200/201
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/                            # expect 200
```

## 2. Test steps

1. **Login as admin**, capture `access_token`.
2. **Happy path — real WO**: `GET /wo/1/bim-match` → expect `200`,
   `{status:'ok', mark:'TC-CO1', model_id:14, global_id:<a real IFC GUID>, match_count:1}`.
3. **A different WO, different mark**: `GET /wo/13/bim-match` → expect
   `200`, `status:'ok'`, `mark:'TC-CO3'`, a **different** `global_id` than
   step 2 (confirms isolation is genuinely per-WO, not hardcoded).
4. **WO not found**: `GET /wo/100/bim-match` (or any id past the seed data's
   range) → expect `404 "WO 100 not found"`.
5. **Frontend — happy path**: log in, navigate to `/order/wo/1`, confirm
   the tab row now shows 4 tabs ending in **"Visual"**, click it, wait a
   few seconds for the Autodesk Viewer to load, confirm the 3D pane shows
   **exactly one isolated piece** (everything else in the model hidden —
   no unrelated geometry visible) and the right pane shows "Drawing / TC-CO1
   — Coming soon". Navigate to `/order/wo/13` (mark TC-CO3), open Visual
   again, confirm a **visibly different piece** renders and the Drawing
   placeholder text updates to "TC-CO3 — Coming soon".
6. **`no_model` / `model_not_ready` / `mark_not_found`**: **not exercised
   live** in this pass — the current seed data has every real WO tied to
   project 5, which already has a complete BIM model, so none of these 3
   states occur naturally without fabricating data. All 3 (plus the happy
   path and the multi-instance-mark case) are covered by
   `backend/src/modules/work-orders/wo-bim-match.service.spec.ts` (8/8
   passing) instead. If seed data changes to include a WO in a
   model-less project, re-run this step live and update this note.

## 3. Expected values reference

| Check | Expected |
|---|---|
| `GET /wo/1/bim-match` | `200`, `status:'ok'`, `mark:'TC-CO1'`, `model_id:14`, `model_version:'1.1'`, `match_count:1` |
| `GET /wo/13/bim-match` | `200`, `status:'ok'`, `mark:'TC-CO3'`, `model_id:14`, `global_id` differs from WO 1's |
| `GET /wo/100/bim-match` (nonexistent WO) | `404 "WO 100 not found"` |
| Frontend: WO 1 → Visual tab | one isolated piece rendered, Drawing pane reads "TC-CO1 — Coming soon" |
| Frontend: WO 13 → Visual tab | a different isolated piece, Drawing pane reads "TC-CO3 — Coming soon" |
| `no_model` / `model_not_ready` / `mark_not_found` | unit-test-only this pass (see step 6) |

## 4. Re-run notes

No test data created or mutated by this test (read-only `GET` calls only)
— safe to re-run any time with no cleanup step. If the seed dataset is
regenerated, re-verify WO ids 1 and 13 still resolve to the marks above
(`SELECT wo.id, ba.assembly_mark FROM work_order wo JOIN bom_assembly ba
ON ba.id = wo.bom_assembly_id ORDER BY wo.id LIMIT 20;`) and update this
doc if they've changed.
