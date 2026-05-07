---
description: Lint the BDT knowledge graph — orphans, broken links, stale claims, dangling Notion refs
argument-hint: [wiki-subpath (optional, focused scan)]
---

# /wiki-doctor — Knowledge graph health check

Read-only scan of the BDT knowledge base + Notion bridge. Reports issues; does
NOT auto-fix (user decides what to repair). Run before sprint review or when
opening a session on an unfamiliar area.

**Scope argument:** $ARGUMENTS (optional — focused scan path; default = full scan)

---

## What it checks

### 1. Orphan wiki pages
Files under `/Users/michel-angelo/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/`
that no other wiki page links to via `[[wiki-link]]` syntax. Exclude index,
`_open-questions`, `_contradictions`, `CLAUDE.md` (those are entry points).

### 2. Broken `[[wiki-link]]` references
For each `[[target]]` or `[[target#section]]` in any wiki/pm file, verify the
target file path exists. Report broken links with source file + line number.

### 3. Stale dated claims
Scan for the pattern `(as of YYYY-MM-DD)` and flag entries:
- Active topic (any page mentioning Sprint 5 / current sprint) — flag if > 30 days old
- Stable topic (org structure, glossary, historical decisions) — flag if > 180 days old

### 4. Dangling Notion refs
For each Notion row in Sprints / Features / Tasks DBs (IDs from memory
`notion-bridge.md`), check the `Wiki Refs` URL field:
- Parse `obsidian://open?vault=knowledge-base&file=<path>`
- Verify the wiki file at `<path>.md` exists
- Report dangling refs with the Notion row name + the bad path

### 5. Sub-page index drift
Verify `wiki/index.md` lists every `.md` file in the wiki/ subtree. Flag any
missing entries (orphans likely, but they should at least be in the index).

---

## Steps

1. **Resolve scope.** If `$ARGUMENTS` is given, restrict scans 1–3 to that
   subpath. Scans 4–5 always run full.

2. **Run checks 1–5** in parallel where possible (independent file reads).
   Use `Glob` + `Grep` for wiki scans; Notion MCP for check 4.

3. **Render report** — single markdown blob, grouped by check:

```
# Wiki Doctor — <ISO-ts>

## Orphan pages (N)
- wiki/path/file.md
- ...

## Broken links (N)
- wiki/source.md:42 → [[missing-target]]
- ...

## Stale claims (N)
- wiki/page.md:10 — "(as of 2025-09-01)" is 247 days old (active topic)
- ...

## Dangling Notion refs (N)
- Notion task "JWT + RBAC" → wiki/features/jwt-rbac.md (file missing)
- ...

## Index drift (N)
- wiki/howto/new-page.md not in index.md
- ...

## Summary
Total issues: N (Critical: K, Warning: M)
```

4. **Print report to stdout. Do NOT write to disk** — this is diagnostic, not a record.

---

## Anti-patterns

- ❌ Auto-fixing issues (user must decide; suggest fixes only in summary)
- ❌ Writing the report to a file (clutters wiki; let user pipe stdout)
- ❌ Modifying any wiki/pm file during the scan
- ❌ Calling Notion MCP write tools (read-only via `notion-fetch` / `notion-search`)
