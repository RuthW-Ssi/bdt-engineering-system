---
description: Pull live Notion sprint state into pm/_snapshots/*.md as read-only mirror
argument-hint: [sprint-name | all (default)]
---

# /sync-sprint — One-way Notion → markdown snapshot

Pulls the current Notion `project&task(test)` workspace state into
`/Users/michel-angelo/Documents/bdt/knowledge-base/projects/bdt-engineering-system/pm/_snapshots/`
as read-only markdown mirrors. Agents read snapshots first (fast, offline)
and only fall through to Notion MCP when the snapshot is stale (>24h).

**Source argument:** $ARGUMENTS (optional — defaults to all active sprints)

---

## Direction is one-way

🚫 NEVER write back to Notion from this command. Only Notion → markdown.
Two-way sync would create source-of-truth ambiguity. If wiki/Notion content
needs to flow the other direction, use `/promote-to-wiki` instead.

---

## Steps

### 1. Resolve Notion IDs from memory

Read agent memory file
`~/.claude/projects/-Users-michel-angelo-Desktop-test555-bdt-app/memory/notion-bridge.md`
to get the cached data_source_id values for Sprints / Features / Tasks DBs.
If memory is missing or IDs return 404, run `notion-search "project&task(test)"`
to refresh, then update the memory file.

### 2. Enumerate target sprint(s) — search-based

> **Note:** `notion-query-database-view` requires a Business plan, so enumerate
> rows via `notion-search` with `data_source_url` instead.

If `$ARGUMENTS` is empty or `all`:
- `notion-search` with `data_source_url = collection://<sprints-id>` and
  `query = "Sprint"` (broad). Filter results client-side to those with
  `Status` in `["Planning", "Active"]` (require `notion-fetch` per row to
  read Status property).

Otherwise:
- `notion-search` with `data_source_url = collection://<sprints-id>` and
  `query = $ARGUMENTS` (semantic match on Sprint Name).

For each matched sprint:
- `notion-search` Features DB with `query = "<sprint name>"` to find features
  whose Sprint relation likely matches. Verify each via `notion-fetch` —
  check the `Sprint` relation column equals the sprint page URL.
- For each verified feature: `notion-search` Tasks DB with `query = "<feature name>"`,
  then `notion-fetch` each candidate to verify `Feature` relation equals feature URL.

**Pagination:** if Tasks count > 25 (search page_size limit), make multiple
`notion-search` calls with progressively narrower queries (e.g. one per
feature's keyword). Tasks DB has 43 rows in iteration 3 baseline.

**Performance hint:** if `memory/notion-bridge.md` includes per-row URL caches
(future enhancement), prefer cached URLs over search; fall back to search only
when cache is stale.

### 3. Render markdown snapshot

For each sprint, write to
`pm/_snapshots/sprint-<n>.md` with this template:

```
_Mirror of Notion <sprint-page-id> as of <ISO-8601 timestamp UTC>_

# Sprint <n> — <sprint name>

**Status:** <status> · **Goal:** <goal>
**Dates:** <start> → <end>
**Blocking:** <blocking-questions text>
**Wiki ref:** <wiki refs URL>

## Features

### <feature 1 name> (Status, Area)
<description>
**Blocked by:** <blocked-by text>
**Wiki ref:** <wiki refs URL>

#### Tasks
- [<status emoji>] <task name>  (Wiki: <wiki refs URL if any>)
- ...

### <feature 2 name>
...
```

Status emoji map:
- `Todo` → `[ ]`
- `In Progress` → `[~]`
- `Blocked` → `[!]`
- `Done` → `[x]`

### 4. Write the master `plan.md` snapshot

Aggregate all active sprints into `pm/_snapshots/plan.md` with header line
`_Mirror of Notion as of <ts>_` and one section per sprint summarising
status + blocked items.

### 5. Final report

Print one line:
```
Synced N sprints, M features, K tasks at <ISO-ts> → pm/_snapshots/
```

---

## Anti-patterns

- ❌ Writing to Notion from this command (read-only)
- ❌ Editing wiki/ files (use /promote-to-wiki for that direction)
- ❌ Skipping the timestamp header (downstream agents rely on it for staleness check)
- ❌ Including raw sensitive content (assignee personal data, etc.) — synthesize
