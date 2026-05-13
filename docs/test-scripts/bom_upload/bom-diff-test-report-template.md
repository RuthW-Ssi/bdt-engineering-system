# BOM Diff Feature — Test Report

> **คำแนะนำ:** Copy ไฟล์นี้เป็น `bom-diff-test-report-YYYY-MM-DD.md` ก่อน run แล้วกรอก result
> **Skill:** รัน `/test-bom-diff` เพื่อให้ Claude ช่วย run และกรอก report นี้อัตโนมัติ

---

## 1. Test Metadata

| Field | Value |
|-------|-------|
| Date | YYYY-MM-DD |
| Tester | |
| Sprint | |
| Branch | |
| Commit | `git rev-parse --short HEAD` |
| Environment | local / staging |
| Frontend URL | http://localhost:5173 |
| Backend URL | http://localhost:3000 |
| Rev.0 files | `storage/test_bom_file/` |
| Rev.1 files | `storage/test_bom_file/test_diff_bom_file/` |
| Project used | |
| Zone used | |
| Dispatch D1 (Rev.0 ID) | |
| Dispatch D2 (Rev.1 ID) | |

---

## 2. Setup Checklist

- [ ] Frontend running (`pnpm dev` → :5173)
- [ ] Backend running (`pnpm --filter backend dev` → :3000)
- [ ] Cloud SQL proxy running (หรือ local Postgres)
- [ ] Login สำเร็จ (admin / BdtDev2026!)
- [ ] Project selected ใน header
- [ ] ทั้ง 3 Rev.0 files พร้อม
- [ ] ทั้ง 3 Rev.1 files พร้อม

---


## 3. Upload Steps

### Step 1 — Upload Rev.0

| | |
|-|-|
| URL | http://localhost:5173/bom → Upload |
| Files | Assembly List Rev.0 + Assembly Part List Rev.0 + Part List Rev.0 |
| Result | ☐ Pass &nbsp; ☐ Fail |
| Dispatch ID (D1) | ___________ |
| Error (ถ้ามี) | |

### Step 2 — Upload Rev.1

| | |
|-|-|
| URL | http://localhost:5173/bom → Upload |
| Zone | **เดิมกับ Rev.0** |
| Files | Assembly List Rev.1 + Assembly Part List Rev.1 + Part List Rev.1 |
| Result | ☐ Pass &nbsp; ☐ Fail |
| Dispatch ID (D2) | ___________ |
| Error (ถ้ามี) | |

---

## 4. Dispatch Detail Page — UI Checks

เปิด `http://localhost:5173/bom/dispatch/{D2}`

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| U1 | Page โหลดได้ ไม่ crash | ✓ | | ☐ Pass ☐ Fail |
| U2 | Header แสดง Zone code | zone code ที่เลือก | | ☐ Pass ☐ Fail |
| U3 | ไม่มี warning bar (ครบ 3 ไฟล์) | ไม่มี warning | | ☐ Pass ☐ Fail |
| U4 | Diff content โหลดได้ (ไม่ใช่ "ไม่มีเวอร์ชันก่อนหน้า") | มี aggregate + hierarchy | | ☐ Pass ☐ Fail |
| U5 | Assembly mark ไม่มี contract prefix | `TH-2CO5` ไม่ใช่ `0X181TH-2CO5` | | ☐ Pass ☐ Fail |

---

## 5. Aggregate Values — ต้องตรงทุก field

> Source: คำนวณจาก raw Excel files โดยตรง (ดู `docs/test-scripts/bom-diff-expected-values.md`)

### 5.1 Weight & Area

| Metric | Expected Prev | Expected Curr | Expected Delta | Actual Prev | Actual Curr | Actual Delta | Result |
|--------|--------------|--------------|----------------|-------------|-------------|--------------|--------|
| weight_kg | **11,143.400** | **11,855.220** | **+711.820** | | | | ☐ Pass ☐ Fail |
| area_m2 | **445.366** | **479.597** | **+34.231** | | | | ☐ Pass ☐ Fail |

### 5.2 Assembly Count

| Metric | Expected Prev | Expected Curr | Expected Delta | Actual | Result |
|--------|--------------|--------------|----------------|--------|--------|
| assembly_count | **47** | **47** | **0** | | ☐ Pass ☐ Fail |
| assembly added | — | — | **2** | | ☐ Pass ☐ Fail |
| assembly removed | — | — | **2** | | ☐ Pass ☐ Fail |
| assembly changed | — | — | **4** | | ☐ Pass ☐ Fail |

### 5.3 Part Count

| Metric | Expected Prev | Expected Curr | Expected Delta | Actual | Result |
|--------|--------------|--------------|----------------|--------|--------|
| part_total | **104** | **104** | **0** | | ☐ Pass ☐ Fail |
| part added | — | — | **2** | | ☐ Pass ☐ Fail |
| part removed | — | — | **2** | | ☐ Pass ☐ Fail |
| part changed | — | — | **13** | | ☐ Pass ☐ Fail |

---

## 6. Assembly Diff — ตรวจ item ต่อ item

### 6.1 Added (ต้องปรากฏ status = `added`)

| assembly_mark | Result |
|--------------|--------|
| **TH-2CO12** | ☐ Found ☐ Missing |
| **TH-2RF16** | ☐ Found ☐ Missing |

