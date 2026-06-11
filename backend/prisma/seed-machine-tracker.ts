import { PrismaClient, EquipmentStatus, RepairSeverity, RepairStatus } from '@prisma/client'

export async function seedMachineTracker(prisma: PrismaClient) {
  const now = new Date('2026-06-11T08:00:00Z')
  const d = (days: number) => new Date(now.getTime() - days * 86400000)

  // Update existing machines with tracker fields via upsert
  // Covers all 5 statuses for testing
  const machines = [
    {
      code: 'EQ-CUT-PLASMA25',
      name: 'Plasma/Gas CNC 2.5 m',
      type: 'machine',
      location: 'โซนตัด A',
      manufacturer: 'Hypertherm',
      model: 'EDGE Pro Ti',
      current_status: EquipmentStatus.OPERATIONAL,
      last_maintenance_at: d(22),  // 22 days → green badge
    },
    {
      code: 'EQ-CUT-PLASMA60',
      name: 'Plasma/Gas CNC 6 m',
      type: 'machine',
      location: 'โซนตัด A',
      manufacturer: 'Hypertherm',
      model: 'EDGE Pro Ti XL',
      current_status: EquipmentStatus.OPERATIONAL,
      last_maintenance_at: d(45),  // 45 days → yellow badge
    },
    {
      code: 'EQ-HBEAM',
      name: 'Integrated H-beam Making',
      type: 'machine',
      location: 'โซน H-Beam',
      manufacturer: 'Vernon',
      model: 'VB-1200',
      current_status: EquipmentStatus.OPERATIONAL,
      last_maintenance_at: d(72),  // 72 days → red badge
    },
    {
      code: 'EQ-WELD-SAW',
      name: 'SAW (auto weld)',
      type: 'machine',
      location: 'โซน H-Beam',
      manufacturer: 'Lincoln Electric',
      model: 'NA-5',
      current_status: EquipmentStatus.MAINTENANCE,
      last_maintenance_at: d(60),
    },
    {
      code: 'EQ-PRESS-110',
      name: 'Machine Press 110T',
      type: 'machine',
      location: 'โซนขึ้นรูป',
      manufacturer: 'SEYI',
      model: 'SN1-110',
      current_status: EquipmentStatus.REPAIR,
      last_maintenance_at: d(35),
    },
    {
      code: 'EQ-CRANE-25T',
      name: 'Overhead Crane 25T',
      type: 'handling',
      location: 'Hall A',
      manufacturer: 'Kito',
      model: 'SLG-25T',
      current_status: EquipmentStatus.UNAVAILABLE,
      last_maintenance_at: d(90),
    },
    {
      code: 'EQ-BLAST',
      name: 'Shot Blast Machine',
      type: 'machine',
      location: 'โซนพ่นสี',
      manufacturer: 'Wheelabrator',
      model: 'EV10',
      current_status: EquipmentStatus.RETIRED,
      last_maintenance_at: d(180),
    },
    {
      code: 'EQ-BRAKE-200',
      name: 'Hydraulic Press Brake 200T',
      type: 'machine',
      location: 'โซนขึ้นรูป',
      manufacturer: 'Amada',
      model: 'HFE-200',
      current_status: EquipmentStatus.OPERATIONAL,
      last_maintenance_at: null,  // no PM yet → gray badge
    },
  ]

  const savedMachines: Record<string, { id: number }> = {}
  for (const m of machines) {
    const saved = await prisma.equipment_resource.upsert({
      where: { code: m.code },
      update: {
        location: m.location,
        manufacturer: m.manufacturer,
        model: m.model,
        current_status: m.current_status,
        last_maintenance_at: m.last_maintenance_at,
      },
      create: {
        code: m.code,
        name: m.name,
        type: m.type,
        active: true,
        location: m.location,
        manufacturer: m.manufacturer,
        model: m.model,
        current_status: m.current_status,
        last_maintenance_at: m.last_maintenance_at,
      },
    })
    savedMachines[m.code] = { id: saved.id }
  }

  // PM log for plasma25 (recent PM)
  await prisma.maintenance_log.upsert({
    where: { id: 1 },
    update: {},
    create: {
      machine_id: savedMachines['EQ-CUT-PLASMA25'].id,
      performed_at: d(22),
      performed_by: 'ช่างเอ',
      description: 'เปลี่ยนชุด torch tip และ shield cap, ทดสอบ plasma หัวตัด',
      parts_replaced: 'Plasma tip × 4, Shield cap × 4',
      duration_min: 90,
      photo_urls: [],
    },
  })

  // PM log for H-Beam (overdue)
  await prisma.maintenance_log.upsert({
    where: { id: 2 },
    update: {},
    create: {
      machine_id: savedMachines['EQ-HBEAM'].id,
      performed_at: d(72),
      performed_by: 'ช่างบี',
      description: 'ตรวจสอบและหล่อลื่น bearing, ปรับ alignment แนวทาง',
      parts_replaced: 'Grease × 2 ถัง',
      duration_min: 120,
      photo_urls: [],
    },
  })

  // Repair ticket for EQ-PRESS-110 (currently in REPAIR status)
  const pressId = savedMachines['EQ-PRESS-110'].id
  const existingTicket = await prisma.repair_ticket.findFirst({
    where: { machine_id: pressId, status: { not: RepairStatus.CLOSED } },
  })
  if (!existingTicket) {
    await prisma.repair_ticket.create({
      data: {
        machine_id: pressId,
        ticket_code: 'RPR-00001',
        severity: RepairSeverity.HIGH,
        status: RepairStatus.OPEN,
        reported_by: 'ช่างเอ',
        reported_at: d(3),
        problem_description: 'แรงดันไฮดรอลิกตก ชุดปั๊มรั่ว เครื่องกดไม่ถึงแรงกด',
        photos_before: [],
      },
    })
    // Update sequence past 1 to avoid collision
    await prisma.repair_ticket_seq.update({ where: { id: 1 }, data: { next_val: 2 } })
  }

  // Status history for EQ-PRESS-110
  const pressHistoryCount = await prisma.machine_status_history.count({ where: { machine_id: pressId } })
  if (pressHistoryCount === 0) {
    await prisma.machine_status_history.create({
      data: {
        machine_id: pressId,
        from_status: EquipmentStatus.OPERATIONAL,
        to_status: EquipmentStatus.REPAIR,
        reason: 'แรงดันไฮดรอลิกตก ต้องส่งซ่อม',
        changed_by: 'หัวหน้าช่าง',
        changed_at: d(3),
      },
    })
  }

  console.log(`  ✓ Machine Tracker: ${machines.length} machines seeded`)
}
