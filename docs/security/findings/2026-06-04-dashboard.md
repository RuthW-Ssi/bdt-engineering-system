# Security Review — Dashboard Showcase

- **Task:** T-DASH-SHOWCASE.01
- **Branch:** dev-dashboard-showcase
- **Date:** 2026-06-04
- **Reviewer:** security subagent (review-only, OWASP-aligned)
- **Scope:** FE-only mock-data prototype — no backend changes, no new API endpoints, no DB writes

---

## Files Reviewed

| File | Status |
|---|---|
| `src/pages/Dashboard.tsx` | Reviewed |
| `src/data/dashboardMock.ts` | Reviewed |
| `src/hooks/useDashboardData.ts` | Reviewed |
| `src/components/dashboard/FilterBar.tsx` | Reviewed |
| `src/components/dashboard/KPIStrip.tsx` | Reviewed |
| `src/components/dashboard/ZoneProgress.tsx` | Reviewed |
| `src/components/dashboard/DispatchesWidget.tsx` | Reviewed |
| `src/components/dashboard/AlertsWidget.tsx` | Reviewed |
| `src/components/dashboard/LibraryDonut.tsx` | Reviewed |
| `src/components/dashboard/RoutingUsage.tsx` | Reviewed |
| `src/components/dashboard/MaterialsWidget.tsx` | Reviewed |
| `src/components/dashboard/ActivityFeed.tsx` | Reviewed |
| `src/components/dashboard/QuickActions.tsx` | Reviewed |
| `src/App.tsx` (modified) | Reviewed |

---

## OWASP Checklist — Scope-adjusted for FE-only mock prototype

| Check | Result |
|---|---|
| `/dashboard` route behind auth guard (`ProtectedRoute`) | PASS |
| `dangerouslySetInnerHTML` usage | NONE FOUND |
| Direct DOM manipulation / `innerHTML` / `eval()` | NONE FOUND |
| `console.log` of sensitive data | NONE FOUND |
| Hardcoded secrets / tokens / API keys | NONE FOUND |
| Auth bypass import / NODE_ENV guard reintroduced | NONE FOUND |
| Hardcoded real PII (full names, emails, phone numbers) | LOW — see Finding 1 |
| Internal project names in mock data | LOW — see Finding 2 |
| Open-redirect via `action_path` navigation | INFO — see Finding 3 |
| localStorage storing sensitive data | PASS (numeric IDs only) |
| URL params exposing sensitive data | PASS (codes/IDs only) |

---

## Findings

### Finding 1 — Low · A09:2021 · Internal usernames in mock activity/dispatch data

- **Where:** `src/data/dashboardMock.ts` lines 167–185 (`MOCK_DISPATCHES.uploader_name`, `MOCK_ACTIVITIES.actor`)
- **What:** Mock data contains real internal system usernames (`apisit.w`, `somchai.k`) used as `uploader_name` and `actor` fields, rendered in `DispatchesWidget` (line 77) and `ActivityFeed` (line 48).
- **Why:** In a B2B internal tool, login handles are low-sensitivity. However, if the mock data is ever exported, screen-shared in a demo, or accidentally shipped to staging with real data seeded from it, these become traceable to individuals. Strictly, usernames constitute PII under PDPA (Thailand) / GDPR category "online identifier."
- **Severity:** Low — internal tool, no external exposure surface, usernames only (no emails/phone numbers/full names)
- **Fix route:** fe — replace with obviously fictional placeholders (`user.a`, `user.b`) or `UserA`, `UserB` before promoting mock to any shared environment or recorded demo. No urgency for local dev prototype.

---

### Finding 2 — Low · A09:2021 · Real internal project name in mock data

- **Where:** `src/data/dashboardMock.ts` line 99 (`MOCK_PROJECTS[0].name = 'THEPHA 28×54m อาคารคลังสินค้า'`)
- **What:** The first mock project uses what appears to be a real SSI Steel project codename and description.
- **Why:** If a screenshot or demo of this dashboard is shared externally, it reveals an active project name and facility type. This is internal business information (BOM data / engineering IP per the security role card domain context).
- **Severity:** Low — mock prototype, no backend exposure; risk only if demo'd externally
- **Fix route:** fe — replace with neutral fictional names (e.g., `'Project Alpha — Prototype'`) if the dashboard will be demo'd outside the team, recorded in video, or used in client-facing presentations.

---

### Finding 3 — Info · A01:2021 · `action_path` used directly in `navigate()` — verify no future open-redirect risk

- **Where:** `src/components/dashboard/AlertsWidget.tsx` line 49 — `navigate(a.action_path)`
- **What:** Alert action paths from `AlertEntry.action_path` are passed directly to React Router's `navigate()`. All current values in `dashboardMock.ts` are internal relative paths (`/bom/dispatch/3`, `/engineer-products`, `/bom`, `/materials`).
- **Why:** React Router's `navigate()` with a relative path (no protocol/host) cannot trigger an open redirect in a SPA. Risk is bounded to mock data. However, when this component is wired to a real API response in a future sprint, if `action_path` comes from the backend without validation, an attacker-supplied absolute URL (e.g., `https://evil.com`) could trigger a redirect.
- **Severity:** Info — no current risk (mock data, relative paths only). Future risk if wired to API without input validation.
- **Fix route:** fe (future sprint, when API-wired) — add a guard: `if (path.startsWith('/')) navigate(path)` before calling `navigate(a.action_path)`.

---

## Clean checks

The following anti-patterns from the security role card were explicitly verified as absent:

- No `dangerouslySetInnerHTML` in any of the 13 new/modified files
- No `console.log`, `console.error`, or `console.warn` calls
- No hardcoded credentials, JWT tokens, API keys, passwords, or `DATABASE_URL`
- No `NODE_ENV === 'production'` guard reintroduced (regression check: clean)
- No new backend endpoints introduced (FE-only scope confirmed)
- No file upload logic (N/A for this feature)
- Auth route check: `<Route path="/dashboard" element={<Dashboard />} />` at `src/App.tsx` line 56 sits inside the `ProtectedRoute` wrapper (lines 49–54) — auth guard intact

---

## Decision

**PASS**

No Critical, High, or Medium findings. Two Low-severity items (fictional vs. real data in mock) and one Info note (future open-redirect guard for when `action_path` is API-driven). FE-only mock prototype is safe to proceed.

---

## OWASP API Top 10 2023 — Impact of this change

All existing open risks (R-001 through R-006) are **unchanged** by this FE-only change. No new API-level risks introduced.

---

_Security review complete — 2026-06-04 · review-only role · fixes routed to fe_
