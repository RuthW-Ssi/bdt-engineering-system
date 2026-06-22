-- ── Operator tables (synced from Supabase bdt-engineer-system) ───────────────

CREATE TABLE IF NOT EXISTS "skill" (
  "id"   SERIAL       PRIMARY KEY,
  "name" VARCHAR(80)  NOT NULL
);

CREATE TABLE IF NOT EXISTS "operator" (
  "id"           SERIAL       PRIMARY KEY,
  "code"         VARCHAR(40)  UNIQUE NOT NULL,
  "name"         VARCHAR(120) NOT NULL,
  "nationality"  VARCHAR(10),
  "position_raw" VARCHAR(120),
  "start_raw"    VARCHAR(40),
  "active"       BOOLEAN      NOT NULL DEFAULT true,
  "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "operator_skill" (
  "id"          SERIAL  PRIMARY KEY,
  "operator_id" INTEGER NOT NULL REFERENCES "operator"("id") ON DELETE CASCADE,
  "skill_id"    INTEGER NOT NULL REFERENCES "skill"("id")    ON DELETE CASCADE,
  "level"       VARCHAR(20),
  UNIQUE ("operator_id", "skill_id")
);

-- ── skill data ────────────────────────────────────────────────────────────────
INSERT INTO "skill" ("id","name") VALUES
  (24,'Weld'),(25,'Assembly'),(26,'Grind'),(27,'Paint'),
  (28,'CNC Plate Cutting'),(29,'CNC Pipe Cutting'),(30,'CNC Drilling'),
  (31,'Subberg Machine'),(32,'Material Handling'),(33,'QC'),
  (34,'Production Supervisor'),(35,'Helper'),(36,'Maintenance'),
  (37,'Driver'),(38,'Office'),(39,'Store'),(40,'Material Store'),(41,'Housekeeping')
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('"skill"','id'), 41, true);

