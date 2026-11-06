import pytest
from path_safety import sanitize_identifier, safe_filename


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
