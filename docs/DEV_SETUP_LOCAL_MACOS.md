# BDT App — Local Dev Setup (macOS, ไม่ใช้ Docker)

> **ℹ️ ไม่ใช้ Cloud SQL แล้ว (2026-05-20):** Cloud SQL ถูกเลิกใช้ — local dev กลับมาใช้
> **Docker Compose Postgres** เป็นหลัก, staging = **Supabase**. ภาพรวม infra ปัจจุบัน: wiki `ops/infra.md`.
> ไฟล์นี้คือคู่มือ local Postgres แบบ **ไม่ใช้ Docker** (ทางเลือกสำหรับ offline/ไม่มี Docker).
> (`docs/onboarding/dev-setup.md` = Cloud SQL onboarding เดิม — historical)

> **Audience:** Dev เครื่องใหม่ที่ยังไม่มีอะไรเลย — เริ่มจาก clean macOS ไปจนถึงรัน frontend + backend ได้พร้อม data ครบ
> **Stack:** NestJS 10 + Prisma 6 + Postgres 16 + React 19 + Vite + pnpm
> **Estimated time:** 30–45 นาที (ขึ้นอยู่กับเน็ตและขนาด dump)

---

## ภาพรวม sync data ที่ต้องทำ

| ส่วน | เครื่องมือ | ใช้ git? |
|---|---|---|
| 🟦 Source code | git clone/pull | ✅ |
| 🟦 Dependencies | pnpm install | ❌ (ติดตั้งจาก lockfile) |
| 🟨 Environment vars (`.env`) | scp / 1Password | ❌ git ignore |
| 🟥 Database (Postgres) | pg_dump + pg_restore | ❌ ต้อง dump แยก |
| 🟥 Uploaded files (`storage/`) | rsync | ❌ ต้อง copy แยก |

> **🟦 Standard / 🟨 Hybrid / 🟥 Custom** — ส่วน 🟥 คือสิ่งที่ git pull เฉยๆ ไม่พอ ต้องใช้คำสั่งเสริม

### Data inventory — ตารางอะไรมาจาก source ไหน

⚠️ **สำคัญมาก:** "data ครบ" ในโปรเจกต์นี้ต้องการ **3 source แยกกัน** — ขาดส่วนใดส่วนหนึ่งจะมี table เปล่า

| Source | เติมตารางเหล่านี้ | คำสั่ง |
|---|---|---|
| **1. `prisma:seed`** | res_users, uom_*, account_account, product_category, mark_prefix_master, tekla_prefix_mapping, steel_grade, project (0X202), product_code_seq, part_code_seq, products (12 STD templates) | `pnpm prisma:seed` |
| **2. `import:routing-xlsx`** | mrp_workcenter (4), routing_formula_param (~19), routing_activity_template (~41) | `pnpm import:routing-xlsx` |
| **2b. `seed:routing`** | routing_template (3: Main/Accessory/False), routing_template_binding_rule (5) | `pnpm seed:routing` |
| **3. `import:odoo`** | materials (จริง), products (จริง — ไม่ใช่แค่ template) | `pnpm import:odoo` |
| **4. UI / pg_dump เท่านั้น** | product_bom, product_bom_line, shop_drawing, drawing_revision, file_storage, routing_op_activity, product_routing_override, custom_routing, routing_template_history, routing_activity_template_history, product_routing_override_history, routing_template_test_fixture | ❌ Path B ไม่มีทาง seed — ต้อง pg_restore หรือสร้างผ่าน UI |

**สรุป Path B (fresh setup) จะได้:**
- ✅ Master data + UoM + ผังบัญชี + steel grade + 12 product templates
- ✅ Work center + formula params + activity templates
- ✅ Materials + Products จริง (ถ้ามี xlsx ที่ import:odoo อ่าน)
- ❌ **ไม่มี:** BOM lines, shop drawings, custom routing (Sprint 4.2), history records + fixtures (Sprint 4.3)

---

## 0. Prerequisites — ติดตั้ง tooling บน macOS

### 0.1 Homebrew (package manager)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

ตรวจสอบ:
```bash
brew --version
```

### 0.2 Node.js 20 LTS + pnpm

```bash
brew install node@20
brew install pnpm
```

ตรวจสอบ:
```bash
node -v   # ควรขึ้น v20.x
pnpm -v   # ควรขึ้น 9.x หรือสูงกว่า
```

### 0.3 PostgreSQL 16

