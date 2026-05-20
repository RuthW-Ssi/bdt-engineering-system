import { PrismaClient } from '@prisma/client'
import * as bcryptjs from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // ══════════════════════════════════════════════════════════════
  // Sprint 1: Material Master seed
  // ══════════════════════════════════════════════════════════════

  // ── res_users: admin ──────────────────────────────────────
  const adminPassword = await bcryptjs.hash(
    process.env.ADMIN_SEED_PASSWORD ?? 'BdtDev2026!',
    12,
  )
  await prisma.res_users.upsert({
    where: { login: 'admin' },
    update: { password: adminPassword, role: 'admin' },
    create: { login: 'admin', name: 'Administrator', active: true, password: adminPassword, role: 'admin' },
  })

  // ── uom_category + uom_uom (20 standard BDT units) ───────
  const cats = {
    Quantity: await prisma.uom_category.upsert({ where: { id: 1 }, update: {}, create: { name: 'Quantity' } }),
    Length:   await prisma.uom_category.upsert({ where: { id: 2 }, update: {}, create: { name: 'Length' } }),
    Mass:     await prisma.uom_category.upsert({ where: { id: 3 }, update: {}, create: { name: 'Mass' } }),
    Volume:   await prisma.uom_category.upsert({ where: { id: 4 }, update: {}, create: { name: 'Volume' } }),
  }

  const uomData = [
    { name: 'Each',        category_id: cats.Quantity.id, uom_type: 'reference' },
    { name: 'Set',         category_id: cats.Quantity.id, uom_type: 'bigger' },
    { name: 'Pieces',      category_id: cats.Quantity.id, uom_type: 'bigger' },
    { name: 'Roll',        category_id: cats.Quantity.id, uom_type: 'bigger' },
    { name: 'Box',         category_id: cats.Quantity.id, uom_type: 'bigger' },
    { name: 'Book',        category_id: cats.Quantity.id, uom_type: 'bigger' },
    { name: 'Pack',        category_id: cats.Quantity.id, uom_type: 'bigger' },
    { name: 'Pair',        category_id: cats.Quantity.id, uom_type: 'bigger' },
    { name: 'Sheet',       category_id: cats.Quantity.id, uom_type: 'bigger' },
    { name: 'Cylinder',    category_id: cats.Quantity.id, uom_type: 'bigger' },
    { name: 'Metres',      category_id: cats.Length.id,   uom_type: 'reference' },
    { name: 'Centimetres', category_id: cats.Length.id,   uom_type: 'smaller' },
    { name: 'Feet',        category_id: cats.Length.id,   uom_type: 'bigger' },
    { name: 'Kilograms',   category_id: cats.Mass.id,     uom_type: 'reference' },
    { name: 'Litre',       category_id: cats.Volume.id,   uom_type: 'reference' },
    { name: 'Gallon',      category_id: cats.Volume.id,   uom_type: 'bigger' },
    { name: 'Pail',        category_id: cats.Volume.id,   uom_type: 'bigger' },
    { name: 'Can',         category_id: cats.Volume.id,   uom_type: 'bigger' },
    { name: 'Bottle',      category_id: cats.Volume.id,   uom_type: 'bigger' },
    { name: 'Drum',        category_id: cats.Volume.id,   uom_type: 'bigger' },
  ]

  for (let i = 0; i < uomData.length; i++) {
    await prisma.uom_uom.upsert({
      where: { id: i + 1 },
      update: {},
      create: uomData[i],
    })
  }

  // ── account_account ──────────────────────────────────────
  const accounts = [
    { code: '61311', name: 'Employee Recreation', account_type: 'expense' },
    { code: '69101', name: 'Advertising', account_type: 'expense' },
    { code: '61310', name: 'Personnel Activity', account_type: 'expense' },
    { code: '61249', name: 'Other Non-Fringe Benefits', account_type: 'expense' },
    { code: '61235', name: 'Uniform', account_type: 'expense' },
    { code: '62411', name: 'Plant Machine, Equipment, Tools', account_type: 'asset' },
    { code: '62412', name: 'Office Equipment, Furniture & Fixture', account_type: 'asset' },
    { code: '61234', name: 'Medical & Tools', account_type: 'expense' },
    { code: '62401', name: 'Printing & Stationary', account_type: 'expense' },
    { code: '62402', name: 'Photocopies & Fax', account_type: 'expense' },
    { code: '62403', name: 'Computer Supplies', account_type: 'expense' },
    { code: '62404', name: 'Janitorial', account_type: 'expense' },
    { code: '62409', name: 'Other Office', account_type: 'expense' },
    { code: '67206', name: 'Gardening', account_type: 'expense' },
    { code: '56130', name: 'Office Building Maintenance', account_type: 'expense' },
    { code: '62405', name: 'Safety Supplies', account_type: 'expense' },
  ]
  for (const a of accounts) {
    await prisma.account_account.upsert({ where: { code: a.code }, update: {}, create: a })
  }

  // ── product_category (Sprint 1: groups 1-7 + steel 9-19) ──
  const categoryData = [
    {
      name: 'พนักงานและกิจกรรมต่างๆ', group_no: '1',
      prefix_5: '10000', needs_criticality: false,
      subgroups: [
        { name: 'Employee Recreation',       group_no: '1.1', prefix_5: '10100', account_code: '61311' },
        { name: 'Advertising',               group_no: '1.2', prefix_5: '10200', account_code: '69101' },
        { name: 'Personnel Activity',        group_no: '1.3', prefix_5: '10300', account_code: '61310' },
        { name: 'Other Non-Fringe Benefits', group_no: '1.4', prefix_5: '10400', account_code: '61249' },
        { name: 'Uniform',                   group_no: '1.5', prefix_5: '10500', account_code: '61235' },
      ],
    },
    {
      name: 'เครื่องมือและอุปกรณ์โรงงาน', group_no: '2',
      prefix_5: '20000', needs_criticality: false,
      subgroups: [
        { name: 'Plant Machine, Equipment, Tools', group_no: '2.1', prefix_5: '20100', account_code: '62411' },
      ],
    },
    {
      name: 'อุปกรณ์สำนักงาน', group_no: '3',
      prefix_5: '30000', needs_criticality: false,
      subgroups: [
        { name: 'Office Equipment, Furniture & Fixture', group_no: '3.1', prefix_5: '30100', account_code: '62412' },
      ],
    },
    {
      name: 'ยาและอุปกรณ์ทางการแพทย์', group_no: '4',
      prefix_5: '40000', needs_criticality: false,
      subgroups: [
        { name: 'Medical & Tools', group_no: '4.1', prefix_5: '40100', account_code: '61234' },
      ],
    },
    {
      name: 'วัสดุสิ้นเปลืองสำนักงาน', group_no: '5',
      prefix_5: '50000', needs_criticality: false,
      subgroups: [
        { name: 'Printing & Stationary', group_no: '5.1', prefix_5: '50100', account_code: '62401' },
        { name: 'Photocopies & Fax',     group_no: '5.2', prefix_5: '50200', account_code: '62402' },
        { name: 'Computer Supplies',     group_no: '5.3', prefix_5: '50300', account_code: '62403' },
        { name: 'Janitorial',            group_no: '5.4', prefix_5: '50400', account_code: '62404' },
        { name: 'Other Office',          group_no: '5.5', prefix_5: '50500', account_code: '62409' },
        { name: 'Gardening',             group_no: '5.6', prefix_5: '50600', account_code: '67206' },
      ],
    },
    {
      name: 'อุปกรณ์ซ่อมแซมอาคาร', group_no: '6',
      prefix_5: '60000', needs_criticality: false,
      subgroups: [
        { name: 'Office Building Maintenance', group_no: '6.1', prefix_5: '60100', account_code: '56130' },
      ],
    },
    {
      name: 'วัสดุและอุปกรณ์ความปลอดภัย', group_no: '7',
      prefix_5: '70000', needs_criticality: false,
      subgroups: [
        { name: 'Safety Supplies', group_no: '7.1', prefix_5: '70100', account_code: '62405' },
      ],
    },
    // Sprint 2: Main Structures (group 8 — for standard product templates)
    { name: 'Main Structures',                      group_no: '8',  prefix_5: 'MS000', needs_criticality: false, subgroups: [] },
    // Steel groups (9-19)
    { name: 'Steel Plate (แผ่นเหล็ก)',           group_no: '9',  prefix_5: 'PL000', needs_criticality: false, subgroups: [] },
    { name: 'Hot Roll Shape (HR Shape)',            group_no: '10', prefix_5: 'HR000', needs_criticality: false, subgroups: [] },
    { name: 'Cold Form Shape',                      group_no: '11', prefix_5: 'CF000', needs_criticality: false, subgroups: [] },
    { name: 'Pipe & Tube (ท่อเหล็ก)',              group_no: '12', prefix_5: 'PT000', needs_criticality: false, subgroups: [] },
    { name: 'Bolt, Nut & Fastener',                 group_no: '13', prefix_5: 'BN000', needs_criticality: false, subgroups: [] },
    { name: 'Welding Consumable',                   group_no: '14', prefix_5: 'WC000', needs_criticality: false, subgroups: [] },
    { name: 'Paint & Coating',                      group_no: '15', prefix_5: 'PC000', needs_criticality: false, subgroups: [] },
    { name: 'Building Component',                   group_no: '16', prefix_5: 'BC000', needs_criticality: false, subgroups: [] },
    { name: 'Steel Accessory',                      group_no: '17', prefix_5: 'AC000', needs_criticality: false, subgroups: [] },
    { name: 'Spare Part',                           group_no: '18', prefix_5: 'SP000', needs_criticality: true,  subgroups: [] },
    { name: 'Fixed Asset / Machine',                group_no: '19', prefix_5: 'FA000', needs_criticality: true,  subgroups: [] },
    // Sprint 2: New groups (20-26)
    { name: 'Part Components',                      group_no: '20', prefix_5: 'PA000', needs_criticality: false, subgroups: [] },
    { name: 'Services / Construction',              group_no: '21', prefix_5: 'SV000', needs_criticality: false, subgroups: [] },
    { name: 'Transport Services',                   group_no: '22', prefix_5: 'TS000', needs_criticality: false, subgroups: [] },
    { name: 'Fabrication Services',                 group_no: '23', prefix_5: 'FB000', needs_criticality: false, subgroups: [] },
    { name: 'Maintenance',                          group_no: '24', prefix_5: 'MT000', needs_criticality: false, subgroups: [] },
    { name: 'Measurement Tools',                    group_no: '25', prefix_5: 'ME000', needs_criticality: false, subgroups: [] },
    { name: 'Stationary',                           group_no: '26', prefix_5: 'ST000', needs_criticality: false, subgroups: [] },
  ]

  for (const cat of categoryData) {
    const parent = await prisma.product_category.upsert({
      where: { prefix_5: cat.prefix_5 },
      update: {},
      create: {
        name: cat.name,
        group_no: cat.group_no,
        prefix_5: cat.prefix_5,
        needs_criticality: cat.needs_criticality,
        complete_name: cat.name,
      },
    })
    for (const sub of cat.subgroups ?? []) {
      const account = await prisma.account_account.findUnique({ where: { code: sub.account_code } })
      await prisma.product_category.upsert({
        where: { prefix_5: sub.prefix_5 },
        update: {},
        create: {
          name: sub.name,
          parent_id: parent.id,
          group_no: sub.group_no,
          prefix_5: sub.prefix_5,
          account_id: account?.id,
          needs_criticality: false,
          complete_name: `${cat.name} / ${sub.name}`,
        },
      })
    }
  }

  // ── part_code_seq: initialise rows for every prefix ──────
  const allCats = await prisma.product_category.findMany({ where: { prefix_5: { not: null } } })
  for (const c of allCats) {
    if (!c.prefix_5) continue
    await prisma.part_code_seq.upsert({
      where: { prefix_5: c.prefix_5 },
      update: {},
      create: { prefix_5: c.prefix_5, next_run: 1 },
    })
  }

  // ══════════════════════════════════════════════════════════════
  // Sprint 2: Product Layer seed
  // ══════════════════════════════════════════════════════════════

  // ── Mark Prefix Master (27 entries) ──────────────────────────
  const MARK_PREFIXES = [
    // Assembly (p)
    { code: 'C',      label: 'Column',           category: 'assembly',      part_type_code: 'p' },
    { code: 'SC',     label: 'Sub Column',       category: 'assembly',      part_type_code: 'p' },
    { code: 'P',      label: 'Post',             category: 'assembly',      part_type_code: 'p' },
    { code: 'RF',     label: 'Rafter',           category: 'assembly',      part_type_code: 'p' },
    { code: 'B',      label: 'Beam',             category: 'assembly',      part_type_code: 'p' },
    { code: 'SB',     label: 'Sub Beam',         category: 'assembly',      part_type_code: 'p' },
    { code: 'CA',     label: 'Canopy',           category: 'assembly',      part_type_code: 'p' },
    { code: 'FR',     label: 'Frame',            category: 'assembly',      part_type_code: 'p' },
    { code: 'LP',     label: 'Lose Plate',       category: 'assembly',      part_type_code: 'p' },
    { code: 'TR',     label: 'Truss',            category: 'assembly',      part_type_code: '-' },
    // Member (m)
    { code: 'PS',     label: 'Pipe Stud',        category: 'member',        part_type_code: 'm' },
    { code: 'VB',     label: 'Vertical Brace',   category: 'member',        part_type_code: 'm' },
    { code: 'HB',     label: 'Horizontal Brace', category: 'member',        part_type_code: 'm' },
    { code: 'ST',     label: 'Stair',            category: 'member',        part_type_code: 'm' },
    { code: 'R',      label: 'Rod',              category: 'member',        part_type_code: 'm' },
    { code: 'PU',     label: 'Purlin',           category: 'member',        part_type_code: 'm' },
    { code: 'GR',     label: 'Girt',             category: 'member',        part_type_code: 'm' },
    { code: 'SG',     label: 'Support Gutter',   category: 'member',        part_type_code: 'm' },
    { code: 'GU',     label: 'Gutter',           category: 'member',        part_type_code: 'm' },
    { code: 'MZ',     label: 'Mezzanine',        category: 'member',        part_type_code: 'm' },
    // Other (o)
    { code: 'FB',     label: 'Fly Brace',        category: 'other',         part_type_code: 'o' },
    { code: 'ANGLE',  label: 'Angle',            category: 'other',         part_type_code: 'o' },
    // Sub-component (w/f)
    { code: 'WEB',    label: 'Web',              category: 'sub_component', part_type_code: 'w' },
    { code: 'FLG',    label: 'Flange',           category: 'sub_component', part_type_code: 'f' },
    // Plate parts (p)
    { code: 'END',    label: 'End Plate',        category: 'plate_part',    part_type_code: 'p' },
    { code: 'GUSSET', label: 'Gusset Plate',     category: 'plate_part',    part_type_code: 'p' },
    { code: 'RIB',    label: 'Rib Plate',        category: 'plate_part',    part_type_code: 'p' },
    { code: 'STIFF',  label: 'Stiff Plate',      category: 'plate_part',    part_type_code: 'p' },
  ]

  for (const mp of MARK_PREFIXES) {
    await prisma.mark_prefix_master.upsert({
      where: { code: mp.code },
      update: {},
      create: mp,
    })
  }

  // ── Tekla Prefix Mapping (21 entries) ───────────────────────
  const TEKLA_MAPPINGS = [
    { tekla_type: 'CO',  bdt_mark_prefix: 'C',      confidence: 'high',   source: '0X202 actual' },
    { tekla_type: 'BE',  bdt_mark_prefix: 'B',      confidence: 'medium', source: 'inferred' },
    { tekla_type: 'SBE', bdt_mark_prefix: 'SB',     confidence: 'medium', source: 'inferred' },
    { tekla_type: 'RA',  bdt_mark_prefix: 'RF',     confidence: 'medium', source: 'inferred' },
    { tekla_type: 'TR',  bdt_mark_prefix: 'TR',     confidence: 'high',   source: 'direct' },
    { tekla_type: 'FB',  bdt_mark_prefix: 'FB',     confidence: 'high',   source: '0X202 actual' },
    { tekla_type: 'VB',  bdt_mark_prefix: 'VB',     confidence: 'high',   source: 'direct' },
    { tekla_type: 'HB',  bdt_mark_prefix: 'HB',     confidence: 'high',   source: 'direct' },
    { tekla_type: 'PU',  bdt_mark_prefix: 'PU',     confidence: 'high',   source: 'direct' },
    { tekla_type: 'GR',  bdt_mark_prefix: 'GR',     confidence: 'high',   source: 'direct' },
    { tekla_type: 'PO',  bdt_mark_prefix: 'P',      confidence: 'medium', source: 'inferred' },
    { tekla_type: 'MZ',  bdt_mark_prefix: 'MZ',     confidence: 'high',   source: 'rev-3 Q3' },
    { tekla_type: 'CN',  bdt_mark_prefix: 'CA',     confidence: 'low',    source: 'inferred' },
    { tekla_type: 'FR',  bdt_mark_prefix: 'FR',     confidence: 'high',   source: 'direct' },
    { tekla_type: 'ST',  bdt_mark_prefix: 'ST',     confidence: 'high',   source: 'direct' },
    { tekla_type: 'w',   bdt_mark_prefix: 'WEB',    confidence: 'high',   source: '0X202 actual' },
    { tekla_type: 'f',   bdt_mark_prefix: 'FLG',    confidence: 'high',   source: '0X202 actual' },
    { tekla_type: 'EP',  bdt_mark_prefix: 'END',    confidence: 'medium', source: 'inferred' },
    { tekla_type: 'GP',  bdt_mark_prefix: 'GUSSET', confidence: 'medium', source: 'inferred' },
    { tekla_type: 'RP',  bdt_mark_prefix: 'RIB',    confidence: 'medium', source: 'inferred' },
    { tekla_type: 'SP',  bdt_mark_prefix: 'STIFF',  confidence: 'medium', source: 'inferred' },
  ]

  for (const tm of TEKLA_MAPPINGS) {
    await prisma.tekla_prefix_mapping.upsert({
      where: { tekla_type: tm.tekla_type },
      update: {},
      create: tm,
    })
  }

  // ── Steel Grade Master (7 entries) ─────────────────────────
  const STEEL_GRADES = [
    { code: 'SS400', standard: 'JIS G3101', yield_mpa: 245, tensile_mpa: 400, notes: 'General structural' },
    { code: 'SM490', standard: 'JIS G3106', yield_mpa: 325, tensile_mpa: 490 },
    { code: 'SM520', standard: 'JIS G3106', yield_mpa: 355, tensile_mpa: 520 },
    { code: 'SM570', standard: 'JIS G3106', yield_mpa: 450, tensile_mpa: 570 },
    { code: 'A36',   standard: 'ASTM A36',  yield_mpa: 250, tensile_mpa: 400, notes: 'US structural' },
    { code: 'G550',  standard: 'AS 1397',   yield_mpa: 550, tensile_mpa: 550, notes: 'Coldform galvanized' },
    { code: 'HY370', standard: 'JIS G3106', yield_mpa: 365, tensile_mpa: 490, notes: 'SM490YB equivalent — common in Standard Part HY370 series' },
  ]

  for (const sg of STEEL_GRADES) {
    await prisma.steel_grade.upsert({
      where: { code: sg.code },
      update: {},
      create: sg,
    })
  }

  // ── Sample Project 0X202 + Zones ──────────────────────────
  const admin = await prisma.res_users.findFirst({ where: { login: 'admin' } })
  const adminId = admin?.id ?? 1

  const proj = await prisma.project.upsert({
    where: { project_code: '0X202' },
    update: {},
    create: {
      project_code: '0X202',
      name: 'Warehouse Samut Prakan (WH-CO1-FACTORY)',
      state: 'in_design',
      create_uid: adminId,
      write_uid: adminId,
    },
  })

  // Zone WH
  const zoneWH = await prisma.project_zone.upsert({
    where: { project_id_code: { project_id: proj.id, code: 'WH' } },
    update: { erection_sequence: 1 },
    create: { project_id: proj.id, code: 'WH', label: 'Warehouse Building', erection_sequence: 1 },
  })

  // Zone OF
  const zoneOF = await prisma.project_zone.upsert({
    where: { project_id_code: { project_id: proj.id, code: 'OF' } },
    update: { erection_sequence: 2 },
    create: { project_id: proj.id, code: 'OF', label: 'Office Building', erection_sequence: 2 },
  })

  // ── product_code_seq: init STD + CUS counters ─────────────
  // Use raw SQL since product_code_seq is not a Prisma model
  await prisma.$executeRaw`
    INSERT INTO product_code_seq (kind, next_run)
    VALUES ('STD', 13), ('CUS', 1)
    ON CONFLICT (kind) DO UPDATE SET next_run = GREATEST(product_code_seq.next_run, EXCLUDED.next_run)
  `

  // ── 12 BDTOM Standard Product Templates ───────────────────
  const mainStructures = await prisma.product_category.findFirst({
    where: { prefix_5: 'MS000' },
  })
  const msCategId = mainStructures?.id ?? 1

  const STANDARD_TEMPLATES = [
    { product_code: 'STD-00001', engineering_code: 'BDTOM01000', name: 'CANOPY' },
    { product_code: 'STD-00002', engineering_code: 'BDTOM02000', name: 'BEAM' },
    { product_code: 'STD-00003', engineering_code: 'BDTOM03000', name: 'COLUMN' },
    { product_code: 'STD-00004', engineering_code: 'BDTOM04000', name: 'RAFTER' },
    { product_code: 'STD-00005', engineering_code: 'BDTOM05000', name: 'RAFTERTRUSS' },
    { product_code: 'STD-00006', engineering_code: 'BDTOM06000', name: 'TRANSFERTRUSS' },
    { product_code: 'STD-00007', engineering_code: 'BDTOM07000', name: 'TRANSFERBEAM' },
    { product_code: 'STD-00008', engineering_code: 'BDTOM08000', name: 'CONNECTIONPLATE' },
    { product_code: 'STD-00009', engineering_code: 'BDTOM09000', name: 'SUBTRUSS' },
    { product_code: 'STD-00010', engineering_code: 'BDTOM10000', name: 'POST' },
    { product_code: 'STD-00011', engineering_code: 'BDTOM11000', name: 'MEZZANINE' },
    { product_code: 'STD-00012', engineering_code: 'BDTH000667', name: 'Steel Structure' },
  ]

  for (const tpl of STANDARD_TEMPLATES) {
    await prisma.products.upsert({
      where: { product_code: tpl.product_code },
      update: { state: 'released', write_uid: adminId, write_date: new Date() },
      create: {
        product_code: tpl.product_code,
        engineering_code: tpl.engineering_code,
        name: tpl.name,
        categ_id: msCategId,
        product_type: 'standard',
        state: 'released',
        sale_ok: false,
        purchase_ok: false,
        create_uid: adminId,
        write_uid: adminId,
      },
    })
  }

  // ── Mock customers (Sprint 6 demo) ───────────────────────────
  const custThai = await prisma.res_partner.upsert({
    where: { ref: 'TST-001' },
    update: {},
    create: {
      ref: 'TST-001',
      name: 'บริษัท ไทยสตีล จำกัด',
      phone: '02-xxx-xxxx',
      email: 'contact@thaisteel.co.th',
      city: 'กรุงเทพมหานคร',
      is_company: true,
      customer_rank: 1,
      active: true,
    },
  })

  const custLogis = await prisma.res_partner.upsert({
    where: { ref: 'LGT-001' },
    update: {},
    create: {
      ref: 'LGT-001',
      name: 'บริษัท ลอจิสติกส์ไทย จำกัด',
      phone: '038-xxx-xxxx',
      email: 'info@logisticsth.co.th',
      city: 'ชลบุรี',
      is_company: true,
      customer_rank: 1,
      active: true,
    },
  })

  // ── Mock projects 0X123 + 0X124 ──────────────────────────────
  const proj123 = await prisma.project.upsert({
    where: { project_code: '0X123' },
    update: {},
    create: {
      project_code: '0X123',
      name: 'อาคารโรงงาน A3',
      state: 'in_design',
      customer_id: custThai.id,
      create_uid: adminId,
      write_uid: adminId,
    },
  })

  await prisma.project_zone.upsert({
    where: { project_id_code: { project_id: proj123.id, code: 'A3' } },
    update: { erection_sequence: 1 },
    create: { project_id: proj123.id, code: 'A3', label: 'โรงงาน Block A3', erection_sequence: 1 },
  })
  await prisma.project_zone.upsert({
    where: { project_id_code: { project_id: proj123.id, code: 'SP' } },
    update: { erection_sequence: 2 },
    create: { project_id: proj123.id, code: 'SP', label: 'Substation & Pump Room', erection_sequence: 2 },
  })

  const proj124 = await prisma.project.upsert({
    where: { project_code: '0X124' },
    update: {},
    create: {
      project_code: '0X124',
      name: 'โกดังเก็บสินค้า Zone B',
      state: 'won',
      customer_id: custLogis.id,
      create_uid: adminId,
      write_uid: adminId,
    },
  })

  await prisma.project_zone.upsert({
    where: { project_id_code: { project_id: proj124.id, code: 'ZB1' } },
    update: { erection_sequence: 1 },
    create: { project_id: proj124.id, code: 'ZB1', label: 'โกดัง Zone B-1', erection_sequence: 1 },
  })
  await prisma.project_zone.upsert({
    where: { project_id_code: { project_id: proj124.id, code: 'ZB2' } },
    update: { erection_sequence: 2 },
    create: { project_id: proj124.id, code: 'ZB2', label: 'โกดัง Zone B-2', erection_sequence: 2 },
  })
  await prisma.project_zone.upsert({
    where: { project_id_code: { project_id: proj124.id, code: 'OF' } },
    update: { erection_sequence: 3 },
    create: { project_id: proj124.id, code: 'OF', label: 'Office', erection_sequence: 3 },
  })

  // ══════════════════════════════════════════════════════════════
  // Sprint 7 F2: Grade master + ProductTemplate library (Rev 2)
  // ══════════════════════════════════════════════════════════════

  // ── Grade master (bom_grade — 5 rows: SS400, SS500, SM520B, HY370, S275) ──
  const BOM_GRADES = [
    { code: 'SS400',  standard: 'JIS G3101',    yield_mpa: 245, tensile_mpa: 400 },
    { code: 'SS500',  standard: 'JIS G3101',    yield_mpa: 315, tensile_mpa: 500 },
    { code: 'SM520B', standard: 'JIS G3106',    yield_mpa: 355, tensile_mpa: 520 },
    { code: 'HY370',  standard: 'JIS G3106',    yield_mpa: 365, tensile_mpa: 490 },
    { code: 'S275',   standard: 'BS EN 10025',  yield_mpa: 275, tensile_mpa: 430 },
  ]

  for (const g of BOM_GRADES) {
    await prisma.grade.upsert({
      where: { code: g.code },
      update: {},
      create: g,
    })
  }

  // ── ProductTemplate (9 templates — Rev 2 schemas with bilingual labels) ──
  // H_BEAM + C_CHANNEL use web_thickness_mm + flange_thickness_mm (Rev 2 amendment).
  // ROD regex covers RODRB##, RB##, and ROD RB## variants.
  // PIPE + CHS regex strips optional SL suffix.
  // PLATE profile_aliases includes PLT prefix.
  const PRODUCT_TEMPLATES = [
    {
      code: 'PLATE',
      prefix: 'PL',
      section_type: 'PL' as const,
      name_en: 'Steel Plate',
      name_th: 'แผ่นเหล็ก',
      parser_regex: '^(?:PL|PLT)\\s*(\\d+(?:\\.\\d+)?)[xX*×](\\d+(?:\\.\\d+)?)(?:[xX*×](\\d+(?:\\.\\d+)?))?',
      profile_aliases: ['PL', 'PLT'],
      attribute_schema: {
        attributes: [
          { code: 'thickness_mm', label_en: 'Thickness (mm)', label_th: 'ความหนา (มม.)',  type: 'number', required: true  },
          { code: 'width_mm',     label_en: 'Width (mm)',      label_th: 'ความกว้าง (มม.)', type: 'number', required: true  },
          { code: 'length_mm',    label_en: 'Length (mm)',     label_th: 'ความยาว (มม.)',   type: 'number', required: false },
        ],
      },
    },
    {
      code: 'L_ANGLE',
      prefix: 'L',
      section_type: 'L' as const,
      name_en: 'Angle (L-Shape)',
      name_th: 'เหล็กฉาก',
      parser_regex: '^L\\s*(\\d+(?:\\.\\d+)?)[xX*×](\\d+(?:\\.\\d+)?)[xX*×](\\d+(?:\\.\\d+)?)',
      profile_aliases: ['L', 'ANGLE'],
      attribute_schema: {
        attributes: [
          { code: 'height_mm',    label_en: 'Height (mm)',    label_th: 'ความสูง (มม.)',    type: 'number', required: true },
          { code: 'width_mm',     label_en: 'Width (mm)',     label_th: 'ความกว้าง (มม.)',  type: 'number', required: true },
          { code: 'thickness_mm', label_en: 'Thickness (mm)', label_th: 'ความหนา (มม.)',    type: 'number', required: true },
        ],
      },
    },
    {
      code: 'H_BEAM',
      prefix: 'H',
      section_type: 'H' as const,
      name_en: 'H-Beam',
      name_th: 'เหล็กรูปพรรณ H',
      // 4-dim: HxBxTwxTf — web and flange thicknesses split (Rev 2 amendment, empirical: 100% rows have Tw≠Tf)
      parser_regex: '^H\\s*(\\d+(?:\\.\\d+)?)[xX*×](\\d+(?:\\.\\d+)?)[xX*×](\\d+(?:\\.\\d+)?)[xX*×](\\d+(?:\\.\\d+)?)',
      profile_aliases: ['H', 'HB', 'H-BEAM'],
      attribute_schema: {
        attributes: [
          { code: 'height_mm',           label_en: 'Height (mm)',           label_th: 'ความสูง (มม.)',       type: 'number', required: true },
          { code: 'width_mm',            label_en: 'Width (mm)',            label_th: 'ความกว้าง (มม.)',     type: 'number', required: true },
          { code: 'web_thickness_mm',    label_en: 'Web Thickness (mm)',    label_th: 'ความหนาเอว (มม.)',    type: 'number', required: true },
          { code: 'flange_thickness_mm', label_en: 'Flange Thickness (mm)', label_th: 'ความหนาปีก (มม.)',   type: 'number', required: true },
        ],
      },
    },
    {
      code: 'C_CHANNEL',
      prefix: 'C',
      section_type: 'C' as const,
      name_en: 'C-Channel',
      name_th: 'เหล็กรูปพรรณ C',
      // 4-dim: HxBxTwxTf — same split as H_BEAM (bootstrap analysis confirmed 4-dim format)
      parser_regex: '^C\\s*(\\d+(?:\\.\\d+)?)[xX*×](\\d+(?:\\.\\d+)?)[xX*×](\\d+(?:\\.\\d+)?)[xX*×](\\d+(?:\\.\\d+)?)',
      profile_aliases: ['C', 'MC', 'CH'],
      attribute_schema: {
        attributes: [
          { code: 'height_mm',           label_en: 'Height (mm)',           label_th: 'ความสูง (มม.)',       type: 'number', required: true },
          { code: 'width_mm',            label_en: 'Width (mm)',            label_th: 'ความกว้าง (มม.)',     type: 'number', required: true },
          { code: 'web_thickness_mm',    label_en: 'Web Thickness (mm)',    label_th: 'ความหนาเอว (มม.)',    type: 'number', required: true },
          { code: 'flange_thickness_mm', label_en: 'Flange Thickness (mm)', label_th: 'ความหนาปีก (มม.)',   type: 'number', required: true },
        ],
      },
    },
    {
      code: 'CHS',
      prefix: 'CHS',
      section_type: 'CHS' as const,
      name_en: 'Circular Hollow Section',
      name_th: 'เหล็กกลมกลวง',
      // (?:SL)? strips optional SL (single-length) suffix found in bootstrap data
      parser_regex: '^CHS\\s*(\\d+(?:\\.\\d+)?)[xX*×](\\d+(?:\\.\\d+)?)(?:SL)?',
      profile_aliases: ['CHS'],
      attribute_schema: {
        attributes: [
          { code: 'outer_dia_mm', label_en: 'Outer Diameter (mm)', label_th: 'เส้นผ่าศูนย์กลางนอก (มม.)', type: 'number', required: true },
          { code: 'thickness_mm', label_en: 'Thickness (mm)',       label_th: 'ความหนา (มม.)',              type: 'number', required: true },
        ],
      },
    },
    {
      code: 'PIPE',
      prefix: 'PIPE',
      section_type: 'PIPE' as const,
      name_en: 'Pipe',
      name_th: 'ท่อเหล็ก',
      parser_regex: '^PIPE\\s*(\\d+(?:\\.\\d+)?)[xX*×](\\d+(?:\\.\\d+)?)(?:SL)?',
      profile_aliases: ['PIPE'],
      attribute_schema: {
        attributes: [
          { code: 'outer_dia_mm', label_en: 'Outer Diameter (mm)', label_th: 'เส้นผ่าศูนย์กลางนอก (มม.)', type: 'number', required: true },
          { code: 'thickness_mm', label_en: 'Thickness (mm)',       label_th: 'ความหนา (มม.)',              type: 'number', required: true },
        ],
      },
    },
    {
      code: 'RHS',
      prefix: 'RHS',
      section_type: 'RHS' as const,
      name_en: 'Rectangular Hollow Section',
      name_th: 'เหล็กกลวงสี่เหลี่ยมผืนผ้า',
      parser_regex: '^RHS\\s*(\\d+(?:\\.\\d+)?)[xX*×](\\d+(?:\\.\\d+)?)[xX*×](\\d+(?:\\.\\d+)?)',
      profile_aliases: ['RHS'],
      attribute_schema: {
        attributes: [
          { code: 'height_mm',    label_en: 'Height (mm)',    label_th: 'ความสูง (มม.)',    type: 'number', required: true },
          { code: 'width_mm',     label_en: 'Width (mm)',     label_th: 'ความกว้าง (มม.)',  type: 'number', required: true },
          { code: 'thickness_mm', label_en: 'Thickness (mm)', label_th: 'ความหนา (มม.)',    type: 'number', required: true },
        ],
      },
    },
    {
      code: 'SHS',
      prefix: 'SHS',
      section_type: 'SHS' as const,
      name_en: 'Square Hollow Section',
      name_th: 'เหล็กกลวงสี่เหลี่ยมจัตุรัส',
      // Actual data format: SHSWxWxT (3-dim). Middle dim equals first (square), so skip it.
      parser_regex: '^SHS\\s*(\\d+(?:\\.\\d+)?)[xX*×]\\d+(?:\\.\\d+)?[xX*×](\\d+(?:\\.\\d+)?)',
      profile_aliases: ['SHS', 'SQ'],
      attribute_schema: {
        attributes: [
          { code: 'width_mm',     label_en: 'Width (mm)',     label_th: 'ความกว้าง (มม.)',  type: 'number', required: true },
          { code: 'thickness_mm', label_en: 'Thickness (mm)', label_th: 'ความหนา (มม.)',    type: 'number', required: true },
        ],
      },
    },
    {
      code: 'ROD',
      prefix: 'ROD',
      section_type: 'ROD' as const,
      name_en: 'Round Bar / Rod',
      name_th: 'เหล็กกลมตัน',
      // Matches RODRB12, RB12, ROD RB12 — all bootstrap-confirmed variants
      parser_regex: '^(?:ROD\\s*)?(?:RODRB|RB)\\s*(\\d+(?:\\.\\d+)?)',
      profile_aliases: ['ROD', 'RB', 'RODRB'],
      attribute_schema: {
        attributes: [
          { code: 'dia_mm', label_en: 'Diameter (mm)', label_th: 'เส้นผ่าศูนย์กลาง (มม.)', type: 'number', required: true },
        ],
      },
    },
  ]

  for (const tpl of PRODUCT_TEMPLATES) {
    await prisma.productTemplate.upsert({
      where: { code: tpl.code },
      update: {
        attribute_schema: tpl.attribute_schema,
        profile_aliases:  tpl.profile_aliases,
        parser_regex:     tpl.parser_regex,
        name_th:          tpl.name_th,
      },
      create: tpl,
    })
  }

  // ══════════════════════════════════════════════════════════════
  // Sprint 8: Standard Steel Products (STD-00013..STD-00066)
  // ══════════════════════════════════════════════════════════════

  const stdCateg = Object.fromEntries(
    (await prisma.product_category.findMany({
      where: { prefix_5: { in: ['PL000', 'HR000', 'CF000', 'PT000', 'MS000'] } },
      select: { id: true, prefix_5: true },
    })).map(c => [c.prefix_5!, c.id])
  )
  const C = {
    PL:  stdCateg['PL000'], ANG: stdCateg['HR000'], HR:  stdCateg['HR000'],
    CF:  stdCateg['CF000'], PT:  stdCateg['PT000'], MS:  stdCateg['MS000'],
  }

  const STEEL_STD = [
    // ── PLATE SS400 ──────────────────────────────────────────────
    { code:'STD-00013', name:'PL6x1500 SS400 (stock 6m)',   categ:C.PL,  va:{ profile:'PL6x1500',   shape:'PL', method:'PL', thickness_mm:6,  width_mm:1500, grade:'SS400' }, w:423.9 },
    { code:'STD-00014', name:'PL9x1500 SS400 (stock 6m)',   categ:C.PL,  va:{ profile:'PL9x1500',   shape:'PL', method:'PL', thickness_mm:9,  width_mm:1500, grade:'SS400' }, w:635.85 },
    { code:'STD-00015', name:'PL10x1500 SS400 (stock 6m)',  categ:C.PL,  va:{ profile:'PL10x1500',  shape:'PL', method:'PL', thickness_mm:10, width_mm:1500, grade:'SS400' }, w:706.5 },
    { code:'STD-00016', name:'PL12x1500 SS400 (stock 6m)',  categ:C.PL,  va:{ profile:'PL12x1500',  shape:'PL', method:'PL', thickness_mm:12, width_mm:1500, grade:'SS400' }, w:847.8 },
    { code:'STD-00017', name:'PL16x1500 SS400 (stock 6m)',  categ:C.PL,  va:{ profile:'PL16x1500',  shape:'PL', method:'PL', thickness_mm:16, width_mm:1500, grade:'SS400' }, w:1130.4 },
    { code:'STD-00018', name:'PL20x1500 SS400 (stock 6m)',  categ:C.PL,  va:{ profile:'PL20x1500',  shape:'PL', method:'PL', thickness_mm:20, width_mm:1500, grade:'SS400' }, w:1413.0 },
    { code:'STD-00019', name:'PL25x1500 SS400 (stock 6m)',  categ:C.PL,  va:{ profile:'PL25x1500',  shape:'PL', method:'PL', thickness_mm:25, width_mm:1500, grade:'SS400' }, w:1766.25 },
    // ── PLATE HY370 ──────────────────────────────────────────────
    { code:'STD-00020', name:'PL6x1500 HY370 (stock 6m)',   categ:C.PL,  va:{ profile:'PL6x1500',   shape:'PL', method:'PL', thickness_mm:6,  width_mm:1500, grade:'HY370' }, w:423.9 },
    { code:'STD-00021', name:'PL10x1500 HY370 (stock 6m)',  categ:C.PL,  va:{ profile:'PL10x1500',  shape:'PL', method:'PL', thickness_mm:10, width_mm:1500, grade:'HY370' }, w:706.5 },
    { code:'STD-00022', name:'PL16x1500 HY370 (stock 6m)',  categ:C.PL,  va:{ profile:'PL16x1500',  shape:'PL', method:'PL', thickness_mm:16, width_mm:1500, grade:'HY370' }, w:1130.4 },
    { code:'STD-00023', name:'PL20x1500 HY370 (stock 6m)',  categ:C.PL,  va:{ profile:'PL20x1500',  shape:'PL', method:'PL', thickness_mm:20, width_mm:1500, grade:'HY370' }, w:1413.0 },
    // ── L_ANGLE SS400 ────────────────────────────────────────────
    { code:'STD-00024', name:'L50x50x5 SS400 (stock 6m)',     categ:C.ANG, va:{ profile:'L50x50x5',    shape:'L', method:'ANG', leg_a_mm:50,  leg_b_mm:50,  thickness_mm:5,  grade:'SS400' }, w:22.86 },
    { code:'STD-00025', name:'L65x65x6 SS400 (stock 6m)',     categ:C.ANG, va:{ profile:'L65x65x6',    shape:'L', method:'ANG', leg_a_mm:65,  leg_b_mm:65,  thickness_mm:6,  grade:'SS400' }, w:35.46 },
    { code:'STD-00026', name:'L75x75x6 SS400 (stock 6m)',     categ:C.ANG, va:{ profile:'L75x75x6',    shape:'L', method:'ANG', leg_a_mm:75,  leg_b_mm:75,  thickness_mm:6,  grade:'SS400' }, w:41.16 },
    { code:'STD-00027', name:'L90x90x9 SS400 (stock 6m)',     categ:C.ANG, va:{ profile:'L90x90x9',    shape:'L', method:'ANG', leg_a_mm:90,  leg_b_mm:90,  thickness_mm:9,  grade:'SS400' }, w:73.62 },
    { code:'STD-00028', name:'L100x100x10 SS400 (stock 6m)',  categ:C.ANG, va:{ profile:'L100x100x10', shape:'L', method:'ANG', leg_a_mm:100, leg_b_mm:100, thickness_mm:10, grade:'SS400' }, w:91.20 },
    { code:'STD-00029', name:'L75x75x6 HY370 (stock 6m)',     categ:C.ANG, va:{ profile:'L75x75x6',    shape:'L', method:'ANG', leg_a_mm:75,  leg_b_mm:75,  thickness_mm:6,  grade:'HY370' }, w:41.16 },
    { code:'STD-00030', name:'L100x100x10 HY370 (stock 6m)',  categ:C.ANG, va:{ profile:'L100x100x10', shape:'L', method:'ANG', leg_a_mm:100, leg_b_mm:100, thickness_mm:10, grade:'HY370' }, w:91.20 },
    // ── H_BEAM SS400 ─────────────────────────────────────────────
    { code:'STD-00031', name:'H200x200x8x12 SS400 (stock 12m)',   categ:C.HR, va:{ profile:'H200x200x8x12',   shape:'H', method:'HR', height_mm:200, width_mm:200, web_thickness_mm:8,  flange_thickness_mm:12, grade:'SS400'  }, w:595.2 },
    { code:'STD-00032', name:'H250x250x9x14 SS400 (stock 12m)',   categ:C.HR, va:{ profile:'H250x250x9x14',   shape:'H', method:'HR', height_mm:250, width_mm:250, web_thickness_mm:9,  flange_thickness_mm:14, grade:'SS400'  }, w:866.4 },
    { code:'STD-00033', name:'H300x300x10x15 SS400 (stock 12m)',  categ:C.HR, va:{ profile:'H300x300x10x15',  shape:'H', method:'HR', height_mm:300, width_mm:300, web_thickness_mm:10, flange_thickness_mm:15, grade:'SS400'  }, w:1128.0 },
    { code:'STD-00034', name:'H350x350x12x19 SS400 (stock 12m)',  categ:C.HR, va:{ profile:'H350x350x12x19',  shape:'H', method:'HR', height_mm:350, width_mm:350, web_thickness_mm:12, flange_thickness_mm:19, grade:'SS400'  }, w:1620.0 },
    { code:'STD-00035', name:'H400x400x13x21 SS400 (stock 12m)',  categ:C.HR, va:{ profile:'H400x400x13x21',  shape:'H', method:'HR', height_mm:400, width_mm:400, web_thickness_mm:13, flange_thickness_mm:21, grade:'SS400'  }, w:2052.0 },
    { code:'STD-00036', name:'H350x350x12x19 SM520B (stock 12m)', categ:C.HR, va:{ profile:'H350x350x12x19',  shape:'H', method:'HR', height_mm:350, width_mm:350, web_thickness_mm:12, flange_thickness_mm:19, grade:'SM520B' }, w:1620.0 },
    { code:'STD-00037', name:'H400x400x13x21 SM520B (stock 12m)', categ:C.HR, va:{ profile:'H400x400x13x21',  shape:'H', method:'HR', height_mm:400, width_mm:400, web_thickness_mm:13, flange_thickness_mm:21, grade:'SM520B' }, w:2052.0 },
    // ── C_CHANNEL ────────────────────────────────────────────────
    { code:'STD-00038', name:'C100x50x5x7.5 SS400 (stock 6m)',   categ:C.HR, va:{ profile:'C100x50x5x7.5',  shape:'C', method:'HR', height_mm:100, width_mm:50, web_thickness_mm:5,   flange_thickness_mm:7.5, grade:'SS400' }, w:56.4 },
    { code:'STD-00039', name:'C125x65x6x8 SS400 (stock 6m)',     categ:C.HR, va:{ profile:'C125x65x6x8',    shape:'C', method:'HR', height_mm:125, width_mm:65, web_thickness_mm:6,   flange_thickness_mm:8,   grade:'SS400' }, w:81.0 },
    { code:'STD-00040', name:'C150x75x6.5x10 SS400 (stock 6m)',  categ:C.HR, va:{ profile:'C150x75x6.5x10', shape:'C', method:'HR', height_mm:150, width_mm:75, web_thickness_mm:6.5, flange_thickness_mm:10,  grade:'SS400' }, w:113.4 },
    // ── CHS ──────────────────────────────────────────────────────
    { code:'STD-00041', name:'CHS60.5x2.3 SS400 (stock 6m)',   categ:C.PT, va:{ profile:'CHS60.5x2.3',   shape:'CHS', method:'PIPE', outer_dia_mm:60.5,  thickness_mm:2.3, grade:'SS400' }, w:19.7 },
    { code:'STD-00042', name:'CHS89.1x3.2 SS400 (stock 6m)',   categ:C.PT, va:{ profile:'CHS89.1x3.2',   shape:'CHS', method:'PIPE', outer_dia_mm:89.1,  thickness_mm:3.2, grade:'SS400' }, w:40.6 },
    { code:'STD-00043', name:'CHS114.3x4.5 SS400 (stock 6m)',  categ:C.PT, va:{ profile:'CHS114.3x4.5',  shape:'CHS', method:'PIPE', outer_dia_mm:114.3, thickness_mm:4.5, grade:'SS400' }, w:73.2 },
    // ── PIPE ─────────────────────────────────────────────────────
    { code:'STD-00044', name:'PIPE60.5x2.3 SS400 (stock 6m)',   categ:C.PT, va:{ profile:'PIPE60.5x2.3',   shape:'PIPE', method:'PIPE', outer_dia_mm:60.5,  thickness_mm:2.3, grade:'SS400' }, w:19.7 },
    { code:'STD-00045', name:'PIPE76.3x2.8 SS400 (stock 6m)',   categ:C.PT, va:{ profile:'PIPE76.3x2.8',   shape:'PIPE', method:'PIPE', outer_dia_mm:76.3,  thickness_mm:2.8, grade:'SS400' }, w:30.4 },
    { code:'STD-00046', name:'PIPE114.3x4.5 SS400 (stock 6m)',  categ:C.PT, va:{ profile:'PIPE114.3x4.5',  shape:'PIPE', method:'PIPE', outer_dia_mm:114.3, thickness_mm:4.5, grade:'SS400' }, w:73.2 },
    { code:'STD-00047', name:'PIPE165.2x5.0 SS400 (stock 6m)',  categ:C.PT, va:{ profile:'PIPE165.2x5.0',  shape:'PIPE', method:'PIPE', outer_dia_mm:165.2, thickness_mm:5.0, grade:'SS400' }, w:118.5 },
    // ── RHS / SHS ────────────────────────────────────────────────
    { code:'STD-00048', name:'RHS100x50x3.2 SS400 (stock 6m)',  categ:C.CF, va:{ profile:'RHS100x50x3.2', shape:'RHS', method:'PIPE', height_mm:100, width_mm:50,  thickness_mm:3.2, grade:'SS400' }, w:43.2 },
    { code:'STD-00049', name:'RHS125x75x4.5 SS400 (stock 6m)',  categ:C.CF, va:{ profile:'RHS125x75x4.5', shape:'RHS', method:'PIPE', height_mm:125, width_mm:75,  thickness_mm:4.5, grade:'SS400' }, w:80.4 },
    { code:'STD-00050', name:'SHS50x3.2 SS400 (stock 6m)',      categ:C.CF, va:{ profile:'SHS50x3.2',     shape:'SHS', method:'PIPE', width_mm:50,               thickness_mm:3.2, grade:'SS400' }, w:28.2 },
    { code:'STD-00051', name:'SHS75x4.5 SS400 (stock 6m)',      categ:C.CF, va:{ profile:'SHS75x4.5',     shape:'SHS', method:'PIPE', width_mm:75,               thickness_mm:4.5, grade:'SS400' }, w:58.5 },
    { code:'STD-00052', name:'SHS100x6 SS400 (stock 6m)',       categ:C.CF, va:{ profile:'SHS100x6',      shape:'SHS', method:'PIPE', width_mm:100,              thickness_mm:6.0, grade:'SS400' }, w:105.6 },
    // ── ROD ──────────────────────────────────────────────────────
    { code:'STD-00053', name:'RB12 SS400 (stock 12m)',  categ:C.HR, va:{ profile:'RB12', shape:'RB', method:'BAR', dia_mm:12, grade:'SS400' }, w:10.66 },
    { code:'STD-00054', name:'RB16 SS400 (stock 12m)',  categ:C.HR, va:{ profile:'RB16', shape:'RB', method:'BAR', dia_mm:16, grade:'SS400' }, w:18.94 },
    { code:'STD-00055', name:'RB19 SS400 (stock 12m)',  categ:C.HR, va:{ profile:'RB19', shape:'RB', method:'BAR', dia_mm:19, grade:'SS400' }, w:26.71 },
    { code:'STD-00056', name:'RB22 SS400 (stock 12m)',  categ:C.HR, va:{ profile:'RB22', shape:'RB', method:'BAR', dia_mm:22, grade:'SS400' }, w:35.82 },
    { code:'STD-00057', name:'RB25 SS400 (stock 12m)',  categ:C.HR, va:{ profile:'RB25', shape:'RB', method:'BAR', dia_mm:25, grade:'SS400' }, w:46.25 },
    { code:'STD-00058', name:'RB32 SS400 (stock 12m)',  categ:C.HR, va:{ profile:'RB32', shape:'RB', method:'BAR', dia_mm:32, grade:'SS400' }, w:75.78 },
    { code:'STD-00059', name:'RB22 HY370 (stock 12m)',  categ:C.HR, va:{ profile:'RB22', shape:'RB', method:'BAR', dia_mm:22, grade:'HY370' }, w:35.82 },
    // ── S275 extras ──────────────────────────────────────────────
    { code:'STD-00060', name:'PL10x1500 S275 (stock 6m)',         categ:C.PL, va:{ profile:'PL10x1500',      shape:'PL', method:'PL',  thickness_mm:10, width_mm:1500, grade:'S275' }, w:706.5 },
    { code:'STD-00061', name:'PL16x1500 S275 (stock 6m)',         categ:C.PL, va:{ profile:'PL16x1500',      shape:'PL', method:'PL',  thickness_mm:16, width_mm:1500, grade:'S275' }, w:1130.4 },
    { code:'STD-00062', name:'H300x300x10x15 S275 (stock 12m)',   categ:C.HR, va:{ profile:'H300x300x10x15', shape:'H',  method:'HR',  height_mm:300, width_mm:300, web_thickness_mm:10, flange_thickness_mm:15, grade:'S275' }, w:1128.0 },
    { code:'STD-00063', name:'L75x75x6 S275 (stock 6m)',          categ:C.ANG,va:{ profile:'L75x75x6',       shape:'L',  method:'ANG', leg_a_mm:75, leg_b_mm:75, thickness_mm:6, grade:'S275' }, w:41.16 },
  ]

  for (const p of STEEL_STD) {
    await prisma.products.upsert({
      where: { product_code: p.code },
      update: {},
      create: {
        product_code:        p.code,
        name:                p.name,
        product_type:        'standard',
        product_kind:        (p as any).kind ?? 'part',
        state:               'released',
        categ_id:            p.categ,
        variant_attributes:  p.va,
        attributes:          {},
        cost_raw_material:   0,
        cost_transport:      0,
        cost_production:     0,
        cost_warehouse:      0,
        stock_policy:        (p as any).kind === 'assembly' ? undefined : 'reorder',
        reorder_min:         (p as any).kind === 'assembly' ? undefined : 0,
        reorder_max:         (p as any).kind === 'assembly' ? undefined : 100,
        create_uid:          adminId,
        write_uid:           adminId,
      },
    })
  }

  // Advance seq past seeded codes
  await prisma.$executeRaw`
    INSERT INTO product_code_seq (kind, next_run)
    VALUES ('STD', 64)
    ON CONFLICT (kind) DO UPDATE SET next_run = GREATEST(product_code_seq.next_run, EXCLUDED.next_run)
  `

  // ══════════════════════════════════════════════════════════════
  // Sprint 9: Paint materials catalog
  // ══════════════════════════════════════════════════════════════

  const paintCategory = await prisma.product_category.upsert({
    where: { prefix_5: 'PAINT' },
    update: {},
    create: {
      name: 'Paint & Coating',
      prefix_5: 'PAINT',
      complete_name: 'Paint & Coating',
      active: true,
    },
  })

  const gallon = await prisma.uom_uom.findFirst({ where: { name: 'Gallon' } })
  if (!gallon) throw new Error('Seed: Gallon UoM not found — run earlier seed steps first')

  const adminUser = await prisma.res_users.findFirstOrThrow({ where: { login: 'admin' } })

  const PAINT_MATERIALS = [
    {
      default_code: 'PAINTPR001',
      name: 'TOA Zinc Rich Primer EP-200',
      description_sale: 'TOA EP-200 Zinc Rich Primer',
      paint_type: 'primer',
      paint_micron: 75,
      coverage_sqm_per_gallon: 8.0,
    },
    {
      default_code: 'PAINTIT001',
      name: 'TOA Epoxy MIO Intermediate',
      description_sale: 'TOA Epoxy MIO Intermediate Coat',
      paint_type: 'intermediate',
      paint_micron: 75,
      coverage_sqm_per_gallon: 7.5,
    },
    {
      default_code: 'PAINTFP001',
      name: 'TOA Chartek Fireproof Coat',
      description_sale: 'TOA Chartek 7 Intumescent Coating',
      paint_type: 'fireproof',
      paint_micron: 1500,
      coverage_sqm_per_gallon: 1.2,
    },
    {
      default_code: 'PAINTTC001',
      name: 'TOA Polyurethane Topcoat',
      description_sale: 'TOA PU Topcoat Finish',
      paint_type: 'topcoat',
      paint_micron: 50,
      coverage_sqm_per_gallon: 10.0,
    },
  ]

  for (const m of PAINT_MATERIALS) {
    await prisma.materials.upsert({
      where: { default_code: m.default_code },
      update: {},
      create: {
        default_code: m.default_code,
        name: m.name,
        description_sale: m.description_sale,
        categ_id: paintCategory.id,
        uom_id: gallon.id,
        type: 'product',
        state: 'confirmed',
        active: true,
        attributes: {
          material_type: 'paint',
          paint_type: m.paint_type,
          paint_micron: m.paint_micron,
          coverage_sqm_per_gallon: m.coverage_sqm_per_gallon,
        },
        create_uid: adminUser.id,
        write_uid: adminUser.id,
      },
    })
  }

  // Sprint 9 (Wire): Welding wire catalog
  const weldingCategory = await prisma.product_category.findFirstOrThrow({ where: { prefix_5: 'WC000' } })
  const kgUom = await prisma.uom_uom.findFirst({ where: { name: 'Kilograms' } })

  const WELDING_WIRE_MATERIALS = [
    { default_code: 'WIRE70S610', name: 'ER70S-6 MIG Wire 1.0mm', description_sale: 'ER70S-6 MIG Welding Wire 1.0mm', wire_diameter_mm: 1.0, kg_per_meter: 0.0062, pkg_kg: 15.0 },
    { default_code: 'WIRE70S612', name: 'ER70S-6 MIG Wire 1.2mm', description_sale: 'ER70S-6 MIG Welding Wire 1.2mm', wire_diameter_mm: 1.2, kg_per_meter: 0.0089, pkg_kg: 15.0 },
    { default_code: 'WIRE70S616', name: 'ER70S-6 MIG Wire 1.6mm', description_sale: 'ER70S-6 MIG Welding Wire 1.6mm', wire_diameter_mm: 1.6, kg_per_meter: 0.0158, pkg_kg: 15.0 },
  ]

  for (const m of WELDING_WIRE_MATERIALS) {
    await prisma.materials.upsert({
      where: { default_code: m.default_code },
      update: {},
      create: {
        default_code: m.default_code,
        name: m.name,
        description_sale: m.description_sale,
        categ_id: weldingCategory.id,
        uom_id: kgUom?.id ?? 1,
        type: 'product',
        state: 'confirmed',
        active: true,
        attributes: { material_type: 'welding_wire', wire_diameter_mm: m.wire_diameter_mm, kg_per_meter: m.kg_per_meter, pkg_kg: m.pkg_kg },
        create_uid: adminUser.id,
        write_uid: adminUser.id,
      },
    })
  }

  console.log('Seed completed ✓')
  console.log('  - admin user with bcrypt password (Sprint 6)')
  console.log('  - 28 mark prefixes')
  console.log('  - 21 Tekla mappings')
  console.log('  - 7 steel grades (sprint 1-6 steel_grade table)')
  console.log(`  - ${categoryData.length} product categories`)
  console.log('  - 12 standard product templates (sprint 2 products table)')
  console.log('  - 3 projects (0X202, 0X123, 0X124) + zones')
  console.log('  - 2 mock customers (TST-001, LGT-001)')
  console.log('  - 5 bom_grade rows (Sprint 7 F2)')
  console.log(`  - ${PRODUCT_TEMPLATES.length} product_template rows (Sprint 7 F2)`)
  console.log(`  - ${STEEL_STD.length} standard steel products STD-00013..STD-00063 (Sprint 8)`)
  console.log(`  - 1 Paint category + ${PAINT_MATERIALS.length} paint materials (Sprint 9)`)
  console.log(`  - 1 Welding Wire category + ${WELDING_WIRE_MATERIALS.length} wire materials (Sprint 9)`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
