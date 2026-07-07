# WO BOM-Version Hold — Test Report

> **คำแนะนำ:** Copy ไฟล์นี้เป็น `wo-bom-hold-test-report-YYYY-MM-DD.md` ก่อน run แล้วกรอก result
> **Skill:** รัน `/test-wo-bom-hold` เพื่อให้ Claude ช่วย run และกรอก report นี้อัตโนมัติ
> **Prerequisite:** ต้อง implement ครบทั้ง 12 tasks ใน `wiki/features/wo-bom-hold-plan.md` ก่อน

---

## 1. Test Metadata

| Field | Value |
|-------|-------|
| Date | YYYY-MM-DD |
| Tester | |
| Sprint | Sprint 20 — WO BOM-Version Hold |
| Branch | |
| Commit | `git rev-parse --short HEAD` |
| Environment | local / staging |
| Backend URL | http://localhost:3000 |
| Project used | |
| Zone used | |
| Dispatch D1 (baseline) | |
| Dispatch D2 (removed/qty-changed revision) | |
| MO (confirmed, 3 lines) | |
| MO2 (DRAFT, stale-warning check) | |
| WO-A (mark removed) | |
| WO-B (qty decreased) | |
| WO-C (qty increased) | |

---

## 2. Setup Checklist

- [ ] Backend running (`pnpm --filter backend dev` → :3000)
- [ ] All 12 tasks in `wo-bom-hold-plan.md` implemented + migrated
- [ ] Login สำเร็จ (admin / BdtDev2026!)
- [ ] Project + zone เลือกแล้ว (ควรใช้ scratch zone ที่ไม่มี WO ค้างอยู่)
- [ ] Baseline BOM fixture (3+ marks) พร้อม
- [ ] Rev.2 fixture (mark ถูกลบ 1 / qty ลด 1 / qty เพิ่ม 1) พร้อม

---

## 3. Fixture Setup Steps

### Step 1 — Upload baseline (D1)

| | |
|-|-|
| Result | ☐ Pass ☐ Fail |
| Dispatch ID (D1) | ___________ |
| MARK-A / qty / weight | |
| MARK-B / qty / weight | |
| MARK-C / qty / weight | |

### Step 2 — Create + confirm MO (3 lines) → auto-create WOs

| | |
|-|-|
| Result | ☐ Pass ☐ Fail |
| MO id | ___________ |
| WO-A id (status after create) | ___________ / NOT_STARTED |
| WO-B id (status after create) | ___________ / NOT_STARTED |
| WO-C id (status after create) | ___________ / NOT_STARTED |

### Step 3 — Upload Rev.2 (D2): MARK-A removed, MARK-B qty↓, MARK-C qty↑

| | |
|-|-|
| Result | ☐ Pass ☐ Fail |
| Dispatch ID (D2) | ___________ |
| `hold_summary.held_wo_count` returned | ___________ |

---

## 4. Core Assertions — Hold Trigger

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| H1 | `hold_summary.held_wo_count` | 2 | | ☐ Pass ☐ Fail |
| H2 | WO-A status | `ON_HOLD` | | ☐ Pass ☐ Fail |
| H3 | WO-A `bom-version-status.delta_types` | includes `REMOVED` | | ☐ Pass ☐ Fail |
| H4 | WO-B status | `ON_HOLD` | | ☐ Pass ☐ Fail |
| H5 | WO-B `bom-version-status.delta_types` | includes `QTY_CHANGED` | | ☐ Pass ☐ Fail |
| H6 | WO-B `delta_details.qty` direction | `to < from` (decrease) | | ☐ Pass ☐ Fail |
| H7 | WO-C status | **NOT** `ON_HOLD` (qty-increase = informational only) | | ☐ Pass ☐ Fail |
| H8 | A WO already `DONE`/`CANCELLED` in the group (if any) | untouched by `applyBomChangeHolds()` | | ☐ Pass ☐ Fail |

---

