import { vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
const navigate = vi.fn()
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }))
import { toast } from 'sonner'
import { BomUpload } from './BomUpload'

// Dispatch Note now goes in through the same picker as the Tekla lists
// (2026-10-26) — this test exercises that wiring with the heavy hooks
// mocked, same precedent as WoDetail.page.test.tsx.
const selectProject = vi.fn()
vi.mock('../hooks/useProjectSelection', () => ({
  useProjectSelection: () => ({
    activeProject: { id: 1, project_code: 'P1', name: 'Project 1' },
    projects: [{ id: 1, project_code: 'P1', name: 'Project 1' }],
    selectProject,
  }),
}))
vi.mock('../hooks/useProjectZones', () => ({
  useProjectZones: () => ({ data: [{ id: 1, code: 'Z1', label: 'Zone 1' }] }),
}))
vi.mock('../hooks/useSubZones', () => ({
  useSubZones: () => ({ data: [] }),
}))
const submit = vi.fn().mockResolvedValue({ id: 99, hold_summary: null })
vi.mock('../hooks/useBomDispatches', () => ({
  useUploadBomWithPreview: () => ({
    submit,
    confirm: vi.fn(),
    confirmReview: vi.fn(),
    cancel: vi.fn(),
    pendingMismatch: null,
    pendingReview: null,
    uploadMutation: { isPending: false },
    isPreviewing: false,
  }),
  useZoneUploadMode: () => ({ data: undefined, isLoading: false }),
}))
vi.mock('../hooks/useRenameStep', () => ({
  useRenameStep: () => ({ dispatchId: null, afterUpload: vi.fn().mockResolvedValue(false), close: vi.fn() }),
}))
vi.mock('../hooks/usePermission', () => ({ usePermission: () => true }))
const savePreshop = vi.fn().mockResolvedValue({ dispatch_id: 95, revision: 3 })
const preshopCurrent = vi.fn().mockReturnValue({ data: null, isLoading: false })
vi.mock('../hooks/useBomPreshop', () => ({
  usePreshopCurrent: (scope: unknown) => preshopCurrent(scope),
  useSavePreshop: () => ({ mutateAsync: savePreshop, isPending: false }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() } }))

afterEach(() => {
  vi.clearAllMocks()
})

function renderPage() {
  render(<MemoryRouter><BomUpload /></MemoryRouter>)
}

function selectZone() {
  fireEvent.change(screen.getByDisplayValue('Select Zone...'), { target: { value: '1' } })
}

function selectSeparateMode() {
  fireEvent.click(screen.getByRole('radio', { name: 'Separate Main + ACC' }))
}

// The combined "BOM Files" dropzone is the first file input on the page;
// NC Files is the second. No DispatchNoteSlot input remains (removed 2026-10-26).
function fileInputs() {
  return screen.getAllByText('Drag files here, or click to select').map(label => {
    const zone = label.closest('div')!.parentElement!
    return zone.querySelector('input[type="file"]') as HTMLInputElement
  })
}

function makeFile(name: string) {
  return new File(['x'], name, { type: 'application/vnd.ms-excel' })
}

describe('BomUpload — Dispatch Note in the same picker', () => {
  it('picking 4 files including a DN puts it in the list and sends doc_types DISPATCH_NOTE', async () => {
    renderPage()
    selectZone()

    const [bomInput, ncInput] = fileInputs()
    const files = [
      makeFile('Assembly List.xlsx'),
      makeFile('Assembly Part List.xlsx'),
      makeFile('Part List.xlsx'),
      makeFile('Dispatch Note.xlsx'),
    ]
    fireEvent.change(bomInput, { target: { files } })

    // shown in the same selected-files list, not as an unknown file
    expect(screen.getByText('Dispatch Note.xlsx')).toBeInTheDocument()
    expect(screen.getByText('Dispatch Note (ไม่ใส่ก็ได้)')).toBeInTheDocument()

    fireEvent.change(ncInput, { target: { files: [new File(['x'], 'a.nc1')] } })

    fireEvent.click(screen.getByRole('button', { name: /Upload/ }))

    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    const formData = submit.mock.calls[0][0] as FormData
    expect(formData.getAll('doc_types')).toEqual(
      expect.arrayContaining(['ASSEMBLY_LIST', 'ASSEMBLY_PART_LIST', 'PART_LIST', 'DISPATCH_NOTE']),
    )
    const sentNames = (formData.getAll('bom_files') as File[]).map(f => f.name)
    expect(sentNames).toContain('Dispatch Note.xlsx')
  })

  it('a second Dispatch Note is rejected with a toast and not added to the list', () => {
    renderPage()
    selectZone()

    const [bomInput] = fileInputs()
    fireEvent.change(bomInput, { target: { files: [makeFile('Dispatch Note.xlsx')] } })
    expect(screen.getAllByText('Dispatch Note (ไม่ใส่ก็ได้)')).toHaveLength(1)

    fireEvent.change(bomInput, { target: { files: [makeFile('Dispatch Note 2.xlsx')] } })

    expect(toast.error).toHaveBeenCalledWith('ใส่ Dispatch Note ได้ไฟล์เดียว')
    // still only the first one in the list
    expect(screen.getAllByText('Dispatch Note (ไม่ใส่ก็ได้)')).toHaveLength(1)
    expect(screen.queryByText('Dispatch Note 2.xlsx')).toBeNull()
  })

  it('removing the Dispatch Note uses the usual remove control', () => {
    renderPage()
    selectZone()
    const [bomInput] = fileInputs()
    fireEvent.change(bomInput, { target: { files: [makeFile('Dispatch Note.xlsx')] } })
    expect(screen.getByText('Dispatch Note.xlsx')).toBeInTheDocument()

    const row = screen.getByText('Dispatch Note.xlsx').closest('div')!.parentElement!.parentElement!
    fireEvent.click(row.querySelector('button')!)
    expect(screen.queryByText('Dispatch Note.xlsx')).toBeNull()
  })

  it('separate mode: a DN named for the other slot gets an inline wrong-box error', () => {
    renderPage()
    selectZone()
    selectSeparateMode()
    const [mainInput] = fileInputs()
    fireEvent.change(mainInput, { target: { files: [makeFile('ACC Dispatch Note.xlsx')] } })
    expect(screen.getByText('ไฟล์นี้เป็น Dispatch Note ของ Acc — ใส่ในช่อง Acc')).toBeInTheDocument()
    expect(screen.queryByText('Dispatch Note (Main) (ไม่ใส่ก็ได้)')).toBeNull()
  })

  it('separate mode: a DN with no matching lists in its slot blocks submit', () => {
    renderPage()
    selectZone()
    selectSeparateMode()
    const [mainInput, accInput, ncInput] = fileInputs()
    fireEvent.change(mainInput, {
      target: {
        files: [
          makeFile('MAIN Assembly List.xlsx'),
          makeFile('MAIN Assembly Part List.xlsx'),
          makeFile('MAIN Part List.xlsx'),
        ],
      },
    })
    fireEvent.change(accInput, { target: { files: [makeFile('ACC Dispatch Note.xlsx')] } })
    fireEvent.change(ncInput, { target: { files: [new File(['x'], 'a.nc1')] } })

    expect(screen.getByText('ใส่ Dispatch Note ของ Acc แล้ว แต่ไม่มีไฟล์ BOM ของ Acc')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Upload/ })).toBeDisabled()
  })
})

