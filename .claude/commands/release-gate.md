---
description: Release-readiness gate — dispatches qa + security in parallel before devops commits/pushes. Critical/High = BLOCK, Medium = WARN, Low = INFO. After commit, cascades doc updates (wiki + Notion + sign-off + log). Use --force-ship for emergency override (logged).
argument-hint: [task-id | --force-ship | --force-ship reason="..."]
---

# /release-gate — release-readiness gate + post-ship doc cascade

Runs `qa` + `security` subagents in **parallel** to verify a feature is ready
to ship. If both PASS (no Critical/High findings), dispatches `devops` to
commit/push, then cascades doc updates to wiki + Notion + sign-off + audit log.

**Target:** `$ARGUMENTS` — task id (e.g. `T-BE-RT.12`) or `--force-ship` for
emergency override (must include `reason="..."` · logged in `log.md`).

Shared rules:
- Role cards: `~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/tech/roles/{qa,security,devops,tester,wiki-integrator,notion-mirror}.md`
- Severity rubric: `bdt-app/CLAUDE.md` §5.2
- Wiki Write Gate: `wiki/tech/roles/_wiki-write-gate.md`

---

## Step 1 — Pre-check

1. Resolve `$ARGUMENTS` → Notion task ID (or read from current branch name).
2. Verify on a feature branch (not `main`). If on `main` → halt with error.
3. Verify branch is clean (no uncommitted changes besides what we intend to commit).
4. Read Notion task to identify the feature scope.
5. Confirm to user: "Release-gating task `T-XX` (feature `<name>`) on branch `<branch>`. Proceed?"

## Step 2 — Parallel review dispatch

Use the Task tool **in a single message** to dispatch both subagents simultaneously:

- **qa subagent** — reads:
  - Notion task DoD checklist
  - `wiki/tech/testing/per-feature/<feature>.md` (PRIMARY artifact · BLOCK if missing)
  - Raw test report in `docs/test-scripts/<feature>/`
  - Manual test evidence (chat/Notion completion notes)
  - Wiki diff (`git diff main -- wiki/`)
  - CI status (`gh run list --limit 1 --branch <branch>`)
  - Coverage summary
  - Returns: PASS / WARN / BLOCK + findings to `docs/qa/findings/<date>-<feature>.md`

- **security subagent** — reads:
  - Changed code (`git diff main -- backend/src/ src/`)
  - OWASP API Top 10 2023 checklist (per role card)
  - Risk register (`docs/security/risk-register.md`)
  - Returns: PASS / WARN / BLOCK + findings to `docs/security/findings/<date>-<feature>.md`

Wait for both to complete. Do NOT proceed sequentially.

## Step 3 — Aggregate findings

Build a unified result table:

| source | severity | finding | fix_route |
|---|---|---|---|
| qa | High | DoD #3 not covered | tester |
| security | Medium | console.log leaks part_mark | backend |
| ... | ... | ... | ... |

Classify overall decision per CLAUDE.md §5.2 rubric:
- ANY Critical or High (from either qa or security) → **BLOCK**
- ANY Medium (no High+) → **WARN**
- Only Low or none → **PASS**

## Step 4 — Decision branching

### Case PASS (no findings ≥ Medium)
- Show summary to user: "✅ All checks PASS · ready to ship"
- Proceed to Step 5

### Case WARN (Medium findings · no Critical/High)
- Show all findings with severity + fix_route
- Ask user: "Proceed despite Medium findings? (y/n)"
- If `y` → record user_overrode=true in sign-off · proceed to Step 5
- If `n` → halt · do not commit

### Case BLOCK (Critical/High findings)
- Show all findings with severity + fix_route
- For each finding · suggest re-dispatching the responsible role
  (tester / fe / be / data / wiki-integrator / devops)
- **Halt** · do not commit · do not push
- User must fix · re-run `/release-gate` after fix

### Emergency override
If `$ARGUMENTS` contains `--force-ship reason="..."`:
- Bypass BLOCK rule
- Require reason argument (refuse if missing)
- Record `forced_ship: true` + reason in sign-off file
- Append explicit override entry to `log.md` (will be reviewed in retrospective)
- Proceed to Step 5

## Step 5 — Commit + push (if PASS or overridden)

Dispatch **devops** subagent with the approved file scope:

1. `git status` — list changed files; confirm scope matches Notion task
2. `git add <explicit paths>` — **never `git add -A`** (per devops role card)
3. `git commit -m "[S<N>-<task-id>] <subject>"` (format per CLAUDE.md §6)
4. `git push origin <branch>`
5. Return commit SHA + push status

Devops MUST refuse if:
- Untracked files outside scope
- Force-push needed
- Branch is `main`

## Step 6 — Close + audit trail + docs cascade

After commit/push succeeds, run all sub-steps below. Sub-steps 6.1–6.4 can
run in parallel where possible · 6.5 verifies the result.

### 6.1 Wiki updates (via `wiki-integrator` subagent)

Dispatch `wiki-integrator` with the change scope (commit diff + Notion task).
Wiki-integrator detects what changed and updates ONLY the affected pages.
**Every wiki write goes through Wiki Write Gate** (propose diff → user approve → write):

