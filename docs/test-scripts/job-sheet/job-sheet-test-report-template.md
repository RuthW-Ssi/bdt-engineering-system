# Per-piece Job Sheet (ใบงานต่อชิ้น) — Test Report

> **คำแนะนำ:** Copy ไฟล์นี้เป็น `job-sheet-test-report-YYYY-MM-DD.md` ก่อน run แล้วกรอก result
> **Script:** `python3 docs/test-scripts/job-sheet/job_sheet_api_check.py --mo <MO_ID>` (ดูข้อ 4) — ตรวจ API ให้อัตโนมัติ ส่วนหน้าจอและกระดาษตรวจด้วยมือ
> **Prerequisite:** backend + frontend รันอยู่, มี MO อย่างน้อย 1 ใบที่มี assembly line + WO, และ (ถ้ามี) MO Part ที่นำเข้าจาก NC เพื่อทดสอบสรุปรูเจาะ
> **สถานะฟอร์ม:** ฉบับร่าง — เนื้อหา/หน้าตาใบงานต้องให้ฝ่ายผลิตและ QA อนุมัติก่อนใช้แทนเอกสารควบคุม

---

## 1. Test Metadata

| Field | Value |
|-------|-------|
| Date | YYYY-MM-DD |
| Tester | |
| Feature | ชุดข้อมูลงานแผ่นเดียวต่อชิ้น (per-piece job sheet) |
| Branch | `<branch>` |
| Commit | `git rev-parse --short HEAD` |
| Environment | local / staging |
| Backend URL | http://localhost:3000 |
| Frontend URL | http://localhost:5173 |
| MO-A (assembly MO, มี WO ครบ) | |
| MO-B (assembly MO, ยังไม่มี WO) | |
| MO-C (MO Part จาก NC, มีรู) | |
| WO-1 (ของ MO-A) | |
| Zone id ของ MO-A | |

---

## 2. Setup Checklist

- [ ] Backend running (`cd backend && pnpm start:dev` → :3000) — build แล้วมี `dist/**/job-sheet/job-sheet-worker.js` (ถ้าไม่มีจะ render บน request thread)
- [ ] Frontend running (`pnpm dev` → :5173)
- [ ] Login สำเร็จ (บัญชีทดสอบ — ขอจากผู้ดูแลระบบ / ตั้งผ่าน env `BDT_USER` / `BDT_PASS` เท่านั้น ห้ามเขียนรหัสผ่านลงไฟล์), ผู้ใช้มีสิทธิ์ `orders:view`
- [ ] `backend/assets/fonts/sarabun/*.ttf` อยู่ครบ
- [ ] เลือก MO-A / MO-B / MO-C / WO-1 แล้วกรอกในตารางข้อ 1

---

## 3. Backend unit specs

```bash
cd backend && pnpm jest job-sheet
```

| Spec | Expected | Result |
|---|---|---|
| `job-sheet-format.spec.ts` | all pass | |
| `job-sheet.service.spec.ts` | all pass (4 todo) | |
| `job-sheet-pdf-builder.spec.ts` | all pass (4 todo) | |

Frontend: `pnpm vitest run src/components/mo/JobSheetModal.test.tsx` → 1 pass, 7 todo. Result: ____

---

## 4. API checks (script)

```bash
export BDT_API=http://localhost:3000/api/v1 BDT_USER=<login> BDT_PASS=<password>
python3 docs/test-scripts/job-sheet/job_sheet_api_check.py --mo <MO-A id> --wo <WO-1 id> --zone <zone id>
```

