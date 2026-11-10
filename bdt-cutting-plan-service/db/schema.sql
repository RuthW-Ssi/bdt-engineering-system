-- Cutting Plan tables — reference schema
--
-- Mirrors the 4 Google Sheet tabs the legacy service (bdt-cuttingplan-etl-v3)
-- currently writes to, one spreadsheet (config.SHEET_ID), 4 tabs:
-- nesting, order_part, plate_usage, remnants.
--
-- This file is NOT applied by the cutting-plan-api service itself — the API
-- stays stateless and returns JSON (see docs/superpowers/specs/
-- 2026-07-14-cuttingplan-api-service-design.md, §5/§6/§8a). It's a reference
-- for bdt-app's own Prisma schema / Supabase project. Table names, prefixes,
-- and constraints here are a starting point — bdt-app's team may adapt them
-- (e.g. prefix with `cutting_plan_`) to fit their own conventions.
--
-- Column derivation source: etl_cuttingplan.py (store_dataframes,
-- reorganize_columns, add_project_info) + app_process.py (add_id,
-- append_sheets). No foreign keys between tables, matching the legacy
-- Sheet's flat/denormalized shape — `cuttingplan_number` is a plain
-- correlation column, not an enforced relationship.

-- ============================================================
-- nesting — merge of NESTING + Used Material + Machine Times
-- sections (joined on cuttingplan_number in the legacy ETL)
-- ============================================================
create table if not exists nesting (
    id                  bigint generated always as identity primary key,

    -- project metadata (present on every table)
    file_id             text not null,
    project_code        text not null,
    project_name        text not null,
    tag                 text,
    description         text,
    version             text,
    revision            text,

    -- NESTING section
    nc_file             text,
    need_date           text,
    nesting_length_mm   numeric,
    nesting_width_mm    numeric,
    changer             text,
    gen_date            text,
    gen_time            text,
    technology          text,

    -- Used Material section
    article_number      text,
    count               numeric,
    plate_number        text,
    charge               text,
    quality             text,
    thick_mm            numeric,
    width_mm            numeric,
    length_mm           numeric,
    area_m2             numeric,
    weight_kg           numeric,
    nesting_percent     numeric,

    cuttingplan_number  text,

    -- Machine Times section
    path_type           text,
    time_min            numeric,
    quantity            numeric,
    start_time_min      numeric,
    total_time_min      numeric,

    created_at          timestamptz not null default now()
);

-- ============================================================
-- order_part — Orders section
-- ============================================================
create table if not exists order_part (
    id                          bigint generated always as identity primary key,

    file_id                     text not null,
    project_code                text not null,
    project_name                text not null,
    tag                         text,
    description                 text,
    version                     text,
    revision                    text,

    tag_part                    text,
    order_number                text,
    item                        text,
    nested                      numeric,
    ordered                     numeric,
    due_date                    text,
    drawing_part_no_version_no  text,
    length_mm                   numeric,
    width_mm                    numeric,
    weight_kg                   numeric,

    cuttingplan_number          text,

    created_at                  timestamptz not null default now()
);

-- ============================================================
-- plate_usage — Plate usage per order in kg section
-- ============================================================
create table if not exists plate_usage (
    id                  bigint generated always as identity primary key,

    file_id             text not null,
    project_code        text not null,
    project_name        text not null,
    tag                 text,
    description         text,
    version             text,
    revision            text,

    order_number        text,
    net_kg              numeric,
    gross_kg            numeric,

    cuttingplan_number  text,

    created_at          timestamptz not null default now()
);

-- ============================================================
-- remnants — Remnants section (optional; a submission with no
-- remnants data produces zero rows here, not a table-level NULL)
-- ============================================================
create table if not exists remnants (
    id                  bigint generated always as identity primary key,

    file_id             text not null,
    project_code        text not null,
    project_name        text not null,
    tag                 text,
    description         text,
    version             text,
    revision            text,

    plate_number        text,
    length_mm           numeric,
    width_mm            numeric,
    area_m2             numeric,
    weight_kg           numeric,
    count               numeric,
    ref_plate           text,
    ref_plate_seq       text,

    cuttingplan_number  text,

    created_at          timestamptz not null default now()
);

create index if not exists idx_nesting_file_id     on nesting (file_id);
create index if not exists idx_order_part_file_id  on order_part (file_id);
create index if not exists idx_plate_usage_file_id on plate_usage (file_id);
create index if not exists idx_remnants_file_id    on remnants (file_id);
