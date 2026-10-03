"""Finite-capacity heuristic schedulers (v1): event-based + backward.

Resource unit = work-center LINE (each line runs one WO at a time).
Precedence = within an MO, all WOs at a lower `sequence` must finish before a
higher-sequence WO starts (stage precedence; v1 linear). Single factory calendar.

Both validated to produce 0 line-overlap (feasible) on the SSI 125-WO test set.
"""
from __future__ import annotations
import collections
from datetime import datetime

from .factory_calendar import FactoryCalendar
from .models import WorkOrder, Line, Assignment, SchedulerConfig


def _dispatch_key(rule: str, wo: WorkOrder, now: datetime):
    if rule == "SPT":
        return (wo.duration_min, wo.target_end, wo.mo_id, wo.sequence, wo.wo_id)
    if rule == "CR":  # critical ratio = time-to-due / work-remaining (smaller = more urgent)
        ttd = (wo.target_end - now).total_seconds() / 60
        cr = ttd / max(wo.duration_min, 1)
        return (cr, wo.target_end, wo.mo_id, wo.sequence, wo.wo_id)
    if rule == "FIFO":
        return (wo.earliest_start, wo.mo_id, wo.sequence, wo.wo_id)
    # default EDD
    return (wo.target_end, wo.mo_id, wo.sequence, wo.wo_id)


class Scheduler:
    def __init__(self, wos: list[WorkOrder], lines: list[Line],
                 cal: FactoryCalendar, cfg: SchedulerConfig, now: datetime):
        self.wos = {w.wo_id: w for w in wos}
        self.cal = cal
        self.cfg = cfg
        self.now = now
        self.lines_of_wc: dict[int, list[Line]] = collections.defaultdict(list)
        for ln in lines:
            self.lines_of_wc[ln.wc_id].append(ln)
        self.bymo: dict[int, list[tuple[int, int]]] = collections.defaultdict(list)
        for w in wos:
            self.bymo[w.mo_id].append((w.sequence, w.wo_id))

    def _preds(self, wo: WorkOrder) -> list[int]:
        return [i for s, i in self.bymo[wo.mo_id] if s < wo.sequence]

    # ---- event-based forward dispatch ----
    def event_based(self) -> dict[int, Assignment]:
        sched: dict[int, Assignment] = {}
        line_free = {ln.line_id: self.now for lns in self.lines_of_wc.values() for ln in lns}
        remaining = set(self.wos)
        while remaining:
            ready = [i for i in remaining if all(p in sched for p in self._preds(self.wos[i]))]
            ready.sort(key=lambda i: _dispatch_key(self.cfg.dispatch_rule, self.wos[i], self.now))
            wo = self.wos[ready[0]]
            pred_done = max([sched[p].end for p in self._preds(wo)], default=self.now)
            est = max(self.now, wo.earliest_start, pred_done)
            best = None
            for ln in self.lines_of_wc[wo.wc_id]:
                st = self.cal.next_work(max(line_free[ln.line_id], est))
                if best is None or st < best[1]:
                    best = (ln, st)
            ln, st = best
            en = self.cal.advance(st, wo.duration_min)
            sched[wo.wo_id] = Assignment(wo.wo_id, st, en, ln.line_id)
            line_free[ln.line_id] = en
            remaining.discard(wo.wo_id)
        return sched

    # ---- backward ALAP finite ----
    def backward(self) -> dict[int, Assignment]:
        sched: dict[int, Assignment] = {}
        line_earliest: dict[int, datetime | None] = {
            ln.line_id: None for lns in self.lines_of_wc.values() for ln in lns}
        order = []
        for mo in self.bymo:
            for _, wo_id in sorted(self.bymo[mo], reverse=True):   # highest seq first
                order.append(wo_id)
        for wo_id in order:
            wo = self.wos[wo_id]
            succ = [sched[i].start for s, i in self.bymo[wo.mo_id]
                    if s > wo.sequence and i in sched]
            deadline = min([wo.target_end] + succ)
            best = None
            for ln in self.lines_of_wc[wo.wc_id]:
                cap = deadline if line_earliest[ln.line_id] is None else min(deadline, line_earliest[ln.line_id])
                cap = self.cal.prev_work(cap)
                st = self.cal.recede(cap, wo.duration_min)
                if best is None or st > best[1]:
                    best = (ln, st)
            ln, st = best
            en = self.cal.advance(st, wo.duration_min)
            sched[wo_id] = Assignment(wo_id, st, en, ln.line_id)
            le = line_earliest[ln.line_id]
            if le is None or st < le:
                line_earliest[ln.line_id] = st
        return sched

    def run(self) -> dict[int, Assignment]:
        d = self.cfg.direction
        if d in ("backward", "alap"):
            return self.backward()
        # forward / event / algorithmic all use the event-based dispatch in v1
        return self.event_based()
