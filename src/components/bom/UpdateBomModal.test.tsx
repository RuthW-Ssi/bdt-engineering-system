import { vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import { UpdateBomModal } from './UpdateBomModal'

// Dispatch Note now goes in through the same picker as the Tekla lists
// (2026-10-26); separate mode gives Main and Acc each their own DN, mapped
// to MAIN_DISPATCH_NOTE / ACC_DISPATCH_NOTE. Same mocking precedent as
// useBomDispatches.test.tsx (QueryClientProvider wrapper, mocked api hooks).
const submit = vi.fn().mockResolvedValue({ id: 99, hold_summary: null })
vi.mock('../../hooks/useBomDispatches', () => ({
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
}))
vi.mock('../../hooks/useRenameStep', () => ({
  useRenameStep: () => ({ dispatchId: null, afterUpload: vi.fn().mockResolvedValue(false), close: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() } }))

afterEach(() => {
  vi.clearAllMocks()
})

function renderModal(uploadMode: 'combined' | 'separate' = 'combined') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <UpdateBomModal dispatchId={7} projectId={1} zoneId={1} subZoneId={null} uploadMode={uploadMode} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

// Dropzones render in DOM order: BOM section(s) first, NC Files last.
function fileInputs() {
  return screen.getAllByText('Drag files here, or click to select').map(label => {
    const zone = label.closest('div')!.parentElement!
    return zone.querySelector('input[type="file"]') as HTMLInputElement
  })
}

function makeFile(name: string) {
  return new File(['x'], name, { type: 'application/vnd.ms-excel' })
}

describe('UpdateBomModal — Dispatch Note in the same picker', () => {
  it('combined mode: a DN among the files lands in the list and is sent as DISPATCH_NOTE', async () => {
    renderModal('combined')
    const [bomInput, ncInput] = fileInputs()
    fireEvent.change(bomInput, {
      target: {
        files: [
          makeFile('Assembly List.xlsx'),
          makeFile('Assembly Part List.xlsx'),
          makeFile('Part List.xlsx'),
          makeFile('Dispatch Note.xlsx'),
        ],
      },
    })
    expect(screen.getByText('Dispatch Note (ไม่ใส่ก็ได้)')).toBeInTheDocument()

    fireEvent.change(ncInput, { target: { files: [new File(['x'], 'a.nc1')] } })
    fireEvent.click(screen.getByRole('button', { name: /Upload/ }))

    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    const formData = submit.mock.calls[0][0] as FormData
    expect(formData.getAll('doc_types')).toEqual(
      expect.arrayContaining(['ASSEMBLY_LIST', 'ASSEMBLY_PART_LIST', 'PART_LIST', 'DISPATCH_NOTE']),
    )
  })

  it('separate mode: Main and Acc each take their own DN (MAIN_DISPATCH_NOTE / ACC_DISPATCH_NOTE)', async () => {
    renderModal('separate')
    const [mainInput, accInput, ncInput] = fileInputs()

    fireEvent.change(mainInput, {
      target: {
        files: [
          makeFile('MAIN Assembly List.xlsx'),
          makeFile('MAIN Assembly Part List.xlsx'),
          makeFile('MAIN Part List.xlsx'),
          makeFile('Dispatch Note.xlsx'),
        ],
      },
    })
    fireEvent.change(accInput, {
      target: {
        files: [
          makeFile('ACC Assembly List.xlsx'),
          makeFile('ACC Assembly Part List.xlsx'),
          makeFile('ACC Part List.xlsx'),
          makeFile('Dispatch Note.xlsx'),
        ],
      },
    })
    // one DN row per section
    expect(screen.getAllByText('Dispatch Note.xlsx')).toHaveLength(2)

    fireEvent.change(ncInput, { target: { files: [new File(['x'], 'a.nc1')] } })
    fireEvent.click(screen.getByRole('button', { name: /Upload/ }))

    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    const formData = submit.mock.calls[0][0] as FormData
    expect(formData.getAll('doc_types')).toEqual(expect.arrayContaining(['MAIN_DISPATCH_NOTE', 'ACC_DISPATCH_NOTE']))
  })

  it('a second DN in the same dropzone shows the toast and is not added', () => {
    renderModal('separate')
    const [mainInput] = fileInputs()
    fireEvent.change(mainInput, { target: { files: [makeFile('Dispatch Note.xlsx')] } })
    expect(screen.getAllByText('Dispatch Note.xlsx')).toHaveLength(1)

    fireEvent.change(mainInput, { target: { files: [makeFile('Dispatch Note 2.xlsx')] } })
    expect(toast.error).toHaveBeenCalledWith('ใส่ Dispatch Note ได้ไฟล์เดียว')
    expect(screen.queryByText('Dispatch Note 2.xlsx')).toBeNull()
  })
})
