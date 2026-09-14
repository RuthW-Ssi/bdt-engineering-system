# WO Visual Tab — Real Drawing Swap-in — Test Report

| Field | Value |
|-------|-------|
| Date | 2026-09-14 |
| Tester | Claude (self-spec, live session) |
| Sprint | 35 |
| Feature | F-WO Visual Tab Real Drawing Swap-in |
| Branch | dev-t-wo-visual-real-drawing |
| Environment | local dev |
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3000 |

This is a UI-wiring + matching-logic feature (no computed numeric values to
verify against a source of truth) — unlike `bom_upload`'s aggregate-value
reports, this report records unit test results plus the live manual
verification steps and their outcomes, per this codebase's established
convention for this class of feature (see `wiki/tech/testing/per-feature/wo-visual-tab.md`
for the full DoD coverage map — this file is the raw re-run record it
references, added to close a QA checklist gap: [[../../qa/findings/2026-09-14-wo-visual-tab.md|QA-02]]).

## Unit tests

```
npx vitest run src/components/wo/WoVisualTab.test.tsx
```

| # | Test | Result |
|---|---|---|
| 1 | matches a drawing whose filename leads with the mark, ignoring the trailing "- - Rev N" suffix | ✅ pass |
| 2 | is case-insensitive | ✅ pass |
| 3 | does not partial-match a different mark that merely shares a prefix (CTR1 vs CTR10) | ✅ pass |
| 4 | ignores PDF files even when the filename matches the mark | ✅ pass |
| 5 | only searches the latest .dwg version — an older version with a matching mark is ignored | ✅ pass |
| 6 | returns null when no .dwg in the latest version matches the mark | ✅ pass |
| 7 | picks the most recently uploaded file when more than one match lands in the latest version | ✅ pass |

**7/7 pass.** Full suite: `npx vitest run` → 62/62 (was 55 before this
increment). `tsc --noEmit` and the real `pnpm run build` (`tsc -b && vite
build`) both clean.

## Live manual verification (Playwright MCP, real running dev app)

| # | Scenario | Steps | Expected | Actual | Result |
|---|---|---|---|---|---|
| 1 | No matching drawing (baseline) | Open WO 3 (mark TC-CO1, zone ZA001/0X220) → Visual tab, before any matching file exists | New honest empty state ("No drawing uploaded for mark...") | Confirmed via screenshot — plain empty state, no mockup | ✅ pass |
| 2 | Match found → real preview | Upload `TC-CO1 - - Rev 1.dwg` to the same zone via the app's own upload flow → reload WO 3 → Visual tab | `DrawingPreviewPanel` renders (not the placeholder), filename shown | Confirmed via screenshot — real component rendered, filename correct | ✅ pass |
| 3 | Cleanup / no-match confirmed on a second WO | Delete the test upload → open WO 7 (different WO, mark TC-CO2, same zone) → Visual tab | Honest empty state, mentions the correct mark | Confirmed via screenshot — "No drawing uploaded for mark "TC-CO2" yet." | ✅ pass |
| 4 | Old mockup fully removed | grep repo for `WoDrawingPlaceholder` | Zero references outside a since-fixed comment | 1 residual comment reference found and fixed (QA-01); zero code/import references | ✅ pass |

Test data (the uploaded `.dwg`) was deleted after verification via the
app's own delete flow — no residual test data left in local dev.

## Bug log

None found during this increment's own implementation. (See
`wiki/tech/testing/per-feature/drawing.md` for the separate PDF-upload
feature's bug/security-finding log from the same day — unrelated to this
feature, this component only *consumes* that already-shipped, already
security-reviewed `DrawingPreviewPanel`.)

## Overall result

✅ **PASS** — 7/7 unit tests, 62/62 full suite, clean `tsc -b` build, 4/4 live
manual scenarios confirmed.
