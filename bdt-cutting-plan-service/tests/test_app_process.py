import os
import pandas as pd
import pytest
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


def test_validate_request_info_requires_project_code():
    info = _complete_info()
    del info["project_code"]
    assert AppProcess.validate_request_info(info) is False


def test_validate_request_info_ignores_missing_project_name():
    # project_name isn't part of the public API — main.py always sets it to
    # "" internally and never reads it from the request. validate_request_info
    # itself doesn't require it either.
    info = _complete_info()
    del info["project_name"]
    assert AppProcess.validate_request_info(info) is True


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


def test_save_uploaded_files_rejects_whole_batch_if_any_filename_unsafe(
    tmp_path, monkeypatch
):
    # A later unsafe filename in the batch must not leave earlier, safe
    # files in the same batch already written to disk (no partial state).
    monkeypatch.chdir(tmp_path)
    app_process = AppProcess(_base_project_info())
    app_process.create_directories()

    files = [
        _FakeFileStorage("safe.txt", b"ok"),
        _FakeFileStorage("../../evil.txt", b"pwned"),
    ]

    with pytest.raises(ValueError):
        app_process.save_uploaded_files(files)

    assert os.listdir(app_process.upload_folder) == []
    assert not (tmp_path / "evil.txt").exists()


def test_remove_files_cleans_up_upload_folder(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    app_process = AppProcess(_base_project_info())
    app_process.create_directories()
    app_process.save_uploaded_files([_FakeFileStorage("report.txt", b"data")])

    app_process.remove_files()

    assert not os.path.exists(app_process.upload_folder)


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
