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

  it('keeps a drag made while a file is still reading', async () => {
    let resolve: (v: unknown) => void = () => {}
    importPartList.mockReturnValue(new Promise(r => { resolve = r }))
    render(<PreshopEditor initial={twoAsmWithParts()} onSave={vi.fn()} saving={false} />)
    const input = screen.getByTestId('slot-pl').querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'PL.xls')] } })
    drag('P103', 'B-01')
    resolve({ filename: 'PL.xls', parts: [P('P999')] })
    await screen.findByTestId('part-card-P999')
    expect(within(screen.getByTestId('asm-row-B-01')).getByTestId('asm-part-count')).toHaveTextContent('1')
  })

  it('does not take a second file while one is reading', () => {
    importDispatchNote.mockReturnValue(new Promise(() => {}))
    render(<PreshopEditor initial={twoAsmWithParts()} onSave={vi.fn()} saving={false} />)
    const dnInput = screen.getByTestId('slot-dn').querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(dnInput, { target: { files: [new File(['x'], 'DN.xls')] } })
    expect(screen.getByTestId('slot-pl').querySelector('input[type="file"]')).toBeNull()
  })

  it('re-picking a Dispatch Note keeps the parts already put into its assemblies', async () => {
    importDispatchNote.mockResolvedValueOnce({ filename: 'DN1.xls', assemblies: [asm('C-01', 4), asm('B-01', 6)], warnings: [] })
    importPartList.mockResolvedValueOnce({ filename: 'PL.xls', parts: [P('P103')] })
    render(<PreshopEditor initial={EMPTY_STATE} onSave={vi.fn()} saving={false} />)
    const pick = async (slot: string, name: string) => {
      const input = screen.getByTestId(slot).querySelector('input[type="file"]') as HTMLInputElement
      fireEvent.change(input, { target: { files: [new File(['x'], name)] } })
    }
    await pick('slot-dn', 'DN1.xls')
    await screen.findByTestId('asm-row-C-01')
    await pick('slot-pl', 'PL.xls')
    await screen.findByTestId('part-card-P103')
    drag('P103', 'C-01')
    importDispatchNote.mockResolvedValueOnce({ filename: 'DN2.xls', assemblies: [asm('C-01', 6), asm('B-01', 6)], warnings: [] })
    await pick('slot-dn', 'DN2.xls')
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /ใหม่ \(จากไฟล์\).*6/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(screen.getByTestId('asm-row-C-01')).getByTestId('asm-part-count')).toHaveTextContent('1')
    expect(within(screen.getByTestId('asm-row-C-01')).getByLabelText('ชุด')).toHaveValue(6)
  })

  it('lets the Engineer fill a missing kg on a part so Save can go', () => {
    const base = mergeDispatchNote(EMPTY_STATE, [asm('C-01', 4)]).state
    const s0 = mergePartList(base, [{ ...P('P103'), unit_weight_kg: null }]).state
    render(<PreshopEditor initial={s0} onSave={vi.fn()} saving={false} />)
    drag('P103', 'C-01')
    const save = screen.getByRole('button', { name: 'Save pre-shop' })
    expect(save).toBeDisabled()
    fireEvent.change(within(screen.getByTestId('part-card-P103')).getByLabelText('kg / ชิ้น'), { target: { value: '4.2' } })
    expect(save).toBeEnabled()
  })

  it('deletes a part that is not in any assembly, and offers no delete for one that is', () => {
    render(<PreshopEditor initial={twoAsmWithParts()} onSave={vi.fn()} saving={false} />)
    drag('P103', 'C-01')
    expect(within(screen.getByTestId('part-card-P103')).queryByRole('button', { name: /Delete/ })).toBeNull()
    fireEvent.click(within(screen.getByTestId('part-card-P201')).getByRole('button', { name: 'Delete P201' }))
    expect(screen.queryByTestId('part-card-P201')).toBeNull()
  })

  it('takes a value the Engineer types in the compare dialog (กำหนดเอง)', async () => {
    importDispatchNote.mockResolvedValue({ filename: 'DN.xls', assemblies: [asm('C-01', 6)], warnings: [] })
    render(<PreshopEditor initial={fromSaved([asm('C-01', 4, { parts: [{ ...P('P103'), qty: 1 }] })])} onSave={vi.fn()} saving={false} />)
    const input = screen.getByTestId('slot-dn').querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'DN.xls')] } })
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('กำหนดเอง ชุด C-01'), { target: { value: '5' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(screen.getByTestId('asm-row-C-01')).getByLabelText('ชุด')).toHaveValue(5)
  })
})


// Separate MAIN + ACC pre-shop (2026-11-25)
describe('PreshopEditor — Separate MAIN + ACC', () => {
  it('separate shows Dispatch Note MAIN/ACC and Part list MAIN/ACC slots; combined shows one of each', () => {
    const { unmount } = render(<PreshopEditor initial={EMPTY_STATE} onSave={vi.fn()} saving={false} uploadMode="separate" />)
    for (const id of ['slot-dn-main', 'slot-dn-acc', 'slot-pl-main', 'slot-pl-acc']) expect(screen.getByTestId(id)).toBeInTheDocument()
    unmount()
    render(<PreshopEditor initial={EMPTY_STATE} onSave={vi.fn()} saving={false} />)
    expect(screen.getByTestId('slot-dn')).toBeInTheDocument()
    expect(screen.queryByTestId('slot-dn-acc')).toBeNull()
  })

  it('Save is disabled while a hand-added row has no slot; picking ACC enables it and sends the slot', () => {
    const onSave = vi.fn()
    const s = mergePartList(EMPTY_STATE, [P('P103')], 'MAIN').state
    render(<PreshopEditor initial={s} onSave={onSave} saving={false} uploadMode="separate" />)
    fireEvent.click(screen.getByRole('button', { name: /Add assembly/ }))
    fireEvent.change(screen.getAllByLabelText('Assembly mark')[0], { target: { value: 'RF9' } })
    drag('P103', 'RF9')
    const save = screen.getByRole('button', { name: 'Save pre-shop' })
    expect(save).toBeDisabled()
    expect(screen.getByText(/เลือก MAIN หรือ ACC: RF9/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Slot RF9'), { target: { value: 'ACC' } })
    expect(save).toBeEnabled()
    fireEvent.click(save)
    expect(onSave.mock.calls[0][0][0]).toMatchObject({ assembly_mark: 'RF9', slot: 'ACC' })
  })

  it('a Dispatch Note dropped in the ACC box tags its marks ACC', async () => {
    importDispatchNote.mockResolvedValue({ filename: 'acc dn.xls', assemblies: [asm('X1', 1)] })
    render(<PreshopEditor initial={EMPTY_STATE} onSave={vi.fn()} saving={false} uploadMode="separate" />)
    const input = screen.getByTestId('slot-dn-acc').querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'acc dn.xls')] } })
    await waitFor(() => expect(screen.getByTestId('asm-row-X1')).toHaveTextContent('ACC'))
  })

  it('one Part List loaded → the other box says it is shared', async () => {
    importPartList.mockResolvedValue({ filename: 'main pl.xlsx', parts: [P('P103')] })
    render(<PreshopEditor initial={EMPTY_STATE} onSave={vi.fn()} saving={false} uploadMode="separate" />)
    const input = screen.getByTestId('slot-pl-main').querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'main pl.xlsx')] } })
    await waitFor(() => expect(screen.getByTestId('slot-pl-acc')).toHaveTextContent('ใช้ Part List ร่วมจากช่อง MAIN'))
  })
})
