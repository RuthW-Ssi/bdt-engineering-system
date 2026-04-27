import type { OpCode, Category, RoutingStatus, ProductStatus, OpMeta, CatMeta, StatusMeta } from '../types'

export const OP_META: Record<OpCode, OpMeta> = {
  CUT:      { label: 'ตัด (CUT)',          icon: 'Scissors',       color: '#C8202A' },
  WELD:     { label: 'เชื่อม (WELD)',      icon: 'Flame',          color: '#BA7517' },
  DRILL:    { label: 'เจาะ (DRILL)',        icon: 'CircleDot',      color: '#14B8A6' },
  PAINT:    { label: 'พ่นสี (PAINT)',      icon: 'Paintbrush2',    color: '#8B5CF6' },
  QC:       { label: 'QC',                  icon: 'CheckCircle2',   color: '#639922' },
  BEND:     { label: 'ดัด (BEND)',          icon: 'GitBranchPlus',  color: '#185FA5' },
  GRIND:    { label: 'ขัด (GRIND)',         icon: 'Zap',            color: '#F59E0B' },
  SHEAR:    { label: 'ตัด (SHEAR)',         icon: 'Scissors',       color: '#64748B' },
  ASSEMBLE: { label: 'ประกอบ (ASSEMBLE)',  icon: 'Layers',         color: '#6366F1' },
}

export const CAT_META: Record<Category, CatMeta> = {
  Assembly:    { color: '#C8202A', icon: 'Building2',  label: 'Assembly' },
  SubAssembly: { color: '#6366F1', icon: 'Layers',     label: 'SubAssembly' },
  Part:        { color: '#14B8A6', icon: 'Component',  label: 'Part' },
  Plate:       { color: '#185FA5', icon: 'Square',     label: 'Plate' },
  ShapeStock:  { color: '#64748B', icon: 'Minus',      label: 'ShapeStock' },
  OtherMat:    { color: '#F59E0B', icon: 'Package',    label: 'OtherMat' },
  Consumable:  { color: '#8B5CF6', icon: 'Droplets',   label: 'Consumable' },
  Coil:        { color: '#8B4513', icon: 'CircleDot',  label: 'Coil' },
}

export const ROUTING_STATUS_META: Record<RoutingStatus, StatusMeta> = {
  Active:        { label: 'Active',        bg: '#EAF3DE', text: '#27500A', border: '#C0DD97', icon: 'CheckCircle' },
  Draft:         { label: 'Draft',         bg: '#F5F5F5', text: '#555555', border: '#C2C2C2', icon: 'Pencil' },
  PendingReview: { label: 'รอตรวจสอบ',   bg: '#E6F1FB', text: '#0C447C', border: '#B5D4F4', icon: 'Clock' },
  Rejected:      { label: 'ปฏิเสธแล้ว',  bg: '#FCEBEB', text: '#5C0D15', border: '#EE9B9B', icon: 'XCircle' },
}

export const PRODUCT_STATUS_META: Record<ProductStatus, StatusMeta> = {
  Draft:         { label: 'ร่าง',          bg: '#F5F5F5', text: '#555555', border: '#E0E0E0', icon: 'Pencil' },
  PendingReview: { label: 'รอตรวจสอบ',   bg: '#FAEEDA', text: '#854F0B', border: 'transparent', icon: 'Clock' },
  Active:        { label: 'อนุมัติแล้ว',   bg: '#EAF3DE', text: '#27500A', border: 'transparent', icon: 'CheckCircle' },
  Rejected:      { label: 'ปฏิเสธ',       bg: '#FCEBEB', text: '#8A1520', border: 'transparent', icon: 'XCircle' },
  Blocked:       { label: 'ระงับส่ง',     bg: '#FCEBEB', text: '#5C0D15', border: '#EE9B9B', icon: 'Ban' },
}

// keep backward compat alias
export const STATUS_META = ROUTING_STATUS_META
