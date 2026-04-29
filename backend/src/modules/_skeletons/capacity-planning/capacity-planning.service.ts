// 🟡 SKELETON — Sprint 7 — 🟨 Hybrid (Siemens Opcenter APS)
// Forward-looking capacity buckets per WC × week/month: available vs committed vs reserved
//
// Implementation checklist (Sprint 7):
//   [ ] Replace stub methods with Prisma calls (model in schema.skeleton.prisma)
//   [ ] Add DTOs in dto/ subfolder
//   [ ] Add state-machine if applicable (reuse pattern from materials.state-machine.ts)
//   [ ] Wire mail_message audit (reuse MailMessageService from Sprint 1)
//   [ ] Add unit tests (≥80% coverage)
//   [ ] Add E2E test
import { Injectable } from '@nestjs/common'

@Injectable()
export class CapacityPlanningService {
  // TODO Sprint 7
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