| # | Check | Expected | Result |
|---|---|---|---|
| A1 | `GET /mo/:id/job-sheets/preview` | 200, `totals.sheets == len(sheets)`, `sheetNo` = 1..N ต่อเนื่อง | |
| A2 | piece mode | ทุก part: จำนวนใบ = `pieceTotal`, `pieceNo` = 1..pieceTotal | |
| A3 | `mode=part` | 1 ใบต่อ (assembly, part mark), `pieceNo == null`, ผลรวม `pieceTotal` = จำนวนใบของ piece mode | |
| A4 | `wo_ids=<WO-1>` | assembly ทุกใบอยู่ใน mark ของ WO-1 และจำนวนใบ ≤ ทั้ง MO | |
| A5 | `zone_id=<zone>` / `zone_id=999999` | zone จริง = เท่าทั้ง MO (MO เดียวโซนเดียว) · zone ปลอม = 409 `JOB_SHEET_EMPTY` | |
| A6 | `part_marks=__NOPE__` | 409 `JOB_SHEET_EMPTY` | |
| A7 | `GET /mo/:id/job-sheets?lang=th` | 200 `application/pdf`, ขึ้นต้น `%PDF-`, จำนวนหน้า = `totals.sheets` | |
| A8 | MO ที่ไม่มีจริง | 404 | |
| A9 | ไม่มี token | 401 | |
| A10 | routing ของทุกใบเรียงตาม `sequence` | เรียงจากน้อยไปมาก | |
| A11 | `heatNo` / `plateId` | `null` ทุกใบ (จนกว่าจะมีระบบติดตาม heat / plate) | |
| A12 | ใบงานทั้งโซน `GET /mo/job-sheets/zone/:zoneId/preview?mode=part` (ต้องส่ง `--zone`) | 200: `mo = null`, `zone.id` ตรง, `sheetNo` 1..N ต่อเนื่องข้าม MO, `moCode` ทุกใบอยู่ใน `zone.moCodes`; หรือ 409 ที่มีรหัสตามเอกสาร; PDF ทั้งโซนขึ้นต้น `%PDF-`; โซนที่ไม่มีอยู่ → 404 `ZONE_NOT_FOUND` | |

Script output (paste):

```
```

---

## 5. Manual UI checks

| # | Step | Expected | Result |
|---|---|---|---|
| U1 | เปิด MO-A → ปุ่ม **พิมพ์ใบงานต่อชิ้น** (ข้างปุ่ม Print) | modal เปิด, แสดงจำนวนใบ / Part Mark / ชิ้น / kg และตารางรายการ | |
| U2 | เปลี่ยน รูปแบบ เป็น "1 ใบต่อ Part Mark" | ตารางโหลดใหม่, คอลัมน์ ชิ้นที่ เป็น `×N` | |
| U3 | กด **ดูตัวอย่าง PDF** | PDF แสดงใน modal (iframe), เปลี่ยนภาษาแล้วตัวอย่างหายให้กดใหม่ | |
| U4 | กด **พิมพ์ใบงานต่อชิ้น** | PDF เปิดแท็บใหม่, ชื่อไฟล์ตอน Save = `JOBSHEET-<MO>-<yyyymmdd>-<hhmmss>` | |
| U5 | เปิด WO-1 → ปุ่ม **พิมพ์ใบงานต่อชิ้น** บน header | modal บอกว่า "เฉพาะชิ้นงานของ WO-…", จำนวนใบ ≤ U1 | |
| U6 | MO-B (ยังไม่มี WO) | มีแถบเตือน "ยังไม่มีขั้นตอน/WO", ใบงานพิมพ์ได้ ช่องขั้นตอนเป็นแม่แบบ routing ของ MO หรือช่องว่าง | |
| U7 | MO-C (MO Part จาก NC) | คอลัมน์ รูเจาะ แสดง `n×Øด`, ในใบงานมีตารางสรุปรู | |
| U8 | MO ที่เกิน 500 ใบ (ถ้ามี) | ข้อความ 409 ภาษาไทย แนะนำให้แยกพิมพ์ / เปลี่ยนรูปแบบ, ปุ่ม PDF กดไม่ได้ | |
| U9 | หน้า **Zones** → แถวโซนที่มี MO ยืนยันแล้ว/กำลังผลิต → **พิมพ์ใบงานต่อชิ้น** | modal หัวเรื่อง "โซน …", มีคอลัมน์ **MO** และบรรทัด "MO ในชุดนี้ (n)", MO ที่ไม่มีชิ้นงานตามเงื่อนไขแสดงเป็นสีเทา; PDF ทุกใบมุมขวาบนเป็นรหัส MO ของใบนั้นเอง | |
| U10 | ผู้ใช้ที่ไม่มีสิทธิ์ `orders:view` หรือผู้ใช้ลูกค้า เปิดหน้า Zones | ไม่เห็นปุ่ม **พิมพ์ใบงานต่อชิ้น** | |
| U11 | หน้า MO-A แท็บ **Assemblies** → ปุ่ม **ใบงาน** ของ Assembly หนึ่ง | modal บอก "เฉพาะ Assembly …", ทุกแถวเป็น Assembly นั้น | |
| U12 | หน้า MO-A แท็บ **Parts** → ไอคอนเครื่องพิมพ์ของ Part Mark หนึ่ง | modal บอก "เฉพาะ Part Mark …", ทุกแถวเป็น Part Mark นั้น (MO Part ที่ไม่มี part mark อาจได้ 409 — บันทึกผล) | |
| U13 | รายการ **MO** / รายการ **WO** (หน้า Order) → ไอคอนเครื่องพิมพ์ท้ายแถว / ข้างรหัส WO | modal เปิดโดยไม่เปลี่ยนหน้า; ของ WO บอก "เฉพาะชิ้นงานของ WO-…" | |
| U14 | หน้า Zones → โซนที่มี sub-zone → **พิมพ์ใบงานต่อชิ้น** → เลือก **Sub-zone** ในหน้าต่าง | รายการ/ยอดรวมโหลดใหม่เฉพาะ sub-zone นั้น (`sub_zone_id` ใน request), บรรทัดขอบเขตบอกชื่อ sub-zone, เลือก "ทั้งโซน" กลับมาเท่าเดิม; โซนที่ไม่มี sub-zone ไม่มีช่องนี้ | |
| U15 | MO Part (แบบขนาด ไม่มี Assembly) ที่มี project/zone → พิมพ์ใบงาน | หัวใบงานแสดง Project / Zone / Sub-zone ของ MO นั้น (ไม่ว่าง); MO ที่ไม่มี plan finish → วันต้องเสร็จ = วันสิ้นสุดตามแผนล่าสุดของ WO ของ Assembly นั้น | |

