# ADR-0014 — 5-Layer Project Hierarchy in Notion

**Date:** 2026-05-08
**Status:** Accepted
**Sprint:** 6 (when adopted) — applied retroactively to existing Sprint 6 work

---

## Context

Through Sprint 1-5, the BDT project tracking lived in Notion with a flat 3-layer hierarchy:

```
Sprint → Feature → Task
```

This was sufficient for solo/small-team execution but had two emerging problems:

1. **No business-side capability grouping.** Cross-sprint capabilities (e.g., "Authentication & RBAC" spans Sprint 6 dev mode → Sprint 7+ full RBAC → Sprint 10+ multi-tenant) had no parent grouping. Each sprint listed JWT-related tasks independently with no rollup view.

2. **No user-story granularity.** Features held both the user-facing requirement ("Admin can log in") and the implementation scope ("Auth dev mode + res_users"). Mixing the two made it hard to:
   - Write Definition of Done in user-language vs implementation-language
   - Map Acceptance Criteria to test cases (1-AC-to-many-TC)
   - Communicate progress to non-technical stakeholders

A 5-layer hierarchy was proposed by the BDT lead on 2026-05-08:

```
Project → Epic → User Story → Feature → Task
```

with **Sprint** kept as an orthogonal time-boxing relation (not in hierarchy).

---

## Decision

Adopt the 5-layer hierarchy in Notion starting Sprint 6. Sprint 5 (Done) and any deferred Sprint 7 items remain in legacy 3-layer until they're touched again.

**Notion schema additions:**
- New `Projects` DB (1 row baseline: bdt-engineering-system)
- New `Epics` DB with `Capability Area` select (Auth/RBAC, Project Management, ECO Governance, Manufacturing Execution, Infrastructure, Integration, Quality)
- New `User Stories` DB with Agile-format fields: `As a`, `I want`, `So that`, `Acceptance Criteria`
- `Features` DB: ADD `User Story` relation (DUAL synced)
- `Tasks` DB: ADD `User Story` relation (DUAL synced) for direct traceability
- `Sprint` relation kept directly on Stories AND Features AND Tasks (denormalized; orthogonal to hierarchy)

**Wiki additions:**
- New `wiki/epics/<area>.md` — durable capability description per Epic
- Story Acceptance Criteria archives to `wiki/features/<feature>/1-business.md` after Feature ships (durable)
- Feature folder thinned to business artifacts only (4 files: README, business, design, release); architecture/QA/ops moved to cross-cutting `wiki/tech/`, `wiki/qa/`, `wiki/ops/`

---

## Consequences

### Pro

- **Capability rollup:** Epic page (Notion + wiki) shows roadmap across sprints — useful for stakeholder communication
- **Cleaner DoD:** Story-level Definition of Done separates "user requirement met" from "implementation done"
- **AC traceability:** 1 Story has its own AC list; 1 AC ≥ 1 Test Case (mappable)
- **Sprint board flexibility:** Can group by Story / Epic / Feature in same Notion view
- **Multi-feature stories:** A Story can map to multiple Features when implementation spans concerns (e.g., "Manage customers" = schema + API + UI = 3 features for 1 story)

### Con

- **Migration cost:** Sprint 6 needed retrospective Story creation + Feature/Task FK assignment (~1h)
- **More DBs to maintain:** 6 Notion DBs vs 3 before
- **Word "Feature" still ambiguous:** Notion "Feature" (deliverable) vs system "feature" (sub-module). Documented in CLAUDE.md but remains a discipline issue.
- **Sprint relation denormalized:** Story.Sprint AND Feature.Sprint AND Task.Sprint must all point to same Sprint — risk of drift. Mitigated by /sync-sprint cross-check.

### Neutral

- Old `pm/_snapshots/*.md` template needs update — see [`/sync-sprint`](.claude/commands/sync-sprint.md) for new template
- ADR-0013 (Customer hierarchy) and ADR-0014 (this) are independent — could merge but kept separate for clean audit

---

## Implementation note

This ADR documents a workflow/tooling decision, not a code/schema decision. No application schema changes. All changes are in:
- Notion workspace `project&task(test)`
- `~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/`
- `bdt-app/CLAUDE.md` + `bdt-app/.claude/commands/*.md`

---

## See also

- Hand-off Memo: https://www.notion.so/359aa61b71f68186be5be4f4d6924a92
- Sprint 6 page: https://www.notion.so/359aa61b71f68135a863db1e827cdd74
- Project root: https://www.notion.so/359aa61b71f681aca913e40fa39d163d
- Epic — Auth & RBAC: https://www.notion.so/35aaa61b71f68148918bf2bb45e084e3
- Wiki Epic page: [[../../knowledge-base/projects/bdt-engineering-system/wiki/epics/auth-and-rbac]]
- ADR-0013 — Customer Hierarchy (independent, related)
