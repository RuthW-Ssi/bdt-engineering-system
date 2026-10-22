import { vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PreshopUploadModal } from './PreshopUploadModal'
import { mergePreshop, type MoDetail, type PreshopMergeRow } from '../../api/mo'

// CRITICAL fix round (2026-10-22): `pairedMarks` must be derived from whether
// the chosen candidate still resolves against the CURRENT dry-run result, not
// raw presence in `pairing` state — otherwise a later dry run that drops the
// candidate (e.g. the old mark now appears elsewhere in the batch) leaves the
// row stuck "paired" with no candidate behind it: the qty cell stays locked
// on "เลือกด้านล่าง" and Save would silently send the row without
// `rename_from`, adding a duplicate mark instead of renaming in place.
//
// The payload math itself (no `rename_from` once a pairing is dropped) is
// proven at the pure-function level in preshopRename.test.ts
// (`reconcilePairing` chained through `candidateFor`/`finalRenamedAssembly` —
// the exact functions this component's save() uses). This test instead
// proves the user-visible symptom is gone: once the candidate disappears
// from a fresh dry run, the row visibly reverts to a plain new row (qty
// editable again, no rename line) and shows the stale notice.

vi.mock('../../api/mo', async () => {
  const actual = await vi.importActual<typeof import('../../api/mo')>('../../api/mo')
  return { ...actual, mergePreshop: vi.fn() }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const mo = { id: 1, mo_code: 'MO-1', shop_type: 'PRE_SHOP', project: null, zone: null } as unknown as MoDetail

const existingOf = (over: object = {}) => ({ qty: 2, length_mm: 1000, width_mm: null, height_mm: null, weight_kg: 50, surface_area_m2: null, parts: [], wo_qty: 0, wo_parts: [] as string[], ...over })
const rowWithCandidate: PreshopMergeRow = { assembly_mark: '9BUH1B-4', status: 'new', existing: null, rename_candidates: [{ line_id: 10, assembly_mark: '2BUH1B-4', existing: existingOf() }] }
const rowWithoutCandidate: PreshopMergeRow = { assembly_mark: '9BUH1B-4', status: 'new', existing: null, rename_candidates: [] }

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><PreshopUploadModal mo={mo} onClose={vi.fn()} /></QueryClientProvider>)
}

const SELECT_LABEL = 'จับคู่กับ mark เดิมของ 9BUH1B-4'
const RENAME_LINE = 'ชื่อ mark 2BUH1B-4 → 9BUH1B-4'
const STALE_NOTICE = 'mark ที่จับคู่ไว้ไม่อยู่ในรายการแล้ว — เลือกใหม่'

describe('PreshopUploadModal — a dropped pairing (fix round)', () => {
  it('pair, then a fresh dry run drops the candidate → row reverts to plain new, notice shown', async () => {
    const mock = vi.mocked(mergePreshop)
    mock.mockResolvedValueOnce({ rows: [rowWithCandidate] })
    mock.mockResolvedValueOnce({ rows: [rowWithoutCandidate] })

    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /เพิ่ม assembly เอง/ }))
    const [markInput, nameInput] = screen.getAllByRole('textbox')
    fireEvent.change(markInput, { target: { value: '9BUH1B-4' } })

    // first dry run resolves with the candidate offered
    await waitFor(() => expect(screen.getByLabelText(SELECT_LABEL)).toBeInTheDocument(), { timeout: 3000 })
    fireEvent.change(screen.getByLabelText(SELECT_LABEL), { target: { value: '10' } })
    await waitFor(() => expect(screen.getByText(RENAME_LINE)).toBeInTheDocument())
    expect(screen.getByText('เลือกด้านล่าง')).toBeInTheDocument() // qty now picked in the compare box, not typed

    // a later dry run (e.g. the old mark now appears elsewhere in the batch) drops it
    fireEvent.change(nameInput, { target: { value: 'renamed in the file too' } })
    await waitFor(() => expect(screen.getByText(STALE_NOTICE)).toBeInTheDocument(), { timeout: 3000 })

    expect(screen.queryByText(RENAME_LINE)).not.toBeInTheDocument()
    expect(screen.queryByText('เลือกด้านล่าง')).not.toBeInTheDocument() // back to a plain editable qty cell
    expect((screen.getByLabelText(SELECT_LABEL) as HTMLSelectElement).value).toBe('') // select reset to "ไม่ใช่…"
  })
})

