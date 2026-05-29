---
description: Aggregate a month of daily summaries into one Monthly_Summary for Apisit Kulkham in ~/Documents/bdt/summary-daily-tao, for review before commit
argument-hint: [YYYY-MM (default current month) | <start>_to_<end>]
---

# /monthly-summary — personal monthly roll-up

Rolls the month's `*_Daily_Summary.md` files in `~/Documents/bdt/summary-daily-tao/<month>-<year>/`
into one `Monthly_Summary_<start>_to_<end>.md`, matching the established format.

**Period:** $ARGUMENTS (optional — defaults to the current month).

---

## Steps

### 1. Resolve period + folder
From `$ARGUMENTS` (or current month) compute the `<month>-<year>` folder and the
`<start>_to_<end>` date range (mirror existing files, e.g. `2026-04-29_to_2026-05-29`).

### 2. Read all dailies in the folder
Read every `*_Daily_Summary.md` (and any `YYYY-MM-DD.md`) in the folder. These are the
source of truth — do NOT re-mine git; the dailies already distilled it.

### 3. Write `Monthly_Summary_<start>_to_<end>.md` (match prior monthly format)
In Thai. Synthesize across the month:
- Header: ผู้จัดทำ Apisit Kulkham · โปรเจ็ค bdt-engineering-system · ช่วง <start> → <end>
- `## ภาพรวมเดือน` — narrative of what shipped this month
- `## งานหลักที่ส่งมอบ` — grouped by feature/area (not by day), citing the daily dates
- `## Decisions สำคัญ` — consolidated, de-duplicated across days
- `## Metrics` — commit count, rough LOC, features shipped, sprints touched
- `## Carry-forward` — open items still pending at month end
- Footer: `*Generated <today> · Source: daily summaries <start>..<end>*`

### 4. Optional .docx export
If the user wants the `.docx` (prior months have one), run:
`pandoc <Monthly_Summary>.md -o <Monthly_Summary>.docx` (only if `pandoc` is available).

### 5. Review gate — DO NOT commit yet
Present the draft. After the user approves: `git -C ~/Documents/bdt/summary-daily-tao
add <file(s)> && git commit -m "monthly: <start>_to_<end> summary"`. **Do NOT push**
unless asked. Stage by explicit path; never `git add -A`.
