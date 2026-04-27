import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.enableCors({ origin: '*' })
  app.setGlobalPrefix('api/v1')
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }),
  )

  const config = new DocumentBuilder()
    .setTitle('BDT Material Master API')
    .setDescription('Material Master Data & Registration — Sprint 1')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'x-user-id', in: 'header' }, 'x-user-id')
    .build()
  const doc = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api/docs', app, doc)

  const port = process.env.PORT ?? 3000
  await app.listen(port)
  console.log(`BDT backend running on http://localhost:${port}`)
  console.log(`Swagger: http://localhost:${port}/api/docs`)
}
bootstrap()
