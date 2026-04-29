-- Sprint 4.3 RT48/RT49: Layer-1 history tables + DB triggers
-- Append-only audit snapshots captured on UPDATE/DELETE of parent rows

-- ────────────────────────────────────────────────────────────
-- RT48: Create 3 history tables
-- ────────────────────────────────────────────────────────────

CREATE TABLE "routing_template_history" (
    "id"             SERIAL PRIMARY KEY,
    "template_id"    INT NOT NULL REFERENCES "routing_template"("id") ON DELETE CASCADE,
    "version"        VARCHAR(20) NOT NULL,
    "snapshot"       JSONB NOT NULL,
    "changed_by_uid" INT NOT NULL REFERENCES "res_users"("id"),
    "changed_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "eco_id"         INT,
    "reason"         TEXT
);
CREATE INDEX "routing_template_history_template_id_changed_at_idx"
    ON "routing_template_history"("template_id", "changed_at");
CREATE INDEX "routing_template_history_eco_id_idx"
    ON "routing_template_history"("eco_id");

CREATE TABLE "routing_activity_template_history" (
    "id"                   SERIAL PRIMARY KEY,
    "activity_template_id" INT NOT NULL REFERENCES "routing_activity_template"("id") ON DELETE CASCADE,
    "version"              VARCHAR(20) NOT NULL,
    "snapshot"             JSONB NOT NULL,
    "changed_by_uid"       INT NOT NULL REFERENCES "res_users"("id"),
    "changed_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "eco_id"               INT,
    "reason"               TEXT
);
CREATE INDEX "routing_activity_template_history_activity_template_id_changed_at_idx"
    ON "routing_activity_template_history"("activity_template_id", "changed_at");
CREATE INDEX "routing_activity_template_history_eco_id_idx"
    ON "routing_activity_template_history"("eco_id");

CREATE TABLE "product_routing_override_history" (
    "id"                   SERIAL PRIMARY KEY,
    "override_id"          INT NOT NULL,
    "product_id"           INT NOT NULL,
    "activity_template_id" INT NOT NULL,
    "snapshot"             JSONB NOT NULL,
    "action"               VARCHAR(20) NOT NULL,
    "changed_by_uid"       INT NOT NULL REFERENCES "res_users"("id"),
    "changed_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "eco_id"               INT
);
CREATE INDEX "product_routing_override_history_product_id_changed_at_idx"
    ON "product_routing_override_history"("product_id", "changed_at");
CREATE INDEX "product_routing_override_history_activity_template_id_changed_at_idx"
    ON "product_routing_override_history"("activity_template_id", "changed_at");
CREATE INDEX "product_routing_override_history_eco_id_idx"
    ON "product_routing_override_history"("eco_id");

-- ────────────────────────────────────────────────────────────
-- RT49: DB triggers — write snapshot BEFORE UPDATE / DELETE
-- ────────────────────────────────────────────────────────────

-- routing_template: capture on UPDATE (changed_by_uid = OLD.write_uid)
CREATE OR REPLACE FUNCTION trg_routing_template_history_fn()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO routing_template_history (template_id, version, snapshot, changed_by_uid, changed_at, reason)
  VALUES (OLD.id, OLD.version, to_jsonb(OLD), OLD.write_uid, NOW(), 'auto-history on update');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_routing_template_history
  BEFORE UPDATE ON routing_template
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION trg_routing_template_history_fn();

-- routing_activity_template: capture on UPDATE
CREATE OR REPLACE FUNCTION trg_routing_activity_template_history_fn()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO routing_activity_template_history (activity_template_id, version, snapshot, changed_by_uid, changed_at, reason)
  VALUES (OLD.id, OLD.version, to_jsonb(OLD), OLD.write_uid, NOW(), 'auto-history on update');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_routing_activity_template_history
  BEFORE UPDATE ON routing_activity_template
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION trg_routing_activity_template_history_fn();

-- product_routing_override: capture on UPDATE (action='update')
CREATE OR REPLACE FUNCTION trg_product_routing_override_update_fn()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO product_routing_override_history
    (override_id, product_id, activity_template_id, snapshot, action, changed_by_uid, changed_at, eco_id)
  VALUES
    (OLD.id, OLD.product_id, OLD.activity_template_id, to_jsonb(OLD), 'update', OLD.write_uid, NOW(), OLD.eco_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_routing_override_update
  BEFORE UPDATE ON product_routing_override
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION trg_product_routing_override_update_fn();

-- product_routing_override: capture on DELETE (action='delete')
CREATE OR REPLACE FUNCTION trg_product_routing_override_delete_fn()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO product_routing_override_history
    (override_id, product_id, activity_template_id, snapshot, action, changed_by_uid, changed_at, eco_id)
  VALUES
    (OLD.id, OLD.product_id, OLD.activity_template_id, to_jsonb(OLD), 'delete', OLD.write_uid, NOW(), OLD.eco_id);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_routing_override_delete
  BEFORE DELETE ON product_routing_override
  FOR EACH ROW
  EXECUTE FUNCTION trg_product_routing_override_delete_fn();
