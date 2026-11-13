import { uploadFileName } from './upload-file-name'

// multer 2 reads multipart file names as latin1 by default, so a UTF-8 "Ø" or Thai name arrives garbled
// (final review 2026-11-10: "…PIPEØ139.8X3.2-HSS550.pdf" read as "…PIPEÃ\x98139.8X3.2…" → size "X 3.2")
describe('uploadFileName', () => {
  it('restores a UTF-8 name that multer read as latin1', () => {
    const sent = 'CP-0X222 - PIPEØ139.8X3.2-HSS550.pdf'
    const asMulterGivesIt = Buffer.from(sent, 'utf8').toString('latin1')
    expect(uploadFileName(asMulterGivesIt)).toBe(sent)
    expect(uploadFileName(Buffer.from('ลูกค้าปรับแบบ.pdf', 'utf8').toString('latin1'))).toBe('ลูกค้าปรับแบบ.pdf')
  })
  it('leaves an ASCII name alone', () => {
    expect(uploadFileName('CP-x - PIPE 113.5X2.4-HSS550.pdf')).toBe('CP-x - PIPE 113.5X2.4-HSS550.pdf')
  })
})
