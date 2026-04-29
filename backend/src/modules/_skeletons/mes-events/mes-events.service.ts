// 🟡 SKELETON — Sprint 7 — 🟥 Custom (BDT MES event stream)
// Append-only shop-floor event log — wo_start, qty_report, scrap, downtime — feeds real-time OEE
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
export class MesEventsService {
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
