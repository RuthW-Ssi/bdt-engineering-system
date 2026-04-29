// 🟡 SKELETON — Sprint 6 — 🟦 Standard Odoo (quality.point + quality.check)
// Quality check definitions per routing op + actual results per work order — AISC Ch.N + AWS D1.1
//
// Implementation checklist (Sprint 6):
//   [ ] Replace stub methods with Prisma calls (model in schema.skeleton.prisma)
//   [ ] Add DTOs in dto/ subfolder
//   [ ] Add state-machine if applicable (reuse pattern from materials.state-machine.ts)
//   [ ] Wire mail_message audit (reuse MailMessageService from Sprint 1)
//   [ ] Add unit tests (≥80% coverage)
//   [ ] Add E2E test
import { Injectable } from '@nestjs/common'

@Injectable()
export class QualityService {
  // TODO Sprint 6
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
