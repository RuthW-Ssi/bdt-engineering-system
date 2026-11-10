"""Rows the parser used to drop or reject (2026-11-09 full re-upload of the legacy cutting plans)."""
import pytest
from app_process import AppProcess
from tests.test_shared_charge import report, run, _File


def test_a_material_code_article_number_is_a_plate_row(tmp_path, monkeypatch):
    # X190-Z1-3.2-1: Article Number "SS400_3.2_2000_600 0" was rejected because it is not an integer, so users
    # edited reports by hand (SM520_20_2000_600 0 → 22) just to get them in. Count is the integer column.
    data = run(tmp_path, monkeypatch, [_File("A.txt", report("00000001.cld", "10432", 2438, 75, 84.9, "P-1", "R1", article="SS400_3.2_2000_600 0"))])
    assert len(data["nesting"]) == 1
    assert "SS400_3.2_2000_600 0" in data["nesting"][0]


def test_an_order_row_tagged_dash_is_kept(tmp_path, monkeypatch):
    # X186-Z3-6-15: 4 order rows tagged "-" (19 of 25 pieces) were dropped silently; the DXF has all 25.
    dash = "-\t0X999\t2\t16\t372\t6.12.2025\tP-2 / P-2\t70\tX\t70\t0.2"
    data = run(tmp_path, monkeypatch, [_File("A.txt", report("00000001.cld", "1", 6000, 232, 72.93, "P-1", "R1", extra_orders=[dash]))])
    assert sorted(row[13].strip() for row in data["order_part"]) == ["P-1", "P-2"]


def test_errors_name_every_bad_file(tmp_path, monkeypatch):
    # Every rejected file comes back with its name and message (structured), not only as one long string
    with pytest.raises(ValueError) as caught:
        run(tmp_path, monkeypatch, [
            _File("GOOD.txt", report("00000001.cld", "1", 6000, 232, 72.93, "P-1", "R1")),
            _File("NO-DIMS-1.txt", report("00000002.cld", "2", 6000, 232, 72.93, "P-1", "R2380", remnant_dims=False)),
            _File("NO-DIMS-2.txt", report("00000003.cld", "3", 6000, 232, 72.93, "P-1", "R2381", remnant_dims=False)),
        ])
    errors = caught.value.errors
    assert sorted(e["File name"] for e in errors) == ["NO-DIMS-1.txt", "NO-DIMS-2.txt"]
    assert all("Remnants" in e["Error message"] for e in errors)
