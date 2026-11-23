import { vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { PreshopAssembly } from '../../../api/bomPreshop'
import { fromSaved, mergePartList, EMPTY_STATE, mergeDispatchNote } from '../../../lib/bomPreshop'
import { PreshopEditor } from './PreshopEditor'

const importDispatchNote = vi.fn()
const importPartList = vi.fn()
vi.mock('../../../api/bomPreshop', () => ({
  importDispatchNote: (f: File) => importDispatchNote(f),
  importPartList: (f: File) => importPartList(f),
}))

const asm = (mark: string, qty: number, extra: Partial<PreshopAssembly> = {}): PreshopAssembly => ({
  assembly_mark: mark, name: 'COLUMN', qty, weight_kg: 100, surface_area_m2: 2, length_mm: 8450, width_mm: 300, height_mm: 300, parts: [], ...extra,
})
const P = (part_mark: string) => ({ part_mark, profile: 'PL12x150', grade: 'SS400', length_mm: 280, unit_weight_kg: 4, no: 24 })

// a fake DataTransfer: jsdom has none
function dt() {
  const data: Record<string, string> = {}
  return { setData: (k: string, v: string) => { data[k] = v }, getData: (k: string) => data[k] ?? '', effectAllowed: '', dropEffect: '' }
}

const twoAsmWithParts = () => mergePartList(mergeDispatchNote(EMPTY_STATE, [asm('C-01', 4), asm('B-01', 6)]).state, [P('P103'), P('P201')]).state

function drag(partMark: string, asmMark: string) {
  const card = screen.getByTestId(`part-card-${partMark}`)
  const row = screen.getByTestId(`asm-row-${asmMark}`)
  const transfer = dt()
  fireEvent.dragStart(card, { dataTransfer: transfer })
  fireEvent.dragOver(row, { dataTransfer: transfer })
  fireEvent.drop(row, { dataTransfer: transfer })
}

describe('PreshopEditor', () => {
  it('puts a dragged part into the assembly it is dropped on', () => {
    render(<PreshopEditor initial={twoAsmWithParts()} onSave={vi.fn()} saving={false} />)
    drag('P103', 'B-01')
    expect(within(screen.getByTestId('asm-row-B-01')).getByTestId('asm-part-count')).toHaveTextContent('1')
    expect(screen.getByTestId('part-card-P103')).toHaveTextContent('In 1 assembly (B-01)')
  })

  it('lets one part go into two assemblies', () => {
    render(<PreshopEditor initial={twoAsmWithParts()} onSave={vi.fn()} saving={false} />)
    drag('P103', 'B-01')
    drag('P103', 'C-01')
    expect(screen.getByTestId('part-card-P103')).toHaveTextContent('In 2 assembly')
  })

  it('keeps Save disabled and lists marks without parts until every assembly has parts', () => {
    const onSave = vi.fn()
    render(<PreshopEditor initial={twoAsmWithParts()} onSave={onSave} saving={false} />)
    const save = screen.getByRole('button', { name: 'Save pre-shop' })
    expect(save).toBeDisabled()
    expect(screen.getByText(/ใส่ part ให้ครบทุก mark ก่อนบันทึก/)).toHaveTextContent('ยังไม่มี part: C-01, B-01')
    drag('P103', 'C-01')
    drag('P201', 'B-01')
    expect(save).toBeEnabled()
    fireEvent.click(save)
    expect(onSave.mock.calls[0][0].map((a: PreshopAssembly) => [a.assembly_mark, a.parts.map(p => p.part_mark)])).toEqual([['C-01', ['P103']], ['B-01', ['P201']]])
  })

  it('asks old or new when a new Dispatch Note changes a saved value', async () => {
    importDispatchNote.mockResolvedValue({ filename: 'DN.xls', assemblies: [asm('C-01', 6)], warnings: [] })
    render(<PreshopEditor initial={fromSaved([asm('C-01', 4, { parts: [{ ...P('P103'), qty: 1 }] })])} onSave={vi.fn()} saving={false} />)
    const input = screen.getByTestId('slot-dn').querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'DN.xls')] } })
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('C-01')
    fireEvent.click(within(dialog).getByRole('button', { name: /ใหม่ \(จากไฟล์\).*6/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(screen.getByTestId('asm-row-C-01')).getByLabelText('ชุด')).toHaveValue(6)
  })
})
