import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { SleeveJointService } from './sleeve-joints'

// 2026-11-26: sleeve joints from the project's IFC (scripts/cp-shape-test/extract-sleeve-joints.py), kept as a file
const dec = (v: number) => ({ toString: () => String(v) })
const FILE = {
  source: 'MODEL.ifc', sleeves: 3, withoutAssembly: 0,
  joints: [
    { sleeve: { mark: 'TC-m7', name: 'SLEEVE PIPE', profile: 'PIPE 139.8X5 SL', odMm: 129.8, wallMm: 5, lengthMm: 400 }, count: 12, assemblies: ['TC-PS1'],
      pipes: [{ mark: 'TC-m1', name: 'PIPE STUD', profile: 'PIPE 139.8X5', odMm: 139.8, wallMm: 5, lengthMm: 8000, insertMm: 197.5 }, { mark: 'TC-m6', name: 'PIPE STUD', profile: 'PIPE 139.8X5', odMm: 139.8, wallMm: 5, lengthMm: 3579, insertMm: 197.5 }] },
    // a model with no marks on its pieces, the sleeve drawn at its pipe's own size; twice, lengths 0.1 mm apart
    ...[9000, 9000.1].map(len => ({ sleeve: { mark: null, name: 'SLEEVE PIPE', profile: 'PIPE 113.5X2.4', odMm: 113.5, wallMm: 2.4, lengthMm: 400 }, count: 1, assemblies: ['DBN-B5-STR12'],
      pipes: [{ mark: null, name: 'SUBTRUSS', profile: 'PIPE 113.5X2.4', odMm: 113.5, wallMm: 2.4, lengthMm: len, insertMm: 197.5 }, { mark: null, name: 'SUBTRUSS', profile: 'PIPE 113.5X2.4', odMm: 113.5, wallMm: 2.4, lengthMm: 1227.6, insertMm: 197.5 }] })),
  ],
}

function build(code = '0X220', file: unknown = FILE) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sleeve-'))
  if (file) fs.writeFileSync(path.join(dir, '0X220.json'), JSON.stringify(file))
  const prisma: any = {
    project: { findUnique: jest.fn(async ({ where }: any) => (where.id === 7 ? { project_code: code } : null)) },
    bom_assembly_part: { findMany: jest.fn(async () => [
      { assembly: { assembly_mark: 'DBN-B5-STR12' }, part: { part_mark: 'DBN-B5-m10', profile: 'PIPE113.5X2.4', length_mm: dec(9000) } },
      { assembly: { assembly_mark: 'DBN-B5-STR12' }, part: { part_mark: 'DBN-B5-m11', profile: 'PIPE 113.5X2.4', length_mm: dec(1227.55) } },
      { assembly: { assembly_mark: 'DBN-B5-STR12' }, part: { part_mark: 'DBN-B5-m12', profile: 'PIPE113.5X2.4', length_mm: dec(400) } },
      { assembly: { assembly_mark: 'DBN-B5-STR12' }, part: { part_mark: 'DBN-B5-p1', profile: 'PL10', length_mm: dec(400) } },
    ]) },
  }
  return { svc: new SleeveJointService(prisma, dir), prisma }
}

describe('SleeveJointService', () => {
  it('gives each joint: the sleeve, the pipes it goes into and how far, how many times', async () => {
    const r = await build().svc.joints(7)
    expect(r.source).toBe('MODEL.ifc')
    expect(r.joints[0]).toEqual({
      sleeve: { marks: ['TC-m7'], profile: 'PIPE 139.8X5 SL', odMm: 129.8, wallMm: 5, lengthMm: 400 },
      pipes: [{ marks: ['TC-m1'], profile: 'PIPE 139.8X5', odMm: 139.8, wallMm: 5, lengthMm: 8000, insertMm: 197.5 }, { marks: ['TC-m6'], profile: 'PIPE 139.8X5', odMm: 139.8, wallMm: 5, lengthMm: 3579, insertMm: 197.5 }],
      count: 12, assemblies: ['TC-PS1'], sleeveDrawnAtPipeSize: false,
    })
  })

  it('a model without marks: marks come from the BOM parts of the same assembly, same size and length (± 1 mm); same joints add up', async () => {
    const { joints } = await build().svc.joints(7)
    expect(joints).toHaveLength(2)
    expect(joints[1].sleeve.marks).toEqual(['DBN-B5-m12'])
    expect(joints[1].pipes.map(p => p.marks)).toEqual([['DBN-B5-m10'], ['DBN-B5-m11']])
    expect(joints[1].count).toBe(2)
    expect(joints[1].sleeveDrawnAtPipeSize).toBe(true)
  })

  it('no file for the project: no joints, no source; an unknown project is a 404', async () => {
    expect(await build('0X999').svc.joints(7)).toEqual({ source: null, joints: [] })
    await expect(build().svc.joints(1)).rejects.toThrow('Project 1 not found')
  })
})
