import { useState, useEffect, useCallback } from 'react'
import { listBoms, getBom, updateBomLine, deleteBomLine } from '../api/boms'
import type { BomDTO, BomListItemDTO, BomView } from '../api/boms'
import type { BomNode, Category } from '../types'

// Map category prefix5 to BomNode category
function inferCategory(code: string): Category {
  const p = code.toUpperCase()
  if (p.startsWith('MS') || p.startsWith('CUS')) return 'Assembly'
  if (p.startsWith('PL')) return 'Plate'
  if (p.startsWith('CF')) return 'SubAssembly'
  if (p.startsWith('PT')) return 'OtherMat'
  if (p.startsWith('BN') || p.startsWith('AC')) return 'Consumable'
  if (p.startsWith('HR')) return 'ShapeStock'
  return 'Part'
}

// Convert a BOM + its flat lines into a BomNode tree
export function bomToTree(bom: BomDTO): BomNode {
  const root: BomNode = {
    id: String(bom.id),
    code: bom.product.product_code,
    name: bom.product.name,
    category: 'Assembly',
    qty: Number(bom.product_qty),
    uom: 'EA',
    scrap_pct: 0,
    level: 0,
    expanded: true,
    children: bom.lines.map((line) => {
      const isMaterial = line.material !== null
      const code = isMaterial ? line.material!.default_code : line.sub_product!.product_code
      const name = isMaterial ? line.material!.name : line.sub_product!.name
      return {
        id: `line-${line.id}`,
        code,
        name,
        category: isMaterial ? inferCategory(code) : ('SubAssembly' as Category),
        qty: Number(line.product_qty),
        uom: line.product_uom?.name ?? 'KG',
        scrap_pct: Number(line.scrap_pct),
        level: 1,
        expanded: false,
        children: [],
        _lineId: line.id,
      } as BomNode & { _lineId: number }
    }),
  }
  return root
}

interface UseBomResult {
  bom: BomDTO | null
  tree: BomNode | null
  bomList: BomListItemDTO[]
  loading: boolean
  error: string | null
  activeBomView: BomView
  setActiveBomView: (v: BomView) => void
  refresh: () => void
  updateLineQty: (lineId: number, qty: number) => Promise<void>
  deleteLineById: (lineId: number) => Promise<void>
}

export function useBom(productCode: string | undefined): UseBomResult {
  const [bomList, setBomList] = useState<BomListItemDTO[]>([])
  const [bom, setBom] = useState<BomDTO | null>(null)
  const [tree, setTree] = useState<BomNode | null>(null)
  const [loading, setLoading] = useState(!!productCode)
  const [error, setError] = useState<string | null>(null)
  const [activeBomView, setActiveBomView] = useState<BomView>('eBOM')

  const load = useCallback(async () => {
    if (!productCode) return
    setLoading(true)
    setError(null)
    try {
      const list = await listBoms(productCode, { bom_view: activeBomView })
      setBomList(list)

      // Prefer active BOM, fallback to first draft
      const target = list.find(b => b.state === 'active') ?? list.find(b => b.state === 'draft') ?? null
      if (target) {
        const detail = await getBom(target.id)
        setBom(detail)
        setTree(bomToTree(detail))
      } else {
        setBom(null)
        setTree(null)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load BOM'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [productCode, activeBomView])

  useEffect(() => { load() }, [load])

  const updateLineQty = useCallback(async (lineId: number, qty: number) => {
    if (!bom) return
    await updateBomLine(bom.id, lineId, { product_qty: qty })
    await load()
  }, [bom, load])

  const deleteLineById = useCallback(async (lineId: number) => {
    if (!bom) return
    await deleteBomLine(bom.id, lineId)
    await load()
  }, [bom, load])

  return { bom, tree, bomList, loading, error, activeBomView, setActiveBomView, refresh: load, updateLineQty, deleteLineById }
}