### 6.2 Removed (ต้องปรากฏ status = `removed`)

| assembly_mark | Result |
|--------------|--------|
| **TH-2FB13** | ☐ Found ☐ Missing |
| **TH-2WH3** | ☐ Found ☐ Missing |

### 6.3 Changed — ต้องตรงทุก field

| assembly_mark | Field | Expected Prev | Expected Curr | Actual Prev | Actual Curr | Result |
|--------------|-------|--------------|--------------|-------------|-------------|--------|
| TH-2CO5 | weight_kg | 407.600 | **412.850** | | | ☐ Pass ☐ Fail |
| TH-2CO5 | area_m2 | 15.801 | **16.050** | | | ☐ Pass ☐ Fail |
| TH-2FB5 | qty | 36 | **24** | | | ☐ Pass ☐ Fail |
| TH-2FB5 | weight_kg | 124.180 | **82.790** | | | ☐ Pass ☐ Fail |
| TH-2FB5 | area_m2 | 6.259 | **4.173** | | | ☐ Pass ☐ Fail |
| TH-2PS1 | qty | 5 | **6** | | | ☐ Pass ☐ Fail |
| TH-2PS1 | weight_kg | 405.350 | **486.420** | | | ☐ Pass ☐ Fail |
| TH-2PS1 | area_m2 | 19.967 | **23.960** | | | ☐ Pass ☐ Fail |
| TH-2RF1 | weight_kg | 535.910 | **549.210** | | | ☐ Pass ☐ Fail |
| TH-2RF1 | area_m2 | 16.732 | **17.142** | | | ☐ Pass ☐ Fail |

---

## 7. Part Diff — ตรวจ item ต่อ item

### 7.1 Added

| part_mark | Result |
|----------|--------|
| **TH-2p77** | ☐ Found ☐ Missing |
| **TH-2p78** | ☐ Found ☐ Missing |

### 7.2 Removed

| part_mark | Result |
|----------|--------|
| **TH-2FB13** | ☐ Found ☐ Missing |
| **TH-2WH3** | ☐ Found ☐ Missing |

### 7.3 Changed — Profile เปลี่ยน (critical)

| part_mark | Field | Expected Prev | Expected Curr | Actual | Result |
|----------|-------|--------------|--------------|--------|--------|
| TH-2WH1 | profile | PL8x60 | **PL10x60** | | ☐ Pass ☐ Fail |
| TH-2WH2 | profile | PL8x60 | **PL10x60** | | ☐ Pass ☐ Fail |
| TH-2m13 | profile | RODRB19 | **RODRB22** | | ☐ Pass ☐ Fail |
| TH-2m15 | profile | RODRB19 | **RODRB22** | | ☐ Pass ☐ Fail |

### 7.4 Changed — Qty เปลี่ยน

| part_mark | Expected Prev | Expected Curr | Actual | Result |
|----------|--------------|--------------|--------|--------|
| TH-2FB5 | 36 | **24** | | ☐ Pass ☐ Fail |
| TH-2p6 | 6 | **7** | | ☐ Pass ☐ Fail |
| TH-2p7 | 6 | **7** | | ☐ Pass ☐ Fail |
| TH-2p8 | 6 | **7** | | ☐ Pass ☐ Fail |
| TH-2p13 | 6 | **7** | | ☐ Pass ☐ Fail |
| TH-2p40 | 1 | **2** | | ☐ Pass ☐ Fail |
| TH-2p57 | 96 | **102** | | ☐ Pass ☐ Fail |
| TH-2p60 | 69 | **75** | | ☐ Pass ☐ Fail |
| TH-2p61 | 40 | **44** | | ☐ Pass ☐ Fail |

---

## 8. Edge Case Checks

| # | Scenario | Expected | Result |
|---|----------|----------|--------|
| E1 | เปิด `/bom/dispatch/99999` | "ไม่พบ Dispatch #99999" | ☐ Pass ☐ Fail |
| E2 | เปิด `/bom/dispatch/abc` | Error/empty state (ไม่ crash) | ☐ Pass ☐ Fail |
| E3 | เปิด Dispatch D1 (Rev.0 — ไม่มี previous) | "ไม่มีเวอร์ชันก่อนหน้า" | ☐ Pass ☐ Fail |
| E4 | Upload Rev.0 ไฟล์เดียว → เปิด D2 | Warning bar แสดงไฟล์ที่ขาด | ☐ Pass ☐ Fail |

---

## 9. Bug Log

| # | TC | Description | Severity | Status |
|---|----|-------------|----------|--------|
| 1 | | | P1/P2/P3 | Open/Fixed |

---

## 10. Summary

| Section | Total | Pass | Fail |
|---------|-------|------|------|
| Setup | 7 | | |
| Upload | 2 | | |
| UI Checks | 5 | | |
| Aggregate | 10 | | |
| Assembly Diff | 16 | | |
| Part Diff | 17 | | |
| Edge Cases | 4 | | |
| **Total** | **61** | | |

**Overall Result:** ☐ PASS &nbsp;&nbsp; ☐ FAIL

**Sign-off:** _________________________ Date: _____________

**Notes:**
