import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  author!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  mime!: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  sizeBytes!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customCoverFilePath?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description?: string;
}

export class FinalizeBookDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bookId!: string;
}

export class CoverUploadDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  mime!: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  sizeBytes!: number;
}

export class FinalizeCoverDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  storageKey!: string;
}
