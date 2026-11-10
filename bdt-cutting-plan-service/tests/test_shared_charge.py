"""Two reports with the same Charge (a plate re-nested from another plate's remnant keeps that plate's Charge)
must stay two plates. Before 2026-11-09 the tables were merged on the Charge alone, so two reports gave
2 x 2 x 2 = 8 nesting rows and the second report had no rows of its own (uploads #83 and #126 in local dev)."""
from app_process import AppProcess


def report(nc, plate_number, length, kg, pct, part, remnant, article="5", extra_orders=(), remnant_dims=True):
    lines = [
        "NESTING",
        f"NC File\t:\t{nc}\tNeed Date\t:\t06.12.2025\t1 / \t2",
        "Nesting Dim.\t:\t660\tx\t1,509\tChanger\t:\tTester\t10.12.2025\t17:05",
        "Technology\t:\tPlasma [PlainCuttingUnit]",
        "",
        "Used Material\tUsage",
        "Article Number\tCount\tPlate Number \tCharge\tQuality\tThick.\tWidth\tLength\t2\tkg\tNesting % ",
        "m",
        f"{article}\t1\t{plate_number} \tSHARED-10-3\tHY370\t10.00\t1524\t{length}\t1.03\t{kg}\t{pct}",
        "",
        "Orders",
        "Part Specific",
        "Tag\tOrder Number\tItem\tNested\tOrdered\tDue date\tDrawing/Part No/Version No\tMain Dim.\tWeight kg ",
        f"1\t0X999\t1\t2\t2\t6.12.2025\t{part} / {part}\t376\tX\t182\t4.0",
        *extra_orders,
        "",
        "",
        "Plate usage per order in kg",
        "Order Number\tNet\tGross",
        f"0X999\t50.00\t{kg}.00",
        f"Total\t50.00\t{kg}.00",
        "",
        "Remnants",
        "2",
        "Plate Number\tDimensions\tArea\tm\tWeight kg\tCount",
        f"{remnant}\t3383 X 1524\t5.2\t405\t1" if remnant_dims else remnant,
        f"{plate_number}-1",
        "",
        "Machine times",
        "Movement\tStart\tTotal",
        "Machining method\tLength\tAvg speed\tTime\tQty\tTime/qty\tTime\tTime",
        "m\tmm/min\tmin\tmin\tmin\tmin",
        "19.4\t2680",
        "Basic Cutting\t7.2\t65\t0.10\t6.5\t13.7",
        "Rapid\t1.2",
        "11.6\t10000\t65\t0.00\t0.0\t1.2",
        "Total\t8.4\t130\t6.5\t14.9",
    ]
    return "\r\n".join(lines).encode()


class _File:
    def __init__(self, filename, content):
        self.filename, self.content = filename, content

    def save(self, destination):
        with open(destination, "wb") as f:
            f.write(self.content)


def run(tmp_path, monkeypatch, files):
    monkeypatch.chdir(tmp_path)
    info = {k: "x" for k in ["file_id", "project_code", "tag", "description", "version", "revision"]}
    info["project_name"] = ""
    app = AppProcess(info)
    app.create_directories()
    app.save_uploaded_files(files)
    app.process_etl()
    return app.build_response_data()


def test_two_reports_sharing_a_charge_stay_two_plates(tmp_path, monkeypatch):
    data = run(tmp_path, monkeypatch, [
        _File("PLATE-A.txt", report("00000001.cld", "12733", 6000, 232, 72.93, "P-1", "R1")),
        _File("PLATE-A-1REVISE2.txt", report("00000002.cld", "12733-1 R4165", 4060, 81, 72.74, "P-2", "R2")),
    ])
    nesting = data["nesting"]
    assert len(nesting) == 2
    # source_file is the last column of every table: the report the row came from
    assert sorted(row[-1] for row in nesting) == ["PLATE-A", "PLATE-A-1REVISE2"]
    by_file = {row[-1]: row for row in nesting}
    assert "00000001.cld" in by_file["PLATE-A"] and "00000002.cld" in by_file["PLATE-A-1REVISE2"]
    assert sorted((row[-1], row[13].strip()) for row in data["order_part"]) == [("PLATE-A", "P-1"), ("PLATE-A-1REVISE2", "P-2")]
    assert sorted(row[-1] for row in data["plate_usage"]) == ["PLATE-A", "PLATE-A-1REVISE2"]
    assert {(row[-1], row[7]) for row in data["remnants"]} == {("PLATE-A", "R1"), ("PLATE-A-1REVISE2", "R2")}


def test_every_table_gains_one_trailing_column(tmp_path, monkeypatch):
    data = run(tmp_path, monkeypatch, [_File("ONE.txt", report("00000003.cld", "1", 6000, 232, 72.93, "P-1", "R1"))])
    # the backend accepts the old column count, or the old count + this one column
    assert {k: len(v[0]) for k, v in data.items()} == {"nesting": 33, "order_part": 19, "plate_usage": 12, "remnants": 17}
    assert all(v[0][-1] == "ONE" for v in data.values())
