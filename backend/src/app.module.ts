import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from './prisma/prisma.module'
import { HealthModule } from './health/health.module'
import { IdentityModule } from './modules/identity/identity.module'
import { MasterDataModule } from './modules/master-data/master-data.module'
import { MailModule } from './modules/mail/mail.module'
import { MaterialsModule } from './modules/materials/materials.module'
// Sprint 2
import { MarkPrefixModule } from './modules/mark-prefix-master/mark-prefix.module'
import { ProjectsModule } from './modules/projects/projects.module'
import { ProjectZonesModule } from './modules/project-zones/project-zones.module'
import { ProductsModule } from './modules/products/products.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    IdentityModule,
    MasterDataModule,
    MailModule,
    MaterialsModule,
    // Sprint 2
    MarkPrefixModule,
    ProjectsModule,
    ProjectZonesModule,
    ProductsModule,
  ],
})
export class AppModule {}
