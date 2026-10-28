import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class CategoryResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Groceries' }) name!: string;
  @ApiProperty({ enum: ['income', 'expense'] }) kind!: 'income' | 'expense';
  @ApiProperty({ nullable: true }) parentId!: string | null;
  @ApiProperty({ nullable: true, description: 'set on categories the ledger books to: fees, taxes, dividends, interest, other_income, other_expense' })
  key!: string | null;
  @ApiProperty() archived!: boolean;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Groceries' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @ApiProperty({ enum: ['income', 'expense'] })
  @IsIn(['income', 'expense'])
  kind!: 'income' | 'expense';

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  parentId?: string | null;
}

export class UpdateCategoryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  parentId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