-- ── operator data (48 คน) ─────────────────────────────────────────────────────
INSERT INTO "operator" ("id","code","name","nationality","position_raw","start_raw","active") VALUES
  (1,'BPD2022-02/B-001','นาย เกรียงไกร เฮงเล้า','TH','ช่างเชื่อม B+ CNC','20/2/23',true),
  (2,'BPD2022-02/A-025','Mr.SAW HEL SO HMUU','MM','ยกขน/CNC','17/02/23',true),
  (3,'BPD2022-02/B-005','นาย เมฆ สุโพธิฤทธิ์','TH','ช่างเชื่อม B','20/2/23',true),
  (4,'BPD2022-02/A-026','Mr.SAN THEP PAING','MM','ยกขน/CNC','17/02/23',true),
  (5,'BPD2022-02/D-006','นาย ยงยุทธ ทรงประสิทธิ์','TH','หัวหน้างานฝ่ายผลิต','20/2/23',true),
  (6,'BPD2022-02/B-042','Mr.SAW CHIT HTWE','MM','ซับเบริ์ก','17/02/23',true),
  (7,'BPD2022-02/A-007','นางสาว ชญาภา แซมสีม่วง','TH','Office&Store','20/2/23',true),
  (8,'BPD2022-02/B-045','Mr.NYI NYI HTWE','MM','ซับเบริ์ก','17/02/23',true),
  (9,'BPD2022-02/B-015','นางสาว พรทิวา ทองโทน','TH','ช่างตัด CNC CUTTING','20/2/23',true),
  (10,'BPD2022-02/A-051','Mr.SAW EH KALU HSER','MM','ยกขน/CNC','2023-04-04',true),
  (11,'BPD2022-02/B-029','นาย ศราวุธ ปัดบุญทัน','TH','ช่างเชื่อมA','20/2/23',true),
  (12,'BPD2022-02/A-055','Mr.SAW SAY KLO WAR.','MM','ยกขน/CNC','15/05/23',true),
  (13,'BPD2022-02/B-070','นาย กมล คำแร่','TH','Driver','2/8/23',true),
  (14,'BPD2022-02/A-058','Mr. THAN ZAW MOE.','MM','ทีมสี','25/05/23',true),
  (15,'BPD2022-02/B-073','นาย รัตนพงค์ ประสาร','TH','ช่างตัด CNC CUTTING','7/8/23',true),
  (16,'BPD2022-02/A-059','Mr. MYO KO KO NAING.','MM','ทีมสี','27/05/23',true),
  (17,'BIF-2022-02/B-074','นาย สมพร ทีน้อย','TH','หัวหน้างานฝ่ายผลิต','9/8/23',true),
  (18,'BIF-2022-02/A-076','Mr. ZIN MYO OO','MM','ยกขน/CNC','28/8/23',true),
  (19,'BIF-2022-02/B-083','นาย ณัฐวรรธน์ บุญสิริไชย','TH','ช่างเชือม B','8/11/23',true),
  (20,'BIF-2022-02/A-084','Miss.TIN TIN OO','MM','แม่บ้าน(คนท้อง)','1/3/24',true),
  (21,'BIF-2022-02/B-094','นางสาว ฐิติรัตน์ ตันหลี','TH','Officer','2/5/24',true),
  (22,'BIF-2022-02/A-085','Miss.NUN PHUMMY','MM','พนักงานวัตถุดิบ/เบิกจ่ายวัสดุ','6/3/24',true),
  (23,'BIF-2022-02/B-101','นาย นฤพนธ์ อินทำ','TH','QC/Engineer','2/9/24',true),
  (24,'BIF-2022-02/A-087','Mr.MIN YE KYAW SWAR.','MM','ประกอบ/ เชื่อม','2024-12-03',true),
  (25,'BIF-2022-02/B-104','นาย ธีระวัฒน์ วงค์สวัส','TH','QC/Engineer','16/11/24',true),
  (26,'BIF-2022-02/A-088','Mr.MIN ZAW OO','MM','ประกอบ/ เชื่อม','2024-12-03',true),
  (27,'BIF-2022-02/B-109','นาย สมชื่อ บรรจงใหม่','TH','ผู้ช่วยช่าง','13/2/25',true),
  (28,'BIF-2022-02/A-089','Mr.THAN HTIKE','MM','ประกอบ/ เชื่อม','2024-08-04',true),
  (29,'BIF-2022-02/B-115','นาย วรินทร ศรีเสถียร','TH','QC',NULL,true),
  (30,'BIF-2022-02/A-095','Mr. SAW NOBLE CHIT.','MM','ยกขน/CNC','2024-02-05',true),
  (31,'BIF-2022-02/B-120','นาย ณัฐวุฒิ ดาหัวโทน','TH','QC','2025-07-01',true),
  (32,'BIF-2022-02/A-102','Mr.SAW KA PAW THAW','MM','เชื่อม/เจียร','9/9/24',true),
  (33,'BIF-2022-02/B-122','นาย อนุวัฒน์ กู้อัจฉริยะกุล','TH','ช่างเชือม B','29/7/68',true),
  (34,'BIF-2022-02/A-103','Mr.AUNG HTAN HTAY.','MM','ประกอบ/ เชื่อม','16/10/24',true),
  (35,'BIF-2022-02/B-126','นาย อภิชาติ พรมเพรียง','TH','ช่างประกอบ','19/9/25',true),
  (36,'BIF-2022-02/A-105','Mr.SAW MIN CHIT THU','MM','ทีมสี','16/10/24',true),
  (37,'BIF-2022-02/B-128','นาย สิทธิกร พรมสูตร','TH','QC','16/12/68',true),
  (38,'BIF-2022-02/A-111','Mr.SAW MUO KALO SAY','MM','ยกขน/CNC','13/2/25',true),
  (39,'BIF-2022-02/B-134','นาย ณรงค์ เลานามสิงค์','TH','ช่างประกอบ+เชื่อม','20/2/69',true),
  (40,'BIF-2022-02/A-114','MISS.TIN TIN','MM','แม่บ้าน','24/2/68',true),
  (41,'BIF-2022-02/B-135','นาย ฐากูร สว่างเฟื่อง','TH','ช่างประกอบ+เชื่อม','1969-11-03',true),
  (42,'BIF-2022-02/A-116','MR.SAW THA LAL WAR','MM','ทีมสี','2025-04-06',true),
  (43,'BIF-2022-02/B-136','นาย สิงหา บุตรดี','TH','ช่างประกอบ+เชื่อม','16/5/69',true),
  (44,'BIF-2022-02/A-117','MR.SAW BO BO HAN','MM','เชื่อม/เจียร','2025-04-06',true),
  (45,'BIF-2022-02/A-118','MR. SAW TAR GAY HTOO','MM','MT','2025-04-06',true),
  (46,'BIF-2022-02/A-119','MR. SAW KHAY MUE','MM','ทีมสี','2025-04-06',true),
  (47,'BIF-2022-02/A-132','MR.YE MIN THU','MM','ทีมสี','2026-05-02',true),
  (48,'BIF-2022-02/A-133','MR.SAW GAY DOH HTOO','MM','ทีมสี','2026-05-02',true)
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('"operator"','id'), 48, true);

