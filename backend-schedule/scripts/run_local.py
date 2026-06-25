#!/usr/bin/env python3
"""CLI runner for the scheduler (reads DATABASE_URL, writes prod_schedule).

Usage:
    DATABASE_URL=postgresql://... python scripts/run_local.py --direction backward --rule EDD
    DATABASE_URL=postgresql://... python scripts/run_local.py --compare

For an offline demo without a DB, see scripts/run_local_embedded.py (the original
sandbox test with the 125-WO dataset embedded).
"""
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.solver import engine  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--direction", default="backward", choices=["backward", "forward", "event", "alap"])
    ap.add_argument("--rule", default="EDD", choices=["EDD", "CR", "SPT", "FIFO"])
    ap.add_argument("--no-persist", action="store_true")
    ap.add_argument("--compare", action="store_true")
    a = ap.parse_args()
    if a.compare:
        out = {"backward": engine.run("backward", a.rule, persist=True),
               "event": engine.run("event", a.rule, persist=True)}
    else:
        out = engine.run(a.direction, a.rule, persist=not a.no_persist)
    print(json.dumps(out, indent=2, default=str))


if __name__ == "__main__":
    main()
