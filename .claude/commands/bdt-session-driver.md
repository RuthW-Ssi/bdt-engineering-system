---
description: Drive a full BDT work session — recap, consistency gate, select, implement, drift backfill, close — taking the handoff from Claude cowork via wiki + Notion
argument-hint: [task-id or feature name | empty = pick from sprint]
---

# /bdt-session-driver — BDT work-session driver (P0–P5)

Drives one Claude Code work session from the cowork handoff to close. Cowork has
already written architecture/design to the wiki and created Sprint/Feature/Task in
Notion. This command walks P0→P5. **Communicate with cowork only through wiki +
Notion** — no durable knowledge stays in chat.

**Target:** $ARGUMENTS (optional — a task id / feature; empty = recap then pick).

Shared rules referenced below:
- Wiki Write Gate: `~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/tech/roles/_wiki-write-gate.md`
- Role cards: same `roles/` dir — `frontend.md`, `backend.md`, `data.md`, `tester.md`, `devops.md`
- Role subagents: `.claude/agents/{frontend,backend,data,tester,devops}.md`

---

## P0 — Recap

1. Run `/sync-sprint` to refresh the Notion snapshot.
2. Dispatch Explore subagents in parallel to read: the relevant wiki design pages
   (`tech/`, `features/`), the Notion task(s) for `$ARGUMENTS`, and the matching
   code area in `src/` or `backend/`.
3. Present a short **"here is what I understand"** recap and ask the user to
   confirm before going further. Do not start work until confirmed.

## P1 — Consistency Gate (tiered)

Compare wiki ↔ Notion ↔ codebase for gaps/contradictions.
- **Hard stop + flag** when the conflict touches **principle / architecture /
  data model**: append to `_contradictions.md` (never overwrite) and/or run
  `/blocking-questions`, then ask the user before proceeding. Do not guess.
- **Log assumption + continue** for small ambiguity (naming, ordering): record the
  assumption and surface it in the P5 handoff.

## P2 — Select + Plan

1. Pick the task (from `$ARGUMENTS` or the sprint), set its level/scope.
2. Tag which role(s) it spans (frontend/backend/data/tester/devops).
3. Draft a short plan and **get user approval before implementing**.

## P3 — Implement

1. For each role the task spans, dispatch that role subagent
   (`.claude/agents/<role>.md`). Multi-role tasks → dispatch in parallel.
2. Each subagent stays inside its role card's `Owns`; boundary crossings come back
   to you to re-dispatch the right role.
3. Do the code / rewrite / fixbug work through the subagents; integrate results.

## P4 — Drift Backfill (immediate)

If the design changed mid-flight, backfill **in this same round** — do not defer:
1. Apply the **Wiki Write Gate**: propose the diff (which wiki page / Notion row,
   which lines, why) → get user approval → then write (via `/wiki-update` or the
   `wiki-integrator` subagent for large edits).
2. Never leave drift unrecorded for "later".

## P5 — Close

1. **Review Gate** — before any `commit`, `push`, or marking a Notion task
   **Done**: stop and ask the user to review. Every time. No exceptions.
2. **Cowork-Sync** — under the Wiki Write Gate: update changed wiki pages, then
   rewrite `pm/handoff.md` (What this round did / Wiki changed / Notion closed /
   Pending cowork decision).
3. Hand off to `/wrap-up` for the existing 8-step closure protocol.
