"""KPIs + feasibility validation for a schedule."""
from __future__ import annotations
import collections
from datetime import datetime
from .models import WorkOrder, Assignment


def line_overlaps(sched: dict[int, Assignment]) -> int:
    """Count overlapping job pairs on the same line (must be 0 for a feasible schedule)."""
    byline = collections.defaultdict(list)
    for a in sched.values():
        byline[a.line_id].append((a.start, a.end))
    n = 0
    for iv in byline.values():
        iv.sort()
        for i in range(1, len(iv)):
            if iv[i][0] < iv[i - 1][1]:
                n += 1
    return n


def compute(sched: dict[int, Assignment], wos: dict[int, WorkOrder], now: datetime) -> dict:
    ends = [a.end for a in sched.values()]
    starts = [a.start for a in sched.values()]
    late = sum(1 for i, a in sched.items() if a.end > wos[i].target_end)
    tardiness_h = sum(max(0.0, (a.end - wos[i].target_end).total_seconds() / 3600)
                      for i, a in sched.items())
    start_before_now = sum(1 for a in sched.values() if a.start < now)
    makespan_d = (max(ends) - now).total_seconds() / 86400 if ends else 0
    return {
        "work_orders": len(sched),
        "feasible": line_overlaps(sched) == 0,
        "line_overlaps": line_overlaps(sched),
        "span_start": min(starts).isoformat() if starts else None,
        "span_end": max(ends).isoformat() if ends else None,
        "makespan_days": round(makespan_d, 2),
        "late_vs_due": late,
        "start_before_now": start_before_now,
        "total_tardiness_hours": round(tardiness_h, 1),
    }


def line_load(sched: dict[int, Assignment], wos: dict[int, WorkOrder]) -> dict[int, float]:
    """Productive minutes per line (uses real op duration, not elapsed time)."""
    load = collections.Counter()
    for i, a in sched.items():
        load[a.line_id] += wos[i].duration_min
    return dict(load)
