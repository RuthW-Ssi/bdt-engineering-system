# Sprint 7 — BOM Upload Manual Test Script

> **Gate:** T6.2 — Claude Code runs dev servers + reports + user approves before push.
> Fixture files: `docs/test-fixtures/` (add real Tekla XLS before running)

---

## Prerequisites

1. Dev servers running: `pnpm dev` (frontend :5173) + `pnpm --filter backend dev` (backend :3000)
2. Cloud SQL proxy running (or local Postgres seeded)
3. Logged in as test user (visit `/login`)
4. Project selected in header (e.g., any seeded project)

---

## Checklist

### A. BOM List page (`/bom`)

- [ ] A1. Navigate to `/bom` — page loads without error
- [ ] A2. No project selected → shows "เลือก Project ที่ header ก่อน" empty state
- [ ] A3. Select project → dispatch list loads (or empty state "Upload BOM แรก")
- [ ] A4. Filter by Zone → list filters correctly
- [ ] A5. Filter by Status (pending / partial / complete) → filters correctly
- [ ] A6. Click "ล้างตัวกรอง" → filters reset
- [ ] A7. Each dispatch card shows: zone code, status chip, progress chip (X/3)
- [ ] A8. Click dispatch card → navigates to `/bom/dispatch/:id`

### B. BOM Upload page (`/bom/upload`)

- [ ] B1. Click "Upload BOM" → `/bom/upload` loads
- [ ] B2. Back arrow returns to `/bom`
- [ ] B3. Drop valid .xls file → filename classifier detects doc type
- [ ] B4. Manually change doc type dropdown → type updates
- [ ] B5. Drop duplicate doc type → shows error on second file
- [ ] B6. Remove file → clears from list
- [ ] B7. Submit without zone → button disabled
- [ ] B8. Submit with ≥1 valid file + zone → upload completes → redirect to `/bom`
- [ ] B9. New dispatch appears in BOM list after upload

### C. BOM Dispatch Detail page (`/bom/dispatch/:id`)

- [ ] C1. Navigate to dispatch → header shows zone code + status chip + progress chip
- [ ] C2. If doc_count < 3 → warning bar lists missing doc types
- [ ] C3. If doc_count = 3 → warning bar absent
- [ ] C4. "Current" tab active by default → BomTreeView renders
- [ ] C5. BomTreeView: if no assembly data → placeholder with assembly/part counts shown
- [ ] C6. Click "History" tab → RevisionList renders
- [ ] C7. RevisionList: revisions grouped by ASSEMBLY_LIST / ASSEMBLY_PART_LIST / PART_LIST
- [ ] C8. Latest revision has "LATEST" badge
- [ ] C9. Click "Upload File" button → ConfirmRevisionModal opens
- [ ] C10. Modal: yellow info banner "จะเพิ่ม revision ใหม่"
- [ ] C11. Modal: drop file + confirm → upload completes → modal closes + History tab refreshes
- [ ] C12. Modal: click backdrop or Cancel → modal closes without upload
- [ ] C13. Back arrow → returns to `/bom`

### D. Error states

- [ ] D1. Navigate to `/bom/dispatch/99999` (non-existent) → "ไม่พบข้อมูล" error state
- [ ] D2. Backend offline → dispatch list shows error empty state (not crash)

### E. Type safety

- [ ] E1. `pnpm tsc --noEmit` → 0 errors
- [ ] E2. `pnpm build` → build succeeds

---

## Result

| Section | Pass | Fail | Notes |
|---------|------|------|-------|
| A. BOM List | | | |
| B. BOM Upload | | | |
| C. Dispatch Detail | | | |
| D. Error states | | | |
| E. Type safety | | | |

**Overall:** ☐ Pass → OK to push &nbsp;&nbsp; ☐ Fail → fix before push