```bash
brew install postgresql@16
brew services start postgresql@16
```

เพิ่ม path ของ pg client tools (เผื่อ `psql`, `pg_dump` ไม่อยู่ใน PATH):

```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

ตรวจสอบ:
```bash
psql --version    # PostgreSQL 16.x
pg_isready        # accepting connections
```

### 0.4 Git + DBeaver (optional)

```bash
brew install git
brew install --cask dbeaver-community   # GUI ดู DB (optional)
```

---

## 1. Clone source code

```bash
cd ~/Desktop
git clone <repo-url> bdt-app
cd bdt-app
git checkout main      # หรือ branch ที่ต้องการ
```

---

## 2. ติดตั้ง dependencies

โปรเจกต์นี้ใช้ **pnpm** (มี `pnpm-lock.yaml` ทั้ง root และ `backend/`):

```bash
# Frontend (root)
pnpm install

# Backend
cd backend
pnpm install
cd ..
```

> ⚠️ **อย่าใช้ `npm install`** จะไม่อ่าน `pnpm-lock.yaml` ทำให้ได้ dependency tree ผิด

---

## 3. ตั้งค่า environment variables (.env)

### 3.1 Backend `.env`

```bash
cd backend
cp .env.example .env
```

แก้ `.env` ให้ตรงกับ Postgres ในเครื่อง — ค่าที่ใช้ใน BDT (default):

```ini
DATABASE_URL="postgresql://bdt:bdt_pass@localhost:5432/bdt?schema=public"
PORT=3000
NODE_ENV=development

# File storage (Sprint 3+ shop drawings)
FILE_STORAGE_DRIVER=local
FILE_STORAGE_LOCAL_PATH=./storage
```

### 3.2 ขอ secret values จาก dev ต้นทาง

ค่าที่ **ห้ามเก็บใน git** — ขอจาก dev เดิมผ่าน 1Password / Bitwarden / scp (ห้ามส่งใน chat/email):

- `DATABASE_URL` — ถ้าใช้ password อื่น
- `JWT_SECRET` — **required** (Sprint 6 เพิ่ม auth แล้ว — ไม่มีค่านี้ backend start ไม่ได้)
- `ADMIN_SEED_PASSWORD` — **required** (Sprint 6) — password ของ admin user ที่ seed ลง DB
- SMTP creds — ถ้าใช้งาน `mail_message`

---

## 4. ตั้งค่า PostgreSQL — สร้าง user + database

เปิด `psql` แล้วรัน:

```bash
psql postgres
```

ใน psql prompt:

```sql
CREATE USER bdt WITH PASSWORD 'bdt_pass';
CREATE DATABASE bdt OWNER bdt;
GRANT ALL PRIVILEGES ON DATABASE bdt TO bdt;
\q
```

ตรวจสอบ connect ได้:

```bash
psql -h localhost -U bdt -d bdt -c "SELECT version();"
```

---

## 5. Sync ข้อมูล — เลือก 1 ใน 2 path

### Path A — มี dump จากเครื่องต้นทาง (แนะนำสำหรับ dev จริง)

ใช้กรณีต้องการข้อมูลจริงครบทุก sprint (materials, products, BOM, drawings, routing)

#### 5A.1 ดึง dump จากเครื่องต้นทาง

ที่เครื่องต้นทางรัน:

```bash
pg_dump -h localhost -U bdt -d bdt -F c -f bdt_full.dump
```

ส่งไฟล์ `bdt_full.dump` ผ่าน scp / AirDrop / NAS ไปที่เครื่องใหม่

#### 5A.2 Restore ที่เครื่องใหม่

```bash
pg_restore -h localhost -U bdt -d bdt --clean --if-exists --no-owner bdt_full.dump
```

#### 5A.3 Sync `storage/` folder (uploaded drawings)

ตาราง `file_storage` เก็บแค่ metadata — ไฟล์จริงอยู่ใน `backend/storage/`:

```bash
rsync -avz --progress user@source-host:/path/to/bdt-app/backend/storage/ \
  ~/Desktop/bdt-app/backend/storage/
```

ถ้าไม่ sync folder นี้ → record ใน DB จะมี แต่เปิด/preview drawing ไม่ได้

---

### Path B — เริ่มจาก fresh schema + seed + xlsx import

ใช้กรณีต้องการ data ที่ derive ได้จาก xlsx ใน `document/` — ครบทุก source ยกเว้น BOM/drawing

⚠️ **ต้องรันให้ครบทั้ง 5 step** — ขาด step ไหนตารางที่ตรงกับ step นั้นจะเปล่า:

```bash
cd backend

