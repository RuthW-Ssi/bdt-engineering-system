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
  it('dropzone only accepts .pdf — .dwg upload was removed 2026-09-15', () => {
    renderModal()
    expect(screen.getByText(/PDF · up to 50 MB each/)).toBeInTheDocument()
    expect(fileInput().accept).toBe('.pdf')
  })

  it('has no file-type picker — .pdf is the only option now', () => {
    renderModal()
    expect(screen.queryByLabelText(/file type/i)).not.toBeInTheDocument()
  })

  it('confirms with the staged files, no file-type argument', () => {
    const { onFilesConfirmed } = renderModal()
    const pdfFile = new File(['x'], 'plan-A.pdf')
    fireEvent.change(fileInput(), { target: { files: [pdfFile] } })

    fireEvent.click(screen.getByRole('button', { name: /upload/i }))

    expect(onFilesConfirmed).toHaveBeenCalledWith([pdfFile])
  })
})
