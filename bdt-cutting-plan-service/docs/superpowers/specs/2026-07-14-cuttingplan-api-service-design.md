# Cutting Plan Processing API — Design Spec

**Date:** 2026-07-14
**Status:** Approved — proceeding to implementation (2026-07-14)
**Author:** Claude (session with bdtapp@ssi-steel.com)

## 1. Context & Goal

The existing cutting-plan ETL service (`bdt-cuttingplan-etl-v3`, Cloud Run,
`asia-southeast1`) is triggered with a Google Drive `file_id`, downloads a zip
of cutting-plan `.txt` reports, parses them, and appends structured rows to a
Google Sheet acting as the system's database.

The organization is migrating its frontend/DB stack: Google Apps Script + Google
Sheet → React + NestJS + Postgres (Supabase), in an existing app ("bdt-app").
The bdt-app team wants to reinforce their system with cutting-plan processing
capability, and will call this capability from their own NestJS backend.

**Goal of this project:** produce a new, standalone Python API service that:
- accepts cutting-plan `.txt` report files directly via multipart upload, no
  zip archive, no Google Drive dependency (revised 2026-07-14 — see §5)
- returns parsed data as JSON (no Google Sheet dependency)
- can be called by bdt-app's NestJS backend once that team decides to integrate it

This is an I/O-boundary migration, not a rewrite of the parsing logic.

## 2. Scope

### In scope
- New HTTP entrypoint accepting `multipart/form-data` (one or more `.txt`
  report files + project metadata fields, no zip — see §5) instead of a
  Drive `file_id`.
- New response shape: structured JSON instead of a Google Sheet append.
- Removal of Google Drive / Google Sheets dependencies (`googledrive_api.py`,
  `googlesheet_api.py`, `service_account_key.json`, Sheet-related config).
- New Cloud Run deployment, separate from `bdt-cuttingplan-etl-v3`.
- IAM-based service-to-service auth (Cloud Run invoker), sized correctly for
  memory/concurrency based on what we learned fixing the old service today.
- A **Known Issues** record of the parsing bugs found while debugging the old
  service, left for the logic's original author / the user's manager to decide
  whether and when to fix.

### Explicitly out of scope
- **`etl_cuttingplan.py` is not modified in any way.** All parsing/transform
  logic — including the bugs identified in this session — is carried over
  unchanged. This is a deliberate decision: the ETL logic has an owner, and
  changing it is that person's call, not something to bundle into an I/O
  migration.
- No changes to `bdt-app` (React/NestJS/Supabase project at
  `/Users/michel-angelo/Desktop/test555/bdt-app`). That repo was explored
  read-only for context and will not be touched. Wiring this API into bdt-app
  is a separate follow-up the bdt-app team will do themselves.
- No changes to `bdt-cuttingplan-etl-v3` (the old service keeps running as-is
  for its current Apps-Script-driven flow).
- No change to the all-or-nothing failure behavior: one malformed file in a
  request still fails the whole request, same as today (explicit user
  decision).
