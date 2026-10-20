import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DrawingUploadModal } from './DrawingUploadModal'
import type { Drawing } from '../../api/drawings'

function drawing(overrides: Partial<Drawing>): Drawing {
  return {
    id: 1,
    project_id: 1,
    zone_id: 1,
    sub_zone_id: null,
    mark: 'A',
    rev: 1,
    file_key: 'drawings/P1/Z1/A/rev1/A - BEAM - Rev 1.pdf',
    file_name: 'A - BEAM - Rev 1.pdf',
    mime_type: 'application/pdf',
    uploaded_by_id: 1,
    create_date: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const existing: Drawing[] = [drawing({})]

function renderModal(props: Partial<React.ComponentProps<typeof DrawingUploadModal>> = {}) {
  const onConfirm = props.onConfirm ?? vi.fn()
  const onClose = props.onClose ?? vi.fn()
  render(
    <DrawingUploadModal
      scopeLabel="0X220 — Z1"
      existing={props.existing ?? existing}
      bomMarks={props.bomMarks ?? ['A', 'B']}
      isUploading={props.isUploading ?? false}
      onConfirm={onConfirm}
      onClose={onClose}
    />,
  )
  return { onConfirm, onClose }
}

function fileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement
}

function uploadButton() {
  return screen.getByRole('button', { name: /upload/i })
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

  it('a parsed file (mark + rev both present) enables Upload and classifies it', () => {
    renderModal()
    const pdfFile = new File(['x'], 'B - BEAM - Rev 1.pdf')
    fireEvent.change(fileInput(), { target: { files: [pdfFile] } })

    expect(uploadButton()).not.toBeDisabled()
    expect(screen.getByText(/mark ใหม่/)).toBeInTheDocument()
  })

  it('Upload stays disabled while a row is missing rev, and enables once typed', () => {
    renderModal()
    // No " - Rev " token → rev unparsed → needs-input.
    const pdfFile = new File(['x'], 'B - BEAM.pdf')
    fireEvent.change(fileInput(), { target: { files: [pdfFile] } })

    expect(uploadButton()).toBeDisabled()
    expect(screen.getByText(/กรอก mark \/ rev/)).toBeInTheDocument()

    const revInput = screen.getByRole('spinbutton') as HTMLInputElement
    fireEvent.change(revInput, { target: { value: '1' } })

    expect(uploadButton()).not.toBeDisabled()
  })

  it('onConfirm receives the edited mark/rev, not just the parsed defaults', () => {
    const { onConfirm } = renderModal()
    const pdfFile = new File(['x'], 'B - BEAM.pdf')
    fireEvent.change(fileInput(), { target: { files: [pdfFile] } })

    const revInput = screen.getByRole('spinbutton') as HTMLInputElement
    fireEvent.change(revInput, { target: { value: '3' } })

    const markInput = screen.getByDisplayValue('B') as HTMLInputElement
    fireEvent.change(markInput, { target: { value: 'C' } })

    fireEvent.click(uploadButton())

    expect(onConfirm).toHaveBeenCalledWith([
      { file: pdfFile, fileName: 'B - BEAM.pdf', mark: 'C', rev: 3 },
    ])
  })

  it('a mark not in bomMarks gets a warning tooltip on the icon, not the label', () => {
    renderModal({ bomMarks: ['A'] })
    const pdfFile = new File(['x'], 'Z - BEAM - Rev 1.pdf')
    fireEvent.change(fileInput(), { target: { files: [pdfFile] } })

    expect(screen.getByTitle('ไม่พบ mark นี้ใน BOM ของ zone นี้')).toBeInTheDocument()
  })

  it('a mark that IS in bomMarks shows no warning tooltip', () => {
    renderModal({ bomMarks: ['A'] })
    const pdfFile = new File(['x'], 'A - BEAM - Rev 2.pdf')
    fireEvent.change(fileInput(), { target: { files: [pdfFile] } })

    expect(screen.queryByTitle('ไม่พบ mark นี้ใน BOM ของ zone นี้')).not.toBeInTheDocument()
  })

  it('replace vs add-sheet vs lower-rev vs new-rev are classified against existing', () => {
    renderModal()
    const replace = new File(['x'], 'A - BEAM - Rev 1.pdf')
    const addSheet = new File(['x'], 'A - PLAN - Rev 1.pdf')
    const newRev = new File(['x'], 'A - BEAM - Rev 2.pdf')
    const lowerRev = new File(['x'], 'A - BEAM - Rev .pdf')
    fireEvent.change(fileInput(), { target: { files: [replace, addSheet, newRev, lowerRev] } })

    expect(screen.getByText(/แทนไฟล์เดิม/)).toBeInTheDocument()
    expect(screen.getByText(/เพิ่มแผ่น/)).toBeInTheDocument()
    expect(screen.getByText(/rev ใหม่/)).toBeInTheDocument()
    expect(screen.getByText(/ต่ำกว่า rev ปัจจุบัน/)).toBeInTheDocument()
  })

  it('mark input caps length at 100 characters, matching the backend DTO', () => {
    renderModal()
    const pdfFile = new File(['x'], 'B - BEAM - Rev 1.pdf')
    fireEvent.change(fileInput(), { target: { files: [pdfFile] } })

    const markInput = screen.getByDisplayValue('B') as HTMLInputElement
    expect(markInput.maxLength).toBe(100)
  })

  it('rev input rejects values over 9999, treating it as missing (needs-input)', () => {
    renderModal()
    const pdfFile = new File(['x'], 'B - BEAM.pdf')
    fireEvent.change(fileInput(), { target: { files: [pdfFile] } })

    const revInput = screen.getByRole('spinbutton') as HTMLInputElement
    fireEvent.change(revInput, { target: { value: '10000' } })

    expect(uploadButton()).toBeDisabled()
    expect(screen.getByText(/กรอก mark \/ rev/)).toBeInTheDocument()
  })

  it('rev input still accepts exactly 9999', () => {
    renderModal()
    const pdfFile = new File(['x'], 'B - BEAM.pdf')
    fireEvent.change(fileInput(), { target: { files: [pdfFile] } })

    const revInput = screen.getByRole('spinbutton') as HTMLInputElement
    fireEvent.change(revInput, { target: { value: '9999' } })

    expect(uploadButton()).not.toBeDisabled()
  })

  it('removing a row drops it from the review table', () => {
    renderModal()
    const pdfFile = new File(['x'], 'B - BEAM - Rev 1.pdf')
    fireEvent.change(fileInput(), { target: { files: [pdfFile] } })
    expect(screen.getByDisplayValue('B')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /ลบ/i }))
    expect(screen.queryByDisplayValue('B')).not.toBeInTheDocument()
  })
})
