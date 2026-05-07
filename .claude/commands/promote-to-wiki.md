---
description: Integrate a Notion page (decision/feature/meeting) into the Obsidian wiki via 4-step protocol
argument-hint: <notion-page-url-or-id>
---

# /promote-to-wiki — Reverse sync (Notion → wiki integration)

Takes a Notion page (Sprint, Feature, Decision, Meeting note) and integrates
its durable content into the Obsidian wiki, following the same 4-step
integration protocol as `/wiki-update` (READ → EXTRACT → INTEGRATE → LOG).

This is the **reverse direction** of `/sync-sprint`:
- `/sync-sprint` = Notion → markdown snapshot (live state, read-only mirror)
- `/promote-to-wiki` = Notion → wiki integration (durable knowledge, edited synthesis)

**Source argument:** $ARGUMENTS (Notion page URL or ID — required)

---

## When to use

- A decision was discussed in a Notion meeting page → promote to `wiki/tech/<area>/decisions.md`
- A Feature row in Notion is shipped → update the canonical `wiki/features/<x>.md`
- An open question is resolved during planning → remove from `wiki/_open-questions.md`
- Stakeholder context is captured in a Notion comment thread → fold into `bdt-core/wiki/people/`

If the source is not a Notion page (e.g. raw meeting transcript file in
`raw/meetings/`), use `/wiki-update` instead.

---

## Steps

### 1. READ — fetch the Notion page

- `notion-fetch` with `$ARGUMENTS` as id.
- If the page contains > 500 lines of content OR multiple sub-pages,
  delegate to the `wiki-integrator` subagent via the Task tool to keep
  main context clean.

### 2. EXTRACT (per root CLAUDE.md protocol)

List explicitly:
- **Entities** mentioned (people, components, features, modules, endpoints)
- **Claims** asserted (with date anchors — note Notion's `last_edited_time`)
- **Decisions** made (with date + approver if available)
- **Contradictions** with current wiki content (Grep wiki first to confirm)
- **Open questions** raised or resolved

### 3. INTEGRATE — route to the appropriate wiki page

| Notion source | Target wiki page |
|---|---|
| Decision page or block | `wiki/tech/<area>/decisions.md` with `> [!decision]` callout |
| Feature row (Notion Features DB) | `wiki/features/<feature-name>.md` (update Description) |
| Meeting note with policy/business rule | `wiki/domain/business-rules.md` |
| Architecture pattern discussed | `wiki/tech/backend/decisions.md` or `wiki/tech/frontend/decisions.md` |
| Open question resolved | Delete entry from `wiki/_open-questions.md` + update affected pages |
| Stakeholder context | `bdt-core/wiki/people/stakeholders.md` |

Style rules (same as `/wiki-update`):
- Bullets > prose. Pages short and dense.
- Use Obsidian `[[wiki-link]]` for every entity mention.
- Date stale-able claims `(as of YYYY-MM-DD)`.
- Source backlink: `_Source: Notion <page-title> (<url>)_`
- Synthesize — never copy Notion content verbatim into wiki.
- H1 once per file (the title), then H2/H3 for sections.

Special cases:
- **Contradiction** — append both versions to `wiki/_contradictions.md`. Never overwrite.
- **Single-source new page** — do NOT create unless user explicitly asked OR ≥2 corroborating sources exist.

### 4. LOG

Append one line to root `/Users/michel-angelo/Documents/bdt/knowledge-base/log.md`:

```
- YYYY-MM-DD — <files touched>: promoted Notion <page-title> → <wiki page>
```

---

## Final report

Concise summary (under 200 words):

```
## Promotion Report

**Source:** Notion <page-title> (<url>)
**Files updated:** <count>
- <wiki path 1>
- <wiki path 2>

**Extracted:**
- Entities: <count> (<key names>)
- Decisions: <count>
- Contradictions: <count>
- Open questions resolved/raised: <count>

**log.md entry:** <verbatim line>
```

---

## Anti-patterns

- ❌ Editing the Notion page (this is wiki-write only)
- ❌ Creating a new wiki page from a single Notion source unless user asked
- ❌ Copying Notion task lists into wiki (wiki summarizes; Notion executes)
- ❌ Skipping LOG step
- ❌ Routing unclear content without asking the user (when in doubt, ask)
