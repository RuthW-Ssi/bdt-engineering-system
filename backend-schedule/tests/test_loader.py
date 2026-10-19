from datetime import datetime, timedelta, timezone

from app.solver import loader

TZ7 = timezone(timedelta(hours=7))


def _row(wo_id, mo_id, seq, finish, start=datetime(2026, 10, 19, 8, 30, tzinfo=TZ7)):
    return {"wo_id": wo_id, "mo_id": mo_id, "sequence": seq, "wc_id": 5, "dur": 120,
            "plan_finish": finish, "plan_start": start}


def test_without_ids_runs_the_original_query_only(fake_conn):
    conn = fake_conn([("from work_order w", [_row(1, 10, 10, datetime(2026, 10, 22, 17, tzinfo=TZ7))])])
    [wo] = loader.load_work_orders(conn)
    assert wo.wo_id == 1
    assert len(conn.log) == 1 and "w.id = any" not in conn.log[0][0]


def test_ids_filter_the_query(fake_conn):
    conn = fake_conn([("not (w.id = any(%s))", []),
                      ("w.id = any(%s)", [_row(2, 10, 20, datetime(2026, 10, 22, 17, tzinfo=TZ7))])])
    [wo] = loader.load_work_orders(conn, [2])
    assert wo.wo_id == 2
    assert conn.log[0][1][1] == [2]


def test_unselected_unfinished_earlier_op_holds_the_successor_back(fake_conn):
    cut_finish = datetime(2026, 10, 21, 12, tzinfo=TZ7)
    conn = fake_conn([
        ("not (w.id = any(%s))", [{"mo_id": 10, "sequence": 10, "plan_finish": cut_finish},
                                  {"mo_id": 10, "sequence": 40, "plan_finish": datetime(2026, 10, 30, tzinfo=TZ7)}]),
        ("w.id = any(%s)", [_row(2, 10, 20, datetime(2026, 10, 22, 17, tzinfo=TZ7))]),
    ])
    [fit] = loader.load_work_orders(conn, [2])
    assert fit.earliest_start == datetime(2026, 10, 21, 12)   # waits for Cut; the later Paint is ignored


def test_waiting_never_moves_a_later_own_start_earlier(fake_conn):
    own_start = datetime(2026, 10, 25, 8, 30, tzinfo=TZ7)
    conn = fake_conn([
        ("not (w.id = any(%s))", [{"mo_id": 10, "sequence": 10, "plan_finish": datetime(2026, 10, 21, tzinfo=TZ7)}]),
        ("w.id = any(%s)", [_row(2, 10, 20, datetime(2026, 10, 28, 17, tzinfo=TZ7), start=own_start)]),
    ])
    [fit] = loader.load_work_orders(conn, [2])
    assert fit.earliest_start == datetime(2026, 10, 25, 8, 30)


def test_other_mo_does_not_hold_back(fake_conn):
    conn = fake_conn([
        ("not (w.id = any(%s))", [{"mo_id": 99, "sequence": 10, "plan_finish": datetime(2026, 10, 30, tzinfo=TZ7)}]),
        ("w.id = any(%s)", [_row(2, 10, 20, datetime(2026, 10, 22, 17, tzinfo=TZ7))]),
    ])
    [fit] = loader.load_work_orders(conn, [2])
    assert fit.earliest_start == datetime(2026, 10, 19, 8, 30)


def _cand(wo_id, status="NOT_STARTED", dur=60, start=True, finish=True, wc_active=True, code=None):
    d = datetime(2026, 10, 20, 8, 30, tzinfo=TZ7)
    return {"wo_id": wo_id, "wo_code": code or f"WO-{wo_id}", "status": status, "dur": dur,
            "plan_start": d if start else None, "plan_finish": d if finish else None, "wc_active": wc_active}


def test_skip_reason_names_every_problem_in_thai():
    assert loader.skip_reason(_cand(1)) is None
    assert loader.skip_reason(_cand(1, wc_active=False)) == "work center ปิดใช้"
    assert loader.skip_reason(_cand(1, dur=0)) == "ไม่มีเวลาทำงาน"
    assert loader.skip_reason(_cand(1, dur=None, start=False)) == "ไม่มีเวลาทำงาน · ไม่มีวันเริ่ม/วันเสร็จตามแผน"
    assert loader.skip_reason(_cand(1, status="IN_PROGRESS")) == "สถานะ IN_PROGRESS — จัดได้เฉพาะ ยังไม่เริ่ม / ปล่อยงานแล้ว"


def test_load_skipped_lists_only_the_ones_left_out(fake_conn):
    conn = fake_conn([("left join mrp_workcenter", [_cand(1), _cand(2, start=False, code="WO-IN-2")])])
    assert loader.load_skipped(conn) == [{"wo_id": 2, "wo_code": "WO-IN-2", "reason": "ไม่มีวันเริ่ม/วันเสร็จตามแผน"}]
    assert "w.id = any" not in conn.log[0][0]


def test_load_skipped_with_a_pick_also_checks_picked_wos_in_other_statuses(fake_conn):
    conn = fake_conn([("left join mrp_workcenter", [_cand(3, status="DONE")])])
    assert loader.load_skipped(conn, [3])[0]["reason"].startswith("สถานะ DONE")
    assert conn.log[0][1][-1] == [3]


def test_load_reservations_maps_started_wos(fake_conn):
    until = datetime(2026, 10, 21, 12, tzinfo=TZ7)
    conn = fake_conn([("w.status::text in ('IN_PROGRESS', 'PAUSED')", [{"wc_id": 18, "wo_code": "WO-9", "plan_finish": until}])])
    assert loader.load_reservations(conn) == [(18, "WO-9", datetime(2026, 10, 21, 12))]
