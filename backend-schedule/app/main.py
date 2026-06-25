"""FastAPI service for the SSI APS scheduler.

Run:  uvicorn app.main:app --reload --port 8100
Env:  DATABASE_URL=postgresql://...   (Supabase / Postgres)
"""
from __future__ import annotations
from fastapi import FastAPI, HTTPException, Query

from .solver import engine

app = FastAPI(title="SSI APS Scheduler", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok", "service": "backend-schedule"}


@app.post("/schedule")
def schedule(direction: str = Query("backward", pattern="^(backward|forward|event|alap)$"),
             dispatch_rule: str = Query("EDD", pattern="^(EDD|CR|SPT|FIFO)$"),
             persist: bool = True):
    """Run the scheduler and (optionally) persist to prod_schedule.

    Returns KPIs (feasibility, makespan, tardiness, late count) + per-line load.
    """
    try:
        return engine.run(direction=direction, dispatch_rule=dispatch_rule, persist=persist)
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/schedule/compare")
def compare(dispatch_rule: str = Query("EDD", pattern="^(EDD|CR|SPT|FIFO)$")):
    """Run both backward and event-based and return KPIs side by side."""
    bk = engine.run(direction="backward", dispatch_rule=dispatch_rule, persist=True)
    ev = engine.run(direction="event", dispatch_rule=dispatch_rule, persist=True)
    return {"backward": bk, "event_based": ev}