-- ── operator_skill data (86 rows) ─────────────────────────────────────────────
INSERT INTO "operator_skill" ("id","operator_id","skill_id","level") VALUES
  (49,44,24,NULL),(50,43,24,NULL),(51,41,24,NULL),(52,39,24,NULL),(53,34,24,NULL),
  (54,33,24,'B'),(55,32,24,NULL),(56,28,24,NULL),(57,26,24,NULL),(58,24,24,NULL),
  (59,19,24,'B'),(60,11,24,'A'),(61,3,24,'B'),(62,1,24,'B+'),
  (63,43,25,NULL),(64,41,25,NULL),(65,39,25,NULL),(66,35,25,NULL),(67,34,25,NULL),
  (68,28,25,NULL),(69,26,25,NULL),(70,24,25,NULL),
  (71,44,26,NULL),(72,32,26,NULL),
  (73,48,27,NULL),(74,47,27,NULL),(75,46,27,NULL),(76,42,27,NULL),(77,36,27,NULL),
  (78,16,27,NULL),(79,14,27,NULL),
  (80,38,28,NULL),(81,30,28,NULL),(82,18,28,NULL),(83,15,28,NULL),(84,12,28,NULL),
  (85,10,28,NULL),(86,9,28,NULL),(87,4,28,NULL),(88,2,28,NULL),(89,1,28,NULL),
  (90,38,29,NULL),(91,30,29,NULL),(92,18,29,NULL),(93,15,29,NULL),(94,12,29,NULL),
  (95,10,29,NULL),(96,9,29,NULL),(97,4,29,NULL),(98,2,29,NULL),(99,1,29,NULL),
  (100,38,30,NULL),(101,30,30,NULL),(102,18,30,NULL),(103,15,30,NULL),(104,12,30,NULL),
  (105,10,30,NULL),(106,9,30,NULL),(107,4,30,NULL),(108,2,30,NULL),(109,1,30,NULL),
  (110,8,31,NULL),(111,6,31,NULL),
  (112,38,32,NULL),(113,30,32,NULL),(114,18,32,NULL),(115,12,32,NULL),(116,10,32,NULL),
  (117,4,32,NULL),(118,2,32,NULL),
  (119,37,33,NULL),(120,31,33,NULL),(121,29,33,NULL),(122,25,33,NULL),(123,23,33,NULL),
  (124,17,34,NULL),(125,5,34,NULL),
  (126,27,35,NULL),
  (127,45,36,NULL),
  (128,13,37,NULL),
  (129,21,38,NULL),(130,7,38,NULL),
  (131,7,39,NULL),
  (132,22,40,NULL),
  (133,40,41,NULL),(134,20,41,NULL)
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('"operator_skill"','id'), 134, true);
