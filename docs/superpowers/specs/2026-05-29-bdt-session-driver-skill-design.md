# Design — `bdt-session-driver` (Claude Code session driver for BDT)

**Date:** 2026-05-29
**Author:** bdtapp@ssi-steel.com + Claude
**Status:** Approved design, pending implementation plan
**Repo:** `bdt-app` · branch `dev-t-session-driver-skill`

---

## 1. Context & Problem

The BDT Engineering System has mature endpoints already: a Karpathy-style LLM
wiki (second brain), a Notion PM workspace (Sprint/Feature/Task), and several
slash commands (`/sync-sprint`, `/wiki-update`, `/wrap-up`, `/blocking-questions`,
`/wiki-doctor`, `/promote-to-wiki`) plus subagents (`wiki-integrator`,
`notion-mirror`).

What is missing is the **front of the workflow** — the piece that opens a work
session, takes the handoff from **Claude cowork**, and drives Claude Code through
a consistent sequence into those existing endpoints. Today that sequence lives
only in *memory (feedback type)*, which is injected as context but does not
*compel* the agent to follow it. As the project grows, steps get skipped: drift
is left un-backfilled, commits happen before review, the wiki and Notion fall out
of sync with what cowork believes.

**Goal:** a single driver that makes the workflow *a path the agent walks*, not a
checklist it may forget — with hard gates at the exact points that currently fail.

---

## 2. Goals / Non-goals

**Goals**
- One position-agnostic **driver** that runs an entire Claude Code work session
  (recap → gate → select → implement → backfill → close).
- A shared **second brain** contract: cowork and Claude Code communicate *only*
  through wiki (cleaned knowledge) + Notion (plan/state). No durable knowledge
  lives in chat.
- **Role separation** by position (frontend / backend / data / tester / devops)
  via subagents the driver dispatches by task domain — without forking the
  workflow spine.
- **Hard gates** at the historically-failing points:
  - Tiered consistency gate (P1).
  - Wiki Write Gate — propose diff → approve → write (P4 and P5).
  - Review Gate — ask the user before any commit / push / mark-Done (P5).
  - Cowork-Sync close — wiki + a cowork-readable handoff doc, every time (P5).

**Non-goals**
- Not replacing existing commands/subagents — the driver *composes* them.
- Not building harness-level (hook) enforcement in v1. The driver is
  model-followed; hook enforcement is a documented future step (§10).
- Not changing the cowork side. This spec covers only the Claude Code side of
  the loop and what it reads from / writes back to the shared second brain.

---

## 3. Architecture — the bidirectional cowork loop

```
        ┌─────────────────── Claude COWORK ───────────────────┐
        │ discuss → summarize architecture / UX / data model   │
        │ → write to wiki LLM + create Sprint/Feature/Task      │
        └───────────────┬──────────────────────────────────────┘
                        │  handoff via:  wiki (cleaned) + Notion (plan)
                        ▼
        ┌─────────── Claude CODE  (bdt-session-driver) ────────┐
        │ P0 Recap → P1 Gate → P2 Select → P3 Implement         │
        │ → P4 Drift Backfill → P5 Close                        │
        └───────────────┬──────────────────────────────────────┘
                        │  write back:  wiki update + Notion close
                        ▼  + pm/handoff.md (cowork read-me)
        └────────────────► cowork's next round sees current state
```

**Golden rule of the loop:** cowork and Claude Code communicate *only* through
wiki + Notion. If a piece of knowledge matters beyond this session, it must be
written into the second brain — never left in chat. (Consistent with the existing
Karpathy-style "integrate, don't re-derive" design.)

**Source-of-truth boundaries (existing, restated):**
- Raw/uncleaned source → `bdt-app/document/`
- Cleaned/synthesized knowledge → wiki LLM (`knowledge-base/.../wiki/`)
- Plan & live status → Notion (mirrored read-only to `pm/_snapshots/` by `/sync-sprint`)

---

## 4. The driver — phases P0–P5

| Phase | What it does | Who | Gate |
|---|---|---|---|
| **P0 Recap** | Read wiki design pages + run `/sync-sprint` + query Notion → present a "here's what I understand" recap for the user to confirm | Explore subagents (parallel) | — |
| **P1 Consistency Gate** | Compare wiki ↔ Notion ↔ codebase for gaps/contradictions | main | **Tiered** (see §5.1) |
| **P2 Select + Plan** | Pick the task, set its level, draft a plan, tag which role(s) it spans | Plan subagent | user approves plan before implement |
| **P3 Implement** | code / rewrite / fixbug — dispatch role subagent(s) by domain (parallel if multi-role) | main + role subagents | — |
| **P4 Drift Backfill** | When design changes mid-flight → backfill wiki + Notion *in this same round* | wiki-integrator subagent | **Wiki Write Gate** (§5.2) — never defer drift |
| **P5 Close** | ① **Review Gate** → ② **Cowork-Sync** → hand off to `/wrap-up` | main | **Review Gate** (§5.3) + **Wiki Write Gate** on the sync write |

Rationale: P4 (immediate backfill) and P5 (review + cowork-sync) are the two
points where "unsystematic" work historically breaks. The driver makes both
*mandatory steps on the path*, not optional-if-remembered.

---

## 5. Gates

### 5.1 Consistency Gate (P1) — tiered

- **Hard stop + flag** when the conflict touches **principle / architecture /
  data model**: write to `_contradictions.md` (append, never overwrite) and/or
  the blocking list, then ask the user before proceeding. Do not guess.
