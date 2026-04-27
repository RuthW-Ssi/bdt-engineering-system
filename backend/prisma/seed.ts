import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // ── res_users: admin ──────────────────────────────────────
  await prisma.res_users.upsert({
    where: { login: 'admin' },
    update: {},
    create: { login: 'admin', name: 'Administrator', active: true },
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

  for (const u of uomData) {
    await prisma.uom_uom.upsert({
      where: { name: u.name } as any,
      update: {},
      create: u,
    })
  }

  // ── account_account (รหัสบัญชีจากคู่มือ 7 กลุ่มแรก) ──────
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

  // ── product_category (7 กลุ่มที่ยืนยันจากเอกสาร) ──────────
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
    // Steel groups (8-13) — Sprint 2 will fill subgroups
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

  console.log('Seed completed ✓')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
