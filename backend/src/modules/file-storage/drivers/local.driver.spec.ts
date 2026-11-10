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

// 2026-11-10: deleting a cutting-plan upload left its empty plate/<project>/<zone>/<id>/ folder behind
describe('LocalFileStorageDriver.delete', () => {
  const base = path.join(STORAGE_ROOT, 'test-fixtures', 'prune')
  const abs = (key: string) => path.join(STORAGE_ROOT, key)
  const write = (key: string) => {
    fs.mkdirSync(path.dirname(abs(key)), { recursive: true })
    fs.writeFileSync(abs(key), 'x')
  }

  afterEach(() => fs.rmSync(base, { recursive: true, force: true }))

  it('removes the folders left empty by the delete, but not the storage root', async () => {
    write('test-fixtures/prune/0X178/ALL/41/Z312-3-1.txt')
    await new LocalFileStorageDriver().delete('test-fixtures/prune/0X178/ALL/41/Z312-3-1.txt')
    expect(fs.existsSync(base)).toBe(false)
    expect(fs.existsSync(STORAGE_ROOT)).toBe(true)
  })

  it('stops at the first folder that still holds something', async () => {
    write('test-fixtures/prune/0X178/ALL/41/Z312-3-1.txt')
    write('test-fixtures/prune/0X178/ALL/42/Z312-3-2.txt')
    await new LocalFileStorageDriver().delete('test-fixtures/prune/0X178/ALL/41/Z312-3-1.txt')
    expect(fs.existsSync(abs('test-fixtures/prune/0X178/ALL/41'))).toBe(false)
    expect(fs.existsSync(abs('test-fixtures/prune/0X178/ALL/42/Z312-3-2.txt'))).toBe(true)
  })

  it('is a no-op for a key that is not on disk', async () => {
    write('test-fixtures/prune/keep.txt')
    await new LocalFileStorageDriver().delete('test-fixtures/prune/gone/missing.txt')
    expect(fs.existsSync(abs('test-fixtures/prune/keep.txt'))).toBe(true)
  })
})

describe('LocalFileStorageDriver.list', () => {
  const base = path.join(STORAGE_ROOT, 'test-fixtures', 'listing')
  const write = (key: string) => {
    const file = path.join(STORAGE_ROOT, key)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'x')
  }

  afterEach(() => fs.rmSync(base, { recursive: true, force: true }))

  it('returns every file under the prefix with its key and modified time', async () => {
    write('test-fixtures/listing/0X197/aaa/A.txt')
    write('test-fixtures/listing/0X197/bbb/B.dxf')
    const out = await new LocalFileStorageDriver().list('test-fixtures/listing/')
    expect(out.map(o => o.key).sort()).toEqual(['test-fixtures/listing/0X197/aaa/A.txt', 'test-fixtures/listing/0X197/bbb/B.dxf'])
    // not `instanceof Date`: fs hands back the Node realm's Date, Jest's sandbox has its own
    expect(out.every(o => Date.now() - o.updatedAt.getTime() < 60_000)).toBe(true)
  })

  it('is empty for a prefix that does not exist or escapes the root', async () => {
    const driver = new LocalFileStorageDriver()
    expect(await driver.list('test-fixtures/listing/nothing/')).toEqual([])
    expect(await driver.list('../')).toEqual([])
  })
})
