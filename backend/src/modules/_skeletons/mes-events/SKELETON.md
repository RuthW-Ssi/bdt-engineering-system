# 🟡 SKELETON — `mes-events` (Sprint 7)

**Tag:** 🟥 BDT-custom (event sourcing pattern)
**Practice basis:** ISA-95 Operations Performance · Siemens Opcenter Execution event model

## Why this exists as a skeleton

Sprint 5 `mrp.workorder.duration` is set imperatively (start/finish). For real MES, an **append-only event stream** is required so that:

- Multiple sources can report (scanner, button-on-machine, operator tablet, IoT sensor)
- Events have device timestamp + server receive timestamp (for clock-skew analysis)
- OEE can be reconstructed retroactively from raw events
- Telemetry survives WO state changes

Schema in `prisma/schema.skeleton.prisma` Section 9.

## Sprint 7 implementation checklist

- [ ] Migration: `mes_shop_floor_event` (BIGSERIAL — high-volume table)
- [ ] Partition by month (Postgres declarative partition)
- [ ] Ingest endpoint: `POST /mes/events` (high-throughput, no validation in critical path)
- [ ] Async projector: every 30 sec → update `mrp_workorder` aggregates from new events
- [ ] Real-time SSE/WebSocket: stream events to FE shop-floor dashboard
- [ ] OEE recompute job: nightly, recomputes WC OEE from last-30d events
- [ ] FE: live shop-floor dashboard (per-WC tile with current WO + qty + downtime alert)

## Event types

- `wo_start` — operator scanned WO barcode
- `wo_pause` / `wo_resume` — break, material wait, etc.
- `wo_done` — completion + final qty report
- `qty_report` — interim qty (every N parts)
- `scrap` — qty + reason
- `downtime` — paired start/end with loss_id
- `setup_start` / `setup_done` — changeover
