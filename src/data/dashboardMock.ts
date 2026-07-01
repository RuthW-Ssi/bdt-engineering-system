// Dashboard mock data — FE-only prototype (no backend calls)
// useDashboardData hook consumes this; types are inline to keep file backend-decoupled

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MockProject {
  id: number
  project_code: string
  name: string
  state: 'active' | 'planning' | 'on_hold' | 'completed'
}

export interface MockZone {
  id: number
  project_id: number
  code: string
  label: string
  erection_sequence: number
}

export interface KpiScope {
  products: number
  dispatches: number
  assemblies: number
  parts: number
  alerts: number
}

export interface MockDispatch {
  id: number
  project_id: number
  zone_id: number | null
  status: 'pending' | 'partial' | 'complete'
  doc_count: number
  uploaded_at: string
  zone_label: string
  uploader_name: string
  assembly_count: number
  part_count: number
  total_weight_kg: number
}

export interface ZoneProgressEntry {
  zone_id: number
  project_id: number
  zone_code: string
  zone_label: string
  progress_pct: number
  dispatched: number
  total: number
}

export interface ActivityEntry {
  id: string
  timestamp: string
  actor: string
  action: string
  entity_type: 'dispatch' | 'product' | 'routing' | 'material' | 'zone'
  entity_label: string
  project_id: number | null
  zone_id: number | null
}

export interface AlertEntry {
  id: string
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
  project_id: number | null
  zone_id: number | null
  action_label: string
  action_path: string
}

export interface LibrarySlice {
  library_code: string
  library_name: string
  count: number
  color: string
}

export interface RoutingTemplateUsage {
  template_name: string
  template_code: string
  count: number
  max: number
}

