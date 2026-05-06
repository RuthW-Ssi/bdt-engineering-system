# Sprint Planning — 2026-05-06

**Type:** raw meeting notes (do not edit, do not delete)
**Attendees:** BDT team (Lead, FE×2, BE×2, QA), Khun Anong (Hot Mill PM),
Khun Somchai (VP Ops, joined 30 min)
**Duration:** 90 min

---

## Agenda
1. Sprint 13 demo recap
2. Sprint 14 scope
3. Phase 2 dashboard discussion (Khun Somchai)
4. AOB

## Notes (verbatim-ish)

**Sprint 13 recap**
- Email notification feature shipped to staging. Khun Anong tested for 3
  shifts.
- 2 incidents: notifications delayed >10 min twice. Vendor (Acme) not yet
  responding to root cause query.

**Khun Anong feedback on dashboard (Phase 1 in production)**
- "Dashboard ดีมาก แต่ขอเพิ่ม **scrap rate** ด้วย ตอนนี้ต้องเปิดอีก 2 หน้าจอ"
- Refresh feels "ไม่ทันใจ" — wants tighter than current 60s. Asked: "เร็วได้ขนาดไหน?"
  - BE Lead: 15s feasible, 5s would need WebSocket rewrite.
  - **No decision recorded.** ← OPEN QUESTION
- Pain: shift handover at 06:00 still uses paper because dashboard read-only.
  Wants "shift note" field.

**Khun Somchai — Phase 2 scope (entered 14:30)**
- Approves Phase 2 with these in-scope:
  1. Scrap rate metric (Khun Anong's request).
  2. Cold Mill rollout (currently Hot Mill only).
  3. Shift note (write, not just read).
- Out of scope for Phase 2: predictive analytics, mobile app.
- Budget: confirmed within current capex line.
- Timeline: target Phase 2 GA by end Q3 2026.

**Sprint 14 scope (decided)**
- Investigate Acme notification delay (BE).
- Spike: scrap rate data source — is it in SAP or MES? (BE+Integration).
- Design exploration: shift note UX (FE+UX).
- No production releases planned this sprint.

**AOB**
- Khun Niran requested status update memo by 2026-05-15.

---

_Recorded by: BDT PM_
_Linked from wiki: [[../../wiki/features/dashboard]],
[[../../../../bdt-core/wiki/people/stakeholders#khun-anong]]_
