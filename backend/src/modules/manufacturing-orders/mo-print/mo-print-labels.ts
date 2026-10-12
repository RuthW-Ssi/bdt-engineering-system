// Printed-form labels for the MO/WO print packet, per language (2026-09-29:
// "ตัวเอกสาร pdf mo wo ที่จะ print ควรจะสามารถ กดเปลี่ยน ภาษาได้"). Only the
// form's own fixed wording lives here — user-entered data (project/zone/
// operation/material names) prints as entered in either language. Thai
// keeps shop-floor jargon (MO, WO, QC, Mark, Routing, Work Center, Assembly)
// in English, since that's how the floor actually says it.
//
// `th` is typed against `en`'s shape, so a label added to one language but
// not the other fails `tsc` instead of printing blank.

export type PrintLang = 'en' | 'th'

export const PRINT_LANGS: readonly PrintLang[] = ['en', 'th']

const en = {
  // Section bands
  moInfo: 'MO Info',
  routing: 'Routing',
  assemblyList: 'Assembly List',
  withdrawalLog: 'Withdrawal Log',
  assemblyPartList: 'Assembly Part List',
  workOrderDetails: 'Work Order Details',
  consumable: 'Consumable',
  productionTime: 'Production Time',
  activities: 'Activities',
  assemblyListQc: 'Assembly List & QC',

  // Form-grid / column labels
  manufacturingOrder: 'Manufacturing Order',
  manufacturingFactory: 'Manufacturing Factory',
  workOrder: 'Work Order',
  project: 'Project',
  zone: 'Zone',
  moType: 'MO Type',
  preShop: 'Pre-shop drawing',
  fullShop: 'Full shop drawing',
  notRealBom: 'not real BOM data yet',
  formerly: 'was',
  planStart: 'Plan Start',
  planFinish: 'Plan Finish',
  planDuration: 'Plan Duration',
  actualStart: 'Actual Start',
  actualFinish: 'Actual Finish',
  actualDuration: 'Actual Duration',
  sequenceWorkCenter: 'Sequence / Work Center',
  operation: 'Operation',
  team: 'Team',
  headcount: 'Headcount',
  responsible: 'Responsible',
  requestedBy: 'Requested By',
  storeController: 'Store Controller',
  dateTime: 'Date/Time',
  date: 'Date',
  seq: 'Seq',
  no: 'No.',
  workCenter: 'Work Center',
  wo: 'WO',
  release: 'Release',
  done: 'Done',
  mark: 'Mark',
  partMark: 'Part Mark',
  name: 'Name',
  code: 'Code',
  profile: 'Profile',
  grade: 'Grade',
  qty: 'Qty',
  unit: 'Unit',
  actual: 'Actual',
  note: 'Note',
  widthMm: 'Width (mm)',
  lengthMm: 'Length (mm)',
  heightMm: 'Height (mm)',
  weightKg: 'Weight (kg)',
  round: 'Round',
  activity: 'Activity',
  type: 'Type',
  plannedMin: 'Planned Min',
  result: 'Result',
  signature: 'Signature',
  passed: 'Passed',
  notPassed: 'Not',
  round1: '1st',
  round2: '2nd',
  round3: '3rd',

  // Cell values / fragments
  noParts: 'No parts',
  unresolved: 'unresolved',
  cont: '(cont.)',
  assemblyQty: (qty: string) => `Assembly Qty ${qty}`,
  minutes: (n: string) => `${n} min`,
  moreSeeQr: (n: number) => `+${n} more (see QR)`,
  // Drawing version stamp + traveler note (2026-10-05, print option A).
  drawingStamp: (rev: string) => `Drawing ${rev}`,
  drawingUpdatedAfterWo: (items: string) => `Drawing updated after this WO was created: ${items}`,
}

export type PrintLabels = typeof en

const th: PrintLabels = {
  moInfo: 'ข้อมูล MO',
  routing: 'Routing',
  assemblyList: 'รายการ Assembly',
  withdrawalLog: 'บันทึกการเบิก',
  assemblyPartList: 'รายการชิ้นส่วนของ Assembly',
  workOrderDetails: 'รายละเอียด Work Order',
  consumable: 'วัสดุสิ้นเปลือง',
  productionTime: 'เวลาการผลิต',
  activities: 'กิจกรรม (Activities)',
  assemblyListQc: 'รายการ Assembly และ QC',

  manufacturingOrder: 'ใบสั่งผลิต (MO)',
  manufacturingFactory: 'โรงงานผลิต',
  workOrder: 'ใบสั่งงาน (WO)',
  project: 'โครงการ',
  zone: 'โซน',
  moType: 'ประเภท MO',
  preShop: 'Pre-shop drawing',
  fullShop: 'Full shop drawing',
  notRealBom: 'ข้อมูลยังไม่ใช่ BOM จริง',
  formerly: 'เดิม',
  planStart: 'เริ่มตามแผน',
  planFinish: 'เสร็จตามแผน',
  planDuration: 'ระยะเวลาตามแผน',
  actualStart: 'เริ่มจริง',
  actualFinish: 'เสร็จจริง',
  actualDuration: 'ระยะเวลาจริง',
  sequenceWorkCenter: 'ลำดับ / Work Center',
  operation: 'Operation',
  team: 'ทีม',
  headcount: 'จำนวนคน',
  responsible: 'ผู้รับผิดชอบ',
  requestedBy: 'ผู้ขอเบิก',
  storeController: 'ผู้ควบคุมคลัง',
  dateTime: 'วันที่/เวลา',
  date: 'วันที่',
  seq: 'ลำดับ',
  no: 'ที่',
  workCenter: 'Work Center',
  wo: 'WO',
  release: 'ปล่อยงาน',
  done: 'เสร็จ',
  mark: 'Mark',
  partMark: 'Part Mark',
  name: 'ชื่อ',
  code: 'รหัส',
  profile: 'Profile',
  grade: 'เกรด',
  qty: 'จำนวน',
  unit: 'หน่วย',
  actual: 'ใช้จริง',
  note: 'หมายเหตุ',
  widthMm: 'กว้าง (มม.)',
  lengthMm: 'ยาว (มม.)',
  heightMm: 'สูง (มม.)',
  weightKg: 'น้ำหนัก (กก.)',
  round: 'รอบ',
  activity: 'กิจกรรม',
  type: 'ประเภท',
  plannedMin: 'นาทีตามแผน',
  result: 'ผล',
  signature: 'ลายเซ็น',
  passed: 'ผ่าน',
  notPassed: 'ไม่ผ่าน',
  round1: 'ครั้งที่ 1',
  round2: 'ครั้งที่ 2',
  round3: 'ครั้งที่ 3',

  noParts: 'ไม่มีชิ้นส่วน',
  unresolved: 'คำนวณไม่ได้',
  cont: '(ต่อ)',
  assemblyQty: (qty: string) => `จำนวน Assembly ${qty}`,
  minutes: (n: string) => `${n} นาที`,
  // Kept as short as the English — it's squeezed into the first column only.
  moreSeeQr: (n: number) => `+อีก ${n} (ดู QR)`,
  drawingStamp: (rev: string) => `แบบ ${rev}`,
  drawingUpdatedAfterWo: (items: string) => `แบบอัปเดตหลังสร้าง WO: ${items}`,
}

export const PRINT_LABELS: Record<PrintLang, PrintLabels> = { en, th }

// Anything other than an exact 'th' prints English — the pre-existing
// behavior, so an old client or a typo'd query never breaks printing.
export function parsePrintLang(raw: string | undefined): PrintLang {
  return raw === 'th' ? 'th' : 'en'
}