- No new file-type handling: the old service silently skips `.pdf`/`.xls`/
  `.dxf` files it finds alongside the `.txt` reports
  (`loop_extract_transform()`'s `elif file_name.endswith('.pdf'): pass`, etc.)
  — it never reads them. The new upload endpoint preserves this: it accepts
  any uploaded file (only validates the filename is path-safe, §8a), and
  still lets the untouched `loop_extract_transform()` ignore non-`.txt`
  files exactly as it always has. No PDF/XLS/DXF parsing is being added.

## 3. Architecture

```
                 ┌─────────────────────────┐
   (unchanged)   │  bdt-cuttingplan-etl-v3 │   Apps Script → Drive file_id → Sheet
                 │  (Cloud Run, untouched) │
                 └─────────────────────────┘

                 ┌─────────────────────────┐
   (new)         │  bdt-cuttingplan-api    │   multipart upload → JSON
                 │  (Cloud Run, new svc)   │   ← called later by bdt-app NestJS
                 └───────────┬─────────────┘
                             │ reuses, unmodified
                             ▼
                 ┌─────────────────────────┐
                 │   etl_cuttingplan.py    │   (byte-for-byte identical)
                 └─────────────────────────┘
```

Two independent Cloud Run services, sharing only the untouched
`etl_cuttingplan.py` module. No shared runtime state, no shared traffic.

## 4. Components — what changes vs. what stays untouched

| File | Disposition |
|---|---|
| `etl_cuttingplan.py` | **Untouched**, copied as-is (all section parsers, `convert_native_types`, existing bugs included) |
| `main.py` | **Rewritten** — new HTTP entrypoint, multipart request handling, request validation before any processing starts |
| `app_process.py` | **Modified** — remove `get_google_drive_file()`, `extract_zip_file()` (no zip anymore), `connect_googlesheet()` / `append_sheets()`'s Sheet-append call; add `save_uploaded_files()` (validates each filename, writes straight into `extracted_folder/`) and a JSON response builder around the existing `convert_native_types()` output |
| `googledrive_api.py` | **Removed** — no longer needed |
| `googlesheet_api.py` | **Removed** — no longer needed |
| `service_account_key.json` | **Removed** — no Google API calls left that need it |
| `config.py` | **Simplified** — drop `SHEET_ID` / sheet range constants |
| `requirements.txt` | **Trimmed** — drop `google-api-python-client`, `google-auth*` (no longer calling Google APIs) |

## 5. API Contract

**Revised 2026-07-14:** no zip. Files are uploaded directly, one or more
`.txt` cutting-plan reports per request — same pattern bdt-app's own
`bom-upload` module already uses for its file uploads, not a zip archive.
This also removes the Zip Slip surface entirely (see §8a Security note).

```
POST /
Content-Type: multipart/form-data

Fields:
  files           one or more .txt cutting-plan report files (repeated field)
  file_id         string — internal identifier, used for temp dir naming (kept
                  for parity with existing code that keys off it)
  project_code    string
  tag             string
  description     string
  version         string
  revision        string
```

**`project_name` is not part of the public API** (revised 2026-07-15 — a
narrower follow-up to the 2026-07-15 optional-fields revision above,
superseding it: `project_code` is required again, `project_name` is gone
from the request entirely). `main.py` never reads `project_name` from the
request and always sets it to `""` internally. This isn't a free choice:
`etl_cuttingplan.py`'s `reorganize_columns()` (untouched) hardcodes
`cols_list[-7:]` — "the last 7 columns appended are project metadata" — so
`AppProcess` must always receive exactly 7 project-info keys or that
slicing silently grabs real data columns instead. Hardcoding
`project_name` to `""` internally while dropping it from the request
satisfies both "caller doesn't send it" and "don't touch
`etl_cuttingplan.py`."

`etl_cuttingplan.py`'s `loop_extract_transform()` (untouched) already expects
a directory containing one or more `.txt` files and loops over whichever it
finds (`os.listdir(...)`, filtered by `.endswith('.txt')`) — it doesn't care
whether they arrived via a zip or direct upload. The new I/O layer's only job
is to populate that directory from the uploaded files instead of extracting
a zip into it.

**Success response (200):**
```json
{
  "code": 200,
  "status": "success",
  "file_id": "...",
  "data": {
    "nesting": [[...], ...],
    "order_part": [[...], ...],
    "plate_usage": [[...], ...],
    "remnants": [[...], ...]
  }
}
```
`data` has exactly these 4 keys — matching the 4 tables in §8a's table
inventory (`nesting` already contains the merged Used Material + Machine
Times data, per that section), not 6. Every value is exactly what
`convert_native_types()` produces per table today — same values, same
shape, just returned in the HTTP response instead of being posted to a
Google Sheet.

**Failure response (400/500):**
```json
{
  "code": 500,
  "status": "failed",
  "file_id": "...",
  "description": "..."
}
```
Same all-or-nothing contract as the current service: any error anywhere in the
pipeline fails the whole request.

## 6. Data Flow

1. bdt-app POSTs one or more `.txt` files + metadata fields to `POST /`.
2. New `main.py` validates that required fields are present **before**
   constructing `AppProcess` (fixes today's ungraceful crash where a missing
   body produced a raw Flask 500 instead of the intended JSON error — this is
   request-handling robustness, not ETL logic, so it's in scope).
3. `AppProcess.save_uploaded_files()` validates each uploaded file's name
   (reject path separators / `..`, matching the path-traversal fix in §8a)
   and writes it straight into `extracted_folder/<zip_name>/`, in place of
   `get_google_drive_file()` + zip extraction. No zip is created or read
   anywhere in the new service.
4. `process_etl()` → `etl_cuttingplan.py` runs exactly as it does today,
   unmodified — `loop_extract_transform()` finds the `.txt` files in that
   directory the same way it always has.
5. Instead of `connect_googlesheet()` + `append_sheets()` posting to a Sheet,
   the new code collects the same `convert_native_types()` output per table
   into a `data` dict and returns it as the JSON response body.
6. `remove_files()` cleans up temp files (unchanged).

## 7. Error Handling

- All-or-nothing preserved, per explicit user decision — no partial-success
  behavior is introduced.
- The one fix applied at the I/O boundary: validate the incoming request
  (required fields present) before touching `AppProcess`, so malformed
  requests always get the intended JSON error envelope instead of an
  unhandled crash. This mirrors what `main.py` already *intended* to do
  (`validate_request_info`) but couldn't, because construction happened
  before validation.

### Security Fixes (in scope — I/O layer, not ETL logic)

An automated security review of the imported source flagged 4 issues, all in
the I/O-handling code we're already rewriting for this project (none touch
`etl_cuttingplan.py`):

1. **Path traversal via `file_id`** (`app_process.py:15,47,49,58,64`) — the
   request-supplied `file_id` is used unsanitized as `self.zip_name` and
   concatenated directly into `os.path.join()` calls (zip path, extraction
   dir, cleanup paths). A crafted value such as `../../../etc/cron.d/x` would
   let a request read or delete files outside the intended `data/` sandbox.
   **Fix:** validate `file_id` against a safe charset (e.g.
   `^[A-Za-z0-9_-]+$`) immediately on receipt, before it's used in any path.
2. **~~Zip Slip~~ (`app_process.py:49`, `zip_ref.extractall(...)`)** — moot as
   of the 2026-07-14 no-zip revision (§5/§6): the service no longer extracts
   a zip anywhere, so this specific mechanism no longer applies. It's
   replaced by an equivalent, narrower concern: each **uploaded file's
   filename** (not a zip member path) is still request-supplied and must be
   validated before being used to build a filesystem path — a filename like
   `../../../whatever.txt` must be rejected before the file is written into
   `extracted_folder/<zip_name>/`. Same fix shape as finding #1 (safe-charset
   check before any path use), applied to filenames instead of `file_id`.
