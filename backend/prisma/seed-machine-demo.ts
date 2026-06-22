import { PrismaClient, EquipmentStatus, RepairSeverity, RepairStatus } from '@prisma/client'

export async function seedMachineDemo(prisma: PrismaClient) {
  const d = (daysAgo: number, hour = 8) => {
    const dt = new Date('2026-06-12T08:00:00Z')
    dt.setDate(dt.getDate() - daysAgo)
    dt.setHours(hour)
    return dt
  }

  // ─── Reset machine-tracker tables for the 8 key machines ─────────────────
  const keyCodes = ['MC-0002','MC-0003','MC-0011','MC-0013',
    'MC-0006','MC-0018','MC-0021','MC-0007','MC-0015',
    'MC-0014',
    'MC-0004','MC-0005','MC-0008','MC-0009','MC-0010',
    'MC-0012','MC-0016','MC-0017','MC-0022','MC-0019','MC-0020']
  const machines = await prisma.equipment_resource.findMany({ where: { code: { in: keyCodes } } })
  const ids = machines.map(m => m.id)
  await prisma.machine_status_history.deleteMany({ where: { machine_id: { in: ids } } })
  await prisma.repair_ticket.deleteMany({ where: { machine_id: { in: ids } } })
  await prisma.maintenance_log.deleteMany({ where: { machine_id: { in: ids } } })
  // Reset seq to safe value
  await prisma.repair_ticket_seq.update({ where: { id: 1 }, data: { next_val: 1 } })

  // ─── Helper to get id by code ─────────────────────────────────────────────
  const id = (code: string) => machines.find(m => m.code === code)!.id

  // ─── Upsert machines with target statuses ─────────────────────────────────
  const machineData = [
    { code: 'MC-0002',  status: EquipmentStatus.OPERATIONAL, last_pm: d(23) },
    { code: 'MC-0003',  status: EquipmentStatus.OPERATIONAL, last_pm: d(46) },
    { code: 'MC-0011',         status: EquipmentStatus.OPERATIONAL, last_pm: d(73) },
    { code: 'MC-0013',      status: EquipmentStatus.MAINTENANCE, last_pm: d(61) },
    { code: 'MC-0006',     status: EquipmentStatus.REPAIR,      last_pm: d(58) },
    { code: 'MC-0018',     status: EquipmentStatus.UNAVAILABLE, last_pm: d(91) },
    { code: 'MC-0021',         status: EquipmentStatus.RETIRED,     last_pm: d(181) },
    { code: 'MC-0007',     status: EquipmentStatus.OPERATIONAL, last_pm: d(38) },
    { code: 'MC-0015',      status: EquipmentStatus.OPERATIONAL, last_pm: d(53) },
    { code: 'MC-0014',     status: EquipmentStatus.OPERATIONAL, last_pm: d(28) },
    // ─── 11 additional machines ───────────────────────────────────────────────
    { code: 'MC-0004',      status: EquipmentStatus.OPERATIONAL, last_pm: d(25) },
    { code: 'MC-0005',      status: EquipmentStatus.OPERATIONAL, last_pm: d(18) },
    { code: 'MC-0008',         status: EquipmentStatus.OPERATIONAL, last_pm: d(67) },
    { code: 'MC-0009',         status: EquipmentStatus.OPERATIONAL, last_pm: d(31) },
    { code: 'MC-0010',           status: EquipmentStatus.OPERATIONAL, last_pm: d(89) },
    { code: 'MC-0012',    status: EquipmentStatus.OPERATIONAL, last_pm: d(55) },
    { code: 'MC-0016',       status: EquipmentStatus.OPERATIONAL, last_pm: d(14) },
    { code: 'MC-0017',       status: EquipmentStatus.MAINTENANCE, last_pm: d(5) },
    { code: 'MC-0022', status: EquipmentStatus.OPERATIONAL, last_pm: d(41) },
    { code: 'MC-0019',     status: EquipmentStatus.OPERATIONAL, last_pm: d(22) },
    { code: 'MC-0020',       status: EquipmentStatus.OPERATIONAL, last_pm: d(78) },
  ]
  for (const m of machineData) {
    await prisma.equipment_resource.update({
      where: { code: m.code },
      data: { current_status: m.status, last_maintenance_at: m.last_pm },
    })
  }

  // ─── PM LOGS ─────────────────────────────────────────────────────────────
  // EQ-CUT-PLASMA25 — 5 PM logs every ~30 days
  const pm25 = id('MC-0002')
  const pmLogs25 = [
    { performed_at: d(143), performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 1 ประจำปี — เปลี่ยน torch tip ครบชุด, ทำความสะอาดหัวตัด plasma, ตรวจ coolant level', parts_replaced: 'Plasma tip ×4, Shield cap ×4', duration_min: 90 },
    { performed_at: d(113), performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 2 — ตรวจสอบ linear guide rail + หล่อลื่น, เปลี่ยน consumable electrode', parts_replaced: 'Electrode ×2, Grease 1 ถัง', duration_min: 75 },
    { performed_at: d(83),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 3 — เปลี่ยน shield cap + plasma tip ชุดใหม่, ทดสอบ cutting quality บน plate 12mm', parts_replaced: 'Shield cap ×4, Plasma tip ×4', duration_min: 90 },
    { performed_at: d(51),  performed_by: 'ช่างซี',  description: 'PM ครั้งที่ 4 — หล่อลื่น linear guide ครบทุกแกน, ตรวจ coolant + refill, ทดสอบ arc stability', parts_replaced: 'Coolant 2L, Grease 0.5 ถัง', duration_min: 120 },
    { performed_at: d(23),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 5 — เปลี่ยน torch tip + electrode ครบชุด, ปรับ cutting height sensor, ทดสอบตัด SS304 10mm', parts_replaced: 'Torch tip ×4, Electrode ×2, Shield cap ×4', duration_min: 90 },
  ]
  for (const l of pmLogs25) await prisma.maintenance_log.create({ data: { machine_id: pm25, ...l, notes: null, photo_urls: [] } })

  // EQ-CUT-PLASMA60 — 3 PM logs
  const pm60 = id('MC-0003')
  const pmLogs60 = [
    { performed_at: d(135), performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 1 — ตรวจสอบ coolant system + เปลี่ยน torch body, ปรับ THC (Torch Height Control)', parts_replaced: 'Torch body, Coolant filter', duration_min: 150 },
    { performed_at: d(89),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 2 — เปลี่ยน plasma tip ครบชุด, ทำความสะอาด cutting table + slat', parts_replaced: 'Plasma tip ×6, Shield cap ×6', duration_min: 120 },
    { performed_at: d(46),  performed_by: 'ช่างซี',  description: 'PM ครั้งที่ 3 — ตรวจสอบ drive system, หล่อลื่น rack & pinion ทุกแกน, ปรับ accuracy ทดสอบ 3 points', parts_replaced: 'Grease 2 ถัง, Lubrication oil 1L', duration_min: 180 },
  ]
  for (const l of pmLogs60) await prisma.maintenance_log.create({ data: { machine_id: pm60, ...l, notes: null, photo_urls: [] } })

  // EQ-HBEAM — 2 PM logs (overdue !)
  const pmHB = id('MC-0011')
  const pmLogsHB = [
    { performed_at: d(153), performed_by: 'ช่างดี',  description: 'PM ประจำปี — ตรวจสอบ roller ทุกตัว, เปลี่ยน bearing ที่สึกหรอ, ปรับ alignment เส้นทาง H-Beam', parts_replaced: 'Bearing ×4, Seal ring ×4', duration_min: 240 },
    { performed_at: d(73),  performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 2 — หล่อลื่น bearing ครบชุด 8 จุด, ตรวจ welding flux feed, ทดสอบ feed speed 1.2 m/min', parts_replaced: 'Grease 2 ถัง, Flux 5 kg', duration_min: 180 },
  ]
  for (const l of pmLogsHB) await prisma.maintenance_log.create({ data: { machine_id: pmHB, ...l, notes: null, photo_urls: [] } })

  // EQ-WELD-SAW — 3 PM logs
  const pmSAW = id('MC-0013')
  const pmLogsSAW = [
    { performed_at: d(127), performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 1 — ตรวจสอบ wire feeder, เปลี่ยน contact tip + nozzle, ปรับ wire tension', parts_replaced: 'Contact tip ×10, Nozzle ×2', duration_min: 60 },
    { performed_at: d(72),  performed_by: 'ช่างซี',  description: 'PM ครั้งที่ 2 — ทำความสะอาด flux hopper + flux recovery, ปรับ submerged arc parameters', parts_replaced: 'Flux 10 kg', duration_min: 90 },
    { performed_at: d(61),  performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 3 ก่อนเข้า Overhaul — ตรวจสอบ drive rolls, บันทึก condition ก่อนซ่อมบำรุงใหญ่', parts_replaced: 'Drive roll ×2', duration_min: 60 },
  ]
  for (const l of pmLogsSAW) await prisma.maintenance_log.create({ data: { machine_id: pmSAW, ...l, notes: null, photo_urls: [] } })

  // EQ-PRESS-110 — 2 PM logs before repair incident
  const pmP110 = id('MC-0006')
  const pmLogsP110 = [
    { performed_at: d(143), performed_by: 'ช่างดี',  description: 'PM ครั้งที่ 1 — ตรวจสอบ hydraulic system, เปลี่ยน oil filter, วัดแรงดัน 210 bar ปกติ', parts_replaced: 'Hydraulic oil filter, Seal kit', duration_min: 120 },
    { performed_at: d(58),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 2 — ตรวจสอบ hydraulic seal พบรั่วเล็กน้อย แต่แรงดันยังอยู่ 195 bar ตัดสินใจ monitor ต่อ', parts_replaced: 'Oil 5L (เติม)', duration_min: 90, notes: 'พบรั่วที่ cylinder seal ขนาดเล็ก แนะนำเปลี่ยนใน PM ครั้งถัดไป' },
  ]
  for (const l of pmLogsP110) await prisma.maintenance_log.create({ data: { machine_id: pmP110, ...l, photo_urls: [] } })

  // EQ-CRANE-25T — 2 PM logs
  const pmCR = id('MC-0018')
  const pmLogsCR = [
    { performed_at: d(148), performed_by: 'ช่างดี',  description: 'PM ประจำปี + ต่อใบรับรองความปลอดภัยประจำปี — ตรวจ wire rope, sheave, brake, load test 27.5T', parts_replaced: 'Wire rope 1 section, Brake pad ×4', duration_min: 480 },
    { performed_at: d(91),  performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 2 — ตรวจสอบ hoist mechanism, หล่อลื่น drum + sheave, ตรวจ limit switch ครบทุกตัว', parts_replaced: 'Grease 3 ถัง, Wire rope grease 2L', duration_min: 240 },
  ]
  for (const l of pmLogsCR) await prisma.maintenance_log.create({ data: { machine_id: pmCR, ...l, notes: null, photo_urls: [] } })

  // EQ-BRAKE-200 — 2 PM logs
  const pmBK = id('MC-0007')
  const pmLogsBK = [
    { performed_at: d(108), performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 1 — ตรวจสอบ hydraulic clamping system, ปรับ back gauge ± 0.1mm', parts_replaced: 'Hydraulic seal kit', duration_min: 90 },
    { performed_at: d(38),  performed_by: 'ช่างซี',  description: 'PM ครั้งที่ 2 — เปลี่ยน hydraulic oil ครบระบบ, ปรับ bending angle calibration, ทดสอบ bending plate 6mm', parts_replaced: 'Hydraulic oil 20L, Oil filter ×2', duration_min: 150 },
  ]
  for (const l of pmLogsBK) await prisma.maintenance_log.create({ data: { machine_id: pmBK, ...l, notes: null, photo_urls: [] } })

  // EQ-WELD-MAG — 2 PM logs
  const pmMAG = id('MC-0015')
  const pmLogsMAG = [
    { performed_at: d(113), performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 1 — ตรวจสอบ wire feeder, เปลี่ยน contact tip ครบชุด, ปรับ wire tension 2.5 kgf', parts_replaced: 'Contact tip ×10, Nozzle ×2', duration_min: 45 },
    { performed_at: d(53),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 2 — ทำความสะอาด torch + ท่อ gas, เปลี่ยน liner, ปรับ shielding gas flow 15 L/min', parts_replaced: 'Wire liner, Contact tip ×6', duration_min: 60 },
  ]
  for (const l of pmLogsMAG) await prisma.maintenance_log.create({ data: { machine_id: pmMAG, ...l, notes: null, photo_urls: [] } })

  // EQ-WELD-SMAW — 2 PM logs
  const pmSMAW = id('MC-0014')
  const pmLogsSMAW = [
    { performed_at: d(98),  performed_by: 'ช่างซี',  description: 'PM ครั้งที่ 1 — ตรวจสอบ cable + electrode holder, ทดสอบ OCV + welding current accuracy', parts_replaced: 'Electrode holder tip', duration_min: 30 },
    { performed_at: d(28),  performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 2 — ตรวจสอบ connection + ทำความสะอาด terminal, ทดสอบ welding ด้วย E7018', parts_replaced: null, duration_min: 30 },
  ]
  for (const l of pmLogsSMAW) await prisma.maintenance_log.create({ data: { machine_id: pmSMAW, ...l, notes: null, photo_urls: [] } })

  // ─── PM LOGS · 11 additional machines ────────────────────────────────────

  // EQ-CUT-PIPE — 3 PM logs every ~45d
  const pmPIPE = id('MC-0004')
  const pmLogsPIPE = [
    { performed_at: d(115), performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 1 — ปรับ CNC pipe center, ตรวจ clamp mechanism + chuck, ทดสอบ cutting แนวตรง', parts_replaced: 'Cutting blade ×2', duration_min: 90 },
    { performed_at: d(70),  performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 2 — เปลี่ยน cutting blade, ตรวจสอบ coolant system + refill, ปรับ feed rate', parts_replaced: 'Cutting blade ×2, Coolant 2L', duration_min: 75 },
    { performed_at: d(25),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 3 — เปลี่ยน cutting blade, ปรับ blade height + guide, ทดสอบตัด pipe 4" ทุกมุม', parts_replaced: 'Cutting blade ×2', duration_min: 75 },
  ]
  for (const l of pmLogsPIPE) await prisma.maintenance_log.create({ data: { machine_id: pmPIPE, ...l, notes: null, photo_urls: [] } })

  // EQ-SAW-BAND — 4 PM logs (blade change every ~35d)
  const pmBAND = id('MC-0005')
  const pmLogsBAND = [
    { performed_at: d(123), performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 1 — เปลี่ยน band saw blade M42 + ปรับ blade tension + guide, ทดสอบ cut SUS 50mm', parts_replaced: 'Band saw blade M42 (3600×27) ×1, Blade guide pad ×2', duration_min: 60 },
    { performed_at: d(83),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 2 — เปลี่ยน blade ใหม่, ตรวจ guide bearing + coolant nozzle position', parts_replaced: 'Band saw blade M42 ×1', duration_min: 60 },
    { performed_at: d(43),  performed_by: 'ช่างซี',  description: 'PM ครั้งที่ 3 — เปลี่ยน blade, ทำความสะอาด coolant tank + เปลี่ยน coolant ใหม่', parts_replaced: 'Band saw blade M42 ×1, Coolant 5L', duration_min: 75 },
    { performed_at: d(18),  performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 4 — เปลี่ยน blade + ปรับ tension ให้ถูกต้อง, ตรวจ drive wheel + idler wheel', parts_replaced: 'Band saw blade M42 ×1', duration_min: 60 },
  ]
  for (const l of pmLogsBAND) await prisma.maintenance_log.create({ data: { machine_id: pmBAND, ...l, notes: null, photo_urls: [] } })

  // EQ-PUNCH — 2 PM logs
  const pmPUNCH = id('MC-0008')
  const pmLogsPUNCH = [
    { performed_at: d(130), performed_by: 'ช่างดี',  description: 'PM ครั้งที่ 1 — ตรวจสอบ hydraulic system ครบ, เปลี่ยน cylinder seal kit, วัดแรงดัน 180 bar ปกติ', parts_replaced: 'Cylinder seal kit, O-ring ×12', duration_min: 150 },
    { performed_at: d(67),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 2 — เปลี่ยน punch die ใหม่, ตรวจ ram alignment + stripper spring', parts_replaced: 'Punch die set, Stripper spring ×4', duration_min: 90 },
  ]
  for (const l of pmLogsPUNCH) await prisma.maintenance_log.create({ data: { machine_id: pmPUNCH, ...l, notes: null, photo_urls: [] } })

  // EQ-DRILL — 3 PM logs
  const pmDRILL = id('MC-0009')
  const pmLogsDRILL = [
    { performed_at: d(135), performed_by: 'ช่างซี',  description: 'PM ครั้งที่ 1 — ตรวจสอบ spindle runout (ค่า <0.03mm), ปรับ belt tension, หล่อลื่น quill', parts_replaced: 'Belt V-type ×2, Grease 0.5 ถัง', duration_min: 60 },
    { performed_at: d(90),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 2 — ล้างทำความสะอาด + เปลี่ยน drill chuck ใหม่, ทดสอบ drill ด้วย bit 10–25mm', parts_replaced: 'Jacobs drill chuck 16mm ×1', duration_min: 75 },
    { performed_at: d(31),  performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 3 — PM ปกติ, ตรวจ feed mechanism + auto-feed clutch, หล่อลื่น quill + column', parts_replaced: null, duration_min: 45 },
  ]
  for (const l of pmLogsDRILL) await prisma.maintenance_log.create({ data: { machine_id: pmDRILL, ...l, notes: null, photo_urls: [] } })

  // EQ-TAP — 1 PM log
  const pmTAP = id('MC-0010')
  const pmLogsTAP = [
    { performed_at: d(89),  performed_by: 'ช่างซี',  description: 'PM ครั้งที่ 1 ประจำปี — ตรวจสอบ tap holder set ทุกขนาด, ทดสอบ tapping M12–M24 บน plate 10mm', parts_replaced: 'Tap M16 ×2 (ชำรุด)', duration_min: 60 },
  ]
  for (const l of pmLogsTAP) await prisma.maintenance_log.create({ data: { machine_id: pmTAP, ...l, notes: null, photo_urls: [] } })

  // EQ-STRAIGHTEN — 2 PM logs
  const pmSTR = id('MC-0012')
  const pmLogsSTR = [
    { performed_at: d(145), performed_by: 'ช่างดี',  description: 'PM ประจำปี — ตรวจสอบ roller set ทุกตัว, เปลี่ยน bearing ที่สึกหรอ ×2 จุด, ตรวจ hydraulic clamp', parts_replaced: 'Bearing UC205 ×4, Seal ring ×4', duration_min: 240 },
    { performed_at: d(55),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 2 — ปรับ roller alignment ครบทุกตัว, ทดสอบ straightness กับ flat bar 10mm ยาว 3m', parts_replaced: 'Grease 1 ถัง', duration_min: 120 },
  ]
  for (const l of pmLogsSTR) await prisma.maintenance_log.create({ data: { machine_id: pmSTR, ...l, notes: null, photo_urls: [] } })

  // EQ-GRIND-4 — 5 PM logs (high-frequency blade change monthly)
  const pmGR4 = id('MC-0016')
  const pmLogsGR4 = [
    { performed_at: d(155), performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 1 — เปลี่ยน grinding disc 4" ใหม่, ตรวจ safety guard + wheel guard ไม่มีรอยแตก', parts_replaced: 'Grinding disc 4"×6mm ×1', duration_min: 20 },
    { performed_at: d(124), performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 2 — เปลี่ยน disc, ตรวจ on/off switch + lock button', parts_replaced: 'Grinding disc 4"×6mm ×1', duration_min: 20 },
    { performed_at: d(78),  performed_by: 'ช่างซี',  description: 'PM ครั้งที่ 3 — เปลี่ยน disc, ตรวจ carbon brush สึก 30% เปลี่ยนใหม่', parts_replaced: 'Grinding disc ×1, Carbon brush ×2', duration_min: 30 },
    { performed_at: d(42),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 4 — เปลี่ยน disc, ตรวจ spindle bearing ไม่มีเสียงผิดปกติ', parts_replaced: 'Grinding disc 4"×6mm ×1', duration_min: 20 },
    { performed_at: d(14),  performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 5 — เปลี่ยน disc ประจำเดือน, ตรวจ guard condition + cable insulation', parts_replaced: 'Grinding disc 4"×6mm ×1', duration_min: 20 },
  ]
  for (const l of pmLogsGR4) await prisma.maintenance_log.create({ data: { machine_id: pmGR4, ...l, notes: null, photo_urls: [] } })

  // EQ-GRIND-7 — 4 PM logs (PM#4 ongoing → MAINTENANCE status)
  const pmGR7 = id('MC-0017')
  const pmLogsGR7 = [
    { performed_at: d(120), performed_by: 'ช่างดี',  description: 'PM ครั้งที่ 1 — เปลี่ยน grinding disc 7" + ตรวจ guard, ทดสอบ RPM ที่ load', parts_replaced: 'Grinding disc 7"×6mm ×1', duration_min: 25, notes: null },
    { performed_at: d(88),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 2 — เปลี่ยน disc, ตรวจ on/off switch + side handle', parts_replaced: 'Grinding disc 7" ×1', duration_min: 25, notes: null },
    { performed_at: d(55),  performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 3 — เปลี่ยน disc, ตรวจ carbon brush เปลี่ยนใหม่ 1 คู่', parts_replaced: 'Grinding disc 7" ×1, Carbon brush ×2', duration_min: 30, notes: null },
    { performed_at: d(5),   performed_by: 'ช่างดี',  description: 'PM ครั้งที่ 4 — เริ่ม PM ประจำเดือน ตรวจ spindle bearing + gear housing — อยู่ระหว่างดำเนินการ', parts_replaced: null, duration_min: 0, notes: 'PM ยังไม่เสร็จ อยู่ระหว่างรอ spare part gear housing gasket' },
  ]
  for (const l of pmLogsGR7) await prisma.maintenance_log.create({ data: { machine_id: pmGR7, ...l, photo_urls: [] } })

  // EQ-SPRAY-AIRLESS — 3 PM logs
  const pmSPRAY = id('MC-0022')
  const pmLogsSPRAY = [
    { performed_at: d(135), performed_by: 'ช่างดี',  description: 'PM ครั้งที่ 1 — ตรวจสอบ pump pressure, เปลี่ยน inlet filter + manifold filter ครบชุด', parts_replaced: 'Filter kit (inlet+manifold) ×1 set', duration_min: 45 },
    { performed_at: d(83),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 2 — ตรวจสอบ spray gun, เปลี่ยน tip ที่ worn ทุกขนาด, ตรวจ hose ไม่มีรอยแตก', parts_replaced: 'Spray tip ×3 (517,519,521), Tip guard ×1', duration_min: 60 },
    { performed_at: d(41),  performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 3 — PM ปกติ, ล้างทำความสะอาด pump + ท่อ, ตรวจ pressure relief valve ทำงานถูกต้อง', parts_replaced: 'Filter ×2', duration_min: 60 },
  ]
  for (const l of pmLogsSPRAY) await prisma.maintenance_log.create({ data: { machine_id: pmSPRAY, ...l, notes: null, photo_urls: [] } })

  // EQ-CRANE-10T — 4 PM logs (PM#1 = annual cert + load test)
  const pmCR10 = id('MC-0019')
  const pmLogsCR10 = [
    { performed_at: d(175), performed_by: 'ช่างดี',  description: 'PM ประจำปี + ต่อใบรับรองความปลอดภัยเครน — ตรวจ wire rope, sheave, brake, hook, load test 11T', parts_replaced: 'Brake pad ×2, Hook latch ×1', duration_min: 360 },
    { performed_at: d(130), performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 2 — ตรวจสอบ hoist mechanism + wire rope condition, หล่อลื่น drum shaft', parts_replaced: 'Wire rope grease 1L, Grease 1 ถัง', duration_min: 180 },
    { performed_at: d(80),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 3 — หล่อลื่น drum + sheave ครบทุกจุด, ตรวจ brake lining + overspeed governor', parts_replaced: 'Grease 2 ถัง', duration_min: 180 },
    { performed_at: d(22),  performed_by: 'ช่างดี',  description: 'PM ครั้งที่ 4 — ตรวจสอบ limit switch (upper/lower/side), visual inspection wire rope ทุก strand', parts_replaced: null, duration_min: 120 },
  ]
  for (const l of pmLogsCR10) await prisma.maintenance_log.create({ data: { machine_id: pmCR10, ...l, notes: null, photo_urls: [] } })

  // EQ-CONV-01 — 2 PM logs
  const pmCONV = id('MC-0020')
  const pmLogsCONV = [
    { performed_at: d(145), performed_by: 'ช่างดี',  description: 'PM ประจำปี — ตรวจสอบ belt condition, roller bearing ทุกตัว, motor shaft alignment, ปรับ belt tracking', parts_replaced: 'Bearing 6205 ×2, Belt tensioner ×1', duration_min: 240 },
    { performed_at: d(78),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 2 — ตรวจสอบ belt tension + ปรับ speed controller, ทดสอบ conveyor speed ที่ setpoint', parts_replaced: 'Grease 0.5 ถัง', duration_min: 90 },
  ]
  for (const l of pmLogsCONV) await prisma.maintenance_log.create({ data: { machine_id: pmCONV, ...l, notes: null, photo_urls: [] } })

  // ─── REPAIR TICKETS ───────────────────────────────────────────────────────
  // EQ-CUT-PLASMA25 — 1 closed repair (power source trip)
  await prisma.repair_ticket.create({ data: {
    machine_id: pm25, ticket_code: 'RPR-00001', status: RepairStatus.CLOSED, severity: RepairSeverity.MEDIUM,
    reported_by: 'ช่างเอ', reported_at: d(98),
    problem_description: 'Plasma power source trip บ่อยขึ้น โดยเฉพาะตอน pierce งาน 20mm หนา ความดันตก',
    photos_before: [],
    repaired_by: 'ช่างอีเล็ก', closed_at: d(96),
    repair_description: 'เปลี่ยน capacitor bank 3 ตัวใน power module, ทดสอบ cut 25mm — ปกติดี',
    parts_replaced: 'Capacitor 4700µF ×3, Fuse ×2', duration_min: 240, photos_after: [],
  }})
  await prisma.repair_ticket_seq.update({ where: { id: 1 }, data: { next_val: 2 } })

  // EQ-HBEAM — 1 closed repair (flux feed jam)
  await prisma.repair_ticket.create({ data: {
    machine_id: pmHB, ticket_code: 'RPR-00002', status: RepairStatus.CLOSED, severity: RepairSeverity.HIGH,
    reported_by: 'ช่างดี', reported_at: d(115),
    problem_description: 'Drive roller ลื่น flux feed ไม่สม่ำเสมอ bead width กว้างแคบไม่เท่ากัน ตรวจพบ knurling สึก',
    photos_before: [],
    repaired_by: 'ช่างดี', closed_at: d(113),
    repair_description: 'เปลี่ยน drive roller ใหม่ทั้ง 2 ตัว ปรับ flux feed rate + ทดสอบ SAW weld bead 3 pass',
    parts_replaced: 'Drive roller knurled ×2', duration_min: 300, photos_after: [],
  }})
  await prisma.repair_ticket_seq.update({ where: { id: 1 }, data: { next_val: 3 } })

  // EQ-PRESS-110 — 1 closed (old) + 1 OPEN (current incident — triggered REPAIR status)
  await prisma.repair_ticket.create({ data: {
    machine_id: pmP110, ticket_code: 'RPR-00003', status: RepairStatus.CLOSED, severity: RepairSeverity.LOW,
    reported_by: 'ช่างเอ', reported_at: d(102),
    problem_description: 'Pressure gauge ชำรุด อ่านค่าไม่ได้ แต่เครื่องยังทำงานได้ปกติ',
    photos_before: [],
    repaired_by: 'ช่างซี', closed_at: d(101),
    repair_description: 'เปลี่ยน pressure gauge ใหม่ calibrate 0-250 bar',
    parts_replaced: 'Pressure gauge 250 bar ×1', duration_min: 60, photos_after: [],
  }})
  await prisma.repair_ticket_seq.update({ where: { id: 1 }, data: { next_val: 4 } })

  // EQ-PRESS-110 OPEN ticket — current breakdown
  await prisma.repair_ticket.create({ data: {
    machine_id: pmP110, ticket_code: 'RPR-00004', status: RepairStatus.OPEN, severity: RepairSeverity.HIGH,
    reported_by: 'ช่างเอ', reported_at: d(4),
    problem_description: 'แรงดันไฮดรอลิกตกจาก 210 bar เหลือ 80 bar กดไม่ถึงแรงที่ตั้งไว้ พบ hydraulic oil รั่วที่ cylinder rod seal ชัดเจน',
    photos_before: [],
  }})
  await prisma.repair_ticket_seq.update({ where: { id: 1 }, data: { next_val: 5 } })

  // EQ-CRANE-25T — 1 closed repair (wire rope strand break)
  await prisma.repair_ticket.create({ data: {
    machine_id: pmCR, ticket_code: 'RPR-00005', status: RepairStatus.CLOSED, severity: RepairSeverity.HIGH,
    reported_by: 'ช่างดี', reported_at: d(130),
    problem_description: 'พบ wire rope strand break 2 เส้นที่ drum section ตาม safety standard ต้องเปลี่ยนทันที',
    photos_before: [],
    repaired_by: 'ช่างภายนอก (บ.ไทยฮง)', closed_at: d(127),
    repair_description: 'เปลี่ยน wire rope 6×19 IWRC 16mm ใหม่ทั้งเส้น รับรองโดย วศ. + Load test 27.5T PASS',
    parts_replaced: 'Wire rope 6×19 IWRC 16mm × 45m', duration_min: 480, photos_after: [],
  }})
  await prisma.repair_ticket_seq.update({ where: { id: 1 }, data: { next_val: 6 } })

  // EQ-SAW-BAND — RPR-00006 (blade snap during thick plate cut)
  await prisma.repair_ticket.create({ data: {
    machine_id: pmBAND, ticket_code: 'RPR-00006', status: RepairStatus.CLOSED, severity: RepairSeverity.MEDIUM,
    reported_by: 'ช่างซี', reported_at: d(90),
    problem_description: 'Band saw blade ขาดกลางการตัด plate SUS 60mm — เสียงดังมาก หยุดงานทันที',
    photos_before: [],
    repaired_by: 'ช่างบี', closed_at: d(88),
    repair_description: 'เปลี่ยน band saw blade M42 ใหม่ + ปรับ tension ให้ถูกต้อง + ตรวจ drive wheel',
    parts_replaced: 'Band saw blade M42 (3600×27mm) ×1, Blade guide pad ×2', duration_min: 120, photos_after: [],
  }})
  await prisma.repair_ticket_seq.update({ where: { id: 1 }, data: { next_val: 7 } })

  // EQ-PUNCH — RPR-00007 (hydraulic oil leak)
  await prisma.repair_ticket.create({ data: {
    machine_id: pmPUNCH, ticket_code: 'RPR-00007', status: RepairStatus.CLOSED, severity: RepairSeverity.HIGH,
    reported_by: 'ช่างดี', reported_at: d(105),
    problem_description: 'Hydraulic oil รั่วที่ cylinder top seal ชัดเจน แรงดันตกจาก 180 bar → 120 bar ผลกระทบต่อแรงกด',
    photos_before: [],
    repaired_by: 'ช่างดี', closed_at: d(103),
    repair_description: 'เปลี่ยน cylinder top seal + O-ring ชุดครบ, flush hydraulic oil, ทดสอบ punch 180 bar ปกติ',
    parts_replaced: 'Cylinder seal kit ×1, O-ring set, Hydraulic oil 5L', duration_min: 180, photos_after: [],
  }})
  await prisma.repair_ticket_seq.update({ where: { id: 1 }, data: { next_val: 8 } })

  // EQ-DRILL — RPR-00008 (chuck jaw worn, drill slipping)
  await prisma.repair_ticket.create({ data: {
    machine_id: pmDRILL, ticket_code: 'RPR-00008', status: RepairStatus.CLOSED, severity: RepairSeverity.MEDIUM,
    reported_by: 'ช่างเอ', reported_at: d(95),
    problem_description: 'Drill bit หลุดลื่นขณะ drill — chuck jaw worn ยึดไม่ได้ งานเสียหาย 2 ชิ้น',
    photos_before: [],
    repaired_by: 'ช่างบี', closed_at: d(93),
    repair_description: 'เปลี่ยน Jacobs chuck ใหม่ 16mm calibrate runout <0.05mm ทดสอบ drill ทุกขนาด',
    parts_replaced: 'Jacobs drill chuck 16mm ×1', duration_min: 90, photos_after: [],
  }})
  await prisma.repair_ticket_seq.update({ where: { id: 1 }, data: { next_val: 9 } })

  // EQ-STRAIGHTEN — RPR-00009 (roller bearing seized)
  await prisma.repair_ticket.create({ data: {
    machine_id: pmSTR, ticket_code: 'RPR-00009', status: RepairStatus.CLOSED, severity: RepairSeverity.HIGH,
    reported_by: 'ช่างดี', reported_at: d(120),
    problem_description: 'Roller #3 seized เสียงดังผิดปกติ + vibration มาก — bearing failure หยุดใช้งานทันที',
    photos_before: [],
    repaired_by: 'ช่างดี', closed_at: d(117),
    repair_description: 'เปลี่ยน roller #3 bearing ×2 + re-align roller set ครบทั้ง 5 ตัว ทดสอบ straighten 6mm flat bar',
    parts_replaced: 'Bearing UC205 ×2, Snap ring ×2', duration_min: 240, photos_after: [],
  }})
  await prisma.repair_ticket_seq.update({ where: { id: 1 }, data: { next_val: 10 } })

  // EQ-SPRAY-AIRLESS — RPR-00010 (nozzle clog)
  await prisma.repair_ticket.create({ data: {
    machine_id: pmSPRAY, ticket_code: 'RPR-00010', status: RepairStatus.CLOSED, severity: RepairSeverity.LOW,
    reported_by: 'ช่างเอ', reported_at: d(95),
    problem_description: 'Spray tip อุดตัน spray pattern เสียหาย ล้างด้วย solvent แล้วไม่ดีขึ้น ต้องหยุดงาน',
    photos_before: [],
    repaired_by: 'ช่างบี', closed_at: d(93),
    repair_description: 'เปลี่ยน spray tip ×1 + filter ×2 ทดสอบ spray pattern เป็นรูปเส้น fan สม่ำเสมอ',
    parts_replaced: 'Spray tip 517 ×1, Inlet filter ×2', duration_min: 45, photos_after: [],
  }})
  await prisma.repair_ticket_seq.update({ where: { id: 1 }, data: { next_val: 11 } })

  // EQ-CONV-01 — RPR-00011 (motor bearing failure)
  await prisma.repair_ticket.create({ data: {
    machine_id: pmCONV, ticket_code: 'RPR-00011', status: RepairStatus.CLOSED, severity: RepairSeverity.HIGH,
    reported_by: 'ช่างดี', reported_at: d(110),
    problem_description: 'มอเตอร์ conveyor เสียงดังผิดปกติ + vibration — bearing failure ชัดเจน ต้องหยุดสายการผลิต',
    photos_before: [],
    repaired_by: 'ช่างดี', closed_at: d(107),
    repair_description: 'เปลี่ยน motor bearing ×2 + realign coupling, ทดสอบ conveyor ที่ทุก speed setpoint',
    parts_replaced: 'Motor bearing 6205-2RS ×2, Coupling cushion ×1', duration_min: 300, photos_after: [],
  }})
  await prisma.repair_ticket_seq.update({ where: { id: 1 }, data: { next_val: 12 } })

  // ─── STATUS HISTORY ───────────────────────────────────────────────────────
  // EQ-PRESS-110: OPERATIONAL → REPAIR 4 days ago
  await prisma.machine_status_history.create({ data: {
    machine_id: pmP110, from_status: EquipmentStatus.OPERATIONAL, to_status: EquipmentStatus.REPAIR,
    reason: 'Hydraulic cylinder rod seal รั่ว แรงดันตก — ต้องหยุดเครื่องส่งซ่อม รอ seal kit จาก supplier',
    changed_by: 'หัวหน้าช่างวิชัย', changed_at: d(4),
  }})

  // EQ-CRANE-25T: OPERATIONAL → UNAVAILABLE 11 days ago (cert expired)
  await prisma.machine_status_history.create({ data: {
    machine_id: pmCR, from_status: EquipmentStatus.OPERATIONAL, to_status: EquipmentStatus.UNAVAILABLE,
    reason: 'ใบรับรองความปลอดภัยเครนหมดอายุ 2026-06-01 — อยู่ระหว่างดำเนินการต่ออายุกับกรมแรงงาน',
    changed_by: 'วิศวกรความปลอดภัย', changed_at: d(11),
  }})
  // EQ-CRANE-25T also had the wire rope repair → went to REPAIR briefly
  await prisma.machine_status_history.create({ data: {
    machine_id: pmCR, from_status: EquipmentStatus.OPERATIONAL, to_status: EquipmentStatus.REPAIR,
    reason: 'Wire rope strand break — หยุดใช้งานทันที รอเปลี่ยน wire rope',
    changed_by: 'หัวหน้าช่างวิชัย', changed_at: d(130),
    related_repair_id: null,
  }})
  await prisma.machine_status_history.create({ data: {
    machine_id: pmCR, from_status: EquipmentStatus.REPAIR, to_status: EquipmentStatus.OPERATIONAL,
    reason: 'เปลี่ยน wire rope เสร็จ + load test 27.5T ผ่าน — กลับใช้งานได้ปกติ',
    changed_by: 'หัวหน้าช่างวิชัย', changed_at: d(127),
  }})

  // EQ-WELD-SAW: OPERATIONAL → MAINTENANCE 11 days ago
  await prisma.machine_status_history.create({ data: {
    machine_id: pmSAW, from_status: EquipmentStatus.OPERATIONAL, to_status: EquipmentStatus.MAINTENANCE,
    reason: 'เริ่ม Annual Overhaul ตามแผน — ตรวจสอบ flux system, เปลี่ยน consumable ทั้งหมด, ปรับ arc parameters',
    changed_by: 'ผู้จัดการฝ่ายผลิต', changed_at: d(11),
  }})

  // EQ-BLAST: OPERATIONAL → RETIRED (equipment replaced)
  await prisma.machine_status_history.create({ data: {
    machine_id: id('MC-0021'), from_status: EquipmentStatus.OPERATIONAL, to_status: EquipmentStatus.RETIRED,
    reason: 'ปลดระวางแทนด้วยเครื่องใหม่ Wheelabrator EV20 — เครื่องนี้อายุ 18 ปี ซ่อมบำรุงแพงเกินคุ้ม',
    changed_by: 'ผู้อำนวยการฝ่าย', changed_at: d(181),
  }})

  // EQ-GRIND-7: OPERATIONAL → MAINTENANCE 5 days ago (monthly PM ongoing)
  await prisma.machine_status_history.create({ data: {
    machine_id: pmGR7, from_status: EquipmentStatus.OPERATIONAL, to_status: EquipmentStatus.MAINTENANCE,
    reason: 'เริ่ม PM ประจำเดือน — ตรวจ spindle bearing + gear housing รอ spare part gasket จาก supplier',
    changed_by: 'หัวหน้าช่างวิชัย', changed_at: d(5),
  }})

  // Update last_maintenance_at for all machines to be correct
  for (const m of machineData) {
    await prisma.equipment_resource.update({
      where: { code: m.code },
      data: { last_maintenance_at: m.last_pm, current_status: m.status },
    })
  }

  console.log('  ✓ Machine Demo: rich data seeded — PM logs, repair tickets, status history')
}
