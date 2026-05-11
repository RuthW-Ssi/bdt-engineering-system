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
      update: {},
      create: {
        product_code: tpl.product_code,
        engineering_code: tpl.engineering_code,
        name: tpl.name,
        categ_id: msCategId,
        product_type: 'standard',
        state: 'draft',
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
      parser_regex: '^SHS\\s*(\\d+(?:\\.\\d+)?)[xX*×](\\d+(?:\\.\\d+)?)',
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
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
