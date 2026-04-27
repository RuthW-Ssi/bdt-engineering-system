import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from './prisma/prisma.module'
import { HealthModule } from './health/health.module'
import { IdentityModule } from './modules/identity/identity.module'
import { MasterDataModule } from './modules/master-data/master-data.module'
import { MailModule } from './modules/mail/mail.module'
import { MaterialsModule } from './modules/materials/materials.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    IdentityModule,
    MasterDataModule,
    MailModule,
    MaterialsModule,
  ],
})
export class AppModule {}
