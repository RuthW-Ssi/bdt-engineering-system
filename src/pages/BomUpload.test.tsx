import { vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
})
