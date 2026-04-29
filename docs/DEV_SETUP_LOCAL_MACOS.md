# BDT App — Local Dev Setup (macOS, ไม่ใช้ Docker)

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
- `JWT_SECRET` — ถ้าโปรเจกต์เพิ่ม auth แล้ว
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

### Path B — เริ่มจาก fresh schema + seed (สำหรับ dev ที่ไม่ต้องการ data จริง)

ใช้กรณีต้องการแค่ schema ล่าสุด + seed master data (UoM, account, admin user)

```bash
cd backend
pnpm prisma migrate deploy    # apply migrations (Sprint 1–4)
pnpm prisma:seed              # seed master data (UoM, account, admin user)
pnpm import:routing-xlsx      # import 923 activity templates + 19 formula params จาก document/
```

> ⚠️ Path B จะไม่มี: products จริง, BOM lines, shop drawings, routing data — ต้องสร้างเองหรือ import จาก xlsx ใน `document/`

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
UNION ALL SELECT 'routing_formula_param', COUNT(*) FROM routing_formula_param;
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
cd backend && pnpm prisma migrate reset --force && pnpm prisma:seed

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

**Last updated:** 2026-04-29 · **Stack version:** Node 20 / Postgres 16 / pnpm 9 / Prisma 6
