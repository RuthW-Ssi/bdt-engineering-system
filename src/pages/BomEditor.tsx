import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, RotateCcw, RotateCw, GitBranch, Layers, CheckCircle2, AlertCircle, Plus, ChevronRight, ChevronDown, GripVertical, Edit2, Copy, Trash2 } from 'lucide-react'
import * as Icons from 'lucide-react'
import { mockBomTree } from '../data/mockBom'
import { CAT_META } from '../data/meta'
import { genId } from '../data/utils'
import type { BomNode, Category } from '../types'

type ValidateState = null | 'pass' | 'fail'

const ERRORS = [
  { code: 'PP-00099', field: 'qty', message: 'Quantity ต้องมากกว่า 0' },
  { code: 'SA-00123', field: 'scrap_pct', message: 'Scrap % เกิน 15% — ตรวจสอบด้วย' },
]

// ── BOM Node Row ──────────────────────────────────────────────
function BomRow({
  node, onToggle, onQtyChange, onAdd, onDelete, onDuplicate, selected, onSelect,
}: {
  node: BomNode
  onToggle: (id: string) => void
  onQtyChange: (id: string, qty: number) => void
  onAdd: (parentId: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  selected: string | null
  onSelect: (id: string) => void
}) {
  const [editingQty, setEditingQty] = useState(false)
  const [qtyVal, setQtyVal] = useState(String(node.qty))
  const [hovered, setHovered] = useState(false)
  const m = CAT_META[node.category]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (Icons as any)[m.icon] as React.ComponentType<{ size?: number; color?: string }> | undefined
  const hasChildren = node.children.length > 0
  const isRoot = node.level === 0
  const isSelected = selected === node.id

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    marginLeft: node.level * 20,
    background: isSelected ? '#E6F1FB' : isRoot ? 'white' : 'white',
    border: isSelected ? '1px solid #B5D4F4' : isRoot ? '1px solid #C2C2C2' : '1px solid #E0E0E0',
    borderRadius: 6,
    marginBottom: 2,
    cursor: 'pointer',
    boxShadow: isRoot ? '0 1px 3px rgba(0,0,0,0.05)' : undefined,
    outline: isSelected ? '1px solid #185FA5 inset' : undefined,
    transition: 'all 120ms',
  }

  return (
    <div
      style={rowStyle}
      onClick={() => onSelect(node.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Expand/collapse */}
      <span
        className="flex items-center justify-center rounded hover:bg-chrome-100"
        style={{ width: 18, height: 18, color: '#8E8E8E', flexShrink: 0, cursor: hasChildren ? 'pointer' : 'default' }}
        onClick={e => { e.stopPropagation(); if (hasChildren) onToggle(node.id) }}
      >
        {hasChildren ? (node.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
      </span>

      {/* Drag handle */}
      <span style={{ width: 14, color: '#C2C2C2', opacity: hovered ? 1 : 0, cursor: 'grab', flexShrink: 0, transition: 'opacity 120ms' }}>
        <GripVertical size={13} />
      </span>

      {/* Category dot */}
      <span style={{ width: 18, height: 18, borderRadius: 999, background: `${m.color}18`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {Icon && <Icon size={10} color={m.color} />}
      </span>

      {/* Code */}
      <span className="font-mono" style={{ fontSize: isRoot ? 13 : 12, fontWeight: isRoot ? 600 : 500, color: isRoot ? '#1F1F1F' : '#555', minWidth: 110, flexShrink: 0 }}>
        {node.code}
      </span>

      {/* Name */}
      <span className="flex-1 truncate" style={{ fontSize: 13, fontWeight: isRoot ? 600 : 400, color: '#1F1F1F' }}>
        {node.name}
      </span>

      {/* Qty */}
      {editingQty ? (
        <input
          autoFocus
          type="number"
          value={qtyVal}
          onChange={e => setQtyVal(e.target.value)}
          onBlur={() => { setEditingQty(false); onQtyChange(node.id, Number(qtyVal)) }}
          onKeyDown={e => { if (e.key === 'Enter') { setEditingQty(false); onQtyChange(node.id, Number(qtyVal)) } if (e.key === 'Escape') { setEditingQty(false); setQtyVal(String(node.qty)) } }}
          onClick={e => e.stopPropagation()}
          className="font-mono"
          style={{ fontSize: 13, fontWeight: 500, color: '#1F1F1F', width: 70, textAlign: 'right', padding: '2px 6px', background: 'white', border: '1px solid #185FA5', borderRadius: 4, boxShadow: '0 0 0 3px rgba(24,95,165,0.15)' }}
        />
      ) : (
        <span
          className="font-mono"
          style={{ fontSize: 13, fontWeight: 500, color: isRoot ? '#555' : '#1F1F1F', minWidth: 50, textAlign: 'right', padding: '2px 6px', cursor: isRoot ? 'default' : 'text', borderRadius: 4 }}
          onClick={e => { if (!isRoot) { e.stopPropagation(); setEditingQty(true) } }}
          title={isRoot ? '' : 'คลิกเพื่อแก้ไข'}
        >
          {node.qty}
        </span>
      )}

      {/* UOM */}
      <span style={{ fontSize: 12, color: '#8E8E8E', minWidth: 32 }}>{node.uom}</span>

      {/* Scrap */}
      {node.scrap_pct > 0 && (
        <span style={{ background: '#FAEEDA', color: '#854F0B', padding: '2px 7px', borderRadius: 999, fontSize: 11, fontWeight: 500, flexShrink: 0 }}>
          +{node.scrap_pct}%
        </span>
      )}

      {/* Actions */}
      <div className="inline-flex gap-0.5" style={{ opacity: hovered ? 1 : 0, transition: 'opacity 120ms' }} onClick={e => e.stopPropagation()}>
        {!isRoot && (
          <>
            <button onClick={() => onAdd(node.id)} className="flex items-center justify-center rounded hover:bg-chrome-200" style={{ width: 22, height: 22, color: '#8E8E8E' }} title="เพิ่ม child"><Plus size={12} /></button>
            <button onClick={() => onDuplicate(node.id)} className="flex items-center justify-center rounded hover:bg-chrome-200" style={{ width: 22, height: 22, color: '#8E8E8E' }} title="ทำซ้ำ"><Copy size={12} /></button>
            <button onClick={() => onDelete(node.id)} className="flex items-center justify-center rounded hover:bg-ssi-50" style={{ width: 22, height: 22, color: '#C8202A' }} title="ลบ"><Trash2 size={12} /></button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Recursive tree renderer ────────────────────────────────────
function BomTree({ node, ...props }: { node: BomNode } & React.ComponentProps<typeof BomRow>) {
  return (
    <>
      <BomRow node={node} {...props} />
      {node.expanded && node.children.map(child => (
        <BomTree key={child.id} node={child} {...props} />
      ))}
    </>
  )
}

// ── Helpers ───────────────────────────────────────────────────
function toggleNode(tree: BomNode, id: string): BomNode {
  if (tree.id === id) return { ...tree, expanded: !tree.expanded }
  return { ...tree, children: tree.children.map(c => toggleNode(c, id)) }
}

function updateQty(tree: BomNode, id: string, qty: number): BomNode {
  if (tree.id === id) return { ...tree, qty }
  return { ...tree, children: tree.children.map(c => updateQty(c, id, qty)) }
}

function addChild(tree: BomNode, parentId: string): BomNode {
  if (tree.id === parentId) {
    const newNode: BomNode = { id: genId(), code: 'NEW-00001', name: 'ชิ้นงานใหม่', category: 'Part' as Category, qty: 1, uom: 'PCS', scrap_pct: 0, level: tree.level + 1, children: [], expanded: false }
    return { ...tree, expanded: true, children: [...tree.children, newNode] }
  }
  return { ...tree, children: tree.children.map(c => addChild(c, parentId)) }
}

function deleteNode(tree: BomNode, id: string): BomNode {
  return { ...tree, children: tree.children.filter(c => c.id !== id).map(c => deleteNode(c, id)) }
}

function duplicateNode(tree: BomNode, id: string): BomNode {
  const newChildren = tree.children.flatMap(c => {
    const dup = c.id === id ? [c, { ...c, id: genId() }] : [c]
    return dup.map(n => duplicateNode(n, id))
  })
  return { ...tree, children: newChildren }
}

function countNodes(node: BomNode): number {
  return 1 + node.children.reduce((a, c) => a + countNodes(c), 0)
}

// ── Main Page ─────────────────────────────────────────────────
export function BomEditor() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [tree, setTree] = useState<BomNode>({ ...mockBomTree, level: 0 })
  const [selected, setSelected] = useState<string | null>(null)
  const [validateState, setValidateState] = useState<ValidateState>(null)
  const [sidePanelTab, setSidePanelTab] = useState<'validation' | 'detail' | 'stats'>('validation')

  const totalNodes = countNodes(tree)
  const maxDepth = 4

  const selectedNode = (() => {
    function find(n: BomNode): BomNode | null {
      if (n.id === selected) return n
      for (const c of n.children) { const r = find(c); if (r) return r }
      return null
    }
    return find(tree)
  })()

  function validate() {
    setValidateState(ERRORS.length > 0 ? 'fail' : 'pass')
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
      {/* Page Header */}
      <div className="bg-white flex items-center sticky top-14 z-40 border-b-2 border-chrome-100 px-4 gap-3" style={{ height: 56, flexShrink: 0 }}>
        <button onClick={() => navigate(`/engineer-products/${code}`)} className="flex items-center justify-center rounded-md hover:bg-chrome-50" style={{ width: 32, height: 32, color: '#8E8E8E' }}>
          <ArrowLeft size={16} />
        </button>
        <span className="font-mono" style={{ fontSize: 14, fontWeight: 600 }}>{code}</span>
        <span style={{ color: '#C2C2C2' }}>·</span>
        <span style={{ fontSize: 13, color: '#8E8E8E' }}>BOM Editor</span>
        <span style={{ background: '#FAEEDA', color: '#854F0B', border: '1px solid #FAC775', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 500 }}>Draft</span>

        <div className="hidden md:flex items-center gap-2 mx-auto" style={{ fontSize: 12, color: '#8E8E8E' }}>
          <GitBranch size={14} />{totalNodes} รายการ · น้ำหนักรวม 2,840.5 kg
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <button className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 32, height: 32, color: '#8E8E8E', border: '1px solid #E0E0E0' }}>
            <RotateCcw size={14} />
          </button>
          <button className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 32, height: 32, color: '#8E8E8E', border: '1px solid #E0E0E0' }}>
            <RotateCw size={14} />
          </button>
          <button
            onClick={validate}
            className="flex items-center gap-1.5 rounded-md"
            style={{
              height: 36, padding: '0 14px', fontSize: 13, fontWeight: 500,
              background: validateState === 'fail' ? '#FCEBEB' : validateState === 'pass' ? '#EAF3DE' : '#F5F5F5',
              color: validateState === 'fail' ? '#C8202A' : validateState === 'pass' ? '#27500A' : '#3A3A3A',
              border: `1px solid ${validateState === 'fail' ? '#EE9B9B' : validateState === 'pass' ? '#C0DD97' : '#C2C2C2'}`,
            }}
          >
            {validateState === 'fail' ? <><AlertCircle size={14} />มี {ERRORS.length} Errors</> : validateState === 'pass' ? <><CheckCircle2 size={14} />ตรวจสอบแล้ว</> : <><CheckCircle2 size={14} />Validate BOM</>}
          </button>
          <button
            className="flex items-center gap-1.5 rounded-md text-white"
            style={{ height: 36, padding: '0 18px', fontSize: 13, fontWeight: 600, background: validateState === 'pass' ? '#C8202A' : '#C8202A', opacity: validateState === 'pass' ? 1 : 0.4, cursor: validateState === 'pass' ? 'pointer' : 'not-allowed' }}
          >
            ส่งตรวจสอบ
          </button>
        </div>
      </div>

      {/* Body: tree + side panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Tree pane */}
        <div className="flex-1 flex flex-col border-r border-chrome-100" style={{ background: '#F5F5F5' }}>
          {/* Hint bar */}
          <div className="flex items-center gap-3 border-b border-chrome-100 px-5" style={{ height: 36, background: '#FAFAFA', fontSize: 11, color: '#8E8E8E', flexShrink: 0 }}>
            <span><kbd className="font-mono" style={{ background: '#E0E0E0', borderRadius: 3, padding: '1px 5px', fontSize: 10, color: '#555' }}>+</kbd> เพิ่ม child</span>
            <span><kbd className="font-mono" style={{ background: '#E0E0E0', borderRadius: 3, padding: '1px 5px', fontSize: 10, color: '#555' }}>Del</kbd> ลบ</span>
            <span><kbd className="font-mono" style={{ background: '#E0E0E0', borderRadius: 3, padding: '1px 5px', fontSize: 10, color: '#555' }}>Space</kbd> ขยาย/ย่อ</span>
            <span><kbd className="font-mono" style={{ background: '#E0E0E0', borderRadius: 3, padding: '1px 5px', fontSize: 10, color: '#555' }}>⌘Z</kbd> Undo</span>
            <span className="flex-1 text-right text-chrome-400" style={{ fontSize: 11 }}>ภาพรวม › ชิ้นงาน › {code} › BOM</span>
          </div>

          {/* Scrollable tree */}
          <div className="flex-1 overflow-y-auto scroll-thin" style={{ padding: '12px 16px' }}>
            <BomTree
              node={tree}
              selected={selected}
              onSelect={setSelected}
              onToggle={id => setTree(t => toggleNode(t, id))}
              onQtyChange={(id, qty) => setTree(t => updateQty(t, id, qty))}
              onAdd={parentId => setTree(t => addChild(t, parentId))}
              onDelete={id => setTree(t => deleteNode(t, id))}
              onDuplicate={id => setTree(t => duplicateNode(t, id))}
            />
            {/* Add root sibling */}
            <button
              onClick={() => {}}
              className="w-full flex items-center justify-center gap-2 hover:border-steel-600 hover:text-steel-600 hover:bg-steel-50 transition-all"
              style={{ height: 36, border: '2px dashed #C2C2C2', borderRadius: 6, cursor: 'pointer', color: '#8E8E8E', fontSize: 12, fontWeight: 500, marginTop: 8 }}
            >
              <Plus size={14} />เพิ่มชิ้นงาน
            </button>
          </div>
        </div>

        {/* Side panel */}
        <div style={{ width: 320, background: 'white', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          {/* Side panel tabs */}
          <div className="flex border-b border-chrome-100" style={{ flexShrink: 0 }}>
            {([['validation', 'Validation'], ['detail', 'Node Detail'], ['stats', 'Stats']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSidePanelTab(key)}
                className="flex items-center gap-1.5 transition-colors"
                style={{ padding: '12px 14px', fontSize: 12, fontWeight: 500, color: sidePanelTab === key ? '#C8202A' : '#8E8E8E', borderBottom: `2px solid ${sidePanelTab === key ? '#C8202A' : 'transparent'}` }}
              >
                {label}
                {key === 'validation' && validateState === 'fail' && (
                  <span style={{ background: '#FCEBEB', color: '#8A1520', padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 600 }}>{ERRORS.length}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto scroll-thin" style={{ padding: 16 }}>
            {sidePanelTab === 'validation' && (
              <div>
                {validateState === null && (
                  <div className="text-center" style={{ color: '#8E8E8E', fontSize: 13, paddingTop: 32 }}>
                    <CheckCircle2 size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                    กด Validate BOM เพื่อตรวจสอบ
                  </div>
                )}
                {validateState === 'pass' && (
                  <div className="rounded-lg flex items-center gap-3" style={{ background: '#EAF3DE', border: '1px solid #C0DD97', padding: '12px 16px' }}>
                    <CheckCircle2 size={20} style={{ color: '#639922', flexShrink: 0 }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#27500A' }}>BOM ผ่านการตรวจสอบ</div>
                  </div>
                )}
                {validateState === 'fail' && (
                  <div className="flex flex-col gap-2">
                    <div className="rounded-lg" style={{ background: '#FCEBEB', border: '1px solid #EE9B9B', padding: '10px 14px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#5C0D15' }}>พบ {ERRORS.length} ข้อผิดพลาด</div>
                    </div>
                    {ERRORS.map((err, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-md" style={{ background: 'white', border: '1px solid #EE9B9B', padding: '10px 12px' }}>
                        <AlertCircle size={14} style={{ color: '#C8202A', flexShrink: 0, marginTop: 1 }} />
                        <div>
                          <div className="font-mono" style={{ fontSize: 11, color: '#C8202A', fontWeight: 600 }}>{err.code}</div>
                          <div style={{ fontSize: 12, color: '#555' }}>{err.message}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {sidePanelTab === 'detail' && (
              <div>
                {!selectedNode ? (
                  <div className="text-center" style={{ color: '#8E8E8E', fontSize: 13, paddingTop: 32 }}>
                    <Edit2 size={28} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                    เลือก node เพื่อดูรายละเอียด
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>{selectedNode.name}</div>
                    {[
                      { label: 'รหัส', value: selectedNode.code, mono: true },
                      { label: 'ประเภท', value: CAT_META[selectedNode.category].label, mono: false },
                      { label: 'จำนวน', value: `${selectedNode.qty} ${selectedNode.uom}`, mono: true },
                      { label: 'Scrap %', value: `${selectedNode.scrap_pct}%`, mono: true },
                      { label: 'Level', value: String(selectedNode.level), mono: true },
                      { label: 'Sub-items', value: String(selectedNode.children.length), mono: true },
                    ].map(f => (
                      <div key={f.label}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{f.label}</div>
                        <div className={f.mono ? 'font-mono' : ''} style={{ fontSize: 13, color: '#1F1F1F' }}>{f.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {sidePanelTab === 'stats' && (
              <div className="flex flex-col gap-3">
                {[
                  { label: 'จำนวนรายการทั้งหมด', value: `${totalNodes} items`, icon: <GitBranch size={14} /> },
                  { label: 'ความลึกสูงสุด', value: `${maxDepth} ชั้น`, icon: <Layers size={14} /> },
                  { label: 'น้ำหนักรวม', value: '2,840.5 kg', icon: <CheckCircle2 size={14} /> },
                  { label: 'Work Centers', value: '4 แห่ง', icon: <CheckCircle2 size={14} /> },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between rounded-md border border-chrome-100" style={{ padding: '10px 14px' }}>
                    <span className="flex items-center gap-2" style={{ fontSize: 13, color: '#555' }}>{s.icon}{s.label}</span>
                    <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{s.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center" style={{ height: 40, background: '#1F1F1F', color: 'white', padding: '0 20px', gap: 16, fontSize: 12, flexShrink: 0 }}>
        <span className="flex items-center gap-1.5" style={{ color: '#8E8E8E' }}><GitBranch size={14} />{totalNodes} รายการ</span>
        <span style={{ width: 1, height: 16, background: '#3A3A3A' }} />
        <span className="flex items-center gap-1.5" style={{ color: '#8E8E8E' }}>น้ำหนักรวม 2,840.5 kg</span>
        <span style={{ width: 1, height: 16, background: '#3A3A3A' }} />
        <span className="flex items-center gap-1.5" style={{ color: '#8E8E8E' }}><Layers size={14} />{maxDepth} ชั้น</span>
        <span className="flex-1" />
        {validateState === 'fail' && <span className="flex items-center gap-1.5" style={{ color: '#EE9B9B' }}><AlertCircle size={13} />มี {ERRORS.length} Errors</span>}
        {validateState === 'pass' && <span className="flex items-center gap-1.5" style={{ color: '#86C04B' }}><CheckCircle2 size={13} />ตรวจสอบแล้ว</span>}
        <span style={{ width: 1, height: 16, background: '#3A3A3A' }} />
        <span style={{ color: '#555' }}>บันทึกล่าสุด 2 นาทีที่แล้ว</span>
      </div>
    </div>
  )
}
