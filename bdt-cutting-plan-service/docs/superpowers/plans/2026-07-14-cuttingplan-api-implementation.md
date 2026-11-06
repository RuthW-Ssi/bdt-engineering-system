# Cutting Plan API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Drive-triggered, Sheet-writing cutting-plan ETL
script into a stateless HTTP API — accepts one or more `.txt` report files
directly via multipart upload (no zip — matches bdt-app's `bom-upload`
pattern), returns parsed data as JSON — without changing any parsing/
business logic in `etl_cuttingplan.py`.

**Architecture:** Same process, same files, I/O boundary swapped. `main.py`
gets a new multipart entrypoint; `app_process.py` loses its Google
Drive/Sheets methods (and its zip-extraction step, since there's no zip
anymore) and gains direct multi-file-upload + JSON-response methods; two new
path-safety helpers close the path-traversal findings from the security
review (one for `file_id`, one for each uploaded filename — no Zip Slip
finding to close, since the no-zip revision removes that surface entirely).
`etl_cuttingplan.py` is untouched except removing 2 unused imports that
would otherwise break on module load once the files they reference are
deleted (user-approved deviation — see Global Constraints).

**Tech Stack:** Python 3.10, Flask + `functions-framework` (unchanged),
`pandas`/`numpy` (unchanged, untouched by this plan), `pytest` for tests
(new — no test infra existed before this plan).

**Out of scope for this plan:** actual Cloud Run deployment (region/project/
service name are still open questions in the design spec — deploy once
confirmed), and the Supabase schema (already shipped as `db/schema.sql`,
reference-only, not applied anywhere by this plan).

## Global Constraints

- `etl_cuttingplan.py`: zero behavior changes. The only edit allowed is
  deleting 2 unused `from googledrive_api import ...` / `from googlesheet_api
  import ...` lines (confirmed unused via `grep -n "GoogleDriveAPI\|
  GoogleSheetAPI" etl_cuttingplan.py` — only the import lines match).
- All-or-nothing error handling: one bad file/row still fails the whole
  request. Do not introduce partial-success behavior.
