# bdt-app — Agent Guide

This codebase is paired with a **Karpathy-style LLM Wiki** at:

```
/Users/michel-angelo/Documents/bdt/knowledge-base/
```

The wiki holds compiled knowledge about this project (domain rules, architecture
decisions, sprint state, code map). **Read it before coding. Update it after
coding.** It is not optional context — it is the source of truth for "why".

---

## Inheritance — read these two files first

When you start a task, read in this order:

1. [`knowledge-base/CLAUDE.md`](/Users/michel-angelo/Documents/bdt/knowledge-base/CLAUDE.md)
   — wiki maintenance protocol (folder roles, 4-step integration, anti-patterns).
2. [`knowledge-base/projects/bdt-engineering-system/CLAUDE.md`](/Users/michel-angelo/Documents/bdt/knowledge-base/projects/bdt-engineering-system/CLAUDE.md)
   — project-specific Agent Quick Start, code navigation map, and update triggers.

Everything in those two files applies here. **Do not duplicate their content into
this file.** This file only adds the codebase-side bridge.

> [!important]
> Read the **Trust & Verification** section in `knowledge-base/CLAUDE.md` and
> the **Truth-Source Matrix** in the project CLAUDE.md before answering or
> editing — these rules cover citation, staleness, and which side (code vs wiki)
> wins when they disagree. They are the main guardrail against hallucinating
> wiki content.

---

## Mandatory read-on-start

Every task — even small ones — start by reading at minimum:

| Step | Source | Tells you |
|---|---|---|
| **1** | **Notion MCP: Project + active Sprint + Epics + User Stories** (5-layer) | **Live ops state — sprint scope, story AC, blockers, who's doing what** |
| **1a** | **Notion MCP: Tasks DB filter Sprint=active** | **Tasks ที่ assigned ใน sprint ปัจจุบัน** |
| 2 | `knowledge-base/projects/bdt-engineering-system/wiki/index.md` | Wiki nav + Epics list + Features list |
| 3 | `knowledge-base/projects/bdt-engineering-system/wiki/epics/<area>.md` | Epic capability description (durable) |
| 4 | `knowledge-base/projects/bdt-engineering-system/wiki/features/<relevant>.md` | Feature-specific rules (if task touches a feature) |

**Notion DB IDs (since 2026-05-08, 5-layer hierarchy):**
- Projects: `af67a383-763d-4e39-b9da-372ac38c7b65`
- Epics: `ae7e8de9-e1be-4ff3-9c9f-3ff74065965c`
- User Stories: `768e1526-2f19-4d77-b19f-7b57099c9d09`
- Sprints: `a7d3fec7-3477-4e1a-896e-40d962cf338c`
- Features: `c40f689d-a2d3-4a8f-a53f-a07ad90d47ac`
- Tasks: `44a5ab8c-9be4-42e1-8cda-3331b8ae6352`

See ADR-0014 for hierarchy rationale.

> [!warning] DO NOT trust `pm/backlog.md` or `pm/_snapshots/*.md` as live state
> ไฟล์เหล่านี้เป็น **stub pointer** หรือ **stale mirror** — query Notion MCP เสมอ
> สำหรับ sprint/task/blocker question

For data-model / API / business-rule work, also follow the **Agent Quick Start
table** in the project CLAUDE.md (linked above) — Step 0 (Notion MCP) คือ entry point
สำหรับ live state.

> [!tip]
> ถ้า task เล็กจริงๆ (เช่น แก้ typo, ปรับ CSS) — query Notion MCP สั้นๆ ก็พอ
> เพื่อรู้ว่าตอนนี้อยู่ sprint ไหน อย่าเพิ่งกระโดดเข้าโค้ดโดยไม่รู้ context

---

## Task Closure Protocol — HARD RULE (run after EVERY work completion)

ทุกครั้งที่ทำงานเสร็จ (code merged + tests pass + DoD met) **ห้าม forget ปิด task ใน Notion** ตาม 5 steps:

1. **Update Notion Task row** — `Status: Done` + `Due Date: today` + append `## Completion Notes (YYYY-MM-DD)` ที่ body (What built / Files changed / Deviations / Follow-ups)
2. **Check Feature progress** — count Tasks where Feature=X AND Status≠Done. ถ้า=0 → flip Feature.Status=Done + Completion Notes
3. **Check Sprint progress** — count Features where Sprint=X AND Status≠Done. ถ้า=0 → flag user (รอ Demo + Retro)
4. **Update wiki ถ้าเกิด durable knowledge** — call `/wiki-update <path>` (อย่า edit ตรง)
5. **Commit message format** — `[S<sprint>-<task-id>] <subject> — <DoD met>`

