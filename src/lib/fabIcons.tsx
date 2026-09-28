// Curated icon set for the Operation icon picker (OperationBuilder.tsx),
// organized by the 12 steel-fab process steps (Cut → Inspect) — same set
// explored in the fab-icons picker artifact (2026-09-27/28), narrowed to
// lucide-react only for the real feature (2026-09-29): the artifact also
// tried some Flaticon picks, but those need per-icon attribution or a paid
// license to ship in the real product, so they're left out here. Every name
// below is imported directly (not `import * as Icons`) so Vite only bundles
// the ~62 icons actually used, not all of lucide-react.
import {
  Scissors, SquareScissors, Axe, Zap, Cpu,
  Drill, Target, CircleDot,
  Shapes, Move, Layers, Component, Anvil, Cog, Hammer,
  Puzzle, Blocks, Ruler, PencilRuler, Wrench, Compass, Magnet, Nut, Toolbox,
  Flame, FlameKindling, Sparkles, Bolt, Thermometer, PlugZap,
  Columns2, Rows2, GripVertical,
  Disc, LoaderCircle, Sparkle, Circle,
  Boxes, Container, Truck, Warehouse, HardHat, Factory, Forklift, Construction,
  Wind, Tornado, Cloud,
  PaintRoller, SprayCan, Paintbrush, PaintBucket, Palette,
  BadgeCheck, CircleCheck, Flag,
  Search, Eye, ClipboardCheck, ScanSearch, Gauge, CircleGauge,
  type LucideIcon,
} from 'lucide-react'

export interface FabIconCategory {
  step: string
  en: string
  th: string
  ids: string[]
}

// "crane" isn't in lucide-react — added one-off from Phosphor Icons
// (MIT license, same free-commercial-no-attribution terms as lucide) rather
// than pulling in a whole second icon library dependency for a single icon
// (2026-09-29: "ใส่ crane เพิ่มให้หน่อย" — path data taken verbatim from
// https://github.com/phosphor-icons/core raw/regular/crane.svg).
function Crane({ size = 16, color = 'currentColor' }: { size?: number | string; color?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width={size} height={size} fill="none">
      <line x1="24" y1="168" x2="128" y2="168" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
      <path d="M24,200V96a8,8,0,0,1,8-8h72l24,80v32a8,8,0,0,1-8,8H32A8,8,0,0,1,24,200Z" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
      <line x1="56" y1="88" x2="56" y2="168" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
      <path d="M104,88,224,24V160a8,8,0,0,1-8,8H200a8,8,0,0,1-8-8v-8" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
    </svg>
  )
}

// LucideIcon | our own plain-function Crane component — both render fine
// with just `size`/`color` (the only props any caller passes), but Lucide's
// own components are typed as `ForwardRefExoticComponent`s, which a plain
// function isn't structurally assignable to.
type FabIconComponent = LucideIcon | ((props: { size?: number | string; color?: string }) => React.JSX.Element)

export const FAB_ICON_COMPONENTS: Record<string, FabIconComponent> = {
  scissors: Scissors, 'square-scissors': SquareScissors, axe: Axe, zap: Zap, cpu: Cpu,
  drill: Drill, target: Target, 'circle-dot': CircleDot,
  shapes: Shapes, move: Move, layers: Layers, component: Component, anvil: Anvil, cog: Cog, hammer: Hammer,
  puzzle: Puzzle, blocks: Blocks, ruler: Ruler, 'pencil-ruler': PencilRuler, wrench: Wrench, compass: Compass, magnet: Magnet, nut: Nut, toolbox: Toolbox,
  flame: Flame, 'flame-kindling': FlameKindling, sparkles: Sparkles, bolt: Bolt, thermometer: Thermometer, 'plug-zap': PlugZap,
  'columns-2': Columns2, 'rows-2': Rows2, 'grip-vertical': GripVertical,
  disc: Disc, 'loader-circle': LoaderCircle, sparkle: Sparkle, circle: Circle,
  boxes: Boxes, container: Container, truck: Truck, warehouse: Warehouse, 'hard-hat': HardHat, factory: Factory, forklift: Forklift, construction: Construction, crane: Crane,
  wind: Wind, tornado: Tornado, cloud: Cloud,
  'paint-roller': PaintRoller, 'spray-can': SprayCan, paintbrush: Paintbrush, 'paint-bucket': PaintBucket, palette: Palette,
  'badge-check': BadgeCheck, 'circle-check': CircleCheck, flag: Flag,
  search: Search, eye: Eye, 'clipboard-check': ClipboardCheck, 'scan-search': ScanSearch, gauge: Gauge, 'circle-gauge': CircleGauge,
}

export const FAB_ICON_CATEGORIES: FabIconCategory[] = [
  { step: '01', en: 'Cut', th: 'ตัด', ids: ['scissors', 'square-scissors', 'axe', 'zap', 'cpu'] },
  { step: '02', en: 'Drill', th: 'เจาะ', ids: ['drill', 'target', 'circle-dot', 'cpu'] },
  { step: '03', en: 'Form', th: 'ขึ้นรูป', ids: ['shapes', 'move', 'layers', 'component', 'anvil', 'cog', 'hammer'] },
  { step: '04', en: 'Fit-up', th: 'ประกอบตำแหน่ง', ids: ['puzzle', 'blocks', 'ruler', 'pencil-ruler', 'wrench', 'compass', 'magnet', 'nut', 'toolbox'] },
  { step: '05', en: 'Weld', th: 'เชื่อม', ids: ['flame', 'flame-kindling', 'sparkles', 'bolt', 'thermometer', 'plug-zap'] },
  { step: '06', en: 'Beam', th: 'งาน H-beam', ids: ['columns-2', 'rows-2', 'grip-vertical', 'anvil', 'thermometer'] },
  { step: '07', en: 'Grind', th: 'เจียร', ids: ['disc', 'loader-circle', 'sparkle', 'circle', 'cog'] },
  { step: '08', en: 'Assembly', th: 'ประกอบรวม', ids: ['boxes', 'puzzle', 'component', 'layers', 'container', 'truck', 'warehouse', 'hard-hat', 'factory', 'forklift', 'construction', 'crane'] },
  { step: '09', en: 'Blast', th: 'พ่นทราย', ids: ['wind', 'tornado', 'cloud'] },
  { step: '10', en: 'Paint', th: 'ทาสี', ids: ['paint-roller', 'spray-can', 'paintbrush', 'paint-bucket', 'palette'] },
  { step: '11', en: 'Finish', th: 'ตกแต่ง', ids: ['badge-check', 'circle-check', 'flag', 'sparkles'] },
  { step: '12', en: 'Inspect', th: 'ตรวจสอบ', ids: ['search', 'eye', 'clipboard-check', 'scan-search', 'gauge', 'circle-gauge', 'compass'] },
]
