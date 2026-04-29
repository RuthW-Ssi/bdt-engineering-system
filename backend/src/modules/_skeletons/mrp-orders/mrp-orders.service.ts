// 🟡 SKELETON — Sprint 5 — 🟦 Standard Odoo (mrp.production + mrp.workorder + stock.production.lot)
// Manufacturing Order + Work Order + Serial Number — replaces MO and SN sheets in process routing.xlsx
//
// Implementation checklist (Sprint 5):
//   [ ] Replace stub methods with Prisma calls (model in schema.skeleton.prisma)
//   [ ] Add DTOs in dto/ subfolder
//   [ ] Add state-machine if applicable (reuse pattern from materials.state-machine.ts)
//   [ ] Wire mail_message audit (reuse MailMessageService from Sprint 1)
//   [ ] Add unit tests (≥80% coverage)
//   [ ] Add E2E test
import { Injectable } from '@nestjs/common'

@Injectable()
export class MrpOrdersService {
  // TODO Sprint 5
  async list() {
    throw new Error('SKELETON: not implemented')
  }
  async findOne(_id: number) {
    throw new Error('SKELETON: not implemented')
  }
  async create(_data: any) {
    throw new Error('SKELETON: not implemented')
  }
}