## 5. Resolution — Cancel (WO-A, REMOVED)

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| R1 | `POST /wo/{WO-A}/accept-new-version` | HTTP 409 (REMOVED guard still fires) | | ☐ Pass ☐ Fail |
| R2 | `POST /wo/{WO-A}/cancel` with `qty_reusable` | HTTP 200/201 | | ☐ Pass ☐ Fail |
| R3 | WO-A status after cancel | `CANCELLED` | | ☐ Pass ☐ Fail |

## 6. Resolution — Accept (WO-B, qty decreased)

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| A1 | `POST /wo/{WO-B}/accept-new-version` without `note` | HTTP 400 | | ☐ Pass ☐ Fail |
| A2 | `POST /wo/{WO-B}/accept-new-version` with `note` | HTTP 200/201 | | ☐ Pass ☐ Fail |
| A3 | WO-B status after accept | leaves `ON_HOLD` (back to pre-hold status) | | ☐ Pass ☐ Fail |
| A4 | `GET /wo/{WO-B}/events` | contains `HOLD` then `ACCEPT_VERSION`, notes include the entered reconciliation text | | ☐ Pass ☐ Fail |

## 7. qty_reusable guard (optional deeper variant — see Re-run Notes)

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| Q1 | Cancel an `ON_HOLD` WO with `qty_done > 0`, no `qty_reusable` | HTTP 400 | | ☐ Pass ☐ Fail |
| Q2 | Cancel with `qty_reusable` provided | HTTP 200/201, persisted | | ☐ Pass ☐ Fail |
| Q3 | Accept an `ON_HOLD` WO where `qty_done` > new target qty, no `qty_reusable` | HTTP 400 | | ☐ Pass ☐ Fail |
| Q4 | Accept with `qty_reusable` provided | HTTP 200/201, persisted | | ☐ Pass ☐ Fail |

---

## 8. MO Detail — `stale_assembly_warnings`

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| M1 | Create MO2 (DRAFT, references superseded MARK-B) | created, status `DRAFT` | | ☐ Pass ☐ Fail |
| M2 | `GET /mo/{MO2}` → `stale_assembly_warnings` | 1 entry, references MARK-B | | ☐ Pass ☐ Fail |
| M3 | MO2 Confirm | **not blocked** by the warning (still allowed) | | ☐ Pass ☐ Fail |
| M4 | A CONFIRMED MO with the same setup | `stale_assembly_warnings` empty (WO-level ON_HOLD handles it instead) | | ☐ Pass ☐ Fail |

---

## 9. Frontend UI Checks (manual/Playwright)

| # | Check | Expected | Result |
|---|-------|----------|--------|
| U1 | `WoDetail` page for an `ON_HOLD` WO | Blocking banner, distinct from `PAUSED` color | ☐ Pass ☐ Fail |
| U2 | Accept form | Requires note; requires qty_reusable when applicable | ☐ Pass ☐ Fail |
| U3 | Cancel form | Requires qty_reusable when `qty_done > 0` | ☐ Pass ☐ Fail |
| U4 | Upload toast | Shows "N WO held" when `held_wo_count > 0`, silent otherwise | ☐ Pass ☐ Fail |
| U5 | `MoDetail` Overview (DRAFT MO) | Shows stale-assembly warning banner, non-blocking | ☐ Pass ☐ Fail |
| U6 | WO list filter dropdown | `ON_HOLD` selectable | ☐ Pass ☐ Fail |

---

## 10. Bug Log

| # | TC | Description | Severity | Status |
|---|----|-------------|----------|--------|
| 1 | | | P1/P2/P3 | Open/Fixed |

---

## 11. Summary

| Section | Total | Pass | Fail |
|---------|-------|------|------|
| Fixture Setup | 3 | | |
| Hold Trigger | 8 | | |
| Resolution — Cancel | 3 | | |
| Resolution — Accept | 4 | | |
| qty_reusable guard | 4 | | |
| MO stale warnings | 4 | | |
| Frontend UI | 6 | | |
| **Total** | **32** | | |

**Overall Result:** ☐ PASS &nbsp;&nbsp; ☐ FAIL

**Sign-off:** _________________________ Date: _____________

**Notes:**