| change detected | wiki page to update | what to add |
|---|---|---|
| Feature shipped (always) | `wiki/features/<feature>.md` | status: shipped · commit SHA · ship date · brief summary |
| Endpoint added/changed/removed | `wiki/tech/backend/api.md` | new endpoint · param changes · response shape |
| Schema migration | `wiki/tech/data-model.md` | new tables · column changes · constraints · indexes |
| New ADR (architectural decision) | `wiki/tech/backend/decisions.md` | append decision · context · trade-offs · consequences |
| Test infra changed | `wiki/tech/testing/*` | pattern updates · framework additions |
| Security finding addressed | `docs/security/risk-register.md` | flip risk status · link to fix commit |

**Verify (don't write again):**
- `wiki/tech/testing/per-feature/<feature>.md` — should EXIST (tester wrote during P3)
- If missing → log warning (tester DoD violation) · continue

### 6.2 Notion cascade updates

Update Notion at 3 levels (use `notion-mirror` subagent for batch writes):

1. **Task page** (`T-XX-YY.NN`):
   - Status = `Done`
   - Completion Notes = `commit <sha> · sign-off <link> · wiki updates <list>`
   - Add ship date

2. **Feature page** (parent of task):
   - Check: ALL child tasks Done?
   - If yes → flip Feature status to `Done` + Completion Notes (rollup)
   - Add ship date

3. **Sprint page** (parent of feature):
   - Check: ALL features in sprint Done?
   - If yes → flip Sprint status to `Done` + Completion Notes (rollup)
   - Add sprint ship date

### 6.3 Sign-off + audit files

1. **Write sign-off file** `docs/qa/sign-offs/<YYYY-MM-DD>-<feature>.md`:
   - `decision` · `checks_performed` · `findings` · `approved_for_ship` · `user_overrode`
   - Link to qa findings + security findings (if any)

2. **Append log.md entry** `~/Documents/bdt/knowledge-base/log.md`:
   - Date · task id · decision (PASS / WARN-overridden / FORCE) · commit SHA
   - Findings count per severity
   - Wiki pages updated (list)
   - If `--force-ship` used: include reason

### 6.4 Snapshot Notion → wiki

Run `/sync-sprint` to pull the just-updated Notion state into
`pm/_snapshots/` (mirror stays consistent with live state).

### 6.5 Verification (must pass before final confirmation)

1. **Run `/wiki-doctor`** to lint all updates:
   - No new broken links from new content
   - No new orphan pages
   - Cross-refs valid (wiki ↔ wiki ↔ docs)

2. **Diff sanity check:**
   - `git log -1 --stat` → expected files only
   - Notion task page → confirm Done badge visible
   - Wiki pages → confirm latest commits present

3. **If verification fails** → DO NOT confirm to user · surface the issue:
   - "Wiki-doctor found broken link in `<page>` · please fix"
   - User decides: roll back · fix forward · accept

### 6.6 Final confirmation

Show user a summary panel:

```
✅ SHIPPED · T-XX-YY.NN (<feature>)

  Commit:        <sha>
  Pushed to:     <branch>
  Notion:        Task ✅ · Feature ✅/⏳ · Sprint ✅/⏳
  Wiki updated:  features/<feature>.md · tech/backend/api.md (+N more)
  Sign-off:      docs/qa/sign-offs/<date>-<feature>.md
  Audit log:     knowledge-base/log.md (appended)
  Wiki-doctor:   ✅ no issues
```

---

## Anti-patterns (REFUSE)

1. **Skipping pre-check** — never proceed without verifying branch + Notion task
2. **Sequential dispatch** — qa and security MUST run in parallel (Task tool, single message)
3. **Auto-accepting WARN** — always ask user explicitly · never assume
4. **`git add -A`** — devops refuses; this command never instructs it
5. **Committing to `main` directly** — must always be feature branch
6. **`--force-ship` without reason** — refuse the override · require explanation
7. **Skipping Step 6 docs cascade** — commit is not enough; doc drift = future contradiction
8. **Direct wiki writes** — always via `wiki-integrator` subagent + Wiki Write Gate (propose → approve → write)
9. **Skipping verification (6.5)** — wiki-doctor must pass before final confirmation

## See also

- `wiki/tech/roles/qa.md` — qa subagent role card (release-readiness reviewer)
- `wiki/tech/roles/security.md` — security subagent role card (OWASP-aligned)
- `wiki/tech/roles/devops.md` — devops role card (commit/push executor)
- `wiki/tech/roles/tester.md` — tester role card (produces wiki test summary qa reads)
- `wiki/tech/roles/wiki-integrator.md` — wiki update orchestrator (Step 6.1)
- `wiki/tech/roles/notion-mirror.md` — Notion batch writer (Step 6.2)
- `wiki/tech/testing/per-feature/_README.md` — wiki test summary folder
- `bdt-app/CLAUDE.md` §5.2 — Release Gate workflow + severity rules
- `bdt-app/CLAUDE.md` §6 — branching · commit format · CI safety
- `.claude/commands/wiki-update.md` — 4-step wiki integration protocol
- `.claude/commands/sync-sprint.md` — Notion → snapshot mirror
- `.claude/commands/wiki-doctor.md` — wiki lint

_Updated 2026-06-03 — added Step 6 docs cascade (6.1 wiki via wiki-integrator · 6.2 Notion 3-level cascade · 6.3 sign-off+log · 6.4 sync-sprint · 6.5 verification · 6.6 final panel)_
