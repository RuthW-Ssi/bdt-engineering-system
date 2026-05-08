# ADR-0012 — JWT Dev-Mode Auth Strategy

**Date:** 2026-05-08
**Status:** Accepted
**Sprint:** 6 (Auth dev mode + PM Foundation)

---

## Context

Sprint 6 introduced auth to replace the `x-user-id` stub header used since Sprint 1.
Two options existed: (a) implement Azure AD MSAL immediately (the intended production strategy),
or (b) ship a standalone JWT dev mode first, with Azure AD planned for Sprint 7+.

Azure AD MSAL requires SSI IT approval for app registration — not yet obtained when Sprint 6 started.

---

## Decision

Ship standalone JWT (HS256) auth in dev mode only.

- `AuthService` throws `ForbiddenException` when `NODE_ENV !== 'development'`.
- `POST /api/v1/auth/login` accepts `login + password`, returns a signed JWT with `sub` and `role` claims.
- All other endpoints require `Authorization: Bearer <token>` via `JwtAuthGuard`.
- Password stored as bcrypt hash; admin user seeded from `ADMIN_SEED_PASSWORD` env var.
- Role field reserved in JWT payload; per-route RBAC deferred to Sprint 7.

---

## Consequences

- Frontend and all API consumers can develop against real auth without waiting for Azure AD approval.
- Production is blocked by the `ForbiddenException` guard until Azure AD is wired up.
- Tech debt: JWT rotation strategy is manual for now; Sprint 7+ scope.

---

## See also

- Implementation detail: [wiki/features/jwt-rbac.md](../../knowledge-base/projects/bdt-engineering-system/wiki/features/jwt-rbac.md)
- Azure AD decision pending: [wiki/tech/frontend/decisions.md](../../knowledge-base/projects/bdt-engineering-system/wiki/tech/frontend/decisions.md)
