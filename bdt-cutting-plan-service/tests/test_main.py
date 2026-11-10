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


def test_missing_project_code_returns_400(client):
    fields = _form_fields()
    del fields["project_code"]
    response = client.post("/", data=fields, content_type="multipart/form-data")

    assert response.status_code == 400
    assert response.get_json()["status"] == "failed"


@patch("main.AppProcess")
def test_project_name_is_not_part_of_the_api(mock_app_process_cls, client):
    mock_instance = mock_app_process_cls.return_value
    mock_instance.build_response_data.return_value = {"nesting": [["row1"]]}

    # Caller never sends project_name at all — it's not in _form_fields().
    data = _form_fields()
    data["files"] = [(io.BytesIO(b"report one"), "report1.txt")]
    response = client.post("/", data=data, content_type="multipart/form-data")

    assert response.status_code == 200

    # AppProcess still receives all 7 project-info keys — project_name is
    # always "" — because etl_cuttingplan.py's reorganize_columns()
    # hardcodes "the last 7 columns are project metadata" and isn't ours
    # to change.
    constructed_with = mock_app_process_cls.call_args[0][0]
    assert constructed_with["project_code"] == "PC1"
    assert constructed_with["project_name"] == ""
    assert set(constructed_with.keys()) == {
        "file_id", "project_code", "project_name",
        "tag", "description", "version", "revision",
    }


@patch("main.AppProcess")
def test_project_name_sent_by_caller_is_ignored(mock_app_process_cls, client):
    # Even if a caller sends project_name anyway, it's not read — always "".
    mock_instance = mock_app_process_cls.return_value
    mock_instance.build_response_data.return_value = {"nesting": [["row1"]]}

    data = _form_fields(project_name="Should Be Ignored")
    data["files"] = [(io.BytesIO(b"report one"), "report1.txt")]
    client.post("/", data=data, content_type="multipart/form-data")

    constructed_with = mock_app_process_cls.call_args[0][0]
    assert constructed_with["project_name"] == ""


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


@patch("main.AppProcess")
def test_processing_error_lists_every_rejected_report(mock_app_process_cls, client):
    error = ValueError("Error in ETL process: ...")
    error.errors = [{"File name": "A.txt", "Error message": "Text format in Remnants ..."}, {"File name": "B.txt", "Error message": "x"}]
    mock_app_process_cls.return_value.process_etl.side_effect = error

    data = _form_fields()
    data["files"] = [(io.BytesIO(b"report one"), "A.txt")]
    body = client.post("/", data=data, content_type="multipart/form-data").get_json()

    assert body["errors"] == [{"file": "A.txt", "message": "Text format in Remnants ..."}, {"file": "B.txt", "message": "x"}]


@patch("main.AppProcess")
def test_other_errors_return_an_empty_list(mock_app_process_cls, client):
    mock_app_process_cls.return_value.process_etl.side_effect = ValueError("boom")
    data = _form_fields()
    data["files"] = [(io.BytesIO(b"report one"), "A.txt")]
    assert client.post("/", data=data, content_type="multipart/form-data").get_json()["errors"] == []
