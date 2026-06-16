-- T-WO.04 · BOM Version Alert needs an audit event when a new BOM version is accepted.
-- Additive enum value. ADD VALUE IF NOT EXISTS is idempotent (PG12+); must NOT be wrapped
-- in a DO/PL-pgSQL block (ALTER TYPE ADD VALUE cannot run inside a function body).
ALTER TYPE "WoEventType" ADD VALUE IF NOT EXISTS 'ACCEPT_VERSION';