- **Log assumption + continue** for small ambiguity (naming, ordering): record
  the assumption, proceed, and surface it in the P5 recap/handoff for later
  reconciliation.

### 5.2 Wiki Write Gate (shared by P4 and P5)

A single shared rule referenced by both backfill points so the logic is not
duplicated:

> Before writing to wiki or Notion: **propose the diff** (which page / which
> lines / why) → **get user approval** → **then write.** Never write to the
> second brain before discussing it.

This protects the shared brain from silent or speculative edits by any agent.

### 5.3 Review Gate (P5)

> Before any `commit`, `push`, or marking a Notion task **Done**: **stop and ask
> the user to review first.** Every time. No exceptions.

### 5.4 Cowork-Sync Close (P5)

On finishing work, update the wiki LLM (via Wiki Write Gate) **and** write
`pm/handoff.md` (§8) so cowork's next round understands the new state. Then hand
off to `/wrap-up` for the existing closure protocol.

---

## 6. Role cards + subagents

The workflow spine is identical across positions; only *implementation
expertise* differs. So position is expressed as **role cards** (shared reference)
+ **role subagents** (isolated context), dispatched at P3 by task domain — not as
forked drivers.

**Role card — one file per position, five fields each:**

| Field | Meaning |
|---|---|
| **Owns** | files/folders this role is responsible for |
| **Conventions** | patterns this role must follow |
| **Definition-of-Done** | what "done" requires for this role |
| **Review criteria** | what the Review Gate checks for this role |
| **Must NOT touch** | hard boundaries (other roles' files, `raw/`, contradiction overwrites) |

**Five roles:** `frontend` (React 19 / Vite / TS) · `backend` (NestJS / Prisma
API) · `data` (Prisma schema / migration) · `tester` (tests / coverage) ·
`devops` (Docker / GCP / CI).

Each role card is paired with a subagent in `.claude/agents/`. A task that spans
multiple roles dispatches multiple subagents in parallel. Role cards live **in
the wiki** (second brain) so cowork and every subagent read the *same* definition.

---

## 7. File layout

Matches the repo's existing convention: slash commands in `.claude/commands/`,
subagents in `.claude/agents/`.

```
bdt-app/.claude/
  commands/bdt-session-driver.md         ← the driver (P0–P5), invoked at session start
  agents/frontend.md                     ← 5 role subagents
  agents/backend.md
  agents/data.md
  agents/tester.md
  agents/devops.md
  (existing: agents/wiki-integrator.md, agents/notion-mirror.md)

knowledge-base/projects/bdt-engineering-system/wiki/tech/roles/
  frontend.md  backend.md  data.md  tester.md  devops.md   ← 5 role cards (second brain)
  _wiki-write-gate.md                    ← shared gate rule (§5.2), read by driver + every subagent

knowledge-base/projects/bdt-engineering-system/pm/
  handoff.md                             ← cowork read-me, rewritten each close
```

**On the Wiki Write Gate file:** it lives in the wiki (not `.claude/commands/`)
because it is a shared operating rule every agent — driver, role subagents, and
cowork — must obey. Placing it in `commands/` would create a phantom invokable
slash command; placing it in the second brain makes it the single shared
definition that the driver and each role subagent reference.

**Note on driver form:** implemented as a slash command (`/bdt-session-driver`)
to match the existing ecosystem and because the user explicitly triggers it at
session start. (Hook-based hard enforcement is a separate future step — §10.)

---

## 8. Handoff-back doc (`pm/handoff.md`)

A short "cover page" cowork can absorb in ~30 seconds. Rewritten (not appended)
each close; points to the detailed append-only logs (`pm/log.md`, root `log.md`)
for full history.

```markdown
# Handoff — updated <date> by claude-code
## What this round did
- [S7-T03] Added BOM endpoint → see wiki: features/bom.md
## Wiki changed
- data-model.md (+ bom_line model) · decisions.md (chose soft-delete)
## Notion closed
- Feature "BOM core" → Done
## Pending cowork decision
- naming: bom_line vs bom_item (assumed bom_line for now)
```

---

## 9. Composition with existing commands/subagents

The driver does not reimplement existing capability — it sequences it:

- **P0** → `/sync-sprint` (+ Explore subagents for wiki/codebase recap)
- **P1** → `/blocking-questions`, `_contradictions.md`, `/wiki-doctor` (consistency)
- **P4 / P5 wiki writes** → `/wiki-update` + `wiki-integrator` subagent, under the Wiki Write Gate
- **P5 close** → `/wrap-up` (existing 8-step closure protocol)
- Notion ID resolution → existing memory bridge file (as `/sync-sprint` does)

---

## 10. Open questions / future

- **Hook enforcement (v2):** once the driver flow is proven, lift the most
  critical gate (Review Gate / "wiki+Notion updated before commit") into a
  Claude Code hook so it is enforced at the harness level and cannot be skipped.
  Hooks are mechanical (pattern checks), so they complement — not replace — the
  semantic gate in the driver.
- **Role card authority:** role cards are project-specific today (React 19 /
  NestJS). If cross-project standards emerge, some fields may migrate to
  `bdt-core/wiki/`. Out of scope for v1.
- **Multi-role conflict resolution:** when parallel role subagents disagree on a
  shared boundary, the driver mediates at P3 → escalates via the P1 tiered rule
  if it touches architecture/data model.
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