---

## 6. Paper checks (พิมพ์จริง 1 ใบ A4)

| # | Check | Expected | Result |
|---|---|---|---|
| P1 | รหัสชิ้น | Part Mark ตัวใหญ่ อ่านได้จากระยะ 2 ม., Assembly Mark, ชิ้นที่ n จาก N | |
| P2 | QR | สแกนด้วยมือถือแล้วเปิดหน้า WO (หรือ MO ถ้ายังไม่มี WO) ได้ | |
| P3 | วัสดุ | หน้าตัด / เกรด / ยาว / กว้าง / หนา / น้ำหนักต่อชิ้น ตรงกับ BOM | |
| P4 | ขั้นตอน | ครบทุก WO ของ assembly เรียงตามลำดับ, มีช่อง ผู้ทำ / วันที่ / QC ว่างให้ลงชื่อ | |
| P5 | แบบอ้างอิง | ชื่อไฟล์ + Rev + วันที่ ตรงกับแบบล่าสุดของ mark | |
| P6 | วันต้องเสร็จ | = Plan Finish ของ MO (dd/mm/yyyy เวลาไทย) | |
| P7 | Heat No. / หมายเลขแผ่น | ช่องว่าง + "(กรอกด้วยมือ)" | |
| P8 | สรุปรูเจาะ | ตรงกับแบบ; ชิ้นที่ไม่มีข้อมูลขึ้นข้อความแดงให้ดูจากแบบ (ไม่พิมพ์เลข 0) | |
| P9 | ภาษาไทย | สระ/วรรณยุกต์ไม่ซ้อนทับ ไม่ตกขอบ | |
| P10 | ท้ายกระดาษ | เวลาพิมพ์ + ข้อความ "แบบฟอร์มฉบับร่าง" + รหัสชิ้น | |

---

## 7. Findings

| # | Severity | Finding | Owner |
|---|---|---|---|
| | | | |

## 8. Sign-off

| Role | Name | Date | Result |
|---|---|---|---|
| Tester | | | PASS / FAIL |
| Production (เจ้าของฟอร์ม) | | | |
| QA | | | |
