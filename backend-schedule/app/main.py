"""FastAPI service for the SSI production scheduler (writes prod_schedule).

Run:  uvicorn app.main:app --reload --port 8100
Env:  DATABASE_URL=postgresql://...   (Supabase / Postgres)

Note: "APS" elsewhere in this repo usually means Autodesk Platform Services (BIM viewer).
This service is the production *scheduler*; NestJS ScheduleService reads what it writes.
"""
from __future__ import annotations
from fastapi import FastAPI, HTTPException, Query

from .solver import engine

app = FastAPI(title="SSI Production Scheduler", version="0.2.0")


@app.get("/health")
def health():
    return {"status": "ok", "service": "backend-schedule"}


@app.post("/schedule")
def schedule(direction: str = Query("backward", pattern="^(backward|forward|event|alap)$"),
             dispatch_rule: str = Query("EDD", pattern="^(EDD|CR|SPT|FIFO)$"),
             persist: bool = True,
             activate: bool = False):
    """Run the scheduler and (optionally) persist to prod_schedule.

    activate=true also makes the written version the single active one (what the
    BDT app shows via GET /schedule/versions/active).
    Returns KPIs (feasibility, makespan, tardiness, late count) + per-line load.
    """
    try:
        return engine.run(direction=direction, dispatch_rule=dispatch_rule, persist=persist,
                          activate=activate and persist)
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/schedule/compare")
def compare(dispatch_rule: str = Query("EDD", pattern="^(EDD|CR|SPT|FIFO)$")):
    """Run both backward and event-based and return KPIs side by side."""
    bk = engine.run(direction="backward", dispatch_rule=dispatch_rule, persist=True)
    ev = engine.run(direction="event", dispatch_rule=dispatch_rule, persist=True)
    return {"backward": bk, "event_based": ev}