3. **Broken request validation** (`app_process.py:216-224`,
   `validate_request_info()`) — the loop only rejects requests that contain
   an *extra* key with an empty value; it never checks that the required
   fields (`file_id`, `project_code`, etc.) are actually present. An empty or
   incomplete request passes validation — this is also the root cause of the
   earlier `TypeError: 'NoneType' object is not subscriptable` crash found
   in this session. **Fix:** rewrite as an explicit allowlist check — every
   required field must be present and non-empty, or the request is rejected.
4. **Same `file_id`-into-path issue in `googledrive_api.py`'s
   `download_file()`** — moot for the new service, since `googledrive_api.py`
   is deleted entirely (§4); no fix needed there because the file won't exist.

These three fixes land naturally inside the multipart-upload rewrite of
`main.py` / `app_process.py` already planned in §4–§6 — no separate scope
needed. They do not touch `etl_cuttingplan.py`.

### Known Issues (not fixed — deferred to the logic's owner)

Carried over unchanged from `etl_cuttingplan.py`, found while debugging
`bdt-cuttingplan-etl-v3` in this session:

1. **`convert_native_types()` (`etl_cuttingplan.py:628`)** — `comma_decimal.match(x)`
   throws `TypeError` when `x` is `None` or a non-string numeric value (e.g.
   NaN converted to `None` upstream). Recurs whenever any table has a blank/
   malformed cell.
2. **`transform_remnants()` (`etl_cuttingplan.py:513-515`)** — splits the raw
   `dimensions` string on space and indexes token `[2]` for `width_mm`; if a
   file's Remnants section doesn't use the expected `"<length> X <width>"`
   format, this silently produces `NaN`, which later surfaces as the opaque
   `TypeError` above.
3. **`extract_used_mat()` (`etl_cuttingplan.py:203-209`)** — the empty-table
   guard (`if self.used_mat_df.shape[0] == 0: raise ValueError("Empty used
   material data.")`) is written *after* code that already indexes row `0`
   (`self.used_mat_df['charge'][0]`), so it never actually fires; an empty
   Used Material section instead raises a confusing `KeyError: 0`, reported
   as `"...not complatible with criteria >>> 0"`.

These will behave identically in the new service. Whoever owns
`etl_cuttingplan.py` can decide whether/when to address them.

