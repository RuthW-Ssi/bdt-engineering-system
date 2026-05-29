---
description: Draft today's personal daily work summary (Apisit Kulkham) into ~/Documents/bdt/summary-daily-tao, mined from git + sprint context, for review before commit
argument-hint: [YYYY-MM-DD (default today)]
---

# /daily-summary — personal end-of-day work summary

Generates a Thai daily work summary for **Apisit Kulkham** in the personal log repo
`~/Documents/bdt/summary-daily-tao/`, matching the established format. Mines the day's
work from git; auto-drafts the judgment sections and flags them for the user to edit.
Run before leaving work.

**Date:** $ARGUMENTS (optional — defaults to today).

---

## Output location & naming

- Month folder: `~/Documents/bdt/summary-daily-tao/<month>-<year>/` lowercase month
  name (e.g. `may-2026`). Create it if missing.
- Daily file: `<YYYY-MM-DD>_Daily_Summary.md`.
- If the file already exists, do NOT overwrite — show a diff of what you'd add and ask.

## Steps

### 1. Resolve date + month folder
Use `$ARGUMENTS` or today. Compute the Thai weekday (จันทร์/อังคาร/…) and the
`<month>-<year>` folder. `mkdir -p` the folder.

### 2. Gather the day's work (the factual base)
Run, for the target date window `[date 00:00, next-day 00:00)`:
- `bdt-app` commits: `git -C /Users/michel-angelo/Desktop/test555/bdt-app log --since=... --until=... --all --pretty="%h %ad %s" --date=format:"%H:%M"`
- `bdt-app` file/LOC deltas for those commits: `git ... diff --stat <first^> <last>` (or per-commit `--numstat`)
- wiki commits: same on `~/Documents/bdt/knowledge-base`
- Sprint context: read the latest `pm/_snapshots/sprint-*.md` (run `/sync-sprint` first if the snapshot is >24h old) for the current Sprint name/goal.

### 3. Write the summary (match the existing format exactly)
Sections, in Thai, in this order:
1. `# สรุปงานประจำวัน — <YYYY-MM-DD> (<thai-weekday>)`
2. **ผู้จัดทำ:** Apisit Kulkham · **โปรเจ็ค:** bdt-engineering-system · **Sprint บริบท:** <from snapshot>
3. `## TL;DR` — 2–4 lines, the headline of the day
4. `## งานที่ทำ` — numbered subsections per feature/area; include code blocks, endpoint lists, and tables where they clarify (mirror prior days' depth)
5. `## Files Changed (<date>)` — table `| File | LOC delta | การเปลี่ยนแปลง |` from the numstat
6. `## Decisions (วันที่ <dd>)` — table `| # | Decision | เหตุผล |` — **AUTO-DRAFT** best-effort from commit messages + diffs, then add the line `> ⚠️ ตรวจ/แก้ decisions ก่อน commit` for the user
7. `## Issues / Bugs พบระหว่างทำ` — table `| Issue | สาเหตุ | แก้อย่างไร |` — **AUTO-DRAFT** best-effort, same ⚠️ flag
8. `## Carry-forward / Next Steps` — bullets (unfinished items, follow-ups, wiki-integration TODOs)
9. Footer: `*Generated <today> · <one-line> · Source: git log, file mtimes, schema migrations*`

### 4. Review gate — DO NOT commit yet
Present the draft path and a short summary. Tell the user to review/enrich the
Decisions + Issues sections (git cannot infer rationale). Only after the user
approves: `git -C ~/Documents/bdt/summary-daily-tao add <file> && git commit`
(commit message `daily: <YYYY-MM-DD> summary`). **Do NOT push** unless asked.

## Notes
- Stage by explicit path; never `git add -A` in this repo.
- This is the user's personal log — separate from the project wiki. Do not copy its
  content into the wiki.