// Live bug (2026-10-22, MO-P2600063): pairing was keyed off whatever
// `check.data` held at that moment. Any edit changes the dry-run query key,
// so while the new dry run was in flight `check.data` was undefined → the
// compare map was EMPTY → reconcilePairing treated every pairing as "no longer
// offered" and dropped them all (row reverts to "ไม่ใช่", false stale notice).
// Responses below mirror the real backend: every absent PRE_SHOP mark is a
// candidate of EVERY new row (renamePool is per-MO, independent of other rows'
// pairings — the dry run never filters by rename_from), name-similar first.
describe('PreshopUploadModal — pairing stays stable across dry runs', () => {
  const cand = (line_id: number, assembly_mark: string) => ({ line_id, assembly_mark, existing: existingOf() })
  const pool = { a5: cand(283, '2BUH1A-5'), a12: cand(279, 'BUH1A-12'), b4: cand(286, '2BUH1B-4'), b3: cand(278, 'BUH1-3') }
  const rows = (): PreshopMergeRow[] => [
    { assembly_mark: '9BUH1A-5', status: 'new', existing: null, rename_candidates: [pool.a5, pool.a12, pool.b4, pool.b3] },
    { assembly_mark: '9BUH1B-4', status: 'new', existing: null, rename_candidates: [pool.b4, pool.a5, pool.b3, pool.a12] },
  ]
  const S1 = 'จับคู่กับ mark เดิมของ 9BUH1A-5'
  const S2 = 'จับคู่กับ mark เดิมของ 9BUH1B-4'
  const sel = (label: string) => screen.getByLabelText(label) as HTMLSelectElement
  const shown = (label: string) => { const s = sel(label); return s.options[s.selectedIndex]?.textContent }

  it('pair two rows, unpair + re-pair one, then edits trigger new dry runs → both pairings kept, no notice', async () => {
    const mock = vi.mocked(mergePreshop)
    mock.mockReset()
    let release: (() => void) | undefined
    mock.mockImplementation(async () => ({ rows: rows() }))

    renderModal()
    const add = screen.getByRole('button', { name: /เพิ่ม assembly เอง/ })
    fireEvent.click(add)
    fireEvent.click(add)
    const marks = () => screen.getAllByRole('textbox').filter((_, k) => k % 2 === 0) // mark, name per row
    fireEvent.change(marks()[0], { target: { value: '9BUH1A-5' } })
    fireEvent.change(marks()[1], { target: { value: '9BUH1B-4' } })
    await waitFor(() => expect(screen.getByLabelText(S2)).toBeInTheDocument(), { timeout: 3000 })

    fireEvent.change(sel(S1), { target: { value: '283' } })
    fireEvent.change(sel(S2), { target: { value: '286' } })
    fireEvent.change(sel(S2), { target: { value: '' } })
    fireEvent.change(sel(S2), { target: { value: '286' } })
    expect(shown(S1)).toBe('2BUH1A-5')
    expect(shown(S2)).toBe('2BUH1B-4')

    // an edit elsewhere → a new debounced dry run, held in flight
    mock.mockImplementation(() => new Promise(res => { release = () => res({ rows: rows() }) }))
    const callsBefore = mock.mock.calls.length
    const nameInputs = screen.getAllByRole('textbox').filter((_, k) => k % 2 === 1)
    fireEvent.change(nameInputs[0], { target: { value: 'edited' } })
    await waitFor(() => expect(mock.mock.calls.length).toBe(callsBefore + 1), { timeout: 3000 })

    // in flight: still paired, compare box still there, no notice
    expect(shown(S1)).toBe('2BUH1A-5')
    expect(shown(S2)).toBe('2BUH1B-4')
    expect(screen.getByText('ชื่อ mark 2BUH1A-5 → 9BUH1A-5')).toBeInTheDocument()
    expect(screen.queryByText(STALE_NOTICE)).not.toBeInTheDocument()

    release!()
    await waitFor(() => expect(sel(S1).options.length).toBe(5))
    await new Promise(r => setTimeout(r, 600))
    expect(shown(S1)).toBe('2BUH1A-5')
    expect(shown(S2)).toBe('2BUH1B-4')
    expect(screen.getByText('ชื่อ mark 2BUH1A-5 → 9BUH1A-5')).toBeInTheDocument()
    expect(screen.getByText('ชื่อ mark 2BUH1B-4 → 9BUH1B-4')).toBeInTheDocument()
    expect(screen.queryByText(STALE_NOTICE)).not.toBeInTheDocument()
    // 1:1 — each row's chosen candidate disabled only in the OTHER row
    const opt = (label: string, v: string) => [...sel(label).options].find(o => o.value === v)!
    expect(opt(S1, '283').disabled).toBe(false)
    expect(opt(S1, '286').disabled).toBe(true)
    expect(opt(S2, '286').disabled).toBe(false)
    expect(opt(S2, '283').disabled).toBe(true)
  })
})
