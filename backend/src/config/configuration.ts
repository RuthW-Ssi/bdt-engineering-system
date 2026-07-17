import { plainToInstance, Transform } from 'class-transformer'
import { IsNotEmpty, IsNumber, IsOptional, IsString, validateSync } from 'class-validator'

class EnvironmentVariables {
  @IsNotEmpty()
  @IsString()
  DATABASE_URL: string

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  PORT: number = 3000

  @IsOptional()
  @IsString()
  NODE_ENV: string = 'development'

  @IsOptional()
  @IsString()
  FILE_STORAGE_DRIVER: string = 'local'

  @IsOptional()
  @IsString()
  FILE_STORAGE_LOCAL_PATH: string = './storage'

  @IsOptional()
  @IsString()
  INSTANCE_CONNECTION_NAME: string

  @IsOptional()
  @IsString()
  GCP_PROJECT_ID: string

  @IsOptional()
  @IsString()
  CUTTING_PLAN_API_URL: string
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  })
  const errors = validateSync(validated, { skipMissingProperties: false })
  if (errors.length > 0) {
    throw new Error(`Config validation failed:\n${errors.toString()}`)
  }
  return validated
}
