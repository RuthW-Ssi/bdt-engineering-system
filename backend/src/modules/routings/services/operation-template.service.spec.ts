import { OperationTemplateService } from './operation-template.service'

// addFromLibrary / updateFromLibrary change a template's activities, so they stamp
// who did it on operation_template (write_uid / write_date) inside the same transaction.
describe('OperationTemplateService library snapshots record the user', () => {
  const SRC = { id: 9, name: 'Weld', activity_code: 'ACT-009', duration_min: 12, consumes: [], skills: [], tools: [] }

  function make() {
    const tx = {
      operation_template: { update: jest.fn().mockResolvedValue({}) },
      operation_template_activity: {
        create: jest.fn().mockResolvedValue({ id: 70 }),
        update: jest.fn().mockResolvedValue({ id: 70 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 70 }),
      },
      op_act_skills: { createMany: jest.fn(), deleteMany: jest.fn() },
      op_act_tool: { createMany: jest.fn(), deleteMany: jest.fn() },
      op_act_material: { deleteMany: jest.fn(), createMany: jest.fn() },
    }
    const prisma = {
      operation_template: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 4 }) },
      operation_template_activity: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 20 } }),
        findUnique: jest.fn().mockResolvedValue({ id: 70, source_activity_id: 9, operation_template_id: 4 }),
      },
      activity: { findUnique: jest.fn().mockResolvedValue(SRC), findUniqueOrThrow: jest.fn().mockResolvedValue(SRC) },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    }
    return { tx, svc: new OperationTemplateService(prisma as never, {} as never) }
  }

  const stamped = (tx: ReturnType<typeof make>['tx']) => {
    expect(tx.operation_template.update).toHaveBeenCalledTimes(1)
    const arg = tx.operation_template.update.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 4 })
    expect(arg.data.write_uid).toBe(42)
    expect(arg.data.write_date).toBeInstanceOf(Date)
  }

  it('addFromLibrary stamps write_uid/write_date on the template', async () => {
    const { tx, svc } = make()
    await svc.addFromLibrary(4, 9, 42)
    stamped(tx)
    // the activity row itself has no write_uid column — nothing user-related is written there
    expect(tx.operation_template_activity.create.mock.calls[0][0].data).not.toHaveProperty('write_uid')
  })

  it('updateFromLibrary stamps write_uid/write_date on the template', async () => {
    const { tx, svc } = make()
    await svc.updateFromLibrary(4, 70, 42)
    stamped(tx)
    expect(tx.operation_template_activity.update.mock.calls[0][0].data).not.toHaveProperty('write_uid')
  })
})