## 8. Auth & Deployment

- **New Cloud Run service**, proposed name `bdt-cuttingplan-api` (open to
  rename), deployed independently of `bdt-cuttingplan-etl-v3`.
- **Region/project:** assumed same as the existing service —
  `asia-southeast1`, `building-technology-493907` — pending confirmation.
- **Auth:** Cloud Run IAM (ID token). Ingress restricted; `roles/run.invoker`
  granted to whatever service account bdt-app's NestJS backend runs as (bdt-app
  team to provide once they're ready to integrate).
- **Resources:** `memory=1Gi`, `containerConcurrency=1` — carried forward from
  today's fix on the old service, since this workload (pandas + multi-file
  parsing, synchronous) has the same per-request memory profile.

## 8a. Database Schema Reference (for bdt-app — not applied by this service)

Confirmed: the new API stays **stateless**, per §5/§6 — it returns JSON and
does not write to any database itself. bdt-app's NestJS backend owns
persistence, on its own Supabase Postgres instance.

To make that hand-off concrete, this repo also ships a **reference SQL DDL
file** (`db/schema.sql`) mirroring the 4 Google Sheet tabs the legacy service
currently writes to (§ table inventory below) — for the bdt-app team to adapt
into their own Prisma schema when they integrate. This repo never connects to
or applies this DDL against any live Supabase project; it's documentation
only.

**Table inventory** (derived from `etl_cuttingplan.py`: `store_dataframes()`,
`reorganize_columns()`, `add_project_info()`; `app_process.py`: `add_id()`,
`append_sheets()`) — confirmed there is exactly **one** Google Spreadsheet
(`config.SHEET_ID`), split into 4 tabs, not 4 separate spreadsheets:

| Table | Source | Notes |
|---|---|---|
| `nesting` | merge of NESTING + Used Material + Machine Times sections (joined on `cuttingplan_number`) | widest table; 3 raw sections denormalized into 1 row |
| `order_part` | Orders section | `X` column dropped, `drawing_part_no_version_no` truncated at `/` (both in `transform_order`, unchanged logic) |
| `plate_usage` | Plate usage section | — |
| `remnants` | Remnants section | optional — skipped entirely if a submission has no remnants data |

Every table gets the same 7 project-metadata columns (`file_id`,
`project_code`, `project_name`, `tag`, `description`, `version`, `revision`)
plus an `id` primary key, matching what `add_id()` / `add_project_info()`
already do today — `project_name` is always `""` (see §5: not part of the
public API, hardcoded internally so the untouched 7-column shape holds).
Full column-by-column detail is in `db/schema.sql`.

No foreign keys between the 4 tables — the legacy Sheet had none (flat,
denormalized), so the reference schema doesn't invent any; `cuttingplan_number`
is kept as a plain text column for correlation, not a DB-enforced relationship.
bdt-app's team may adjust naming (e.g. prefix with `cutting_plan_`) and add
constraints to fit their own conventions — this file is a starting point, not
a mandate.

## 9. Testing

- ETL logic itself: **no new tests added** — it's unmodified, out of scope,
  and owned by someone else.
- New I/O layer: needs coverage for what's actually new —
  - multipart upload handling (files saved correctly; unsafe filenames like
    `../../etc/passwd` rejected)
  - required-field validation (missing field → clean JSON 400, not a crash)
  - response shape matches the contract in §5
  - auth (unauthenticated caller rejected)
- Regression check: re-run the existing scenarios in `test case.txt` (positive
  + negative cases) against the new endpoint and confirm the parsed `data`
  matches what the old service used to write to the Sheet, for the same input
  files.

## 10. Open Questions

1. Confirm target GCP project/region for the new service (assumed same as
   `bdt-cuttingplan-etl-v3`).
2. Confirm service name (`bdt-cuttingplan-api` is a placeholder).
3. Which service account will bdt-app's NestJS backend run as, so the
   `run.invoker` binding can be granted — bdt-app team to provide when ready.
4. ~~Timing: user is waiting on their manager's decision about who drives this
   work forward (user vs. someone else) before implementation starts.~~
   **Resolved 2026-07-14:** user directed building the API now; long-term
   ownership/maintenance is still a separate open question for their manager.
5. Database persistence — **resolved**, see §8a: service stays stateless,
   `db/schema.sql` ships as a reference for bdt-app's own schema.