describe('BomUpload — opened from the BOM page (2026-10-28)', () => {
  it('preselects the zone passed in the URL', () => {
    render(<MemoryRouter initialEntries={['/bom/upload?project_id=1&zone_id=1']}><BomUpload /></MemoryRouter>)
    expect(screen.getByDisplayValue('Z1 — Zone 1')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Select Zone...')).toBeNull()
  })
})

describe('BomUpload — BOM Type', () => {
  it('opens on Full shop with NC Files', () => {
    renderPage()
    selectZone()
    expect(screen.getByRole('radio', { name: 'Full shop (BOM)' })).toBeChecked()
    expect(screen.getByText(/^NC Files/)).toBeInTheDocument()
  })

  it('Pre-shop hides the BOM and NC sections and shows the pre-shop slots', () => {
    renderPage()
    selectZone()
    fireEvent.click(screen.getByRole('radio', { name: 'Pre-shop' }))
    expect(screen.queryByText(/^NC Files/)).toBeNull()
    expect(screen.getByText('Part list (ถ้ามี)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save pre-shop' })).toBeDisabled()
  })

  it('loads the saved pre-shop of the zone', () => {
    preshopCurrent.mockReturnValue({ isLoading: false, data: { dispatch_id: 7, revision: 2, uploaded_at: '2026-11-23T03:00:00Z', assemblies: [
      { assembly_mark: 'C-01', name: 'COLUMN', qty: 4, weight_kg: 100, surface_area_m2: 2, length_mm: 8450, width_mm: 300, height_mm: 300,
        parts: [{ part_mark: 'P101', profile: 'H300', grade: 'SS400', length_mm: 8400, unit_weight_kg: 789.6, qty: 1 }] },
    ] } })
    renderPage()
    selectZone()
    fireEvent.click(screen.getByRole('radio', { name: 'Pre-shop' }))
    expect(screen.getByText(/Pre-shop rev 2/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('C-01')).toBeInTheDocument()
  })
})

describe('BomUpload — pre-shop load fails', () => {
  it('shows the error and no editor, so an empty save cannot replace the real revision', () => {
    preshopCurrent.mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch: vi.fn() })
    renderPage()
    selectZone()
    fireEvent.click(screen.getByRole('radio', { name: 'Pre-shop' }))
    expect(screen.getByText(/โหลด pre-shop ของ zone นี้ไม่ได้/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save pre-shop' })).toBeNull()
  })
})

describe('BomUpload — Save pre-shop', () => {
  it('opens the BOM page on the same project and zone, with the new pre-shop selected', async () => {
    preshopCurrent.mockReturnValue({ isLoading: false, data: { dispatch_id: 7, revision: 2, uploaded_at: '2026-11-23T03:00:00Z', assemblies: [
      { assembly_mark: 'C-01', name: 'COLUMN', qty: 4, weight_kg: 100, surface_area_m2: 2, length_mm: 8450, width_mm: 300, height_mm: 300,
        parts: [{ part_mark: 'P101', profile: 'H300', grade: 'SS400', length_mm: 8400, unit_weight_kg: 789.6, qty: 1 }] },
    ] } })
    renderPage()
    selectZone()
    fireEvent.click(screen.getByRole('radio', { name: 'Pre-shop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save pre-shop' }))
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/bom?project_id=1&zone_id=1', { state: { selectDispatch: 95 } }))
  })
})
