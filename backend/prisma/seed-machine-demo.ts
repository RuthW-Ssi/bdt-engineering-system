import { PrismaClient, EquipmentStatus, RepairSeverity, RepairStatus } from '@prisma/client'

export async function seedMachineDemo(prisma: PrismaClient) {
  const d = (daysAgo: number, hour = 8) => {
    const dt = new Date('2026-06-12T08:00:00Z')
    dt.setDate(dt.getDate() - daysAgo)
    dt.setHours(hour)
    return dt
  }

  // ─── Reset machine-tracker tables for the 8 key machines ─────────────────
  const keyCodes = ['EQ-CUT-PLASMA25','EQ-CUT-PLASMA60','EQ-HBEAM','EQ-WELD-SAW',
    'EQ-PRESS-110','EQ-CRANE-25T','EQ-BLAST','EQ-BRAKE-200','EQ-WELD-MAG',
    'EQ-WELD-SMAW','EQ-WELD-SAW']
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
    { code: 'EQ-CUT-PLASMA25',  status: EquipmentStatus.OPERATIONAL, last_pm: d(23) },
    { code: 'EQ-CUT-PLASMA60',  status: EquipmentStatus.OPERATIONAL, last_pm: d(46) },
    { code: 'EQ-HBEAM',         status: EquipmentStatus.OPERATIONAL, last_pm: d(73) },
    { code: 'EQ-WELD-SAW',      status: EquipmentStatus.MAINTENANCE, last_pm: d(61) },
    { code: 'EQ-PRESS-110',     status: EquipmentStatus.REPAIR,      last_pm: d(58) },
    { code: 'EQ-CRANE-25T',     status: EquipmentStatus.UNAVAILABLE, last_pm: d(91) },
    { code: 'EQ-BLAST',         status: EquipmentStatus.RETIRED,     last_pm: d(181) },
    { code: 'EQ-BRAKE-200',     status: EquipmentStatus.OPERATIONAL, last_pm: d(38) },
    { code: 'EQ-WELD-MAG',      status: EquipmentStatus.OPERATIONAL, last_pm: d(53) },
    { code: 'EQ-WELD-SMAW',     status: EquipmentStatus.OPERATIONAL, last_pm: d(28) },
  ]
  for (const m of machineData) {
    await prisma.equipment_resource.update({
      where: { code: m.code },
      data: { current_status: m.status, last_maintenance_at: m.last_pm },
    })
  }

  // ─── PM LOGS ─────────────────────────────────────────────────────────────
  // EQ-CUT-PLASMA25 — 5 PM logs every ~30 days
  const pm25 = id('EQ-CUT-PLASMA25')
  const pmLogs25 = [
    { performed_at: d(143), performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 1 ประจำปี — เปลี่ยน torch tip ครบชุด, ทำความสะอาดหัวตัด plasma, ตรวจ coolant level', parts_replaced: 'Plasma tip ×4, Shield cap ×4', duration_min: 90 },
    { performed_at: d(113), performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 2 — ตรวจสอบ linear guide rail + หล่อลื่น, เปลี่ยน consumable electrode', parts_replaced: 'Electrode ×2, Grease 1 ถัง', duration_min: 75 },
    { performed_at: d(83),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 3 — เปลี่ยน shield cap + plasma tip ชุดใหม่, ทดสอบ cutting quality บน plate 12mm', parts_replaced: 'Shield cap ×4, Plasma tip ×4', duration_min: 90 },
    { performed_at: d(51),  performed_by: 'ช่างซี',  description: 'PM ครั้งที่ 4 — หล่อลื่น linear guide ครบทุกแกน, ตรวจ coolant + refill, ทดสอบ arc stability', parts_replaced: 'Coolant 2L, Grease 0.5 ถัง', duration_min: 120 },
    { performed_at: d(23),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 5 — เปลี่ยน torch tip + electrode ครบชุด, ปรับ cutting height sensor, ทดสอบตัด SS304 10mm', parts_replaced: 'Torch tip ×4, Electrode ×2, Shield cap ×4', duration_min: 90 },
  ]
  for (const l of pmLogs25) await prisma.maintenance_log.create({ data: { machine_id: pm25, ...l, notes: null, photo_urls: [] } })

  // EQ-CUT-PLASMA60 — 3 PM logs
  const pm60 = id('EQ-CUT-PLASMA60')
  const pmLogs60 = [
    { performed_at: d(135), performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 1 — ตรวจสอบ coolant system + เปลี่ยน torch body, ปรับ THC (Torch Height Control)', parts_replaced: 'Torch body, Coolant filter', duration_min: 150 },
    { performed_at: d(89),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 2 — เปลี่ยน plasma tip ครบชุด, ทำความสะอาด cutting table + slat', parts_replaced: 'Plasma tip ×6, Shield cap ×6', duration_min: 120 },
    { performed_at: d(46),  performed_by: 'ช่างซี',  description: 'PM ครั้งที่ 3 — ตรวจสอบ drive system, หล่อลื่น rack & pinion ทุกแกน, ปรับ accuracy ทดสอบ 3 points', parts_replaced: 'Grease 2 ถัง, Lubrication oil 1L', duration_min: 180 },
  ]
  for (const l of pmLogs60) await prisma.maintenance_log.create({ data: { machine_id: pm60, ...l, notes: null, photo_urls: [] } })

  // EQ-HBEAM — 2 PM logs (overdue !)
  const pmHB = id('EQ-HBEAM')
  const pmLogsHB = [
    { performed_at: d(153), performed_by: 'ช่างดี',  description: 'PM ประจำปี — ตรวจสอบ roller ทุกตัว, เปลี่ยน bearing ที่สึกหรอ, ปรับ alignment เส้นทาง H-Beam', parts_replaced: 'Bearing ×4, Seal ring ×4', duration_min: 240 },
    { performed_at: d(73),  performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 2 — หล่อลื่น bearing ครบชุด 8 จุด, ตรวจ welding flux feed, ทดสอบ feed speed 1.2 m/min', parts_replaced: 'Grease 2 ถัง, Flux 5 kg', duration_min: 180 },
  ]
  for (const l of pmLogsHB) await prisma.maintenance_log.create({ data: { machine_id: pmHB, ...l, notes: null, photo_urls: [] } })

  // EQ-WELD-SAW — 3 PM logs
  const pmSAW = id('EQ-WELD-SAW')
  const pmLogsSAW = [
    { performed_at: d(127), performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 1 — ตรวจสอบ wire feeder, เปลี่ยน contact tip + nozzle, ปรับ wire tension', parts_replaced: 'Contact tip ×10, Nozzle ×2', duration_min: 60 },
    { performed_at: d(72),  performed_by: 'ช่างซี',  description: 'PM ครั้งที่ 2 — ทำความสะอาด flux hopper + flux recovery, ปรับ submerged arc parameters', parts_replaced: 'Flux 10 kg', duration_min: 90 },
    { performed_at: d(61),  performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 3 ก่อนเข้า Overhaul — ตรวจสอบ drive rolls, บันทึก condition ก่อนซ่อมบำรุงใหญ่', parts_replaced: 'Drive roll ×2', duration_min: 60 },
  ]
  for (const l of pmLogsSAW) await prisma.maintenance_log.create({ data: { machine_id: pmSAW, ...l, notes: null, photo_urls: [] } })

  // EQ-PRESS-110 — 2 PM logs before repair incident
  const pmP110 = id('EQ-PRESS-110')
  const pmLogsP110 = [
    { performed_at: d(143), performed_by: 'ช่างดี',  description: 'PM ครั้งที่ 1 — ตรวจสอบ hydraulic system, เปลี่ยน oil filter, วัดแรงดัน 210 bar ปกติ', parts_replaced: 'Hydraulic oil filter, Seal kit', duration_min: 120 },
    { performed_at: d(58),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 2 — ตรวจสอบ hydraulic seal พบรั่วเล็กน้อย แต่แรงดันยังอยู่ 195 bar ตัดสินใจ monitor ต่อ', parts_replaced: 'Oil 5L (เติม)', duration_min: 90, notes: 'พบรั่วที่ cylinder seal ขนาดเล็ก แนะนำเปลี่ยนใน PM ครั้งถัดไป' },
  ]
  for (const l of pmLogsP110) await prisma.maintenance_log.create({ data: { machine_id: pmP110, ...l, photo_urls: [] } })

  // EQ-CRANE-25T — 2 PM logs
  const pmCR = id('EQ-CRANE-25T')
  const pmLogsCR = [
    { performed_at: d(148), performed_by: 'ช่างดี',  description: 'PM ประจำปี + ต่อใบรับรองความปลอดภัยประจำปี — ตรวจ wire rope, sheave, brake, load test 27.5T', parts_replaced: 'Wire rope 1 section, Brake pad ×4', duration_min: 480 },
    { performed_at: d(91),  performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 2 — ตรวจสอบ hoist mechanism, หล่อลื่น drum + sheave, ตรวจ limit switch ครบทุกตัว', parts_replaced: 'Grease 3 ถัง, Wire rope grease 2L', duration_min: 240 },
  ]
  for (const l of pmLogsCR) await prisma.maintenance_log.create({ data: { machine_id: pmCR, ...l, notes: null, photo_urls: [] } })

  // EQ-BRAKE-200 — 2 PM logs
  const pmBK = id('EQ-BRAKE-200')
  const pmLogsBK = [
    { performed_at: d(108), performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 1 — ตรวจสอบ hydraulic clamping system, ปรับ back gauge ± 0.1mm', parts_replaced: 'Hydraulic seal kit', duration_min: 90 },
    { performed_at: d(38),  performed_by: 'ช่างซี',  description: 'PM ครั้งที่ 2 — เปลี่ยน hydraulic oil ครบระบบ, ปรับ bending angle calibration, ทดสอบ bending plate 6mm', parts_replaced: 'Hydraulic oil 20L, Oil filter ×2', duration_min: 150 },
  ]
  for (const l of pmLogsBK) await prisma.maintenance_log.create({ data: { machine_id: pmBK, ...l, notes: null, photo_urls: [] } })

  // EQ-WELD-MAG — 2 PM logs
  const pmMAG = id('EQ-WELD-MAG')
  const pmLogsMAG = [
    { performed_at: d(113), performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 1 — ตรวจสอบ wire feeder, เปลี่ยน contact tip ครบชุด, ปรับ wire tension 2.5 kgf', parts_replaced: 'Contact tip ×10, Nozzle ×2', duration_min: 45 },
    { performed_at: d(53),  performed_by: 'ช่างเอ',  description: 'PM ครั้งที่ 2 — ทำความสะอาด torch + ท่อ gas, เปลี่ยน liner, ปรับ shielding gas flow 15 L/min', parts_replaced: 'Wire liner, Contact tip ×6', duration_min: 60 },
  ]
  for (const l of pmLogsMAG) await prisma.maintenance_log.create({ data: { machine_id: pmMAG, ...l, notes: null, photo_urls: [] } })

  // EQ-WELD-SMAW — 2 PM logs
  const pmSMAW = id('EQ-WELD-SMAW')
  const pmLogsSMAW = [
    { performed_at: d(98),  performed_by: 'ช่างซี',  description: 'PM ครั้งที่ 1 — ตรวจสอบ cable + electrode holder, ทดสอบ OCV + welding current accuracy', parts_replaced: 'Electrode holder tip', duration_min: 30 },
    { performed_at: d(28),  performed_by: 'ช่างบี',  description: 'PM ครั้งที่ 2 — ตรวจสอบ connection + ทำความสะอาด terminal, ทดสอบ welding ด้วย E7018', parts_replaced: null, duration_min: 30 },
  ]
  for (const l of pmLogsSMAW) await prisma.maintenance_log.create({ data: { machine_id: pmSMAW, ...l, notes: null, photo_urls: [] } })

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
    machine_id: id('EQ-BLAST'), from_status: EquipmentStatus.OPERATIONAL, to_status: EquipmentStatus.RETIRED,
    reason: 'ปลดระวางแทนด้วยเครื่องใหม่ Wheelabrator EV20 — เครื่องนี้อายุ 18 ปี ซ่อมบำรุงแพงเกินคุ้ม',
    changed_by: 'ผู้อำนวยการฝ่าย', changed_at: d(181),
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
