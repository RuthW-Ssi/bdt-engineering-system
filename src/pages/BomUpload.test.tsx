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
  useZoneUploadMode: () => ({ data: zoneMode.value, isLoading: false }),
}))
const zoneMode = vi.hoisted(() => ({ value: undefined as { mode: 'combined' | 'separate' | null; hasFullShop: boolean } | undefined }))
const afterUpload = vi.hoisted(() => vi.fn())
vi.mock('../hooks/useRenameStep', () => ({
  useRenameStep: () => ({ dispatchId: null, partsOnly: false, afterUpload, close: vi.fn() }),
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
  zoneMode.value = undefined
})
beforeEach(() => { afterUpload.mockResolvedValue(false) })

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
    // marks and parts are both decided in the Rev review now (2026-11-23) → no pairing dialog after save
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/bom/dispatch/99/paint'))
    expect(afterUpload).not.toHaveBeenCalled()
    const formData = submit.mock.calls[0][0] as FormData
    expect(formData.getAll('doc_types')).toEqual(
      expect.arrayContaining(['ASSEMBLY_LIST', 'ASSEMBLY_PART_LIST', 'PART_LIST', 'DISPATCH_NOTE']),
    )
    const sentNames = (formData.getAll('bom_files') as File[]).map(f => f.name)
    expect(sentNames).toContain('Dispatch Note.xlsx')
  })

  it('NC FILES has Clear all: removes every NC file at once', () => {
    renderPage()
    const [, ncInput] = fileInputs()
    fireEvent.change(ncInput, { target: { files: [new File(['x'], 'a.nc1'), new File(['y'], 'b.nc1')] } })
    expect(screen.getByText('NC FILES (2)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.queryByText(/NC FILES/)).toBeNull()
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

  // One Part List is shared by MAIN and ACC (2026-11-23, Tao)
  it('separate mode: ACC with no Part List borrows MAIN\'s — Upload is enabled and the ACC box says so', () => {
    renderPage()
    selectZone()
    selectSeparateMode()
    const [mainInput, accInput, ncInput] = fileInputs()
    fireEvent.change(mainInput, { target: { files: [makeFile('MAIN Assembly List.xlsx'), makeFile('MAIN Assembly Part List.xlsx'), makeFile('MAIN Part List.xlsx')] } })
    fireEvent.change(accInput, { target: { files: [makeFile('ACC Assembly List.xlsx'), makeFile('ACC Assembly Part List.xlsx')] } })
    fireEvent.change(ncInput, { target: { files: [new File(['x'], 'a.nc1')] } })
    expect(screen.getByText('ใช้ Part List ร่วมจากช่อง MAIN')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Upload/ })).toBeEnabled()
  })

  it('separate mode: the Part List alone in ACC is shared with MAIN\'s lists', () => {
    renderPage()
    selectZone()
    selectSeparateMode()
    const [mainInput, accInput, ncInput] = fileInputs()
    fireEvent.change(mainInput, { target: { files: [makeFile('MAIN Assembly List.xlsx'), makeFile('MAIN Assembly Part List.xlsx')] } })
    fireEvent.change(accInput, { target: { files: [makeFile('ACC Part List.xlsx')] } })
    fireEvent.change(ncInput, { target: { files: [new File(['x'], 'a.nc1')] } })
    expect(screen.getByText('ใช้ Part List ร่วมจากช่อง ACC')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Upload/ })).toBeEnabled()
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

describe('BomUpload — someone saved first', () => {
  const C01 = (qty: number) => ({ assembly_mark: 'C-01', name: 'COLUMN', qty, weight_kg: 100, surface_area_m2: 2, length_mm: 8450, width_mm: 300, height_mm: 300,
    parts: [{ part_mark: 'P101', profile: 'H300', grade: 'SS400', length_mm: 8400, unit_weight_kg: 789.6, qty: 1 }] })

  it('shows who saved, what differs, and saves on top only when asked', async () => {
    preshopCurrent.mockReturnValue({ isLoading: false, data: { dispatch_id: 7, revision: 2, uploaded_at: '2026-11-23T03:00:00Z', uploader: 'Admin', assemblies: [C01(4)] } })
    savePreshop.mockReset()
    savePreshop
      .mockRejectedValueOnce({ response: { status: 409, data: { code: 'PRESHOP_STALE', message: 'มีผู้บันทึก pre-shop zone นี้ไปก่อนแล้ว',
        current: { dispatch_id: 8, revision: 3, uploaded_at: '2026-11-23T04:40:00Z', uploader: 'Admin', assemblies: [C01(6)] } } } })
      .mockResolvedValueOnce({ dispatch_id: 9, revision: 4 })
    renderPage()
    selectZone()
    fireEvent.click(screen.getByRole('radio', { name: 'Pre-shop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save pre-shop' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('มีผู้บันทึก pre-shop zone นี้ไปก่อนแล้ว')
    expect(dialog).toHaveTextContent('rev 3')
    expect(dialog).toHaveTextContent('ชุด 6 → 4')
    expect(savePreshop.mock.calls[0][0]).toMatchObject({ base_revision: 2 })
    fireEvent.click(screen.getByRole('button', { name: /บันทึกทับเป็น rev 4/ }))
    await vi.waitFor(() => expect(savePreshop).toHaveBeenCalledTimes(2))
    expect(savePreshop.mock.calls[1][0]).toMatchObject({ base_revision: 2, overwrite: true })
  })

  it('"กลับไปแก้ต่อ" closes the warning and keeps the editor', async () => {
    preshopCurrent.mockReturnValue({ isLoading: false, data: { dispatch_id: 7, revision: 2, uploaded_at: '2026-11-23T03:00:00Z', uploader: 'Admin', assemblies: [C01(4)] } })
    savePreshop.mockReset()
    savePreshop.mockRejectedValueOnce({ response: { status: 409, data: { code: 'PRESHOP_STALE', message: 'x',
      current: { dispatch_id: 8, revision: 3, uploaded_at: '2026-11-23T04:40:00Z', uploader: 'Admin', assemblies: [C01(6)] } } } })
    renderPage()
    selectZone()
    fireEvent.click(screen.getByRole('radio', { name: 'Pre-shop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save pre-shop' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'กลับไปแก้ต่อ' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByDisplayValue('C-01')).toBeInTheDocument()
    expect(savePreshop).toHaveBeenCalledTimes(1)
  })
})

describe('BomUpload — file sections layout', () => {
  it('Combined: BOM Files and NC Files sit in one row', () => {
    renderPage()
    selectZone()
    const row = screen.getByTestId('bom-nc-row')
    expect(row).toHaveTextContent('BOM Files')
    expect(row).toHaveTextContent('NC Files')
  })

  it('Separate: MAIN and ACC share a row, NC Files is below on its own', () => {
    renderPage()
    selectZone()
    selectSeparateMode()
    const row = screen.getByTestId('main-acc-row')
    expect(row).toHaveTextContent('MAIN BOM Files')
    expect(row).toHaveTextContent('ACC BOM Files')
    expect(row).not.toHaveTextContent('NC Files')
  })
})

// A zone with a real (Full shop) BOM can't take a pre-shop — the BOM Type offers Full shop only (2026-11-24, Tao)
describe('BomUpload — BOM Type on a Full shop zone', () => {
  it('a zone without a real BOM offers Full shop and Pre-shop', () => {
    renderPage()
    selectZone()
    expect(screen.getByRole('radio', { name: 'Pre-shop' })).toBeInTheDocument()
  })

  it('a zone with a real BOM hides Pre-shop, even when the link asks for it', () => {
    zoneMode.value = { mode: 'combined', hasFullShop: true }
    render(<MemoryRouter initialEntries={['/bom/upload?project_id=1&zone_id=1&type=preshop']}><BomUpload /></MemoryRouter>)
    expect(screen.queryByRole('radio', { name: 'Pre-shop' })).toBeNull()
    expect(screen.getByRole('radio', { name: 'Full shop (BOM)' })).toBeChecked()
  })

  // 2026-11-25: the pre-shop picks Combined / Separate and its first save locks the zone
  it('a pre-shop zone keeps Pre-shop, shows the mode choice locked to the pre-shop type', () => {
    zoneMode.value = { mode: 'separate', hasFullShop: false }
    render(<MemoryRouter initialEntries={['/bom/upload?project_id=1&zone_id=1&type=preshop']}><BomUpload /></MemoryRouter>)
    expect(screen.getByRole('radio', { name: 'Pre-shop' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Separate Main + ACC' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Combined' })).toBeDisabled()
  })

  it('an empty zone offers the mode choice on Pre-shop too', () => {
    render(<MemoryRouter initialEntries={['/bom/upload?project_id=1&zone_id=1&type=preshop']}><BomUpload /></MemoryRouter>)
    expect(screen.getByRole('radio', { name: 'Combined' })).toBeEnabled()
    expect(screen.getByRole('radio', { name: 'Separate Main + ACC' })).toBeEnabled()
  })
})

// Opened from Update BOM: the project / zone / sub-zone stay fixed (2026-11-24, Tao)
describe('BomUpload — opened from Update BOM', () => {
  it('locks Project, Zone and Sub-zone and says Update BOM', () => {
    render(<MemoryRouter initialEntries={['/bom/upload?project_id=1&zone_id=1&type=preshop&update=1']}><BomUpload /></MemoryRouter>)
    for (const s of screen.getAllByRole('combobox').slice(0, 3)) expect(s).toBeDisabled()
    expect(screen.getByText('Update BOM')).toBeInTheDocument()
  })
  it('a plain Upload BOM keeps Project and Zone selectable', () => {
    renderPage()
    const [project, zone] = screen.getAllByRole('combobox')
    expect(project).toBeEnabled()
    expect(zone).toBeEnabled()
  })
})
