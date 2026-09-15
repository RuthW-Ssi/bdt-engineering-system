import * as fs from 'fs'
import * as path from 'path'
import { LocalFileStorageDriver } from './local.driver'

const STORAGE_ROOT = process.env.FILE_STORAGE_LOCAL_PATH || './storage'

describe('LocalFileStorageDriver.getObject', () => {
  const key = 'test-fixtures/local-driver-spec.txt'
  const filePath = path.join(STORAGE_ROOT, key)

  beforeEach(() => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, 'hello from disk')
  })

  afterEach(() => {
    fs.rmSync(filePath, { force: true })
  })

  it('reads the file at the resolved local path and returns its bytes', async () => {
    const driver = new LocalFileStorageDriver()
    const buf = await driver.getObject(key)
    expect(buf.toString()).toBe('hello from disk')
  })

  it('throws when the key does not exist on disk', async () => {
    const driver = new LocalFileStorageDriver()
    await expect(driver.getObject('does/not/exist.txt')).rejects.toThrow()
  })
})
