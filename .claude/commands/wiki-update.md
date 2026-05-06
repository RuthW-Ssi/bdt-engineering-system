---
description: Run the 4-step wiki integration protocol on a source (file path or pasted text)
argument-hint: <path-to-raw-file | block-of-text>
---

# /wiki-update — Integrate source into the BDT wiki

You are running the **4-step integration protocol** defined in
`/Users/michel-angelo/Documents/bdt/knowledge-base/CLAUDE.md`.

**Source provided:** $ARGUMENTS

---

## Execute these steps in order — do NOT skip

### 1. READ
- If `$ARGUMENTS` is a file path → read the file completely with the Read tool.
  Do not skim. Do not summarize from filename alone.
- If `$ARGUMENTS` is pasted text → treat the text itself as the source.
- If the source is large (>500 lines), consider delegating to the `wiki-integrator`
  subagent via Task tool to keep main context clean.

### 2. EXTRACT
List explicitly:
- **Entities** mentioned (people, components, features, modules, endpoints).
- **Claims** made (facts asserted about the project).
- **Decisions** recorded (with date + approver if available).
- **Dates** any claim is anchored to.
- **Contradictions** with current wiki content (search wiki first to confirm).
- **New open questions** raised.

### 3. INTEGRATE
For each affected entity / topic:
- Update the relevant page under
  `/Users/michel-angelo/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/`
  (or `bdt-core/wiki/` for cross-project knowledge).
- Use Obsidian-style `[[wiki-link]]` for every entity mention.
- Every wiki page must link to ≥1 other page — no orphans.
- Date claims that may go stale: `(as of YYYY-MM-DD)`.

**Contradictions:**
- Do NOT silently overwrite. Append both versions (with source links + dates) to
  `wiki/_contradictions.md`.
- Add `> [!warning] Contested` callout to the affected page.

**Decisions:**
- Use `> [!decision]` callout with date + approver in
  `wiki/tech/<area>/decisions.md`.

**Open questions:**
- Append to `wiki/_open-questions.md` with source link.

**Style:**
- Bullets > prose. Pages short and dense.
- Synthesize — never quote `raw/` verbatim into `wiki/`.
- Link back to source: `_Source: [[../../raw/<subdir>/<filename>]]_` (if source is in `raw/`).

### 4. LOG
Append one line to root
`/Users/michel-angelo/Documents/bdt/knowledge-base/log.md`:

```
- YYYY-MM-DD — <files touched>: <one-line summary>
```

---

## Anti-patterns — fail loud if you catch yourself

- ❌ Editing anything in `raw/` (READ-ONLY)
- ❌ Creating a new wiki page from a single source unless user asked OR ≥2 corroborating sources exist
- ❌ Deleting contradicted info instead of moving to `_contradictions.md`
- ❌ Putting operational state (sprint tasks, standup notes) in `wiki/` (use `pm/` instead)
- ❌ Skipping the LOG step

---

## Final report to user

After completing all 4 steps, report concisely:
- Files updated (paths)
- Entities/decisions/contradictions extracted (counts)
- Open questions raised (if any)
- log.md entry added
