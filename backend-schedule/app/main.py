"""FastAPI service "prod-scheduler" for the SSI production scheduler (writes prod_schedule).

Run:  uvicorn app.main:app --reload --port 8100
Env:  DATABASE_URL=postgresql://...   (Supabase / Postgres)

Contract: docs/adr/0015-prod-scheduler-cloud-run.md. Deployed on Cloud Run behind IAM; only
NestJS calls it, so this service does no auth of its own.

Note: "APS" elsewhere in this repo usually means Autodesk Platform Services (BIM viewer).
This service is the production *scheduler*; NestJS ScheduleService reads what it writes.
"""
from __future__ import annotations
import logging
from typing import Literal, Optional

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from .db import to_local
from .errors import DataNotReady, RunInProgress
from .solver import engine

log = logging.getLogger(__name__)
app = FastAPI(title="SSI Production Scheduler", version="0.3.0")


class CompareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dispatch_rule: Literal["EDD", "CR", "SPT", "FIFO"] = "EDD"
    now: Optional[AwareDatetime] = None   # ISO-8601 with offset; converted to naive Asia/Bangkok
    requested_by: str = Field("prod-scheduler", max_length=120)


class ScheduleRequest(CompareRequest):
    direction: Literal["event", "backward", "forward", "alap"] = "backward"
    activate: bool = False
    persist: bool = True   # activate only takes effect when persist is true


@app.exception_handler(RunInProgress)
def _run_in_progress(_request, _exc):
    return JSONResponse(status_code=409, content={
        "code": "run_in_progress", "message": "another scheduler run is in progress; retry when it finishes"})


@app.exception_handler(DataNotReady)
def _data_not_ready(_request, exc: DataNotReady):
    return JSONResponse(status_code=422, content={
        "code": "data_not_ready", "message": "scheduler input data is not ready; nothing was written",
        "reasons": exc.reasons})


@app.exception_handler(Exception)
def _internal(_request, exc: Exception):
    log.exception("scheduler failed", exc_info=exc)   # details stay in the server log, never the body
    return JSONResponse(status_code=500, content={"code": "internal", "message": "scheduler failed"})


@app.get("/health")
def health():
    return {"status": "ok", "service": "prod-scheduler"}


@app.post("/schedule")
def schedule(req: ScheduleRequest):
    """Run the scheduler and (optionally) persist to prod_schedule.

    activate=true also makes the written version the single active one (what the
    BDT app shows via GET /schedule/versions/active).
    Returns KPIs (feasibility, makespan, tardiness, late count), per-line load and the version written.
    """
    return engine.run(direction=req.direction, dispatch_rule=req.dispatch_rule,
                      now=to_local(req.now) if req.now else None, persist=req.persist,
                      activate=req.activate and req.persist, requested_by=req.requested_by)


@app.post("/schedule/compare")
def compare(req: CompareRequest):
    """Run backward and event-based in memory and return KPIs side by side. Never writes."""
    now = to_local(req.now) if req.now else engine.default_now()
    kw = dict(dispatch_rule=req.dispatch_rule, now=now, persist=False, requested_by=req.requested_by)
    return {"backward": engine.run(direction="backward", **kw),
            "event_based": engine.run(direction="event", **kw)}
