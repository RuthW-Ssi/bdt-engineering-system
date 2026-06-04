---
description: Manual walkthrough test for the Dashboard showcase prototype (FE-only mock data, no API calls)
argument-hint: [viewport: 1024 | 1280 | 1440 | 1920 (default all)]
---

# /test-dashboard-showcase — Dashboard showcase manual walkthrough

Runs the 7 P0 user stories + regression + viewport checks for the
`dev-dashboard-showcase` branch. FE-only — no backend assertion script needed.

**Branch:** `dev-dashboard-showcase`
**Test type:** manual interaction
**Source of truth for expected values:** `src/data/dashboardMock.ts`

---

## Step 1 — Environment verification

```bash
# Confirm on correct branch
git branch --show-current   # must print: dev-dashboard-showcase

# Confirm servers are running
curl -s -o /dev/null -w "frontend: %{http_code}\n" http://localhost:5173
curl -s -o /dev/null -w "backend: %{http_code}\n" http://localhost:3000

# Confirm no TS errors
npx tsc --noEmit && echo "TS: clean"
```

Expected: branch = `dev-dashboard-showcase` · frontend 200 · TS clean.

---

## Step 2 — Run test cases (manual)

Open `http://localhost:5173` in browser. Follow each case in order.

### T-001 · Login redirect (US-001)
1. Clear cookies / open incognito
2. Navigate to `http://localhost:5173`
3. Redirected to `/login` ✓
4. Login with `admin / BdtDev2026!`
5. **Expected:** lands at `/dashboard` (not `/materials`)

### T-002 · Default project + localStorage restore (US-002)
1. DevTools → Application → Local Storage → delete all `dashboard_*` keys
2. Reload `/dashboard`
3. **Expected:** THEPHA chip active · KPI = 142 / 8 / 67 / 75 / 4
4. Click PROJ-B chip
5. Reload page
6. **Expected:** PROJ-B still active (restored from localStorage)
7. Clear localStorage again → reload → THEPHA restored

### T-003 · Project chip switch (US-003)
| Click | Expected KPI | Expected zone tabs |
|---|---|---|
| THEPHA | 142/8/67/75/4 | Z1, Z2, Z3 |
| PROJ-B | 89/5/41/48/2 | ZA, ZB |
| PROJ-C | 31/1/14/17/1 | ZX, ZY |
| PROJ-D | 12/0/5/7/0 | P1 |

Check URL updates: `?project=PROJ-B` etc.

### T-004 · Zone drill-down (US-004)
With THEPHA active:
| Zone tab | Expected KPI | Expected dispatch rows |
|---|---|---|
| Z1 | 48/3/22/26/2 | 1 row (dispatch #1, complete) |
| Z2 | 54/3/29/25/1 | 2 rows (#2 partial, #3 pending) |
| Z3 | 40/2/16/24/1 | 1 row (#5 pending) |
| All Zones | 142/8/67/75/4 | 4 rows |

### T-005 · KPI cards (US-005)
- Verify 5 cards visible: Products / BOM Dispatches / Assemblies / Parts / Alerts
- Alerts card: red color when value > 0 (THEPHA/All = 4 → red)
- PROJ-D/All: Alerts = 0 → grey icon

### T-006 · Zone progress bars + color tiers (US-006)
THEPHA / All Zones — verify:
- Z1 82% → **green bar** "On track"
- Z2 48% → **blue bar** "In progress"
- Z3 25% → **amber bar** "Behind"
- PROJ-B / ZB 18% → **red bar** "At risk"

Click a zone bar → zone filter activates.
Click same bar again → filter clears (returns to All Zones).

### T-007 · Dispatch table (US-007)
THEPHA / All Zones:
- 4 rows (ids 1, 2, 3, 5 — all project_id:1)
- Row 1: Complete pill (green) · 22 asm · 86 parts · 4,200 kg
- Row 2: Partial pill (amber)
- Rows 3 + 5: Pending pill (grey)
- Click action arrow row 1 → navigates to `/bom/dispatch/1`
- "View all" link → `/bom`

### T-008 · Regression (existing routes)
Navigate to each and confirm it loads (not blank/error):
- `/bom` — BomList
- `/materials` — MaterialList
- `/engineer-products` — ProductList
- `/routings` — RoutingList
- `/projects` — ProjectList

---

## Step 3 — Viewport check

Use browser DevTools responsive mode. Test at widths:
- 1024px — all widgets visible, no horizontal scroll
- 1280px — layout comfortable
- 1440px — natural spacing
- 1920px — container capped (not full-bleed stretch)

---

## Step 4 — Report

Report is **not auto-generated** (no vitest yet). Record results inline:

```
Dashboard showcase manual test — YYYY-MM-DD
Branch: dev-dashboard-showcase
Tester: <name>

T-001 Login redirect:     [ PASS / FAIL ] notes:
T-002 Default project:    [ PASS / FAIL ] notes:
T-003 Project switch:     [ PASS / FAIL ] notes:
T-004 Zone drill-down:    [ PASS / FAIL ] notes:
T-005 KPI cards:          [ PASS / FAIL ] notes:
T-006 Zone progress bars: [ PASS / FAIL ] notes:
T-007 Dispatch table:     [ PASS / FAIL ] notes:
T-008 Regression:         [ PASS / FAIL ] notes:
Viewport 1024px:          [ PASS / FAIL ] notes:
Viewport 1920px:          [ PASS / FAIL ] notes:

OVERALL: PASS / FAIL
Known deviations: <list any acceptable gaps>
```

Save report to: `docs/test-scripts/dashboard/dashboard-showcase-test-report-YYYY-MM-DD.md`

---

## Step 5 — Expected values reference

All expected values come from `src/data/dashboardMock.ts`:
- `KPI_BY_SCOPE` — per-scope KPI counts
- `ZONE_PROGRESS_BY_PROJECT` — zone percentages
- `MOCK_DISPATCHES` — dispatch rows
- `MOCK_ALERTS` — alert count per scope

No xlsx dependency (prototype uses hand-crafted mock data).

---

## Re-run notes

- No zone/dispatch collision risk (mock data is deterministic)
- If servers not running: `npm run dev` (FE) + `cd backend && npm run start:dev` (BE) + `docker compose up -d postgres`
- Test is idempotent — no DB writes, safe to re-run unlimited times
