---
description: Bootstrap a new BDT project — Notion workspace + wiki skeleton + CLAUDE.md + memory bridge, all per cross-project standards
argument-hint: <project-name> [optional one-line description]
---

# /new-project — Bootstrap a new BDT project

Automates the bootstrap of a new project that follows the
[BDT Agentic Workflow Standard](obsidian://open?vault=knowledge-base&file=bdt-core%2Fwiki%2Fstandards%2Fagentic-workflow).

Creates **all** artifacts in one call:
- Notion structure (project page + 3 relational DBs)
- Wiki skeleton (`projects/<name>/wiki/` + `pm/` + `raw/`)
- Project `CLAUDE.md` (with Truth-Source Matrix)
- Agent memory bridge file (`notion-bridge-<name>.md`)
- Log entry

**Argument:** $ARGUMENTS — first token = project name (required, slug form: `kebab-case`); rest = description (optional).

---

## Anti-patterns

- ❌ Running this command without confirming standards are up-to-date in `bdt-core/wiki/standards/`
- ❌ Skipping the user-confirmation step before creating Notion artifacts (Notion creates can't be auto-undone)
- ❌ Reusing existing project name (will fail validation)
- ❌ Creating wiki dirs before Notion (if Notion fails halfway, wiki orphans)

---

## Steps

### 1. VALIDATE arguments

- Parse `$ARGUMENTS`:
  - `<project-name>` — first whitespace-delimited token
  - `<description>` — rest of line (optional)
- Validate name:
  - Matches regex `^[a-z][a-z0-9-]+$` (kebab-case, starts with letter)
  - Not in `["bdt-engineering-system", "_template", ...]` (reserved)
  - Not already present at `projects/<name>/` in knowledge-base
- If invalid, print error + ask user to retry. Do NOT proceed.

### 2. CONFIRM with user

Display a summary table before any creation:

```
About to create new BDT project:
  Name:        <project-name>
  Description: <description-or-prompt-for-it>
  Wiki path:   /Users/michel-angelo/Documents/bdt/knowledge-base/projects/<name>/
  Notion:      new sub-page under "project&task(test)" container + 3 DBs
  Memory:      ~/.claude/projects/<project-id>/memory/notion-bridge-<name>.md
  Standards:   bdt-core/wiki/standards/agentic-workflow.md (universal)

Confirm? (yes/no)
```

Wait for explicit yes. If the user does not confirm, abort cleanly.

### 3. CREATE Notion structure

Read agent memory `notion-bridge.md` for container page id.
Then in this order (sequential — each step needs the prior id):

3a. **Duplicate template page** — Notion MCP doesn't have a native "duplicate"
   that preserves DB schemas, so build manually from the spec in
   [notion-schema-template](obsidian://open?vault=knowledge-base&file=bdt-core%2Fwiki%2Fstandards%2Fnotion-schema-template):

   - `notion-create-pages` parent = container, title = `<project-name>`,
     content = brief metadata + cross-link to bdt-core agentic-workflow standard.

3b. **Create Sprints DB** under the new project page with the standard schema:

   ```
   CREATE TABLE (
     "Sprint Name" TITLE,
     "Status" SELECT('Planning':yellow, 'Active':blue, 'Done':green, 'Archived':gray),
     "Start Date" DATE,
     "End Date" DATE,
     "Goal" RICH_TEXT,
     "Wiki Refs" URL,
     "Blocking Questions" RICH_TEXT
   )
   ```

3c. **Create Features DB** with `Sprint` RELATION DUAL to Sprints DB:

   ```
   CREATE TABLE (
     "Feature Name" TITLE,
     "Sprint" RELATION('<sprints-data-source-id>', DUAL 'Features'),
     "Status" SELECT('Planning':yellow, 'Active':blue, 'Blocked':red, 'Done':green),
     "Area" SELECT('BE':purple, 'FE':pink, 'BE+Integration':orange, 'FE+BE':brown, 'Infra':default),
     "Wiki Refs" URL,
     "Blocked By" RICH_TEXT,
     "Description" RICH_TEXT
   )
   ```

3d. **Create Tasks DB** with `Feature` RELATION DUAL to Features DB:

   ```
   CREATE TABLE (
     "Task Name" TITLE,
     "Feature" RELATION('<features-data-source-id>', DUAL 'Tasks'),
     "Status" SELECT('Todo':gray, 'In Progress':blue, 'Blocked':red, 'Done':green),
     "Assignee" PEOPLE,
     "Due Date" DATE,
     "Wiki Refs" URL
   )
   ```

3e. **Capture all returned IDs** — page IDs + 3 data_source_ids. Needed for memory + wiki refs.

3f. **(optional)** Create `📊 Stakeholder Dashboard` sub-page using the same
   pattern as the bdt-engineering-system instance.

### 4. CREATE wiki skeleton

Create directory tree at `/Users/michel-angelo/Documents/bdt/knowledge-base/projects/<name>/`:

```
projects/<name>/
├── wiki/
│   ├── index.md
│   ├── _open-questions.md
│   ├── _contradictions.md
│   ├── conventions.md
│   ├── domain/.gitkeep
│   ├── features/.gitkeep
│   ├── tech/
│   │   ├── data-model.md (stub)
│   │   ├── backend/.gitkeep
│   │   └── frontend/.gitkeep
│   └── howto/.gitkeep
├── pm/
│   ├── plan.md (stub pointer to Notion)
│   ├── backlog.md (stub pointer to Notion)
│   ├── _snapshots/.gitkeep
│   └── sprints/.gitkeep
├── raw/
│   ├── meetings/.gitkeep
│   └── adr/.gitkeep
└── CLAUDE.md (with Truth-Source Matrix template)
```

Use [wiki-template](obsidian://open?vault=knowledge-base&file=bdt-core%2Fwiki%2Fstandards%2Fwiki-template)
for per-file conventions. Each created file:

- `index.md`: title `# <project-name> Wiki — Index` + standard sections (Tech / Features / Domain / Conventions & Howto / Maintenance) — empty list under each
- `_open-questions.md`: header + format reminder
- `_contradictions.md`: header + format reminder
- `conventions.md`: header + "(populate per project)"
- `pm/plan.md`: stub pointer to new Notion project page URL (5-7 lines)
- `pm/backlog.md`: stub pointer to Notion Sprints DB Planning filter (5 lines)

### 5. CREATE project `CLAUDE.md`

Generated from template — see [agentic-workflow#Truth-Source Matrix](obsidian://open?vault=knowledge-base&file=bdt-core%2Fwiki%2Fstandards%2Fagentic-workflow):

```markdown
# <project-name> — Agent Guide

Inherits root [[../../CLAUDE]] + [[../../bdt-core/CLAUDE]]. Project-specific rules below.

## What this project is

<description>

## Stack

(populate per project)

## Agent Quick Start

| Step | Read | Tells you |
|---|---|---|
| 1 | wiki/index.md | What exists |
| 2 | wiki/features/<relevant>.md | Feature behavior |
| 3 | wiki/tech/data-model.md | Entities |
| 4 | wiki/domain/business-rules.md | Validation + guards |
| 5 | wiki/conventions.md | Code patterns |

## Truth-Source Matrix

[Universal rows] (per bdt-core/wiki/standards/agentic-workflow#Truth-Source Matrix)

[Project-specific rows] (add as discovered):
| Topic | Source |
|---|---|
| (populate per project) | |

## When to update the wiki

Per bdt-core/wiki/standards/agentic-workflow#The 4-step integration protocol.
```

### 6. CREATE memory bridge file

`~/.claude/projects/<project-id>/memory/notion-bridge-<name>.md`:

Format per [notion-schema-template#Memory bridge file format](obsidian://open?vault=knowledge-base&file=bdt-core%2Fwiki%2Fstandards%2Fnotion-schema-template).

Append pointer line to `MEMORY.md`:
`- [Notion bridge IDs — <name>](notion-bridge-<name>.md) — DBs for <project-name>`

### 7. UPDATE bdt-engineering-system index (if first peer project)

If this is the second project in the workspace, update
`bdt-core/wiki/index.md` to add a "Projects" section listing all instance
project pages.

### 8. LOG

Append to root `log.md`:

```
## YYYY-MM-DD
- New project bootstrapped: <name>
  - Notion: <project-page-url>
  - Wiki: projects/<name>/
  - Description: <description>
```

### 9. REPORT

Print:

```
✅ Project <name> bootstrapped successfully

Notion:
  Project page: <url>
  Sprints DB:   <url>
  Features DB:  <url>
  Tasks DB:     <url>

Wiki:
  /Users/michel-angelo/Documents/bdt/knowledge-base/projects/<name>/

Memory:
  ~/.claude/projects/.../memory/notion-bridge-<name>.md

Next steps:
  1. Open the Notion project page; populate stack/repo metadata
  2. (Optional) Set up Stakeholder filtered views in 3 DBs (per notion-schema-template)
  3. Add first Sprint row → Feature rows → Task rows in Notion
  4. Run /sync-sprint to verify the snapshot generation works
  5. Update projects/<name>/CLAUDE.md with project-specific Truth-Source rows
```

---

## Failure modes + recovery

| Failure point | Recovery |
|---|---|
| Validation fail (bad name) | Ask user to retry with valid name. No partial state. |
| User did not confirm | Abort cleanly. No state changed. |
| Notion create-page fail | Stop. Print error. User can retry from step 3 — wiki not yet touched. |
| Sprints DB create fail | Notion has stale project page; user can delete in UI then retry. Wiki not yet touched. |
| Tasks DB create fail | Notion has stale project page + Sprints + Features; user delete + retry. Wiki not yet touched. |
| Wiki dir create fail (filesystem) | Notion done, wiki partial. Manual cleanup of partial wiki, then re-run from step 4. |
| Memory bridge fail | Notion + wiki done, memory missing. Manual create with returned IDs. |
| Log fail | Cosmetic — append manually. |

Always print failure point + what's been done so user can recover manually.

---

## Anti-patterns (recap)

- ❌ Don't skip user confirmation in step 2 — Notion creates can't be undone via MCP
- ❌ Don't proceed if validation fails — never half-bootstrap
- ❌ Don't hardcode IDs — read from notion-bridge.md memory
- ❌ Don't create wiki/howto/* example files — leave empty for project to populate
- ❌ Don't copy the bdt-engineering-system Guide Book content — link to bdt-core standards instead

---

## See also

- [agentic-workflow](obsidian://open?vault=knowledge-base&file=bdt-core%2Fwiki%2Fstandards%2Fagentic-workflow) — universal standard
- [notion-schema-template](obsidian://open?vault=knowledge-base&file=bdt-core%2Fwiki%2Fstandards%2Fnotion-schema-template) — DB schema
- [wiki-template](obsidian://open?vault=knowledge-base&file=bdt-core%2Fwiki%2Fstandards%2Fwiki-template) — folder structure
- [howto/onboard-new-project](obsidian://open?vault=knowledge-base&file=bdt-core%2Fwiki%2Fhowto%2Fonboard-new-project) — manual fallback recipe
- Notion 🧱 Template page: https://www.notion.so/359aa61b71f681fc8ed2e72c1df5718f
