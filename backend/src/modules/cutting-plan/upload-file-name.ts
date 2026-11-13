// multer 2 decodes multipart file names as latin1 (its default defParamCharset); browsers send UTF-8.
// Undo that, so "PIPEØ139.8X3.2" and Thai names read as sent. A pure-ASCII name is unchanged.
export function uploadFileName(name: string): string {
  if (!/[\x80-\xff]/.test(name)) return name
  const decoded = Buffer.from(name, 'latin1').toString('utf8')
  return decoded.includes('�') ? name : decoded // not UTF-8 after all: keep what came
}
