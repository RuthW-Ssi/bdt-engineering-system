# QA Sign-off — WO Visual tab: mark + version dropdowns, whole-model highlight

- **feature:** The WO detail Visual tab gets a Mark dropdown and a version dropdown in each pane header.
  - **Drawing versions:** listed per mark (only versions holding that mark's PDF), newest first.
  - **3D model versions:** listed per project, defaulting to the newest `complete` model.
  - **`GET /wo/:id/bim-match`:** gains an optional `model_id`, validated against the mark's own project (404 otherwise). The response adds `models[]`, `global_ids[]` and `wo_global_ids[]`.
  - **3D toolbar `Boxes`:** shows the whole model with the selected mark in red and the camera framed on it (new optional `BimFocusRequest.fitGlobalIds`).
  - **3D toolbar `Layers`:** shows every WO mark in orange plus the selected mark in red, with a legend and no camera move.
  - All picks are view-only.
- **branch:** `dev-t-wo-visual-version`
- **date:** 2026-10-05
- **qa decision:** PASS (Low/INFO only). QA re-ran the tests independently. Every row of the decisions table in `wiki/tech/testing/per-feature/wo-visual-tab.md` (2026-10-05 increment) maps to an existing, passing test.
- **security decision:** PASS (Low/INFO only).
  - BOLA holds: `model_id` is checked against the mark's project list, and an unknown or foreign model returns the same 404.
  - `wo_global_ids` covers same-project marks only.
  - There are no XSS sinks.
  - Resource use is acceptable: two lean queries, one of them indexed.
- **approved_for_ship:** true · **forced_ship:** false
- **migration:** none (no Prisma schema or migration changes)
- **evidence:**
  - frontend vitest 308/308; backend `wo-bim-match.service.spec.ts` 23/23
  - frontend `tsc -b` clean; backend `tsc --noEmit` clean; eslint clean on touched code
  - two adversarial review rounds (find → refute) ran before the gate; all confirmed findings were Low and are fixed
  - live: a local-dev API probe on WO 186/187/189 returned `models`/`global_ids`/`wo_global_ids` with counts matching each WO's marks; the user verified the toggles, colors and dropdowns in the browser
  - `/ponytail-review` was not run: the command is not available in this session

## Follow-ups (Low, not blocking)
- Add `@RequiresPermission('orders','view')` to `GET /wo/:id/bim-match` (API5). It was already JWT-only before this change, and the same metadata is reachable via the JWT-only `/bim-models/:id/*`.
- Use `ParseIntPipe({ optional: true })` for `model_id` / `bom_assembly_id`. Today they are plain `Number()`, which never reaches Prisma, and malformed input returns 404.
- Disable the version picker while placeholder data is shown. This closes a rare race: on a cross-project WO, picking a stale model while a switch is loading.
- The MO print packet still uses the zone-latest drawing rule (`mo-print/mark-drawing-match.ts`).
- Post-ship docs: update `wiki/tech/backend/api.md`, the `features/wo` implementation-delta and `drawing.md`, add a Notion task under F-WO Visual Tab, and update `log.md`.