# Step 1 — schema ล่าสุด
pnpm prisma migrate deploy

# Step 2 — master data (UoM, account, category, mark_prefix, steel_grade,
#          project 0X202, 12 standard product templates)
pnpm prisma:seed

# Step 3 — routing xlsx data (Sprint 4)
#          จาก document/process routing.xlsx
#          → 4 mrp_workcenter, ~19 routing_formula_param, ~41 routing_activity_template
pnpm import:routing-xlsx

# Step 3b — routing templates + binding rules (Sprint 4.2)
#           → 3 routing_template (Main / Accessory / False), 5 binding rules
#           → rebind products ที่ product_code = CUS-00001 → Main template
pnpm seed:routing

# Step 4 — materials + products จริง (ไม่ใช่ template)
#          จาก document/odoo-material-template.xlsx + odoo-product-template.xlsx
pnpm import:odoo
```

**เช็คหลังแต่ละ step ว่า data เข้าจริง:**

```bash
psql -h localhost -U bdt -d bdt -c "
SELECT 'After seed:' AS step, COUNT(*) FROM mark_prefix_master      -- ควรได้ 28
UNION ALL SELECT 'After routing-xlsx:', COUNT(*) FROM routing_activity_template  -- ควรได้ ~41
UNION ALL SELECT 'After seed:routing:', COUNT(*) FROM routing_template          -- ควรได้ 3
UNION ALL SELECT 'After odoo:', COUNT(*) FROM materials              -- ควรได้ > 0
;"
```

> ⚠️ Path B **ไม่มี:** product_bom, product_bom_line, shop_drawing, drawing_revision, file_storage, Sprint 4.2 routing tables — ต้องสร้างผ่าน UI หรือใช้ Path A

---

## 6. รัน dev server

เปิด 2 terminal tabs:

### Tab 1 — Backend (NestJS, port 3000)

```bash
cd backend
pnpm prisma generate     # generate Prisma Client (จำเป็นทุกครั้งหลัง pull schema เปลี่ยน)
pnpm start:dev
```

ควรเห็น:
```
[Nest] Nest application successfully started
🚀 Server listening on http://localhost:3000
```

### Tab 2 — Frontend (Vite, port 5173)

```bash
cd ~/Desktop/bdt-app
pnpm dev
```

ควรเห็น:
```
VITE v8.x  ready in xxx ms
➜  Local:   http://localhost:5173/
```

Vite proxy ตั้งไว้แล้ว — call `/api/*` จะถูก forward ไปที่ `localhost:3000` อัตโนมัติ (ดู `vite.config.ts`)

---

## 7. Smoke test — เช็คว่า data ครบ

เปิด `psql` แล้วเช็ค row count เทียบกับเครื่องต้นทาง:

```sql
SELECT 'materials' AS tbl, COUNT(*) FROM materials
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'product_bom', COUNT(*) FROM product_bom
UNION ALL SELECT 'product_bom_line', COUNT(*) FROM product_bom_line
UNION ALL SELECT 'shop_drawing', COUNT(*) FROM shop_drawing
UNION ALL SELECT 'drawing_revision', COUNT(*) FROM drawing_revision
UNION ALL SELECT 'file_storage', COUNT(*) FROM file_storage
UNION ALL SELECT 'mrp_workcenter', COUNT(*) FROM mrp_workcenter
UNION ALL SELECT 'mrp_routing_workcenter', COUNT(*) FROM mrp_routing_workcenter
UNION ALL SELECT 'routing_activity_template', COUNT(*) FROM routing_activity_template
UNION ALL SELECT 'routing_formula_param', COUNT(*) FROM routing_formula_param
-- Sprint 4.2 tables
UNION ALL SELECT 'routing_op_activity', COUNT(*) FROM routing_op_activity
UNION ALL SELECT 'product_routing_override', COUNT(*) FROM product_routing_override
UNION ALL SELECT 'custom_routing', COUNT(*) FROM custom_routing
-- Sprint 4.3 tables
UNION ALL SELECT 'routing_template_history', COUNT(*) FROM routing_template_history
UNION ALL SELECT 'override_history', COUNT(*) FROM product_routing_override_history
UNION ALL SELECT 'test_fixtures', COUNT(*) FROM routing_template_test_fixture
-- Sprint 6 tables
UNION ALL SELECT 'customers (res_partner)', COUNT(*) FROM res_partner
UNION ALL SELECT 'users (res_users)', COUNT(*) FROM res_users
UNION ALL SELECT 'sub_zone', COUNT(*) FROM sub_zone;
```

เปิด UI ที่ `http://localhost:5173` แล้วทดสอบ:
- ✅ List materials โหลดได้
- ✅ List products โหลดได้
- ✅ คลิกดู BOM ของ product ใดๆ — เห็น lines
- ✅ คลิก preview shop drawing — เปิดไฟล์ได้ (ถ้าทำขั้น 5A.3)

---

## Troubleshooting

### ❌ `pnpm install` แล้วช้ามาก / ค้าง

ลบ store cache แล้วลองใหม่:
```bash
pnpm store prune
rm -rf node_modules backend/node_modules
pnpm install && cd backend && pnpm install
```

### ❌ `psql: error: connection refused`

Postgres ยังไม่ start:
```bash
brew services restart postgresql@16
pg_isready    # ต้องขึ้น "accepting connections"
```

### ❌ `password authentication failed for user "bdt"`

User ยังไม่ถูกสร้าง หรือ password ไม่ตรงกับ `.env`:
```bash
psql postgres -c "ALTER USER bdt WITH PASSWORD 'bdt_pass';"
```

### ❌ `Error: P3009 migrate found failed migrations`

มี migration เก่าค้างใน state failed:
```bash
cd backend
pnpm prisma migrate resolve --rolled-back <migration_name>
pnpm prisma migrate deploy
```

หรือ reset ทั้ง DB (ระวัง! ลบ data ทั้งหมด):
```bash
pnpm prisma migrate reset --force
```

### ❌ `Prisma Client validation` หลัง git pull

Schema เปลี่ยนแต่ Prisma Client ยังเก่า:
```bash
cd backend
pnpm prisma generate
```

### ❌ Port 3000 / 5173 ถูกใช้อยู่

หา process ที่ใช้ port:
```bash
lsof -i :3000
lsof -i :5173
kill -9 <PID>
```

หรือเปลี่ยน port:
- Backend: แก้ `PORT=3001` ใน `backend/.env`
- Frontend: `pnpm dev --port 5174`

### ❌ Frontend เรียก `/api/*` แล้วได้ 404

เช็คว่า backend รันอยู่จริง:
```bash
curl http://localhost:3000/api/healthz    # ควรได้ JSON response
```

ถ้า backend port ไม่ใช่ 3000 ต้องแก้ `vite.config.ts` ให้ตรง

### ❌ Preview shop drawing แล้วได้ "File not found"

`file_storage` table มี record แต่ไฟล์จริงไม่อยู่:
```bash
ls -la backend/storage/    # ควรมี folders ตาม UUID
```

ถ้าว่าง — ทำขั้น 5A.3 (rsync `storage/`) อีกครั้ง

### ❌ `Permission denied` ตอนเขียนไฟล์ลง `backend/storage/`

```bash
chmod -R u+rw backend/storage/
```

### ❌ `pg_restore` แจ้ง `role "bdt" does not exist`

ทำขั้น 4 ก่อน (สร้าง user `bdt`) แล้วค่อย restore — หรือใช้ flag `--no-owner`:
```bash
pg_restore -h localhost -U postgres -d bdt --no-owner --clean bdt_full.dump
```

### ❌ Migration ล่าสุด pending หลัง restore dump เก่า

Dump มาจากเครื่องที่ schema เก่ากว่า:
```bash
cd backend
pnpm prisma migrate deploy   # apply migration ที่ใหม่กว่า dump
```

### ❌ Data ไม่ครบหลัง setup — เช็คว่าขั้นไหนหาย

อาการ: ตารางบางตารางเปล่า เช่น routing template ไม่มี / materials ไม่ขึ้น

**1. Diagnostic query** — เช็คว่า data หายขั้นไหน:

```sql
psql -h localhost -U bdt -d bdt
```

```sql
SELECT 'STEP 2 (seed)' AS step, COUNT(*) AS count, 28 AS expected FROM mark_prefix_master
UNION ALL SELECT 'STEP 2 (seed)',  COUNT(*), 12  FROM products WHERE product_code LIKE 'STD-%'
UNION ALL SELECT 'STEP 3 (routing-xlsx)', COUNT(*), 4   FROM mrp_workcenter
UNION ALL SELECT 'STEP 3 (routing-xlsx)', COUNT(*), 19  FROM routing_formula_param
UNION ALL SELECT 'STEP 3 (routing-xlsx)', COUNT(*), 41  FROM routing_activity_template
UNION ALL SELECT 'STEP 3b (seed:routing)', COUNT(*), 3  FROM routing_template
UNION ALL SELECT 'STEP 3b (seed:routing)', COUNT(*), 5  FROM routing_template_binding_rule
UNION ALL SELECT 'STEP 4 (import:odoo)',  COUNT(*), 0   FROM materials;  -- > 0 ถ้า odoo xlsx มี
```

**2. แปลผล + แก้:**

| ผลลัพธ์ | สาเหตุ | แก้ |
|---|---|---|
| Step 2 count = 0 | ลืมรัน seed | `cd backend && pnpm prisma:seed` |
| Step 3 count = 0 | ลืมรัน routing import | `cd backend && pnpm import:routing-xlsx` |
| Step 3 templates ตัวเลขแปลกๆ (เช่น 82) | bug: รัน import:routing-xlsx ซ้ำ → duplicate | ดูเคส "routing template ซ้ำ" ด้านล่าง |
| Step 3b count = 0 | ลืมรัน seed:routing | `cd backend && pnpm seed:routing` |
| Step 4 count = 0 | ลืมรัน odoo import | `cd backend && pnpm import:odoo` |

### ❌ routing template ซ้ำ / มีจำนวนเกินคาด (bug ใน import-routing-xlsx)

`import-routing-xlsx.ts` ใช้ `prisma.routing_activity_template.create()` ไม่ใช่ upsert ฉะนั้น **รัน 2 รอบ = 82 records แทนที่จะเป็น 41**

**แก้ชั่วคราว:** clear ตารางก่อนรันใหม่
```bash
psql -h localhost -U bdt -d bdt -c "TRUNCATE routing_activity_template RESTART IDENTITY CASCADE;"
cd backend && pnpm import:routing-xlsx
```

> 🐛 **TODO:** แก้ script ให้ใช้ upsert จริง

### ❌ `pnpm import:routing-xlsx` หรือ `import:odoo` แจ้ง "ENOENT: no such file"

ไฟล์ xlsx หาย (ปกติอยู่ใน `document/` ของ repo):
```bash
ls -la document/process\ routing.xlsx
ls -la document/odoo-material-template.xlsx
ls -la document/odoo-product-template.xlsx

# ถ้าหายและ git track อยู่ — restore จาก git
cd ~/Desktop/bdt-app
git checkout HEAD -- "document/process routing.xlsx"
```

### ❌ `import:odoo` แจ้ง `No seq row for prefix XXXXX`

`part_code_seq` ยังไม่ initialize → ต้องรัน seed ก่อน:
```bash
cd backend
pnpm prisma:seed       # initialize part_code_seq + product_code_seq
pnpm import:odoo       # ค่อยรันต่อ
```

---

## Quick reference — คำสั่งที่ใช้บ่อย

```bash
# Daily start
cd ~/Desktop/bdt-app
git pull
cd backend && pnpm install && pnpm prisma migrate deploy && pnpm prisma generate
cd .. && pnpm install
# แล้วเปิด 2 tabs: backend `pnpm start:dev`, frontend `pnpm dev`

# ดู DB ใน CLI
psql -h localhost -U bdt -d bdt

# Reset DB ทั้งหมด (ระวัง!)
cd backend && pnpm prisma migrate reset --force && pnpm prisma:seed && pnpm import:routing-xlsx && pnpm seed:routing

# สร้าง dump ส่งให้ทีม
pg_dump -h localhost -U bdt -d bdt -F c -f bdt_$(date +%Y%m%d).dump
```

---

## เอกสารที่เกี่ยวข้อง

- `bdt-app/CHANGELOG.md` — สรุปการเปลี่ยนแปลงแต่ละ sprint
- `bdt-app/backend/prisma/schema.prisma` — Single source of truth ของ DB schema
- `bdt-app/document/` — xlsx files (Production-Std-Time-Cost-Machines, process routing) ที่ใช้ import data
- `bdt-app/SPRINT_PLAN_*.md` — แผน sprint แต่ละรอบ

---

**Last updated:** 2026-05-08 (Sprint 6) · **Stack version:** Node 20 / Postgres 16 / pnpm 9 / Prisma 6
