import { useState, useEffect } from 'react'
import { listBoms, getBom } from '../api/boms'
import type { BomListItemDTO, BomLineDTO } from '../api/boms'
import type { BomDiffNode, DiffState, Category } from '../types'

function lineKey(line: BomLineDTO): string {
  return line.material ? line.material.default_code : line.sub_product?.product_code ?? String(line.id)
}

function lineCode(line: BomLineDTO): string {
  return line.material?.default_code ?? line.sub_product?.product_code ?? String(line.id)
}

function lineName(line: BomLineDTO): string {
  return line.material?.name ?? line.sub_product?.name ?? ''
}

function lineCategory(_line: BomLineDTO): Category {
  return _line.sub_product ? 'SubAssembly' : 'Part'
}

function lineQtyStr(line: BomLineDTO): string {
  return `${Number(line.product_qty)} ${line.product_uom?.name ?? 'KG'}`
}

export function diffBomLines(oldLines: BomLineDTO[], newLines: BomLineDTO[]): BomDiffNode[] {
  const oldMap = new Map(oldLines.map(l => [lineKey(l), l]))

  const nodes: BomDiffNode[] = []
  const seen = new Set<string>()

  for (const line of newLines) {
    const key = lineKey(line)
    seen.add(key)
    const old = oldMap.get(key)

    let state: DiffState = 'added'
    const changes: { field: string; old: string; newVal: string }[] = []

    if (old) {
      const oldQty = Number(old.product_qty)
      const newQty = Number(line.product_qty)
      const oldScrap = Number(old.scrap_pct)
      const newScrap = Number(line.scrap_pct)

      if (oldQty !== newQty) changes.push({ field: 'qty', old: String(oldQty), newVal: String(newQty) })
      if (oldScrap !== newScrap) changes.push({ field: 'scrap%', old: `${oldScrap}%`, newVal: `${newScrap}%` })

      state = changes.length > 0 ? 'modified' : 'unchanged'
    }

    nodes.push({
      id: `diff-new-${line.id}`,
      code: lineCode(line),
      name: lineName(line),
      category: lineCategory(line),
      state,
      level: 1,
      qty: state === 'modified' && old
        ? `${Number(old.product_qty)} → ${Number(line.product_qty)} ${line.product_uom?.name ?? 'KG'}`
        : lineQtyStr(line),
      changes: changes.length > 0 ? changes : undefined,
      expanded: state === 'modified',
      children: [],
    })
  }

  for (const line of oldLines) {
    const key = lineKey(line)
    if (seen.has(key)) continue
    nodes.push({
      id: `diff-old-${line.id}`,
      code: lineCode(line),
      name: lineName(line),
      category: lineCategory(line),
      state: 'removed',
      level: 1,
      qty: lineQtyStr(line),
      expanded: false,
      children: [],
    })
  }

  return nodes
}

interface UseBomDiffResult {
  bomList: BomListItemDTO[]
  diffNodes: BomDiffNode[]
  fromVersionId: number | null
  toVersionId: number | null
  setFromVersionId: (id: number) => void
  setToVersionId: (id: number) => void
  loading: boolean
  stats: { added: number; modified: number; removed: number; unchanged: number }
}

export function useBomDiff(productCode: string | undefined): UseBomDiffResult {
  const [bomList, setBomList] = useState<BomListItemDTO[]>([])
  const [fromVersionId, setFromVersionId] = useState<number | null>(null)
  const [toVersionId, setToVersionId] = useState<number | null>(null)
  const [diffNodes, setDiffNodes] = useState<BomDiffNode[]>([])
  const [loading, setLoading] = useState(false)

  // Load BOM list
  useEffect(() => {
    if (!productCode) return
    listBoms(productCode).then(list => {
      setBomList(list)
      if (list.length >= 2) {
        setFromVersionId(list[list.length - 1].id)
        setToVersionId(list[0].id)
      } else if (list.length === 1) {
        setToVersionId(list[0].id)
      }
    })
  }, [productCode])

  // Compute diff when versions change
  useEffect(() => {
    if (!toVersionId) return
    setLoading(true)

    const fetchBoth = fromVersionId
      ? Promise.all([getBom(fromVersionId), getBom(toVersionId)])
      : getBom(toVersionId).then(b => [null, b] as [null, typeof b])

    fetchBoth
      .then(([fromBom, toBom]) => {
        const oldLines = fromBom?.lines ?? []
        const newLines = toBom.lines
        setDiffNodes(diffBomLines(oldLines, newLines))
      })
      .finally(() => setLoading(false))
  }, [fromVersionId, toVersionId])

  const stats = diffNodes.reduce(
    (acc, n) => { acc[n.state]++; return acc },
    { added: 0, modified: 0, removed: 0, unchanged: 0 },
  )

  return { bomList, diffNodes, fromVersionId, toVersionId, setFromVersionId, setToVersionId, loading, stats }
}