export interface MaterialSummary {
  total: number
  paint: number
  welding: number
  recent: { code: string; name: string; state: string }[]
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export const MOCK_PROJECTS: MockProject[] = [
  { id: 1, project_code: 'THEPHA', name: 'THEPHA 28×54m Warehouse', state: 'active' },
  { id: 2, project_code: 'PROJ-B', name: 'Project B — Samut Sakhon Factory', state: 'active' },
  { id: 3, project_code: 'PROJ-C', name: 'Project C — Rayong Cold Storage', state: 'planning' },
  { id: 4, project_code: 'PROJ-D', name: 'Project D — Pilot Phase 1', state: 'on_hold' },
]

// ─── Zones ────────────────────────────────────────────────────────────────────

export const MOCK_ZONES_BY_PROJECT: Record<number, MockZone[]> = {
  1: [
    { id: 1, project_id: 1, code: 'Z1', label: 'Zone 1 — Structural Frame', erection_sequence: 1 },
    { id: 2, project_id: 1, code: 'Z2', label: 'Zone 2 — Assembly Hall', erection_sequence: 2 },
    { id: 3, project_id: 1, code: 'Z3', label: 'Zone 3 — Roofing + Cladding', erection_sequence: 3 },
  ],
  2: [
    { id: 4, project_id: 2, code: 'ZA', label: 'Zone A — Main Structure', erection_sequence: 1 },
    { id: 5, project_id: 2, code: 'ZB', label: 'Zone B — Mezzanine', erection_sequence: 2 },
  ],
  3: [
    { id: 6, project_id: 3, code: 'ZX', label: 'Zone X — Cold Room Frame', erection_sequence: 1 },
    { id: 7, project_id: 3, code: 'ZY', label: 'Zone Y — Canopy', erection_sequence: 2 },
  ],
  4: [
    { id: 8, project_id: 4, code: 'P1', label: 'Pilot Zone 1', erection_sequence: 1 },
  ],
}

// ─── KPI by scope ─────────────────────────────────────────────────────────────

export const KPI_BY_SCOPE: Record<string, KpiScope> = {
  '1:all': { products: 142, dispatches: 8,  assemblies: 67, parts: 75, alerts: 4 },
  '1:1':   { products: 48,  dispatches: 3,  assemblies: 22, parts: 26, alerts: 2 },
  '1:2':   { products: 54,  dispatches: 3,  assemblies: 29, parts: 25, alerts: 1 },
  '1:3':   { products: 40,  dispatches: 2,  assemblies: 16, parts: 24, alerts: 1 },
  '2:all': { products: 89,  dispatches: 5,  assemblies: 41, parts: 48, alerts: 2 },
  '2:4':   { products: 52,  dispatches: 3,  assemblies: 24, parts: 28, alerts: 1 },
  '2:5':   { products: 37,  dispatches: 2,  assemblies: 17, parts: 20, alerts: 1 },
  '3:all': { products: 31,  dispatches: 1,  assemblies: 14, parts: 17, alerts: 1 },
  '3:6':   { products: 20,  dispatches: 1,  assemblies: 9,  parts: 11, alerts: 0 },
  '3:7':   { products: 11,  dispatches: 0,  assemblies: 5,  parts: 6,  alerts: 1 },
  '4:all': { products: 12,  dispatches: 0,  assemblies: 5,  parts: 7,  alerts: 0 },
  '4:8':   { products: 12,  dispatches: 0,  assemblies: 5,  parts: 7,  alerts: 0 },
}

// ─── Zone progress ────────────────────────────────────────────────────────────

export const ZONE_PROGRESS_BY_PROJECT: Record<number, ZoneProgressEntry[]> = {
  1: [
    { zone_id: 1, project_id: 1, zone_code: 'Z1', zone_label: 'Zone 1 — Structural Frame', progress_pct: 82, dispatched: 18, total: 22 },
    { zone_id: 2, project_id: 1, zone_code: 'Z2', zone_label: 'Zone 2 — Assembly Hall',   progress_pct: 48, dispatched: 14, total: 29 },
    { zone_id: 3, project_id: 1, zone_code: 'Z3', zone_label: 'Zone 3 — Roofing + Cladding', progress_pct: 25, dispatched: 4, total: 16 },
  ],
  2: [
    { zone_id: 4, project_id: 2, zone_code: 'ZA', zone_label: 'Zone A — Main Structure', progress_pct: 61, dispatched: 15, total: 24 },
    { zone_id: 5, project_id: 2, zone_code: 'ZB', zone_label: 'Zone B — Mezzanine',      progress_pct: 18, dispatched: 3,  total: 17 },
  ],
  3: [
    { zone_id: 6, project_id: 3, zone_code: 'ZX', zone_label: 'Zone X — Cold Room Frame', progress_pct: 44, dispatched: 4, total: 9 },
    { zone_id: 7, project_id: 3, zone_code: 'ZY', zone_label: 'Zone Y — Canopy',          progress_pct: 0,  dispatched: 0, total: 5 },
  ],
  4: [
    { zone_id: 8, project_id: 4, zone_code: 'P1', zone_label: 'Pilot Zone 1', progress_pct: 0, dispatched: 0, total: 5 },
  ],
}

// ─── Dispatches ───────────────────────────────────────────────────────────────

export const MOCK_DISPATCHES: MockDispatch[] = [
  { id: 1, project_id: 1, zone_id: 1, status: 'complete', doc_count: 2, uploaded_at: '2026-06-03T09:12:00Z', zone_label: 'Z1 — Structural Frame', uploader_name: 'somchai.k', assembly_count: 22, part_count: 86,  total_weight_kg: 4200 },
  { id: 2, project_id: 1, zone_id: 2, status: 'partial',  doc_count: 1, uploaded_at: '2026-06-02T14:30:00Z', zone_label: 'Z2 — Assembly Hall',    uploader_name: 'apisit.w',  assembly_count: 14, part_count: 52,  total_weight_kg: 2800 },
  { id: 3, project_id: 1, zone_id: 2, status: 'pending',  doc_count: 1, uploaded_at: '2026-06-01T11:00:00Z', zone_label: 'Z2 — Assembly Hall',    uploader_name: 'somchai.k', assembly_count: 15, part_count: 60,  total_weight_kg: 3100 },
  { id: 4, project_id: 2, zone_id: 4, status: 'complete', doc_count: 3, uploaded_at: '2026-05-31T16:45:00Z', zone_label: 'ZA — Main Structure',   uploader_name: 'apisit.w',  assembly_count: 24, part_count: 91,  total_weight_kg: 5600 },
  { id: 5, project_id: 1, zone_id: 3, status: 'pending',  doc_count: 1, uploaded_at: '2026-05-30T08:00:00Z', zone_label: 'Z3 — Roofing + Cladding', uploader_name: 'somchai.k', assembly_count: 4, part_count: 18, total_weight_kg: 890 },
]

// ─── Activities ───────────────────────────────────────────────────────────────

export const MOCK_ACTIVITIES: ActivityEntry[] = [
  { id: 'a1', actor: 'apisit.w',  action: 'marked dispatch complete', entity_type: 'dispatch', entity_label: 'Z1 Dispatch #1',    timestamp: '2026-06-03T10:30:00Z', project_id: 1, zone_id: 1 },
  { id: 'a2', actor: 'somchai.k', action: 'uploaded BOM dispatch',    entity_type: 'dispatch', entity_label: 'Z1 Dispatch #1',    timestamp: '2026-06-03T09:12:00Z', project_id: 1, zone_id: 1 },
  { id: 'a3', actor: 'somchai.k', action: 'created product',          entity_type: 'product',  entity_label: 'SA-00125 Column',   timestamp: '2026-06-02T15:20:00Z', project_id: 1, zone_id: 2 },
  { id: 'a4', actor: 'apisit.w',  action: 'uploaded BOM dispatch',    entity_type: 'dispatch', entity_label: 'Z2 Dispatch #2',    timestamp: '2026-06-02T14:30:00Z', project_id: 1, zone_id: 2 },
  { id: 'a5', actor: 'apisit.w',  action: 'applied routing template', entity_type: 'routing',  entity_label: 'RT-WELD-HEAVY',     timestamp: '2026-06-01T13:10:00Z', project_id: 1, zone_id: null },
  { id: 'a6', actor: 'somchai.k', action: 'registered material',      entity_type: 'material', entity_label: 'CN-WELD-E7018',     timestamp: '2026-05-31T11:05:00Z', project_id: null, zone_id: null },
  { id: 'a7', actor: 'apisit.w',  action: 'uploaded BOM dispatch',    entity_type: 'dispatch', entity_label: 'ZA Dispatch #4',    timestamp: '2026-05-31T16:45:00Z', project_id: 2, zone_id: 4 },
  { id: 'a8', actor: 'somchai.k', action: 'created zone',             entity_type: 'zone',     entity_label: 'Z3 Roofing',        timestamp: '2026-05-30T09:00:00Z', project_id: 1, zone_id: 3 },
  { id: 'a9', actor: 'apisit.w',  action: 'approved product',         entity_type: 'product',  entity_label: 'PP-00101 BasePlate', timestamp: '2026-05-29T17:30:00Z', project_id: 1, zone_id: null },
]

// ─── Alerts ───────────────────────────────────────────────────────────────────

export const MOCK_ALERTS: AlertEntry[] = [
  { id: 'al1', severity: 'high',   title: 'BOM dispatch pending review', detail: 'Z2 Dispatch #3 uploaded 3 days ago — no match assigned', project_id: 1, zone_id: 2, action_label: 'Review now', action_path: '/bom/dispatch/3' },
  { id: 'al2', severity: 'medium', title: 'Product pending approval',    detail: 'SA-00125 in PendingReview for 5+ days',                  project_id: 1, zone_id: 2, action_label: 'Review',     action_path: '/engineer-products' },
  { id: 'al3', severity: 'medium', title: 'Zone Z3 low progress (25%)', detail: 'Only 4/16 assemblies dispatched in Zone 3',              project_id: 1, zone_id: 3, action_label: 'Go to BOM',  action_path: '/bom' },
  { id: 'al4', severity: 'low',    title: 'Material missing Odoo ref',  detail: 'CN-WELD-E7018 has no odoo_ref_id',                       project_id: null, zone_id: null, action_label: 'Fix',  action_path: '/materials' },
]

// ─── Library distribution ─────────────────────────────────────────────────────

export const LIBRARY_DISTRIBUTION: LibrarySlice[] = [
  { library_code: 'LIB-001', library_name: 'I-Beam Frame',     count: 28, color: '#185FA5' },
  { library_code: 'LIB-002', library_name: 'Column Assembly',  count: 19, color: '#27500A' },
  { library_code: 'LIB-003', library_name: 'Base Plate',       count: 15, color: '#C8202A' },
  { library_code: 'LIB-004', library_name: 'Gusset / Stiff.',  count: 12, color: '#854F0B' },
  { library_code: 'LIB-005', library_name: 'Purlin + Rail',    count: 9,  color: '#14B8A6' },
  { library_code: 'LIB-006', library_name: 'Canopy Frame',     count: 7,  color: '#8E8E8E' },
  { library_code: 'LIB-007', library_name: 'Misc. Bracket',    count: 5,  color: '#C2C2C2' },
]

// ─── Routing usage ────────────────────────────────────────────────────────────

export const ROUTING_USAGE: RoutingTemplateUsage[] = [
  { template_name: 'Weld + Paint (Heavy)',   template_code: 'RT-WELD-HEAVY', count: 38, max: 38 },
  { template_name: 'Cut + Drill + QC',       template_code: 'RT-CUT-DRILL',  count: 29, max: 38 },
  { template_name: 'Full Assembly (8-step)', template_code: 'RT-FULL-8',     count: 22, max: 38 },
  { template_name: 'Paint Only',            template_code: 'RT-PAINT',       count: 15, max: 38 },
  { template_name: 'SubAssembly Standard',  template_code: 'RT-SA-STD',      count: 11, max: 38 },
  { template_name: 'QC Only',              template_code: 'RT-QC',           count: 6,  max: 38 },
]

// ─── Materials summary ────────────────────────────────────────────────────────

export const MATERIALS_SUMMARY: MaterialSummary = {
  total: 37,
  paint: 31,
  welding: 6,
  recent: [
    { code: 'CN-WELD-E7018', name: 'Welding Rod E7018 3.2mm',      state: 'confirmed' },
    { code: 'PL-00046',      name: 'Steel Plate SS400 t20×350',     state: 'confirmed' },
    { code: 'CN-EPOXY-P1',   name: 'Epoxy Primer Coat 1',           state: 'to_approve' },
    { code: 'CN-TOPCOAT-G',  name: 'Top Coat Grey RAL7035',         state: 'draft' },
  ],
}
