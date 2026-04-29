import { IsArray, IsInt, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

class ReorderItem {
  @IsInt() id: number
  @IsInt() sequence: number
}

export class ReorderOperationsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReorderItem)
  items: ReorderItem[]
}
