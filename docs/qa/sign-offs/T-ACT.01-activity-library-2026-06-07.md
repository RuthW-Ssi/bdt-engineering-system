# Release Sign-off — T-ACT.01 Activity Library

**Date:** 2026-06-07  
**Sprint:** Sprint 11  
**Branch:** dev-t-activity-library → pushed to remote  
**Author:** Apisit Kulkham (Tao)

## Release Gate Result: WARN / PASS

No Critical or High findings. 5 Medium/Low findings — all accepted for internal deployment.

### QA Findings
| ID | Severity | Finding | Decision |
|---|---|---|---|
| QA-1 | Medium | No resource-type guard in validateMachine/resolveLabors | Accepted — defer to Sprint 11b |
| QA-2 | Low | Fractional duration display (cosmetic) | Resolved — total duration pill removed |
| QA-3 | Low | useUpdateActivity(0) on create page (guarded by isEdit) | Accepted — harmless |

### Security Findings
| ID | Severity | Finding | Decision |
|---|---|---|---|
| SEC-1 | Medium | No ownership check on DELETE (shared dataset, staff-only) | Accepted — no user-ownership semantics |
| SEC-2 | Low | No MaxLength on query param q | Accepted — internal tool, bounded by take:500 |

## What Shipped
- 4 DB tables: activity, activity_consume, activity_code_seq, activity_labor (with qty)
- 5 REST endpoints (all JWT-guarded): GET /activities, GET /activities/:id, POST, PATCH, DELETE
- Concurrency-safe ACT-XXXXX code generator (FOR UPDATE transaction)
- ActivityLibraryList: green Clock duration pill, Labor ×qty column
- ActivityBuilder: 2-card form (Activity Details + Resources: Machine+Materials+Labor)
- LaborPicker: multi-select with qty stepper (min 1)
- 17 seed production activities covering all Operation Library operations

## Next Task
T-ACT.02 (Drop Sprint 4 routing chain) — unblocked, ready to begin
