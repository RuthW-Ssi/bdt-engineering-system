import { Module } from '@nestjs/common'
import { MarkAliasService } from './mark-alias.service'

// Leaf module (2026-10-21): imported by BomUpload, WorkOrders and
// ManufacturingOrders; imports nothing but the global PrismaModule.
@Module({ providers: [MarkAliasService], exports: [MarkAliasService] })
export class MarkRenameModule {}
