# Cutting Plan API

Parses one or more cutting-plan `.txt` reports (the same format the legacy
`bdt-cuttingplan-etl-v3` service consumes, uploaded directly — no zip,
matching bdt-app's `bom-upload` pattern) and returns the extracted data as
JSON. Stateless — this service does not store anything; the caller is
responsible for persisting the returned data (see
`db/schema.sql` for a reference Postgres schema).

## Endpoint

```
POST /
Content-Type: multipart/form-data
```

## Request fields

| Field | Type | Required | Description |
|---|---|---|---|
| `files` | file (repeated) | yes | One or more cutting-plan report files. Any filename is accepted (matching the old service, which silently ignored non-`.txt` files bundled alongside the reports — no new file-type parsing is added here) |
| `file_id` | text | yes | Caller-supplied identifier (letters, digits, `-`, `_` only) |
| `project_code` | text | yes | Project code |
| `tag` | text | yes | Zone/tag label |
| `description` | text | yes | Free-text description |
| `version` | text | yes | Version number |
| `revision` | text | yes | Revision number |

`project_name` is **not part of this API** — do not send it; if sent, it is
ignored. See Data note below for why the key still exists internally.

The 6 required fields must be non-empty, or the request is rejected with
`400` before any file processing starts. Each uploaded file's name must not
contain a path separator or `..` — an unsafe filename is rejected, but as
a processing error (`500`, see below), not a `400`: the check runs after
the initial request-shape validation, inside the same all-or-nothing
processing block as ETL parsing errors.

**Data note:** `etl_cuttingplan.py` (untouched, upstream logic) stamps
project-info fields as columns on every output table, and its column
reordering step hardcodes "the last 7 columns are project metadata" — so
this API always passes exactly 7 keys through internally, with
`project_name` hardcoded to `""` (it's never read from the request).
Expect an empty-string `project_name` column in every table in `data`.

## Example request

```bash
curl -X POST https://<service-url>/ \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -F file_id=abc123 \
  -F project_code=0X165 \
  -F tag=ZONE1 \
  -F description=main-structure \
  -F version=1 \
  -F revision=0 \
  -F files=@X197-Z0-16-1.txt \
  -F files=@221-Z3-16-7.txt
```

## Success response — `200`

```json
{
  "code": 200,
  "status": "success",
  "file_id": "abc123",
  "description": "ETL successfully completed",
  "data": {
    "nesting": [[ "...", "..." ]],
    "order_part": [[ "...", "..." ]],
    "plate_usage": [[ "...", "..." ]],
    "remnants": [[ "...", "..." ]]
  }
}
```

`data` has one key per table (see `db/schema.sql` for column order per
table). `remnants` is omitted entirely if the submission has no remnants
data — this is expected, not an error.

## Error responses

| HTTP status | `status` | When |
|---|---|---|
| `400` | `failed` | A required field is missing/empty, or no `files` were uploaded |
| `500` | `failed` | Any error during processing — an unsafe uploaded filename (`../...`), unparseable `.txt` content, etc. — all-or-nothing: the whole request fails, nothing is partially returned |

```json
{
  "code": 500,
  "status": "failed",
  "file_id": "abc123",
  "description": "human-readable error message"
}
```

## Known limitations (carried over from the original parser, not fixed by
this API — see the design spec's "Known Issues" section for details and file/line references)

- A malformed value in certain fields (e.g. a Remnants section whose
  `dimensions` text doesn't match `"<length> X <width>"`) can produce a
  generic `TypeError`-derived message rather than a specific one.
- An empty Used Material section can report a confusing `KeyError: 0`
  instead of "Empty used material data."

These are parsing-logic bugs, deliberately left unfixed pending the
original logic author's decision (see the design spec).

## Auth

Cloud Run IAM (ID token). No API key / shared secret — the caller must be
an authorized Cloud Run invoker.
