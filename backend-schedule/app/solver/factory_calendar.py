"""Factory calendar engine: productive-time windows with daily overheads.

Single shared calendar (FACTORY-STD). Each working day (Mon-Sat) has:
  - morning block, afternoon block, optional OT block
  - a daily START overhead (morning task + machine-check) trimmed off the first block
  - a daily END overhead (shutdown prep) trimmed off the last block of the day
Lunch (12:00-13:00) and the OT gap (17:30-18:00) are non-productive by construction.

All datetimes here are NAIVE LOCAL time (Asia/Bangkok). Convert at the edges.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, date, timedelta


@dataclass
class FactoryCalendar:
    holidays: set[date] = field(default_factory=set)
    allow_ot: bool = True
    day_start_overhead_min: int = 30      # 08:00-08:30 morning task + setup
    day_end_overhead_min: int = 15        # last 15 min: shutdown prep
    # base shift blocks as (start_min, end_min) from midnight
    normal_blocks: tuple = ((8 * 60, 12 * 60), (13 * 60, 17 * 60 + 30))
    ot_block: tuple = (18 * 60, 22 * 60)
    work_dows: tuple = (0, 1, 2, 3, 4, 5)   # Mon..Sat (Python weekday: Mon=0)
    _scan_limit: int = 4000

    def is_workday(self, d: date) -> bool:
        return d.weekday() in self.work_dows and d not in self.holidays

    def windows(self, d: date) -> list[tuple[datetime, datetime]]:
        """Productive intervals for date d (after overheads). Empty if non-working."""
        if not self.is_workday(d):
            return []
        blocks = list(self.normal_blocks) + ([self.ot_block] if self.allow_ot else [])
        # start overhead -> first block; end overhead -> last block
        s0, e0 = blocks[0]
        blocks[0] = (s0 + self.day_start_overhead_min, e0)
        sL, eL = blocks[-1]
        blocks[-1] = (sL, eL - self.day_end_overhead_min)
        out = []
        for a, b in blocks:
            if b > a:
                out.append((datetime(d.year, d.month, d.day, a // 60, a % 60),
                            datetime(d.year, d.month, d.day, b // 60, b % 60)))
        return out

    # ---- forward ----
    def advance(self, start: datetime, minutes: float) -> datetime:
        """End datetime after consuming `minutes` of productive time from `start`."""
        d, cur, rem = start.date(), start, float(minutes)
        for _ in range(self._scan_limit):
            for a, b in self.windows(d):
                s = max(cur, a)
                if s >= b:
                    continue
                avail = (b - s).total_seconds() / 60
                if avail >= rem:
                    return s + timedelta(minutes=rem)
                rem -= avail
                cur = b
            d += timedelta(days=1)
            cur = datetime(d.year, d.month, d.day, 0, 0)
        raise RuntimeError("advance() scan overflow")

    def next_work(self, dt: datetime) -> datetime:
        d = dt.date()
        for _ in range(800):
            for a, b in self.windows(d):
                if dt < a:
                    return a
                if a <= dt < b:
                    return dt
            d += timedelta(days=1)
            dt = datetime(d.year, d.month, d.day, 0, 0)
        raise RuntimeError("next_work() overflow")

    # ---- backward ----
    def recede(self, end: datetime, minutes: float) -> datetime:
        """Start datetime such that working from it for `minutes` ends at `end`."""
        d, cur, rem = end.date(), end, float(minutes)
        for _ in range(self._scan_limit):
            for a, b in reversed(self.windows(d)):
                e = min(cur, b)
                if e <= a:
                    continue
                avail = (e - a).total_seconds() / 60
                if avail >= rem:
                    return e - timedelta(minutes=rem)
                rem -= avail
                cur = a
            d -= timedelta(days=1)
            cur = datetime(d.year, d.month, d.day, 23, 59)
        raise RuntimeError("recede() scan overflow")

    def prev_work(self, dt: datetime) -> datetime:
        d = dt.date()
        for _ in range(800):
            for a, b in reversed(self.windows(d)):
                if dt > b:
                    return b
                if a < dt <= b:
                    return dt
            d -= timedelta(days=1)
            dt = datetime(d.year, d.month, d.day, 23, 59)
        raise RuntimeError("prev_work() overflow")
