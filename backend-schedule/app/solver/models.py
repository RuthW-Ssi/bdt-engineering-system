"""Domain models for the scheduler (DB-agnostic)."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime


@dataclass
class WorkOrder:
    wo_id: int
    mo_id: int
    sequence: int          # routing step within the MO (precedence)
    wc_id: int             # work center the op runs on
    duration_min: float    # expected_duration_min
    target_end: datetime   # due (local naive)
    earliest_start: datetime  # release (local naive)


@dataclass
class Line:
    line_id: int
    wc_id: int
    line_no: int
    crew_size: int
    labor_mode: str        # 'internal' | 'subcontract'


@dataclass
class Assignment:
    wo_id: int
    start: datetime
    end: datetime
    line_id: int


@dataclass
class SchedulerConfig:
    direction: str = "backward"      # backward | forward | event | algorithmic
    dispatch_rule: str = "EDD"       # EDD | CR | SPT | FIFO
    allow_ot: bool = True
    horizon_days: int = 14
