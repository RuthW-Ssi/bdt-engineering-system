"""Typed scheduler errors; app/main.py maps them to HTTP responses (ADR-0015)."""
from __future__ import annotations


class RunInProgress(Exception):
    """Another persisting run holds the scheduler advisory lock (-> 409 run_in_progress)."""


class DataNotReady(Exception):
    """Inputs cannot be scheduled; nothing was written (-> 422 data_not_ready)."""

    def __init__(self, reasons: list[str]):
        super().__init__("; ".join(reasons))
        self.reasons = reasons
