import type { OpCode, Category, MaterialGroup, RoutingStatus, ProductStatus, OpMeta, CatMeta, MatGroupMeta, StatusMeta } from '../types'

export const OP_META: Record<OpCode, OpMeta> = {
  CUT:      { label: 'Cut (CUT)',          icon: 'Scissors',       color: '#C8202A' },
  WELD:     { label: 'Weld (WELD)',        icon: 'Flame',          color: '#BA7517' },
  DRILL:    { label: 'Drill (DRILL)',      icon: 'CircleDot',      color: '#14B8A6' },
  PAINT:    { label: 'Paint (PAINT)',      icon: 'Paintbrush2',    color: '#8B5CF6' },
  QC:       { label: 'QC',                 icon: 'CheckCircle2',   color: '#639922' },
  BEND:     { label: 'Bend (BEND)',        icon: 'GitBranchPlus',  color: '#185FA5' },
  GRIND:    { label: 'Grind (GRIND)',      icon: 'Zap',            color: '#F59E0B' },
  SHEAR:    { label: 'Shear (SHEAR)',      icon: 'Scissors',       color: '#64748B' },
  ASSEMBLE: { label: 'Assemble (ASSEMBLE)', icon: 'Layers',        color: '#6366F1' },
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
  Active:        { label: 'Active',         bg: '#EAF3DE', text: '#27500A', border: '#C0DD97', icon: 'CheckCircle' },
  Draft:         { label: 'Draft',          bg: '#F5F5F5', text: '#555555', border: '#C2C2C2', icon: 'Pencil' },
  PendingReview: { label: 'Pending Review', bg: '#E6F1FB', text: '#0C447C', border: '#B5D4F4', icon: 'Clock' },
  Rejected:      { label: 'Rejected',       bg: '#FCEBEB', text: '#5C0D15', border: '#EE9B9B', icon: 'XCircle' },
}

export const PRODUCT_STATUS_META: Record<ProductStatus, StatusMeta> = {
  Draft:         { label: 'Draft',          bg: '#F5F5F5', text: '#555555', border: '#E0E0E0', icon: 'Pencil' },
  PendingReview: { label: 'Pending Review', bg: '#FAEEDA', text: '#854F0B', border: 'transparent', icon: 'Clock' },
  Active:        { label: 'Approved',       bg: '#EAF3DE', text: '#27500A', border: 'transparent', icon: 'CheckCircle' },
  Rejected:      { label: 'Rejected',       bg: '#FCEBEB', text: '#8A1520', border: 'transparent', icon: 'XCircle' },
  Blocked:       { label: 'Blocked',        bg: '#FCEBEB', text: '#5C0D15', border: '#EE9B9B', icon: 'Ban' },
}

// ── Material Group Meta (13 groups per BDT Product Master) ────
export const MAT_GROUP_META: Record<MaterialGroup, MatGroupMeta> = {
  PLATE:          { label: 'Steel Plate',          label_en: 'Steel Plate',          color: '#185FA5', icon: 'Square' },
  HR_SHAPE:       { label: 'Hot Roll Shape',       label_en: 'HR Shape',             color: '#1F1F1F', icon: 'Minus' },
  COLDFORM:       { label: 'Cold Form',            label_en: 'Cold Form Shape',      color: '#64748B', icon: 'AlignJustify' },
  PIPE_TUBE:      { label: 'Steel Pipe & Tube',    label_en: 'Pipe & Tube',          color: '#14B8A6', icon: 'Circle' },
  FLAT_ROUND_BAR: { label: 'Flat / Round Bar',    label_en: 'Bar Stock',            color: '#6366F1', icon: 'Minus' },
  COIL:           { label: 'Steel Coil',           label_en: 'Steel Coil',           color: '#8B4513', icon: 'RefreshCw' },
  BOLT_NUT:       { label: 'Bolt & Nut',           label_en: 'Fasteners',            color: '#F59E0B', icon: 'Settings2' },
  WELD_CONSUMABLE:{ label: 'Weld Consumable',      label_en: 'Welding Consumable',   color: '#BA7517', icon: 'Flame' },
  PAINT_COAT:     { label: 'Paint / Coating',       label_en: 'Paint & Coating',      color: '#8B5CF6', icon: 'Paintbrush2' },
  BUILDING_COMP:  { label: 'Building Component',   label_en: 'Building Component',   color: '#639922', icon: 'Home' },
  ACCESSORY:      { label: 'Steel Accessory',      label_en: 'Steel Accessory',      color: '#C8202A', icon: 'Wrench' },
  SPARE_PART:     { label: 'Spare Part',           label_en: 'Spare Part',           color: '#854F0B', icon: 'Package' },
  FIXED_ASSET:    { label: 'Fixed Asset',          label_en: 'Machine / Fixed Asset',color: '#3A3A3A', icon: 'Factory' },
}

// keep backward compat alias
export const STATUS_META = ROUTING_STATUS_META
