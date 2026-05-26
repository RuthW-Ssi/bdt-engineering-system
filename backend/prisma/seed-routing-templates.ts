/**
 * Seed routing templates from process routing.xlsx
 * Source: bdt-app/document/process routing.xlsx
 *
 * Run: npx ts-node --project tsconfig.json prisma/seed-routing-templates.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ADMIN_UID = 1

// ── Workcenter IDs (from DB) ──────────────────────────────────────
const WC = { BU: 1, AS: 2, PT: 3, PR: 4 }

// ── Formula param codes (must exist in routing_formula_param) ────
const P = {
  per_unit:              'per unit',
  buildup_weight:        'buildup_weight',
  buildup_perimeter:     'buildup-perimeter',
  buildup_weldpoint:     'buildup_weldingpoint',
  buildup_weldsize:      'buildup_weldingsize',
  part_quan:             'part_quan',
  assembly_point:        'assembly_point',
  product_weld_length:   'product_welding_length',
  product_length:        'product_length',
  product_perimeter:     'product_perimeter',
  product_area:          'product_area',
}

// ── Activity template definitions ────────────────────────────────
const ACTIVITY_TEMPLATES = [
  // ── Built-up Fit (Build operation) ───────────────────────────
  { op_code: 'OP-BU-BUILD', seq: 10,  description: '3.1 ยกชิ้นงานขึ้น Jig',              per_minute: 10,   param: P.buildup_weight,    std: 500,  unit: 'kilogram',    manpower: 1, wc: WC.BU },
  { op_code: 'OP-BU-BUILD', seq: 20,  description: '3.2 ประกอบ web & flange',             per_minute: 20,   param: P.buildup_perimeter, std: 6,    unit: 'meter',       manpower: 2, wc: WC.BU },
  { op_code: 'OP-BU-BUILD', seq: 30,  description: '3.3 เชื่อม Tack ชิ้นงาน',            per_minute: 24,   param: P.buildup_weldpoint,  std: 120,  unit: 'point',       manpower: 1, wc: WC.BU },
  { op_code: 'OP-BU-BUILD', seq: 40,  description: '3.4 ตรวจสอบความถูกต้อง',            per_minute: 5,    param: P.buildup_perimeter, std: 3,    unit: 'meter',       manpower: 1, wc: WC.BU },
  { op_code: 'OP-BU-BUILD', seq: 50,  description: '3.5 เขียน Mark no ชิ้นงาน',          per_minute: 5,    param: P.per_unit,          std: 1,    unit: 'unit',        manpower: 1, wc: WC.BU },
  { op_code: 'OP-BU-BUILD', seq: 60,  description: 'ลงบันทึก Report',                     per_minute: 5,    param: P.per_unit,          std: 1,    unit: 'unit',        manpower: 1, wc: WC.BU },

  // ── Built-up Weld (SAW Welding operation) ────────────────────
  { op_code: 'OP-BU-WELD',  seq: 10,  description: '4.1 ยกชิ้นงานขึ้น Station',           per_minute: 5,    param: P.buildup_weight,    std: 500,  unit: 'kilogram',    manpower: 1, wc: WC.BU },
  { op_code: 'OP-BU-WELD',  seq: 20,  description: '4.2 ตั้งค่ากระแสไฟและความเร็วเชื่อม', per_minute: 5,    param: P.buildup_weldsize,  std: 6,    unit: 'mm',          manpower: 1, wc: WC.BU },
  { op_code: 'OP-BU-WELD',  seq: 30,  description: '4.3 เชื่อมแนวที่ 1',                  per_minute: 2.5,  param: P.buildup_weldsize,  std: 6,    unit: 'mm',          manpower: 1, wc: WC.BU },
  { op_code: 'OP-BU-WELD',  seq: 40,  description: '4.4 พลิกชิ้นงาน',                    per_minute: 3,    param: P.buildup_weight,    std: 500,  unit: 'kilogram',    manpower: 1, wc: WC.BU },
  { op_code: 'OP-BU-WELD',  seq: 50,  description: '4.5 เชื่อมแนวที่ 2',                  per_minute: 20,   param: P.buildup_weldsize,  std: 6,    unit: 'mm',          manpower: 1, wc: WC.BU },
  { op_code: 'OP-BU-WELD',  seq: 60,  description: '4.6 พลิกชิ้นงาน',                    per_minute: 3,    param: P.buildup_weight,    std: 500,  unit: 'kilogram',    manpower: 1, wc: WC.BU },
  { op_code: 'OP-BU-WELD',  seq: 70,  description: '4.7 เชื่อมแนวที่ 3',                  per_minute: 20,   param: P.buildup_weldsize,  std: 6,    unit: 'mm',          manpower: 1, wc: WC.BU },
  { op_code: 'OP-BU-WELD',  seq: 80,  description: '4.8 พลิกชิ้นงาน',                    per_minute: 3,    param: P.buildup_weight,    std: 500,  unit: 'kilogram',    manpower: 1, wc: WC.BU },
  { op_code: 'OP-BU-WELD',  seq: 90,  description: '4.9 เชื่อมแนวที่ 4',                  per_minute: 20,   param: P.buildup_weldsize,  std: 6,    unit: 'mm',          manpower: 1, wc: WC.BU },
  { op_code: 'OP-BU-WELD',  seq: 100, description: '4.10 ยกชิ้นงานลง',                   per_minute: 5,    param: P.buildup_weight,    std: 500,  unit: 'kilogram',    manpower: 1, wc: WC.BU },
  { op_code: 'OP-BU-WELD',  seq: 110, description: '4.11 ตรวจสอบความถูกต้อง',            per_minute: 10,   param: P.per_unit,          std: 1,    unit: 'unit',        manpower: 1, wc: WC.BU },
  { op_code: 'OP-BU-WELD',  seq: 120, description: 'ลงบันทึก Report',                     per_minute: 5,    param: P.per_unit,          std: 1,    unit: 'unit',        manpower: 1, wc: WC.BU },

  // ── Assembly Fit-up ───────────────────────────────────────────
  { op_code: 'OP-AS-FIT',   seq: 10,  description: '5.1 ทำการเบิก Part ไปประกอบ',         per_minute: 3,    param: P.part_quan,         std: 5,    unit: 'piece',       manpower: 1, wc: WC.AS },
  { op_code: 'OP-AS-FIT',   seq: 20,  description: '5.2 ยกชิ้นงานไปประกอบ',               per_minute: 5,    param: P.part_quan,         std: 5,    unit: 'piece',       manpower: 1, wc: WC.AS },
  { op_code: 'OP-AS-FIT',   seq: 30,  description: '5.3 ทำการ Lay ชิ้นงานเพื่อประกอบ',    per_minute: 15,   param: P.assembly_point,    std: 5,    unit: 'point',       manpower: 1, wc: WC.AS },
  { op_code: 'OP-AS-FIT',   seq: 40,  description: '5.4 ประกอบชิ้นงานตามแบบ',             per_minute: 30,   param: P.assembly_point,    std: 5,    unit: 'point',       manpower: 2, wc: WC.AS },
  { op_code: 'OP-AS-FIT',   seq: 50,  description: '5.5 ตรวจสอบความถูกต้อง',             per_minute: 10,   param: P.per_unit,          std: 1,    unit: 'unit',        manpower: 1, wc: WC.AS },
  { op_code: 'OP-AS-FIT',   seq: 60,  description: 'ลงบันทึก Report',                     per_minute: 5,    param: P.per_unit,          std: 1,    unit: 'unit',        manpower: 1, wc: WC.AS },

  // ── Assembly Welding ──────────────────────────────────────────
  { op_code: 'OP-AS-WELD',  seq: 10,  description: '6.1 เชื่อมชิ้นงาน',                   per_minute: 5,    param: P.product_weld_length, std: 1,  unit: 'meter',       manpower: 2, wc: WC.AS },
  { op_code: 'OP-AS-WELD',  seq: 20,  description: '6.2 เจียร์แต่งเก็บความเรียบร้อย',     per_minute: 5,    param: P.product_weld_length, std: 1,  unit: 'meter',       manpower: 2, wc: WC.AS },
  { op_code: 'OP-AS-WELD',  seq: 30,  description: '6.3 เผาดัดถ้าโก่งงอ',                 per_minute: 30,   param: P.product_length,    std: 6,    unit: 'meter',       manpower: 1, wc: WC.AS },
  { op_code: 'OP-AS-WELD',  seq: 40,  description: '6.4 ตรวจสอบความถูกต้อง',             per_minute: 10,   param: P.product_perimeter, std: 5,    unit: 'meter',       manpower: 1, wc: WC.AS },
  { op_code: 'OP-AS-WELD',  seq: 50,  description: '6.5 ติด Tag Mark no ชื่อชิ้นงาน',     per_minute: 5,    param: P.per_unit,          std: 1,    unit: 'unit',        manpower: 1, wc: WC.AS },
  { op_code: 'OP-AS-WELD',  seq: 60,  description: 'ลงบันทึก Report',                     per_minute: 5,    param: P.per_unit,          std: 1,    unit: 'unit',        manpower: 1, wc: WC.AS },

  // ── Painting — Blast & Primer (7.x) ──────────────────────────
  { op_code: 'OP-PT-PRIMER', seq: 10, description: '7.1 ยกย้ายชิ้นงานเข้าโรง Blast',      per_minute: 15,   param: P.product_length,    std: 6,    unit: 'meter',       manpower: 2, wc: WC.PT },
  { op_code: 'OP-PT-PRIMER', seq: 20, description: '7.2 ทำการเรียงชิ้นงาน',                per_minute: 5,    param: P.product_length,    std: 6,    unit: 'meter',       manpower: 1, wc: WC.PT },
  { op_code: 'OP-PT-PRIMER', seq: 30, description: '7.3 ทำการ Blast ตาม Spec ที่ต้องการ', per_minute: 5,    param: P.product_area,      std: 1,    unit: 'sq.meter',    manpower: 2, wc: WC.PT },
  { op_code: 'OP-PT-PRIMER', seq: 40, description: '7.4 ทำการตรวจสอบ',                    per_minute: 10,   param: P.product_perimeter, std: 5,    unit: 'meter',       manpower: 1, wc: WC.PT },
  { op_code: 'OP-PT-PRIMER', seq: 50, description: 'ลงบันทึก Report',                     per_minute: 5,    param: P.per_unit,          std: 1,    unit: 'unit',        manpower: 1, wc: WC.PT },
  { op_code: 'OP-PT-PRIMER', seq: 60, description: '7.5 ย้ายชิ้นงานออก',                  per_minute: 5,    param: P.per_unit,          std: 1,    unit: 'unit',        manpower: 1, wc: WC.PT },

  // ── Painting — Top Coat (8.x) ─────────────────────────────────
  { op_code: 'OP-PT-TOPCOAT', seq: 10, description: '8.1 จัดเรียงชิ้นงาน',                per_minute: 5,    param: P.product_length,    std: 6,    unit: 'meter',       manpower: 1, wc: WC.PT },
  { op_code: 'OP-PT-TOPCOAT', seq: 20, description: '8.2 ทาสี',                           per_minute: 4,    param: P.product_area,      std: 1,    unit: 'sq.meter',    manpower: 1, wc: WC.PT },
  { op_code: 'OP-PT-TOPCOAT', seq: 30, description: '8.3 วัดความหนาสี',                   per_minute: 3,    param: P.product_area,      std: 1,    unit: 'sq.meter',    manpower: 1, wc: WC.PT },
  { op_code: 'OP-PT-TOPCOAT', seq: 40, description: '8.4 ตรวจสอบความหนาสี',               per_minute: 3,    param: P.product_area,      std: 1,    unit: 'sq.meter',    manpower: 1, wc: WC.PT },
  { op_code: 'OP-PT-TOPCOAT', seq: 50, description: 'ลงบันทึก Report',                    per_minute: 5,    param: P.per_unit,          std: 1,    unit: 'unit',        manpower: 1, wc: WC.PT },
]

// ── Routing template definitions ─────────────────────────────────
// Operations: { op_code, name, wc, seq, actOpCode? }
// actOpCode = op_code from ACTIVITY_TEMPLATES to link activities
const TEMPLATES = [
  {
    code: 'Main',
    name: 'Main Structural (Built-up Beam / Column)',
    description: 'Routing สำหรับชิ้นงานโครงสร้างหลัก เช่น H-Beam, Column, Built-up',
    applies_to_product_type: null,
    ops: [
      { op_code: 'OP-BU-DRILL',  name: 'Drill',              wc: WC.BU, seq: 10,  actOpCode: null          },
      { op_code: 'OP-BU-BUILD',  name: 'Build (H-Beam Fit)', wc: WC.BU, seq: 20,  actOpCode: 'OP-BU-BUILD' },
      { op_code: 'OP-BU-WELD',   name: 'Weld (SAW)',         wc: WC.BU, seq: 30,  actOpCode: 'OP-BU-WELD'  },
      { op_code: 'OP-BU-FINISH', name: 'Finishing Built-up', wc: WC.BU, seq: 40,  actOpCode: null          },
      { op_code: 'OP-AS-FIT',    name: 'Fit-up',             wc: WC.AS, seq: 50,  actOpCode: 'OP-AS-FIT'   },
      { op_code: 'OP-AS-WELD',   name: 'Weld (Assembly)',    wc: WC.AS, seq: 60,  actOpCode: 'OP-AS-WELD'  },
      { op_code: 'OP-AS-GRIND',  name: 'Grinding',           wc: WC.AS, seq: 70,  actOpCode: null          },
      { op_code: 'OP-AS-FINISH', name: 'Finishing Assembly', wc: WC.AS, seq: 80,  actOpCode: null          },
      { op_code: 'OP-PT-PRIMER', name: 'Primer / Blast',     wc: WC.PT, seq: 90,  actOpCode: 'OP-PT-PRIMER' },
      { op_code: 'OP-PT-FIREPR', name: 'Fire Proof',         wc: WC.PT, seq: 100, actOpCode: null          },
      { op_code: 'OP-PT-TOPCOAT',name: 'Top Coat',           wc: WC.PT, seq: 110, actOpCode: 'OP-PT-TOPCOAT'},
    ],
  },
  {
    code: 'Accessory',
    name: 'Accessory Parts (Purlin / Girt / Anchor)',
    description: 'Routing สำหรับชิ้นงาน Accessory เช่น Purlin, Girt, Anchor Bolt',
    applies_to_product_type: null,
    ops: [
      { op_code: 'OP-BU-DRILL',  name: 'Drill',              wc: WC.BU, seq: 10,  actOpCode: null          },
      { op_code: 'OP-BU-BUILD',  name: 'Build (H-Beam Fit)', wc: WC.BU, seq: 20,  actOpCode: 'OP-BU-BUILD' },
      { op_code: 'OP-BU-WELD',   name: 'Weld (SAW)',         wc: WC.BU, seq: 30,  actOpCode: 'OP-BU-WELD'  },
      { op_code: 'OP-BU-FINISH', name: 'Finishing Built-up', wc: WC.BU, seq: 40,  actOpCode: null          },
      { op_code: 'OP-AS-FIT',    name: 'Fit-up',             wc: WC.AS, seq: 50,  actOpCode: 'OP-AS-FIT'   },
      { op_code: 'OP-AS-WELD',   name: 'Weld (Assembly)',    wc: WC.AS, seq: 60,  actOpCode: 'OP-AS-WELD'  },
      { op_code: 'OP-AS-GRIND',  name: 'Grinding',           wc: WC.AS, seq: 70,  actOpCode: null          },
      { op_code: 'OP-AS-FINISH', name: 'Finishing Assembly', wc: WC.AS, seq: 80,  actOpCode: null          },
      { op_code: 'OP-PT-PRIMER', name: 'Primer / Blast',     wc: WC.PT, seq: 90,  actOpCode: 'OP-PT-PRIMER' },
      { op_code: 'OP-PT-FIREPR', name: 'Fire Proof',         wc: WC.PT, seq: 100, actOpCode: null          },
      { op_code: 'OP-PT-TOPCOAT',name: 'Top Coat',           wc: WC.PT, seq: 110, actOpCode: 'OP-PT-TOPCOAT'},
    ],
  },
  {
    code: 'False',
    name: 'False / Bought-out (No Routing)',
    description: 'Routing สำหรับชิ้นงานที่ซื้อมาหรือไม่มีกระบวนการผลิต',
    applies_to_product_type: null,
    ops: [
      { op_code: 'OP-BU-THREAD', name: 'Threading',          wc: WC.BU, seq: 10,  actOpCode: null },
      { op_code: 'OP-BU-BEND',   name: 'Bending',            wc: WC.BU, seq: 20,  actOpCode: null },
      { op_code: 'OP-PR-PREP',   name: 'Prepare Material',   wc: WC.PR, seq: 30,  actOpCode: null },
      { op_code: 'OP-AS-PREASM', name: 'Pre Assembly',       wc: WC.AS, seq: 40,  actOpCode: null },
      { op_code: 'OP-PT-BLAST',  name: 'Blast',              wc: WC.PT, seq: 50,  actOpCode: null },
    ],
  },
]

async function main() {
  console.log('=== Seed routing templates from process routing.xlsx ===\n')

  // ── 1. Delete all existing routing templates (clear dependents first) ──────────
  console.log('1. Deleting existing routing templates…')
  await prisma.routing_template_binding_rule.deleteMany({})
  await prisma.routing_template_history.deleteMany({})
  await prisma.routing_template_test_fixture.deleteMany({})
  // clear custom_routings that reference templates
  await prisma.custom_routing.updateMany({ data: { cloned_from_template_id: null } })
  // clear product template bindings
  await prisma.products.updateMany({ where: { routing_template_id: { not: null } }, data: { routing_template_id: null } })
  const deleted = await prisma.routing_template.deleteMany({})
  console.log(`   → Deleted ${deleted.count} templates\n`)

  // ── 2. Delete existing routing_activity_templates with these op_codes ──────────
  const opCodes = [...new Set(ACTIVITY_TEMPLATES.map(a => a.op_code))]
  console.log('2. Deleting existing activity templates…')
  const deletedActs = await prisma.routing_activity_template.deleteMany({
    where: { op_code: { in: opCodes } },
  })
  console.log(`   → Deleted ${deletedActs.count} activity templates\n`)

  // ── 3. Create activity templates ──────────────────────────────────────────────
  console.log('3. Creating activity templates…')
  const actMap = new Map<string, number[]>() // op_code → [actId in order]

  for (const a of ACTIVITY_TEMPLATES) {
    const act = await prisma.routing_activity_template.create({
      data: {
        op_code:            a.op_code,
        description:        a.description,
        sequence:           a.seq,
        per_minute:         a.per_minute,
        formula_param_code: a.param,
        std_measure:        a.std,
        unit:               a.unit,
        manpower:           a.manpower,
        workcenter_id:      a.wc,
        source:             'xlsx_seed',
        create_uid:         ADMIN_UID,
        write_uid:          ADMIN_UID,
      },
    })
    if (!actMap.has(a.op_code)) actMap.set(a.op_code, [])
    actMap.get(a.op_code)!.push(act.id)
  }
  console.log(`   → Created ${ACTIVITY_TEMPLATES.length} activity templates\n`)

  // ── 4. Create routing templates with operations ───────────────────────────────
  console.log('4. Creating routing templates…')
  for (const tpl of TEMPLATES) {
    const template = await prisma.routing_template.create({
      data: {
        code:                    tpl.code,
        name:                    tpl.name,
        description:             tpl.description,
        applies_to_product_type: tpl.applies_to_product_type,
        state:                   'active',
        create_uid:              ADMIN_UID,
        write_uid:               ADMIN_UID,
        write_date:              new Date(),
      },
    })

    for (const op of tpl.ops) {
      const workcenterRow = await prisma.mrp_routing_workcenter.create({
        data: {
          template_id:   template.id,
          name:          op.name,
          op_code:       op.op_code,
          sequence:      op.seq,
          workcenter_id: op.wc,
          time_mode:     'formula',
          time_cycle:    0,
          blocked_by_op_ids: [],
          create_uid:    ADMIN_UID,
          write_uid:     ADMIN_UID,
          write_date:    new Date(),
        },
      })

      // Link activity templates to this operation
      if (op.actOpCode && actMap.has(op.actOpCode)) {
        const actIds = actMap.get(op.actOpCode)!
        for (let i = 0; i < actIds.length; i++) {
          await prisma.routing_op_activity.create({
            data: {
              routing_workcenter_id: workcenterRow.id,
              activity_template_id:  actIds[i],
              sequence:              (i + 1) * 10,
            },
          })
        }
      }
    }

    const opCount = tpl.ops.length
    const actCount = tpl.ops.reduce((s, o) => s + (o.actOpCode ? (actMap.get(o.actOpCode)?.length ?? 0) : 0), 0)
    console.log(`   ✓ ${tpl.code.padEnd(12)} — ${opCount} ops, ${actCount} activity links`)
  }

  console.log('\n=== Done ===')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
