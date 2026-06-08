import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { validate } from './config/configuration'
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
// Sprint 3
import { BomsModule } from './modules/boms/boms.module'
import { DrawingsModule } from './modules/drawings/drawings.module'
import { FileStorageModule } from './modules/file-storage/file-storage.module'
// Sprint 4
import { RoutingsModule } from './modules/routings/routings.module'
// Sprint 6
import { AuthModule } from './modules/auth/auth.module'
import { CustomersModule } from './modules/customers/customers.module'
import { SubZonesModule } from './modules/sub-zones/sub-zones.module'
// Sprint 7
import { BomUploadModule } from './modules/bom-upload/bom-upload.module'
// Sprint 9
import { MbomPaintModule } from './modules/mbom-paint/mbom-paint.module'
import { MbomWeldingModule } from './modules/mbom-welding/mbom-welding.module'
// Sprint 10
import { ProductDerivationModule } from './modules/product-derivation/product-derivation.module'
// Sprint 11
import { ProductLibraryModule } from './modules/product-library/product-library.module'
// Sprint 12
import { ActivitiesModule } from './modules/activities/activities.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    PrismaModule,
    HealthModule,
    // Sprint 6: AuthModule first — registers JwtModule globally
    AuthModule,
    IdentityModule,
    MasterDataModule,
    MailModule,
    MaterialsModule,
    // Sprint 2
    MarkPrefixModule,
    ProjectsModule,
    ProjectZonesModule,
    ProductsModule,
    // Sprint 3
    BomsModule,
    DrawingsModule,
    FileStorageModule,
    // Sprint 4
    RoutingsModule,
    // Sprint 6
    CustomersModule,
    SubZonesModule,
    // Sprint 7
    BomUploadModule,
    // Sprint 9
    MbomPaintModule,
    MbomWeldingModule,
    // Sprint 10
    ProductDerivationModule,
    // Sprint 11
    ProductLibraryModule,
    // Sprint 12
    ActivitiesModule,
  ],
})
export class AppModule {}