- No Google Drive / Google Sheets calls anywhere in the new code path.
- Every new filesystem path built from request-supplied data must go through
  `sanitize_identifier()` (for `file_id`) or `safe_filename()` (for each
  uploaded file's name) before use (path-traversal fix, design spec §8a).
- No zip anywhere in the new code path — files are uploaded directly.
- Source repo: `/Users/michel-angelo/Downloads/bdtapp/cuttingplan-src/extracted`
  (git remote: `https://github.com/RuthW-Ssi/bdt-cutting-plan-system.git`,
  branch `main`). Commit after every task.

---

## Task 1: Test infrastructure

**Files:**
- Create: `requirements-dev.txt`
- Create: `pytest.ini`
- Create: `tests/__init__.py`
- Create: `tests/test_smoke.py`

**Interfaces:**
- Produces: a working `pytest` command runnable from the repo root, with
  `path_safety`, `app_process`, `main`, `etl_cuttingplan` importable directly
  from any file under `tests/`.

- [ ] **Step 1: Create a virtualenv and install runtime + dev dependencies**

```bash
cd /Users/michel-angelo/Downloads/bdtapp/cuttingplan-src/extracted
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

- [ ] **Step 2: Add `requirements-dev.txt`**

```
pytest==8.*
```

- [ ] **Step 3: Install dev dependencies**

```bash
pip install -r requirements-dev.txt
```

- [ ] **Step 4: Add `pytest.ini`**

```ini
[pytest]
pythonpath = .
testpaths = tests
```

- [ ] **Step 5: Add `tests/__init__.py`** (empty file)

```python
```

- [ ] **Step 6: Add a smoke test — `tests/test_smoke.py`**

```python
def test_pytest_is_working():
    assert 1 + 1 == 2
```

- [ ] **Step 7: Run pytest to confirm the setup works**

Run: `pytest -v`
Expected: `tests/test_smoke.py::test_pytest_is_working PASSED`, 1 passed.

- [ ] **Step 8: Commit**

```bash
git add requirements-dev.txt pytest.ini tests/__init__.py tests/test_smoke.py
git commit -m "test: add pytest infrastructure"
```

---

## Task 2: `path_safety.sanitize_identifier()`

**Files:**
- Create: `path_safety.py`
- Test: `tests/test_path_safety.py`

**Interfaces:**
- Produces: `sanitize_identifier(value: str) -> str` — returns `value`
  unchanged if it matches `^[A-Za-z0-9_-]+$`, otherwise raises `ValueError`.
  Used by Task 6 (`AppProcess.__init__`).

- [ ] **Step 1: Write the failing tests — `tests/test_path_safety.py`**

```python
import pytest
from path_safety import sanitize_identifier


def test_sanitize_identifier_accepts_safe_values():
    assert sanitize_identifier("abc123") == "abc123"
    assert sanitize_identifier("1CRSs4sTiKtzc1mebQtE5DIrOFZ4PdizZ") == "1CRSs4sTiKtzc1mebQtE5DIrOFZ4PdizZ"
    assert sanitize_identifier("proj-code_01") == "proj-code_01"


def test_sanitize_identifier_rejects_path_traversal():
    with pytest.raises(ValueError):
        sanitize_identifier("../../etc/passwd")


def test_sanitize_identifier_rejects_slashes():
    with pytest.raises(ValueError):
        sanitize_identifier("a/b")


def test_sanitize_identifier_rejects_empty_string():
    with pytest.raises(ValueError):
        sanitize_identifier("")


def test_sanitize_identifier_rejects_none():
    with pytest.raises(ValueError):
        sanitize_identifier(None)


def test_sanitize_identifier_rejects_trailing_newline():
    # `$` in Python regex matches before a trailing \n, not just end-of-string —
    # must use \Z (or fullmatch) or "abc\n" slips through as if it were "abc".
    with pytest.raises(ValueError):
        sanitize_identifier("abc\n")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_path_safety.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'path_safety'`

- [ ] **Step 3: Implement — `path_safety.py`**

```python
import re

_SAFE_ID_PATTERN = re.compile(r'^[A-Za-z0-9_-]+\Z')


def sanitize_identifier(value):
    """Reject any value not safe to use as a path segment (path traversal guard)."""
    if not value or not _SAFE_ID_PATTERN.match(value):
        raise ValueError(f"Invalid identifier: {value!r}")
    return value
```

Note: `\Z` here, not `$` — Python's `$` anchor matches at end-of-string *or*
just before a trailing `\n`, so `$` alone would let `"abc\n"` pass as if it
were `"abc"`. `\Z` matches only the true end of the string.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_path_safety.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add path_safety.py tests/test_path_safety.py
git commit -m "feat: add sanitize_identifier path-traversal guard"
```

---

## Task 3: `path_safety.safe_filename()`

**Revised 2026-07-14:** the API no longer accepts a zip (see Global
Constraints and design spec §5/§6) — files are uploaded directly, one or
more `.txt` reports per request, matching bdt-app's `bom-upload` pattern.
There is no zip to extract, so there is no Zip Slip surface. What's left is
a narrower, equivalent concern: each uploaded file's *filename* is still
request-supplied and must be validated before it's used to build a
filesystem path.

**Files:**
- Modify: `path_safety.py`
- Modify: `tests/test_path_safety.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `safe_filename(filename: str) -> str` — returns `filename`
  unchanged if it's safe to use as a single path component (no `/`, not `.`
  or `..`, not empty); otherwise raises `ValueError`. Used by Task 6
  (`AppProcess.save_uploaded_files`).

- [ ] **Step 1: Add the failing tests to `tests/test_path_safety.py`**

```python
from path_safety import safe_filename


def test_safe_filename_accepts_normal_filenames():
    assert safe_filename("report.txt") == "report.txt"
    assert safe_filename("X197-Z0-16-1.txt") == "X197-Z0-16-1.txt"


def test_safe_filename_rejects_path_traversal():
    with pytest.raises(ValueError):
        safe_filename("../../etc/passwd")


def test_safe_filename_rejects_embedded_separator():
    with pytest.raises(ValueError):
        safe_filename("sub/dir/report.txt")


def test_safe_filename_rejects_dot_and_dotdot():
    with pytest.raises(ValueError):
        safe_filename(".")
    with pytest.raises(ValueError):
        safe_filename("..")


def test_safe_filename_rejects_empty():
    with pytest.raises(ValueError):
        safe_filename("")
```

(`import pytest` is already at the top of `tests/test_path_safety.py` from
Task 2 by this point — no need to add it again.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_path_safety.py -v`
Expected: FAIL — `ImportError: cannot import name 'safe_filename'`

- [ ] **Step 3: Implement — append to `path_safety.py`**

```python
import os


def safe_filename(filename):
    """Reject any filename not safe to use as a single path component
    (path traversal guard for direct file uploads, no zip involved)."""
    if not filename or filename in ('.', '..'):
        raise ValueError(f"Invalid filename: {filename!r}")
    if os.path.basename(filename) != filename:
        raise ValueError(f"Invalid filename: {filename!r}")
    return filename
```

Add `import os` to the top of the file, alongside the existing `import re`
(if it isn't there already).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_path_safety.py -v`
Expected: 11 passed (6 from Task 2 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add path_safety.py tests/test_path_safety.py
git commit -m "feat: add safe_filename path-traversal guard for uploads"
```

---

## Task 4: Fix `AppProcess.validate_request_info()`

**Files:**
- Modify: `app_process.py:216-224`
- Create: `tests/test_app_process.py`

**Interfaces:**
- Produces: `AppProcess.validate_request_info(request_info: dict | None) ->
  bool` — `True` only if every one of `file_id`, `project_code`,
  `project_name`, `tag`, `description`, `version`, `revision` is present and
  non-empty. Used by Task 8 (`main.py`).

- [ ] **Step 1: Write the failing tests — `tests/test_app_process.py`**

```python
from app_process import AppProcess

REQUIRED = ["file_id", "project_code", "project_name", "tag", "description", "version", "revision"]


def _complete_info(**overrides):
    info = {field: f"value-{field}" for field in REQUIRED}
    info.update(overrides)
    return info


def test_validate_request_info_accepts_complete_request():
    assert AppProcess.validate_request_info(_complete_info()) is True


def test_validate_request_info_rejects_missing_field():
    info = _complete_info()
    del info["file_id"]
    assert AppProcess.validate_request_info(info) is False


def test_validate_request_info_rejects_empty_value():
    assert AppProcess.validate_request_info(_complete_info(file_id="")) is False


def test_validate_request_info_rejects_empty_dict():
    assert AppProcess.validate_request_info({}) is False


def test_validate_request_info_rejects_none():
    assert AppProcess.validate_request_info(None) is False


def test_validate_request_info_accepts_falsy_but_present_value():
    # Fields arrive from multipart form data, always as strings — but the
    # check must not use bare Python truthiness, or a value that's falsy
    # without being empty (e.g. the string "0") would be wrongly rejected.
    assert AppProcess.validate_request_info(_complete_info(revision="0")) is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_app_process.py -v`
Expected: FAIL — `test_validate_request_info_rejects_missing_field`,
`test_validate_request_info_rejects_empty_dict`, and
`test_validate_request_info_rejects_none` fail (the current buggy
implementation returns `True` for these).
`test_validate_request_info_accepts_falsy_but_present_value` passes even
against the old buggy code (it never rejected anything present) — it's
here to lock in correct behavior once the fix below lands, not to prove
the old code was broken.

- [ ] **Step 3: Fix `app_process.py:216-224`**

Replace:

```python
    # Validate request information
    @staticmethod
    def validate_request_info(request_info):

        common_info = ["file_id", "project_code", "project_name", "tag", "description", "version", "revision"]

        for key, value in request_info.items():
            if key not in common_info and request_info[key] == '':
                return False
        return True
```

with:

```python
    # Validate request information
    @staticmethod
    def validate_request_info(request_info):

        required_fields = ["file_id", "project_code", "project_name", "tag", "description", "version", "revision"]

        if not request_info:
            return False

        for field in required_fields:
            if field not in request_info or request_info[field] in (None, ''):
                return False
        return True
```

Note: `field not in request_info or request_info[field] in (None, '')`, not
bare `not request_info.get(field)` — the latter is Python truthiness, which
would also reject a legitimately falsy-but-present value like `"0"` (or,
for a non-string caller, `0`/`False`). The check must distinguish "missing
or empty" from "falsy."

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_app_process.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add app_process.py tests/test_app_process.py
git commit -m "fix: validate_request_info now actually requires all fields present"
```

---

## Task 5: Remove unused Google imports from `etl_cuttingplan.py`

**Files:**
- Modify: `etl_cuttingplan.py:8-9`
- Create: `tests/test_etl_cuttingplan_imports.py`

**Interfaces:** none (no behavior change — confirmed dead code).

- [ ] **Step 1: Write the failing test — `tests/test_etl_cuttingplan_imports.py`**

```python
def test_etl_cuttingplan_module_imports_cleanly():
    import etl_cuttingplan  # noqa: F401
```

This does not test any parsing/business logic (out of scope, per Global
Constraints) — it only proves the module still loads after this task's edit.

- [ ] **Step 2: Run test to verify it currently passes (baseline)**

Run: `pytest tests/test_etl_cuttingplan_imports.py -v`
Expected: PASS (the imports are still valid at this point — this step just
establishes the baseline before Task 9 deletes the files they point to).

- [ ] **Step 3: Remove the 2 unused import lines from `etl_cuttingplan.py`**

Delete lines 8-9:

```python
from googledrive_api import GoogleDriveAPI
from googlesheet_api import GoogleSheetAPI
```

Confirm nothing else in the file references `GoogleDriveAPI` or
`GoogleSheetAPI`:

```bash
grep -n "GoogleDriveAPI\|GoogleSheetAPI" etl_cuttingplan.py
```

Expected: no output.

- [ ] **Step 4: Run test to verify it still passes**

Run: `pytest tests/test_etl_cuttingplan_imports.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add etl_cuttingplan.py tests/test_etl_cuttingplan_imports.py
git commit -m "chore: remove 2 unused Google API imports from etl_cuttingplan.py

Confirmed dead (grep shows only the import lines matched) -- required
so the module still loads after googledrive_api.py/googlesheet_api.py
are deleted in a later task. No parsing/business logic changed."
```

---

## Task 6: `AppProcess` — sanitize identifiers, replace Drive download with direct multi-file upload

**Revised 2026-07-14:** no zip (see Task 3 note and design spec §5/§6).
Files are uploaded directly; `AppProcess` writes each one straight into the
directory `etl_cuttingplan.py`'s untouched `loop_extract_transform()` already
scans (`extracted_folder/<zip_name>/`) instead of staging + extracting a zip.

**Files:**
- Modify: `app_process.py:12-25` (`__init__`), `31-40` (`create_directories`),
  `42-52` (`extract_zip_file`, removed), `54-77` (`remove_files`), `79-83`
  (`get_google_drive_file`, removed)
- Modify: `tests/test_app_process.py`

**Interfaces:**
- Consumes: `sanitize_identifier` and `safe_filename` from `path_safety`
  (Tasks 2-3).
- Produces:
  - `AppProcess.create_directories()` — same name as before, now also
    creates and exposes `self.upload_folder` (=
    `extracted_folder/<zip_name>`), the directory `loop_extract_transform()`
    scans.
  - `AppProcess.save_uploaded_files(file_storages)` — takes an iterable of
    objects with `.filename` and `.save(path)` attributes (matching
    Werkzeug's `FileStorage`, what `request.files.getlist(...)` returns),
    validates each `.filename` via `safe_filename`, and saves each into
    `self.upload_folder`. Used by Task 8 (`main.py`).

- [ ] **Step 1: Write the failing tests — append to `tests/test_app_process.py`**

```python
import os
import pytest
from app_process import AppProcess


class _FakeFileStorage:
    def __init__(self, filename, content):
        self.filename = filename
        self._content = content
        self.saved_to = None

    def save(self, path):
        self.saved_to = path
        with open(path, "wb") as f:
            f.write(self._content)


def _base_project_info(**overrides):
    info = {
        "file_id": "abc123",
        "project_code": "PC1",
        "project_name": "Project One",
        "tag": "ZONE1",
        "description": "test",
        "version": "1",
        "revision": "0",
    }
    info.update(overrides)
    return info


def test_init_rejects_unsafe_file_id(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    with pytest.raises(ValueError):
        AppProcess(_base_project_info(file_id="../../etc/passwd"))


def test_create_directories_creates_upload_folder(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    app_process = AppProcess(_base_project_info())

    app_process.create_directories()

    assert app_process.upload_folder == os.path.join(
        app_process.extracted_folder, "abc123"
    )
    assert os.path.isdir(app_process.upload_folder)


def test_save_uploaded_files_writes_each_file(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    app_process = AppProcess(_base_project_info())
    app_process.create_directories()

    files = [
        _FakeFileStorage("report1.txt", b"first"),
        _FakeFileStorage("report2.txt", b"second"),
    ]
    app_process.save_uploaded_files(files)

    for name, content in [("report1.txt", b"first"), ("report2.txt", b"second")]:
        path = os.path.join(app_process.upload_folder, name)
        assert os.path.exists(path)
        with open(path, "rb") as f:
            assert f.read() == content


def test_save_uploaded_files_rejects_unsafe_filename(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    app_process = AppProcess(_base_project_info())
    app_process.create_directories()

    files = [_FakeFileStorage("../../evil.txt", b"pwned")]

    with pytest.raises(ValueError):
        app_process.save_uploaded_files(files)

    assert not (tmp_path / "evil.txt").exists()


def test_remove_files_cleans_up_upload_folder(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    app_process = AppProcess(_base_project_info())
    app_process.create_directories()
    app_process.save_uploaded_files([_FakeFileStorage("report.txt", b"data")])

    app_process.remove_files()

    assert not os.path.exists(app_process.upload_folder)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_app_process.py -v`
Expected: FAIL — `AttributeError: 'AppProcess' object has no attribute
'upload_folder'` / `'save_uploaded_files'`, and `test_init_rejects_unsafe_file_id`
fails because `__init__` doesn't sanitize yet.

- [ ] **Step 3: Implement — modify `app_process.py`**

Change the imports at the top of the file:

```python
import pandas as pd
import numpy as np
import os
from etl_cuttingplan import Etl_Cuttingplan
from googlesheet_api import GoogleSheetAPI
from path_safety import sanitize_identifier, safe_filename
import config
```

Drop `from googledrive_api import GoogleDriveAPI` (its only user,
`get_google_drive_file`, is removed by this task) and `import zipfile` (no
zip handling remains after this task). `GoogleSheetAPI` and `config` are
still used by `add_id`/`validate_cols`/`connect_googlesheet`, which aren't
removed until Task 7 — dropping their imports now would leave those
still-present methods referencing undefined names.

Change `__init__` (was lines 12-25) — drops `input_folder` and `type_file`,
neither needed once there's no zip to stage:

```python
    def __init__(self, project_info):

        # Define the file name and folder paths
        self.zip_name = sanitize_identifier(project_info['file_id'])
        self.extracted_folder = os.path.join(os.getcwd(), "data", "extracted")
        self.output_folder = os.path.join(os.getcwd(), "data", "output")

        # Project information
        self.project_info = project_info

        self.final_data = {}
```

Change `create_directories` (was lines 31-40) — adds `self.upload_folder`,
the per-request directory `loop_extract_transform()` scans:

```python
    def create_directories(self):
        # Create directories if they don't exist
        if not os.path.exists(self.extracted_folder):
            os.makedirs(self.extracted_folder)

        self.upload_folder = os.path.join(self.extracted_folder, self.zip_name)
        if not os.path.exists(self.upload_folder):
            os.makedirs(self.upload_folder)

        if not os.path.exists(self.output_folder):
            os.makedirs(self.output_folder)
```

Delete `extract_zip_file` entirely (was lines 42-52) — there is nothing to
extract.

Change `remove_files` (was lines 54-77) — drops the zip-file removal block,
keeps the upload-folder cleanup:

```python
    # Remove uploaded files after finished processing
    def remove_files(self):

        # Check if the upload folder exists
        if os.path.exists(self.upload_folder):
            # List the files in the directory
            uploaded_files = os.listdir(self.upload_folder)

            # Iterate over the files and remove each one
            for file in uploaded_files:
                file_path = os.path.join(self.upload_folder, file)
                os.remove(file_path)

            # Remove the subfolder
            os.rmdir(self.upload_folder)
```

Replace `get_google_drive_file` (was lines 79-83) with:

```python
    # Save the uploaded files into the upload folder
    def save_uploaded_files(self, file_storages):
        for file_storage in file_storages:
            filename = safe_filename(file_storage.filename)
            destination = os.path.join(self.upload_folder, filename)
            file_storage.save(destination)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_app_process.py -v`
Expected: 11 passed (6 from Task 4 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add app_process.py tests/test_app_process.py
git commit -m "feat: replace Google Drive download with direct multi-file upload

AppProcess now sanitizes file_id on construction, exposes
upload_folder from create_directories(), and saves uploaded files
directly (each filename validated via safe_filename) instead of
staging + extracting a zip. get_google_drive_file()/extract_zip_file()
removed."
```

---

## Task 7: `AppProcess` — replace Google Sheet output with JSON response data

**Files:**
- Modify: `app_process.py` (remove `clean_numeric_strings`, `add_id`,
  `validate_cols`, `connect_googlesheet`; replace `append_sheets` with
  `build_response_data`)
- Modify: `tests/test_app_process.py`

**Interfaces:**
- Consumes: `self.etl.df_dict`, `self.etl.replace_na_to_none(table)`,
  `self.etl.convert_native_types()` — all unchanged, from
  `etl_cuttingplan.py`.
- Produces: `AppProcess.build_response_data() -> dict` — same all-or-nothing
  semantics as the old `append_sheets` (raises `ValueError` if a non-remnants
  table is empty; skips `remnants` if empty), but returns the collected data
  instead of posting to a Sheet. Used by Task 8 (`main.py`).

- [ ] **Step 1: Write the failing tests — append to `tests/test_app_process.py`**

```python
import pandas as pd


class _FakeEtl:
    def __init__(self, df_dict):
        self.df_dict = df_dict
        self.replace_na_to_none_calls = []
        self._convert_result = [["row1"]]

    def replace_na_to_none(self, table):
        self.replace_na_to_none_calls.append(table)

    def convert_native_types(self):
        return self._convert_result


def test_build_response_data_collects_non_empty_tables(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    app_process = AppProcess(_base_project_info())
    app_process.etl = _FakeEtl({
        "nesting": pd.DataFrame({"a": [1]}),
        "order_part": pd.DataFrame({"a": [1]}),
        "plate_usage": pd.DataFrame({"a": [1]}),
        "remnants": pd.DataFrame(),
    })

    data = app_process.build_response_data()

    assert data["nesting"] == [["row1"]]
    assert data["order_part"] == [["row1"]]
    assert data["plate_usage"] == [["row1"]]
    assert "remnants" not in data


def test_build_response_data_raises_when_non_remnants_table_empty(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    app_process = AppProcess(_base_project_info())
    app_process.etl = _FakeEtl({
        "nesting": pd.DataFrame(),
        "order_part": pd.DataFrame({"a": [1]}),
        "plate_usage": pd.DataFrame({"a": [1]}),
        "remnants": pd.DataFrame(),
    })

    with pytest.raises(ValueError, match="No data in nesting"):
        app_process.build_response_data()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_app_process.py -v`
Expected: FAIL — `AttributeError: 'AppProcess' object has no attribute
'build_response_data'`

- [ ] **Step 3: Implement — modify `app_process.py`**

Remove their now-last-user imports from the top of the file — change:

```python
from etl_cuttingplan import Etl_Cuttingplan
from googlesheet_api import GoogleSheetAPI
from path_safety import sanitize_identifier, safe_filename
import config
```

to:

```python
from etl_cuttingplan import Etl_Cuttingplan
from path_safety import sanitize_identifier, safe_filename
```

Delete these four methods entirely: `clean_numeric_strings` (was
lines 118-122), `add_id` (was lines 124-141), `validate_cols` (was lines
143-177), `connect_googlesheet` (was lines 179-182).

Replace `append_sheets` (was lines 184-213) with:

```python
    # Collect parsed tables into a response dict (replaces Sheet-append)
    def build_response_data(self):

        for key, value in self.etl.df_dict.items():

            if not self.etl.df_dict[key].empty:

                self.etl.replace_na_to_none(value)
                post_table = self.etl.convert_native_types()

                self.final_data[key] = post_table

            # Skip remnants if no data
            elif key == 'remnants' and self.etl.df_dict[key].empty:
                pass

            else:
                raise ValueError(f'No data in {key} dataframe')

        return self.final_data
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_app_process.py -v`
Expected: 13 passed (11 from Task 4 + Task 6, + 2 new).

- [ ] **Step 5: Commit**

```bash
git add app_process.py tests/test_app_process.py
git commit -m "feat: replace Google Sheet append with build_response_data()

Removes add_id/validate_cols/connect_googlesheet/clean_numeric_strings
(all Sheet-specific). Same all-or-nothing semantics, JSON dict output
instead of a Sheets API call."
```

---

## Task 8: Rewrite `main.py` — multipart HTTP entrypoint

**Revised 2026-07-14:** accepts one or more files under a repeated `files`
field (no zip — see Task 3/6 notes and design spec §5/§6).

**Files:**
- Modify: `main.py` (full rewrite)
- Create: `tests/test_main.py`

**Interfaces:**
- Consumes: `AppProcess.validate_request_info`, `AppProcess(...)`,
  `.create_directories()`, `.save_uploaded_files(files)`, `.process_etl()`,
  `.build_response_data()`, `.remove_files()` — all from Tasks 4, 6, 7 plus
  the untouched `process_etl` from the original file.
- Produces: `POST /` (functions-framework target `process_cuttingplan`) —
  see `docs/api.md` (Task 10) for the full contract.

- [ ] **Step 1: Write the failing tests — `tests/test_main.py`**

```python
import io
from unittest.mock import patch
import pytest
from functions_framework import create_app


@pytest.fixture
def client():
    app = create_app("process_cuttingplan", "main.py")
    return app.test_client()


def _form_fields(**overrides):
    fields = {
        "file_id": "abc123",
        "project_code": "PC1",
        "project_name": "Project One",
        "tag": "ZONE1",
        "description": "test",
        "version": "1",
        "revision": "0",
    }
    fields.update(overrides)
    return fields


def test_missing_field_returns_400(client):
    fields = _form_fields()
    del fields["file_id"]
    response = client.post("/", data=fields, content_type="multipart/form-data")

    assert response.status_code == 400
    assert response.get_json()["status"] == "failed"


def test_missing_file_returns_400(client):
    response = client.post("/", data=_form_fields(), content_type="multipart/form-data")

    assert response.status_code == 400
    assert response.get_json()["status"] == "failed"


@patch("main.AppProcess")
def test_successful_processing_returns_200_with_data(mock_app_process_cls, client):
    mock_instance = mock_app_process_cls.return_value
    mock_instance.build_response_data.return_value = {"nesting": [["row1"]]}

    data = _form_fields()
    data["files"] = [
        (io.BytesIO(b"report one"), "report1.txt"),
        (io.BytesIO(b"report two"), "report2.txt"),
    ]
    response = client.post("/", data=data, content_type="multipart/form-data")

    assert response.status_code == 200
    body = response.get_json()
    assert body["status"] == "success"
    assert body["file_id"] == "abc123"
    assert body["data"] == {"nesting": [["row1"]]}
    mock_instance.remove_files.assert_called_once()

    # save_uploaded_files was called with both uploaded files
    saved_files = mock_instance.save_uploaded_files.call_args[0][0]
    assert [f.filename for f in saved_files] == ["report1.txt", "report2.txt"]


@patch("main.AppProcess")
def test_processing_error_returns_500_and_cleans_up(mock_app_process_cls, client):
    mock_instance = mock_app_process_cls.return_value
    mock_instance.process_etl.side_effect = ValueError("boom")

    data = _form_fields()
    data["files"] = [(io.BytesIO(b"report one"), "report1.txt")]
    response = client.post("/", data=data, content_type="multipart/form-data")

    assert response.status_code == 500
    body = response.get_json()
    assert body["status"] == "failed"
    assert "boom" in body["description"]
    mock_instance.remove_files.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_main.py -v`
Expected: FAIL — old `main.py` still expects a JSON body (`request.get_json`)
and doesn't return proper HTTP status codes.

- [ ] **Step 3: Rewrite `main.py`**

```python
import os
import functions_framework
from flask import Flask
from app_process import AppProcess

app = Flask(__name__)

REQUIRED_FIELDS = [
    "file_id", "project_code", "project_name",
    "tag", "description", "version", "revision",
]

# Local debug:
# python -m functions_framework --target=process_cuttingplan --debug --port=8080
# curl -F file_id=abc123 -F project_code=PC1 -F project_name=P1 -F tag=T1 \
#      -F description=d -F version=1 -F revision=0 \
#      -F files=@report1.txt -F files=@report2.txt \
#      http://localhost:8080/


@functions_framework.http
def process_cuttingplan(request):

    form_data = {field: request.form.get(field) for field in REQUIRED_FIELDS}

    if not AppProcess.validate_request_info(form_data):
        return {
            "code": 400,
            "status": "failed",
            "description": "ERROR: Not all keys found in request",
        }, 400

    uploaded_files = request.files.getlist('files')
    if not uploaded_files:
        return {
            "code": 400,
            "status": "failed",
            "description": "ERROR: No files uploaded",
        }, 400

    app_process = None

    try:
        app_process = AppProcess(form_data)
        app_process.create_directories()
        app_process.save_uploaded_files(uploaded_files)
        app_process.process_etl()
        data = app_process.build_response_data()
        app_process.remove_files()

        return {
            "code": 200,
            "file_id": form_data['file_id'],
            "status": "success",
            "description": "ETL successfully completed",
            "data": data,
        }

    except Exception as e:

        if app_process is not None:
            app_process.remove_files()

        return {
            "code": 500,
            "file_id": form_data.get('file_id'),
            "status": "failed",
            "description": str(e),
        }, 500


if __name__ == "__main__":
    app.run(port=int(os.environ.get("PORT", 8080)), host='0.0.0.0', debug=True)
```

Note the HTTP status code now matches the `code` field in the JSON body
(the old service always returned HTTP 200 even for a `"code": 500` error
body — an intentional fix, in scope as I/O-layer/HTTP-semantics work, not an
ETL logic change).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_main.py -v`
Expected: 4 passed.

- [ ] **Step 5: Run the full test suite**

Run: `pytest -v`
Expected: all tests from Tasks 1-8 passed, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add main.py tests/test_main.py
git commit -m "feat: rewrite main.py as a multipart-upload HTTP entrypoint

Accepts one or more files under a repeated 'files' field, no zip.
Validates required fields before constructing AppProcess (fixes the
ungraceful NoneType crash from an incomplete/empty request). Returns
JSON with a matching HTTP status code instead of always-200."
```

---

## Task 9: Remove Google Drive/Sheets files, trim config and requirements

**Files:**
- Delete: `googledrive_api.py`, `googlesheet_api.py`, `config.py`
- Modify: `requirements.txt`

**Interfaces:** none.

- [ ] **Step 1: Confirm nothing still references the files being deleted**

```bash
grep -rn "googledrive_api\|googlesheet_api\|import config\|config\." --include="*.py" .
```

Expected: no output (Tasks 5-7 already removed every reference).

- [ ] **Step 2: Delete the files**

```bash
git rm googledrive_api.py googlesheet_api.py config.py
```

- [ ] **Step 3: Trim `requirements.txt`**

Replace the full contents with:

```
functions-framework==3.*
pandas==2.2.1
numpy==1.26.4
```

(Drops `google`, `google-api-core`, `google-api-python-client`, `google-auth`,
`google-auth-httplib2`, `google-auth-oauthlib`,
`google-cloud-appengine-logging`, `google-cloud-audit-log`,
`google-cloud-core`, `google-cloud-logging`, `googleapis-common-protos` — none
of these are imported anywhere once Drive/Sheets calls are gone.)

- [ ] **Step 4: Reinstall dependencies from the trimmed file and confirm nothing breaks**

```bash
pip install -r requirements.txt --force-reinstall --no-deps
python3 -c "import main"
```

Expected: no output from the `import main` line (no `ModuleNotFoundError` /
`ImportError`).

- [ ] **Step 5: Run the full test suite**

Run: `pytest -v`
Expected: all tests still passed (deleting these files doesn't touch any
tested code path).

- [ ] **Step 6: Commit**

```bash
git add requirements.txt
git commit -m "chore: remove Google Drive/Sheets files and dependencies

No longer needed now that the service accepts direct upload and
returns JSON instead of calling Drive/Sheets APIs."
```

---

## Task 10: API documentation

**Revised 2026-07-14:** documents the `files` (repeated, no zip) contract
from Task 8, not a single zip field.

**Files:**
- Create: `docs/api.md`
- Create: `openapi.yaml`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Write `docs/api.md`**

```markdown
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
| `project_name` | text | yes | Project name |
| `tag` | text | yes | Zone/tag label |
| `description` | text | yes | Free-text description |
| `version` | text | yes | Version number |
| `revision` | text | yes | Revision number |

All 7 non-file fields are required and must be non-empty, or the request is
rejected with `400` before any file processing starts. Each uploaded
file's name must not contain a path separator or `..` — an unsafe filename
is rejected, but as a processing error (`500`, see below), not a `400`:
the check runs after the initial request-shape validation, inside the same
all-or-nothing processing block as ETL parsing errors.

## Example request

```bash
curl -X POST https://<service-url>/ \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -F file_id=abc123 \
  -F project_code=0X165 \
  -F project_name="WHA T31-4" \
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
```

- [ ] **Step 2: Write `openapi.yaml`**

```yaml
openapi: 3.0.3
info:
  title: Cutting Plan API
  version: "1.0.0"
  description: >
    Parses one or more directly-uploaded cutting-plan .txt reports (no zip)
    and returns extracted data as JSON. Stateless — does not persist data
    itself.
paths:
  /:
    post:
      summary: Process one or more cutting-plan report files
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              required:
                - files
                - file_id
                - project_code
                - project_name
                - tag
                - description
                - version
                - revision
              properties:
                files:
                  type: array
                  items:
                    type: string
                    format: binary
                file_id:
                  type: string
                  pattern: '^[A-Za-z0-9_-]+$'
                project_code:
                  type: string
                project_name:
                  type: string
                tag:
                  type: string
                description:
                  type: string
                version:
                  type: string
                revision:
                  type: string
      responses:
        '200':
          description: Successfully parsed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    example: 200
                  status:
                    type: string
                    example: success
                  file_id:
                    type: string
                  description:
                    type: string
                  data:
                    type: object
                    properties:
                      nesting:
                        type: array
                        items:
                          type: array
                          items: {}
                      order_part:
                        type: array
                        items:
                          type: array
                          items: {}
                      plate_usage:
                        type: array
                        items:
                          type: array
                          items: {}
                      remnants:
                        type: array
                        items:
                          type: array
                          items: {}
        '400':
          description: Invalid request (missing field or no files uploaded)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '500':
          description: Processing failed (unsafe filename, unparseable content, etc. -- all-or-nothing)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
      security:
        - cloudRunIam: []
components:
  schemas:
    ErrorResponse:
      type: object
      properties:
        code:
          type: integer
        status:
          type: string
          example: failed
        file_id:
          type: string
        description:
          type: string
  securitySchemes:
    cloudRunIam:
      type: http
      scheme: bearer
      bearerFormat: "Google-signed ID token"
```

- [ ] **Step 3: Validate the OpenAPI YAML is well-formed**

```bash
pip install pyyaml  # if not already present from requirements-dev
python3 -c "import yaml; yaml.safe_load(open('openapi.yaml')); print('valid YAML')"
```

Expected: `valid YAML`

- [ ] **Step 4: Commit**

```bash
git add docs/api.md openapi.yaml
git commit -m "docs: add API documentation and OpenAPI spec"
```

---

## Task 11: Manual end-to-end verification (not automated)

This task is intentionally manual, not scripted — the automated tests in
Tasks 1-8 all mock the `AppProcess`/`Etl_Cuttingplan` boundary or use
synthetic uploads with no real cutting-plan `.txt` content, by design (fabricating
a realistic `.txt` fixture risks silently not matching the real, intricate
section-parsing rules in `etl_cuttingplan.py`, and no real sample files exist
in this repo to use as committed fixtures — see design spec, "Testing"). This
step validates the full pipeline against a real file instead.

**Files:** none (verification only).

- [ ] **Step 1: Start the service locally**

```bash
source .venv/bin/activate
functions-framework --target=process_cuttingplan --source=main.py --port=8080
```

- [ ] **Step 2: Get one known-good sample's `.txt` files**

Using the scenarios already catalogued in `test case.txt`, download one
positive-test file from Google Drive (e.g. file ID
`1CRSs4sTiKtzc1mebQtE5DIrOFZ4PdizZ`) via the Drive web UI or `gcloud`/Drive
API with the existing service-account credentials — do **not** commit
anything downloaded here to the repo (it's real project data). The Drive
file is a zip (that's how the *sample data* happens to be packaged on
Drive, unrelated to the new API's upload format) — unzip it locally to get
the individual `.txt` report files:

```bash
unzip <downloaded>.zip -d /tmp/cutting-plan-sample
```

- [ ] **Step 3: POST the extracted `.txt` files to the local server**

```bash
curl -X POST http://localhost:8080/ \
  -F file_id=verify001 \
  -F project_code=TEST \
  -F project_name=Verification \
  -F tag=T1 \
  -F description=manual-e2e-check \
  -F version=1 \
  -F revision=0 \
  $(for f in /tmp/cutting-plan-sample/*.txt; do echo -F "files=@$f"; done)
```

- [ ] **Step 4: Confirm the response**

Expected: HTTP `200`, `"status": "success"`, and a `data` object with
`nesting`/`order_part`/`plate_usage` populated (and `remnants` if the sample
has any) — row values should match what the same file previously produced
in the Google Sheet via the old service (spot-check a few values, e.g.
`project_code`/`cuttingplan_number`/`weight_kg`).

- [ ] **Step 5: Repeat with one negative-test file from `test case.txt`**

E.g. the "material มากกว่า 1 row" case (`1eNsprDv4MJ-ajBEOJZiH6WMA2-NumNK6`)
— expected: HTTP `500`, `"status": "failed"`, with a `description` matching
the same error message the old service used to produce for that file.

- [ ] **Step 6: Document the result**

No commit needed for this task — it's a verification checkpoint, not a code
change. If either check fails, stop and re-open the relevant task above
before considering the plan complete.