> [!warning] ห้าม flip Status=Done โดยไม่ใส่ Completion Notes
> Notes เป็น audit trail (deviation tracking + onboarding + retro) — skip = status-lie risk

> รายละเอียดเต็มอยู่ใน `projects/bdt-engineering-system/CLAUDE.md` §"Task Closure Protocol"

---

## Update triggers (สรุป)

หลังเขียนโค้ด ให้เช็คว่าตรงข้อใด ถ้าตรง → update wiki ก่อนปิด task (Step 4):

- เพิ่ม Prisma model ใหม่ → `wiki/tech/data-model.md`
- เพิ่ม API endpoint → `wiki/tech/backend/api.md`
- ตัดสินใจสำคัญด้านสถาปัตยกรรม → `wiki/tech/<area>/decisions.md` (`> [!decision]` callout)
- สร้าง feature ใหม่ / แก้ feature เดิมที่กระทบ business → `wiki/features/<feature>.md`
- เจอ business rule ใหม่ / แก้ของเดิม → `wiki/domain/business-rules.md`
- ปิด open question → ลบจาก `wiki/_open-questions.md` + อัปเดตหน้าที่อ้างถึง
- เจอข้อขัดแย้งกับ wiki → append `wiki/_contradictions.md` + ใส่ `> [!warning] Contested` callout
- จบ sprint → append `pm/log.md` + อัปเดต `pm/plan.md` + append root `log.md`

> ตารางเต็มอยู่ในไฟล์ `projects/bdt-engineering-system/CLAUDE.md` ที่ link ไว้ข้างบน — ใช้เป็น authoritative reference

---

## What lives where (ห้ามจำผิด)

| Folder | Purpose | Edit policy |
|---|---|---|
| `bdt-core/wiki/` | Cross-project knowledge (org, people, standards) | Edit per protocol |
| `projects/bdt-engineering-system/wiki/` | Project-specific synthesized knowledge | Edit per protocol |
| `projects/bdt-engineering-system/pm/` | Operational state (sprints, backlog) | Update freely — transient |
| `projects/bdt-engineering-system/raw/` | Source material (meetings, ADRs, transcripts) | **READ-ONLY. Never edit. Never delete.** |
| `log.md` (root) | Append-only changelog of wiki edits | Append only |

---

## Hard rules (ผิดเมื่อไรพังทันที)

> [!warning]
> 1. **ห้าม edit `raw/`** — แม้แต่แก้ typo ก็ห้าม source data ต้องคงเดิม
> 2. **ห้าม overwrite contradictions** — ถ้าข้อมูลใหม่ขัดของเดิม → append `_contradictions.md`, อย่าลบของเก่า
> 3. **ทุก wiki page ต้อง link ออกอย่างน้อย 1 ที่** — ห้ามมี orphan ใช้ `[[wiki-link]]` Obsidian-style

---

## Helpers

- **`/wiki-update <path-or-text>`** — รัน 4-step integration protocol (READ→EXTRACT→INTEGRATE→LOG) อัตโนมัติ ใช้หลังประชุม / ตัดสินใจสำคัญ / จบ feature
- **Subagent `wiki-integrator`** — เรียกผ่าน Task tool เมื่อต้อง integrate raw content ขนาดใหญ่ (เช่น meeting transcript) ที่ไม่ควร bloat main context

---

## Codebase quick reference

Stack: React 19 + Vite + TypeScript (frontend) · NestJS 10 + Prisma 6 + PostgreSQL 16 (backend) · Docker Compose · pnpm.

Key directories — full code map ในไฟล์ `projects/bdt-engineering-system/CLAUDE.md`:

```
bdt-app/
├── src/                     ← React frontend
├── backend/src/modules/     ← NestJS modules (materials, products, boms, routings, ...)
├── backend/prisma/          ← schema.prisma + migrations + seeds
├── docs/adr/                ← Architecture Decision Records
└── docs/                    ← DEV_SETUP_LOCAL_MACOS.md ฯลฯ
```

Branch ปัจจุบัน: `tao_dev_llmwiki` (สำหรับงานเชื่อม wiki + dev work)
