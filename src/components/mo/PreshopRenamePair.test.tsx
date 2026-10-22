import { vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PreshopRenamePair } from './PreshopRenamePair'
import type { PreshopAssembly } from '../../api/mo'
import type { RenameCandidate } from '../../lib/preshopRename'

// A new row (status 'new') offered every absent PRE_SHOP mark of the MO as a
// possible rename (2026-10-22, scope cut: no % shown). Paired, it renders
// like a normal existing-mark compare row (reuses PreshopMergeCompare as-is)
// plus a "ชื่อ mark X → Y" line. 1:1 — a candidate chosen elsewhere is disabled here.

const incoming: PreshopAssembly = { assembly_mark: '9BUH1B-4', qty: 1, weight_kg: null, surface_area_m2: null, length_mm: null, parts: [] }
const existingOf = (over: object = {}) => ({ qty: 2, length_mm: 1000, width_mm: null, height_mm: null, weight_kg: 50, surface_area_m2: null, parts: [], wo_qty: 0, wo_parts: [] as string[], ...over })
const candidates: RenameCandidate[] = [
  { line_id: 10, assembly_mark: '2BUH1B-4', existing: existingOf() },
  { line_id: 20, assembly_mark: 'OTHER-1', existing: existingOf({ qty: 5 }) },
]

function setup(over: Partial<React.ComponentProps<typeof PreshopRenamePair>> = {}) {
  const onPair = over.onPair ?? vi.fn()
  const onChoiceChange = over.onChoiceChange ?? vi.fn()
  render(
    <PreshopRenamePair
      mark="9BUH1B-4"
      incoming={incoming}
      candidates={candidates}
      chosenId={undefined}
      takenIds={new Set()}
      choice={{}}
      onPair={onPair}
      onChoiceChange={onChoiceChange}
      {...over}
    />,
  )
  return { onPair, onChoiceChange }
}

describe('PreshopRenamePair', () => {
  it('defaults to "ไม่ใช่" with candidates in server order, no % shown', () => {
    setup()
    const select = screen.getByLabelText('จับคู่กับ mark เดิมของ 9BUH1B-4') as HTMLSelectElement
    expect(select.value).toBe('')
    expect([...select.options].map(o => o.text)).toEqual(['ไม่ใช่ — เพิ่มเป็น mark ใหม่', '2BUH1B-4', 'OTHER-1'])
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ชื่อ mark/)).not.toBeInTheDocument()
  })

  it('has the ⓘ tooltip explaining pairing (custom hover, never native title)', () => {
    setup()
    const icon = screen.getByLabelText(/อธิบาย/)
    expect(icon).not.toHaveAttribute('title')
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.mouseEnter(icon)
    expect(screen.getByRole('tooltip')).toHaveTextContent('เปลี่ยนชื่อให้ แทนการเพิ่มเป็น mark ใหม่')
  })

  it('picking a candidate fires onPair with its line_id', () => {
    const { onPair } = setup()
    fireEvent.change(screen.getByLabelText('จับคู่กับ mark เดิมของ 9BUH1B-4'), { target: { value: '10' } })
    expect(onPair).toHaveBeenCalledWith(10)
  })

  it('once paired, renders the rename line and the compare box (reused as-is)', () => {
    setup({ chosenId: 10, takenIds: new Set([10]), choice: {} })
    expect(screen.getByText('ชื่อ mark 2BUH1B-4 → 9BUH1B-4')).toBeInTheDocument()
    expect(screen.getByText(/มีใน MO แล้ว/)).toBeInTheDocument()
    // the cards for the differing qty (existing 2, incoming 1) both show
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('unpaired → no compare box, no rename line', () => {
    setup({ chosenId: undefined })
    expect(screen.queryByText(/ชื่อ mark/)).not.toBeInTheDocument()
    expect(screen.queryByText(/มีใน MO แล้ว/)).not.toBeInTheDocument()
  })

  it('unpairing (back to "ไม่ใช่") fires onPair(undefined)', () => {
    const { onPair } = setup({ chosenId: 10, takenIds: new Set([10]) })
    fireEvent.change(screen.getByLabelText('จับคู่กับ mark เดิมของ 9BUH1B-4'), { target: { value: '' } })
    expect(onPair).toHaveBeenCalledWith(undefined)
  })

  it('shows the stale-pairing notice when given one, even unpaired (reconcilePairing already reset chosenId)', () => {
    setup({ chosenId: undefined, notice: 'mark ที่จับคู่ไว้ไม่อยู่ในรายการแล้ว — เลือกใหม่' })
    expect(screen.getByText('mark ที่จับคู่ไว้ไม่อยู่ในรายการแล้ว — เลือกใหม่')).toBeInTheDocument()
  })

  it('no notice by default', () => {
    setup()
    expect(screen.queryByText(/จับคู่ไว้ไม่อยู่ในรายการแล้ว/)).not.toBeInTheDocument()
  })

  it('1:1 — a candidate chosen by another row is disabled here, except this row\'s own pick', () => {
    setup({ chosenId: 20, takenIds: new Set([10, 20]) })
    const select = screen.getByLabelText('จับคู่กับ mark เดิมของ 9BUH1B-4') as HTMLSelectElement
    expect([...select.options].find(o => o.value === '10')!.disabled).toBe(true)
    expect([...select.options].find(o => o.value === '20')!.disabled).toBe(false)
  })
})
