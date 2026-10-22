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
