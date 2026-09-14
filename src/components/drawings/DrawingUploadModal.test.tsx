import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DrawingUploadModal } from './DrawingUploadModal'

function renderModal(onFilesConfirmed = vi.fn()) {
  render(
    <DrawingUploadModal
      scopeLabel="0X220 — Z1"
      isUploading={false}
      onFilesConfirmed={onFilesConfirmed}
      onClose={vi.fn()}
    />,
  )
  return { onFilesConfirmed }
}

function fileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement
}

describe('DrawingUploadModal', () => {
  it('defaults to DWG — dropzone only accepts .dwg', () => {
    renderModal()
    expect(screen.getByText(/DWG · up to 50 MB each/)).toBeInTheDocument()
    expect(fileInput().accept).toBe('.dwg')
  })

  it('switching the file-type picker to PDF restricts the dropzone to .pdf', () => {
    renderModal()
    fireEvent.change(screen.getByLabelText(/file type/i), { target: { value: 'pdf' } })
    expect(screen.getByText(/PDF · up to 50 MB each/)).toBeInTheDocument()
    expect(fileInput().accept).toBe('.pdf')
  })

  it('switching file type clears any already-staged files, so a batch never mixes DWG and PDF', () => {
    renderModal()
    const dwgFile = new File(['x'], 'plan-A.dwg')
    fireEvent.change(fileInput(), { target: { files: [dwgFile] } })
    expect(screen.getByText('plan-A.dwg')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/file type/i), { target: { value: 'pdf' } })

    expect(screen.queryByText('plan-A.dwg')).not.toBeInTheDocument()
  })

  it('confirms with the currently selected file type', () => {
    const { onFilesConfirmed } = renderModal()
    fireEvent.change(screen.getByLabelText(/file type/i), { target: { value: 'pdf' } })
    const pdfFile = new File(['x'], 'plan-A.pdf')
    fireEvent.change(fileInput(), { target: { files: [pdfFile] } })

    fireEvent.click(screen.getByRole('button', { name: /upload/i }))

    expect(onFilesConfirmed).toHaveBeenCalledWith([pdfFile], 'pdf')
  })
})
